from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
SCRIPT = SCRIPTS / "git_exact_write.py"
spec = importlib.util.spec_from_file_location("git_exact_write", SCRIPT)
mod = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(mod)


def git(repo: Path, *args: str, check: bool = True) -> str:
    proc = subprocess.run(["git", *args], cwd=repo, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and proc.returncode != 0:
        raise AssertionError(proc.stderr or proc.stdout)
    return proc.stdout.strip()


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class ExactGitWriteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        git(self.repo, "init", "-b", "task/example")
        git(self.repo, "config", "user.name", "Test User")
        git(self.repo, "config", "user.email", "test@example.com")
        (self.repo / "existing.txt").write_text("old\n", encoding="utf-8")
        git(self.repo, "add", "existing.txt")
        git(self.repo, "commit", "-m", "base")
        self.base = git(self.repo, "rev-parse", "HEAD")
        self.blob = git(self.repo, "rev-parse", "HEAD:existing.txt")
        git(self.repo, "remote", "add", "origin", "https://github.com/owner/repo.git")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def write_manifest(self, data: dict) -> Path:
        path = self.root / "manifest.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def common(self, operation: str, path: str) -> dict:
        return {
            "schema_version": 1,
            "repository": "owner/repo",
            "branch": "task/example",
            "operation": operation,
            "path": path,
            "base_commit": self.base,
            "base_blob": None,
            "payload_sha256": None,
            "payload_bytes": None,
            "expected_postimage_sha256": None,
            "commit_message": f"{operation} {path}",
        }

    def execute_with_receipt(self, manifest: dict, payload: Path | None = None) -> dict:
        receipt_path = self.root / "receipt.json"
        mod.execute(self.write_manifest(manifest), payload, self.repo, receipt_path)
        return json.loads(receipt_path.read_text(encoding="utf-8"))

    def test_update_commits_exact_payload_and_emits_receipt(self) -> None:
        payload = b"new value\n"
        payload_path = self.root / "payload.bin"
        payload_path.write_bytes(payload)
        manifest = self.common("update", "existing.txt")
        manifest.update(
            base_blob=self.blob,
            payload_sha256=digest(payload),
            payload_bytes=len(payload),
            expected_postimage_sha256=digest(payload),
        )
        receipt = self.execute_with_receipt(manifest, payload_path)
        self.assertEqual((self.repo / "existing.txt").read_bytes(), payload)
        self.assertEqual(git(self.repo, "status", "--porcelain"), "")
        self.assertEqual(receipt["state"], mod.LOCAL_COMMIT_VERIFIED)
        self.assertEqual(receipt["postimage_sha256"], digest(payload))
        self.assertNotEqual(receipt["commit"], self.base)

    def test_create_commits_only_declared_path(self) -> None:
        payload = b"hello\n"
        payload_path = self.root / "payload.bin"
        payload_path.write_bytes(payload)
        manifest = self.common("create", "new/created.txt")
        manifest.update(
            payload_sha256=digest(payload),
            payload_bytes=len(payload),
            expected_postimage_sha256=digest(payload),
        )
        self.execute_with_receipt(manifest, payload_path)
        self.assertEqual((self.repo / "new/created.txt").read_bytes(), payload)
        self.assertEqual(git(self.repo, "show", "--pretty=", "--name-only", "HEAD"), "new/created.txt")

    def test_delete_requires_exact_base_blob(self) -> None:
        manifest = self.common("delete", "existing.txt")
        manifest["base_blob"] = self.blob
        self.execute_with_receipt(manifest)
        self.assertFalse((self.repo / "existing.txt").exists())
        self.assertEqual(git(self.repo, "show", "--pretty=", "--name-only", "HEAD"), "existing.txt")

    def test_payload_hash_mismatch_fails_without_mutation(self) -> None:
        payload_path = self.root / "payload.bin"
        payload_path.write_bytes(b"wrong\n")
        manifest = self.common("update", "existing.txt")
        manifest.update(base_blob=self.blob, payload_sha256=digest(b"expected\n"), payload_bytes=6)
        with self.assertRaises(mod.ExactWriteError):
            mod.check(self.write_manifest(manifest), payload_path, self.repo)
        self.assertEqual((self.repo / "existing.txt").read_text(encoding="utf-8"), "old\n")
        self.assertEqual(git(self.repo, "rev-parse", "HEAD"), self.base)

    def test_dirty_worktree_fails_closed(self) -> None:
        (self.repo / "owner-note.txt").write_text("unrelated\n", encoding="utf-8")
        payload = b"new\n"
        payload_path = self.root / "payload.bin"
        payload_path.write_bytes(payload)
        manifest = self.common("update", "existing.txt")
        manifest.update(base_blob=self.blob, payload_sha256=digest(payload), payload_bytes=len(payload))
        with self.assertRaisesRegex(mod.ExactWriteError, "not clean"):
            mod.check(self.write_manifest(manifest), payload_path, self.repo)

    def test_branch_mismatch_fails_closed(self) -> None:
        git(self.repo, "switch", "-c", "other")
        payload = b"new\n"
        payload_path = self.root / "payload.bin"
        payload_path.write_bytes(payload)
        manifest = self.common("update", "existing.txt")
        manifest.update(base_blob=self.blob, payload_sha256=digest(payload), payload_bytes=len(payload))
        with self.assertRaisesRegex(mod.ExactWriteError, "branch mismatch"):
            mod.check(self.write_manifest(manifest), payload_path, self.repo)

    def test_base_commit_mismatch_fails_closed(self) -> None:
        payload = b"new\n"
        payload_path = self.root / "payload.bin"
        payload_path.write_bytes(payload)
        manifest = self.common("update", "existing.txt")
        manifest.update(base_blob=self.blob, payload_sha256=digest(payload), payload_bytes=len(payload))
        manifest["base_commit"] = "0" * 40
        with self.assertRaisesRegex(mod.ExactWriteError, "base commit mismatch"):
            mod.check(self.write_manifest(manifest), payload_path, self.repo)

    def test_update_base_blob_mismatch_fails_closed(self) -> None:
        payload = b"new\n"
        payload_path = self.root / "payload.bin"
        payload_path.write_bytes(payload)
        manifest = self.common("update", "existing.txt")
        manifest.update(base_blob="0" * 40, payload_sha256=digest(payload), payload_bytes=len(payload))
        with self.assertRaisesRegex(mod.ExactWriteError, "base blob mismatch"):
            mod.check(self.write_manifest(manifest), payload_path, self.repo)

    def test_path_traversal_rejected(self) -> None:
        manifest = self.common("delete", "../outside")
        manifest["base_blob"] = self.blob
        with self.assertRaisesRegex(mod.ExactWriteError, "safe repository-relative"):
            mod.check(self.write_manifest(manifest), None, self.repo)

    def test_receipt_must_be_outside_repo(self) -> None:
        payload = b"new\n"
        payload_path = self.root / "payload.bin"
        payload_path.write_bytes(payload)
        manifest = self.common("update", "existing.txt")
        manifest.update(base_blob=self.blob, payload_sha256=digest(payload), payload_bytes=len(payload))
        with self.assertRaisesRegex(mod.ExactWriteError, "receipt path must be outside"):
            mod.execute(self.write_manifest(manifest), payload_path, self.repo, self.repo / "receipt.json")

    def test_diff_check_failure_restores_clean_preimage(self) -> None:
        payload = b"trailing-space \n"
        payload_path = self.root / "payload.bin"
        payload_path.write_bytes(payload)
        manifest = self.common("update", "existing.txt")
        manifest.update(base_blob=self.blob, payload_sha256=digest(payload), payload_bytes=len(payload))
        with self.assertRaises(mod.ExactWriteError):
            mod.execute(self.write_manifest(manifest), payload_path, self.repo, self.root / "receipt.json")
        self.assertEqual((self.repo / "existing.txt").read_text(encoding="utf-8"), "old\n")
        self.assertEqual(git(self.repo, "status", "--porcelain"), "")
        self.assertEqual(git(self.repo, "rev-parse", "HEAD"), self.base)

    def test_github_origin_mismatch_fails_without_echoing_remote(self) -> None:
        git(self.repo, "remote", "set-url", "origin", "https://secret@github.com/other/repo.git")
        payload = b"new\n"
        payload_path = self.root / "payload.bin"
        payload_path.write_bytes(payload)
        manifest = self.common("update", "existing.txt")
        manifest.update(base_blob=self.blob, payload_sha256=digest(payload), payload_bytes=len(payload))
        with self.assertRaisesRegex(mod.ExactWriteError, "origin repository does not match") as caught:
            mod.check(self.write_manifest(manifest), payload_path, self.repo)
        self.assertNotIn("secret", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
