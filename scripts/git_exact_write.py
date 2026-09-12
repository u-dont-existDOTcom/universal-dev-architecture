#!/usr/bin/env python3
"""Validate and locally commit one exact, hash-bound Git file mutation."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
from typing import Any, Sequence
from git_exact_manifest import ExactWriteError, load_manifest, safe_target, sha256_bytes, validate_manifest
from git_exact_repo import restore_preimage, run_git, stage_operation, verify_preimage, verify_repo_identity

LOCAL_COMMIT_VERIFIED = "LOCAL_COMMIT_VERIFIED"

def load_payload(path: Path | None, manifest: dict[str, Any]) -> bytes | None:
    if manifest["operation"] == "delete":
        if path is not None: raise ExactWriteError("delete operation must not receive a payload")
        return None
    if path is None: raise ExactWriteError("create/update requires --payload")
    try: payload = path.read_bytes()
    except OSError as exc: raise ExactWriteError(f"unable to read payload: {exc}") from exc
    if len(payload) != manifest["payload_bytes"]: raise ExactWriteError("payload byte count does not match manifest")
    if sha256_bytes(payload) != manifest["payload_sha256"]: raise ExactWriteError("payload SHA-256 does not match manifest")
    return payload

def prepare(manifest_path: Path, payload_path: Path | None, repo_root: Path) -> tuple[dict[str, Any], Path, bytes | None]:
    manifest = load_manifest(manifest_path); validate_manifest(manifest)
    repo_root = repo_root.resolve(); target = safe_target(repo_root, manifest["path"])
    verify_repo_identity(repo_root, manifest); verify_preimage(repo_root, manifest, target)
    return manifest, target, load_payload(payload_path, manifest)

def check(manifest_path: Path, payload_path: Path | None, repo_root: Path) -> None:
    prepare(manifest_path, payload_path, repo_root)

def receipt(repo_root: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {
        "schema_version": 1, "state": LOCAL_COMMIT_VERIFIED,
        "repository": manifest["repository"], "branch": manifest["branch"],
        "operation": manifest["operation"], "path": manifest["path"],
        "base_commit": manifest["base_commit"], "commit": run_git(repo_root, ["rev-parse", "HEAD"]).stdout.strip(),
        "payload_sha256": manifest.get("payload_sha256"), "payload_bytes": manifest.get("payload_bytes"),
        "postimage_sha256": None, "push_required": True, "remote_verification_required": True,
    }
    if manifest["operation"] != "delete": out["postimage_sha256"] = sha256_bytes((repo_root / manifest["path"]).read_bytes())
    return out

def write_receipt(path: Path | None, value: dict[str, Any], repo_root: Path) -> None:
    text = json.dumps(value, indent=2, sort_keys=True) + "\n"
    if path is None: sys.stdout.write(text); return
    resolved = path.resolve(strict=False)
    try: resolved.relative_to(repo_root.resolve())
    except ValueError: pass
    else: raise ExactWriteError("receipt path must be outside the repository worktree")
    resolved.parent.mkdir(parents=True, exist_ok=True); resolved.write_text(text, encoding="utf-8")

def execute(manifest_path: Path, payload_path: Path | None, repo_root: Path, receipt_path: Path | None) -> None:
    manifest, target, payload = prepare(manifest_path, payload_path, repo_root); repo_root = repo_root.resolve()
    try:
        stage_operation(repo_root, manifest, target, payload)
        run_git(repo_root, ["commit", "-m", manifest["commit_message"]])
    except ExactWriteError:
        restore_preimage(repo_root, manifest); raise
    write_receipt(receipt_path, receipt(repo_root, manifest), repo_root)

def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(); sub = p.add_subparsers(dest="command", required=True)
    for name in ("check", "apply"):
        c = sub.add_parser(name); c.add_argument("--manifest", required=True, type=Path); c.add_argument("--payload", type=Path); c.add_argument("--repo-root", default=Path.cwd(), type=Path)
        if name == "apply": c.add_argument("--receipt", type=Path)
    return p

def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "check": check(args.manifest, args.payload, args.repo_root); print("EXACT_GIT_WRITE_CHECK_PASS")
        else: execute(args.manifest, args.payload, args.repo_root, args.receipt)
    except ExactWriteError as exc: print(f"ERROR: {exc}", file=sys.stderr); return 1
    return 0

if __name__ == "__main__": raise SystemExit(main())
