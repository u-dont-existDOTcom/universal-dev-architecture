"""Git state checks and exact path mutation primitives."""
from __future__ import annotations
import re, subprocess
from pathlib import Path
from typing import Any, Sequence
from git_exact_manifest import ExactWriteError, sha256_bytes

def run_git(repo_root: Path, args: Sequence[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(["git", *args], cwd=repo_root, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and proc.returncode != 0:
        detail = proc.stderr.strip() or proc.stdout.strip() or f"exit {proc.returncode}"
        raise ExactWriteError(f"git {' '.join(args)} failed: {detail}")
    return proc

def normalize_github_repo(remote: str) -> str | None:
    patterns = (
        r"^git@github\.com:([^/]+/[^/]+?)(?:\.git)?$",
        r"^ssh://git@github\.com/([^/]+/[^/]+?)(?:\.git)?$",
        r"^https://(?:[^/@]+@)?github\.com/([^/]+/[^/?#]+?)(?:\.git)?(?:[?#].*)?$",
    )
    for pattern in patterns:
        match = re.match(pattern, remote)
        if match:
            return match.group(1).removesuffix(".git")
    return None

def verify_repo_identity(repo_root: Path, manifest: dict[str, Any]) -> None:
    if run_git(repo_root, ["rev-parse", "--is-inside-work-tree"]).stdout.strip() != "true":
        raise ExactWriteError("repo_root is not a Git working tree")
    branch = run_git(repo_root, ["branch", "--show-current"]).stdout.strip()
    if branch != manifest["branch"]:
        raise ExactWriteError(f"branch mismatch: expected {manifest['branch']!r}, found {branch!r}")
    head = run_git(repo_root, ["rev-parse", "HEAD"]).stdout.strip()
    if head != manifest["base_commit"]:
        raise ExactWriteError(f"base commit mismatch: expected {manifest['base_commit']}, found {head}")
    if run_git(repo_root, ["status", "--porcelain=v1", "--untracked-files=all"]).stdout:
        raise ExactWriteError("working tree is not clean")
    remote = run_git(repo_root, ["remote", "get-url", "origin"], check=False)
    if remote.returncode == 0:
        normalized = normalize_github_repo(remote.stdout.strip())
        if normalized is not None and normalized != manifest["repository"]:
            raise ExactWriteError("origin repository does not match manifest repository")

def current_blob(repo_root: Path, relative: str) -> str | None:
    proc = run_git(repo_root, ["rev-parse", f"HEAD:{relative}"], check=False)
    return proc.stdout.strip() if proc.returncode == 0 else None

def verify_preimage(repo_root: Path, manifest: dict[str, Any], target: Path) -> None:
    operation, rel = manifest["operation"], manifest["path"]
    blob = current_blob(repo_root, rel)
    if operation == "create":
        if blob is not None or target.exists():
            raise ExactWriteError("create target already exists")
        return
    if blob is None:
        raise ExactWriteError(f"{operation} target is not present in HEAD")
    if blob != manifest["base_blob"]:
        raise ExactWriteError(f"base blob mismatch for {rel}")

def restore_preimage(repo_root: Path, manifest: dict[str, Any]) -> None:
    rel = manifest["path"]
    if manifest["operation"] == "create":
        run_git(repo_root, ["rm", "-f", "--ignore-unmatch", "--", rel], check=False)
        target = repo_root / rel
        if target.exists():
            target.unlink()
        parent = target.parent
        while parent != repo_root and parent.exists():
            try: parent.rmdir()
            except OSError: break
            parent = parent.parent
    else:
        run_git(repo_root, ["restore", "--source=HEAD", "--staged", "--worktree", "--", rel], check=False)

def stage_operation(repo_root: Path, manifest: dict[str, Any], target: Path, payload: bytes | None) -> None:
    operation, rel = manifest["operation"], manifest["path"]
    if operation in {"create", "update"}:
        assert payload is not None
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        expected = manifest.get("expected_postimage_sha256") or manifest["payload_sha256"]
        if sha256_bytes(target.read_bytes()) != expected:
            raise ExactWriteError("postimage SHA-256 does not match manifest")
        run_git(repo_root, ["add", "--", rel])
    else:
        run_git(repo_root, ["rm", "--", rel])
    changed = [x for x in run_git(repo_root, ["diff", "--cached", "--name-only"]).stdout.splitlines() if x]
    if changed != [rel]:
        raise ExactWriteError(f"staged path set must equal exactly [{rel!r}]")
    check = run_git(repo_root, ["diff", "--cached", "--check"], check=False)
    if check.returncode != 0:
        raise ExactWriteError(check.stdout.strip() or check.stderr.strip() or "git diff --check failed")
