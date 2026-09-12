"""Manifest and path validation for exact single-file Git writes."""
from __future__ import annotations
import hashlib, json, re
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
OPERATIONS = {"create", "update", "delete"}

class ExactWriteError(RuntimeError):
    pass

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def load_manifest(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ExactWriteError(f"invalid manifest {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ExactWriteError("manifest root must be a JSON object")
    return value

def _string(manifest: dict[str, Any], key: str) -> str:
    value = manifest.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ExactWriteError(f"manifest field {key!r} must be a nonempty string")
    return value

def validate_manifest(manifest: dict[str, Any]) -> None:
    if manifest.get("schema_version") != SCHEMA_VERSION:
        raise ExactWriteError(f"schema_version must equal {SCHEMA_VERSION}")
    operation = _string(manifest, "operation")
    if operation not in OPERATIONS:
        raise ExactWriteError(f"operation must be one of {sorted(OPERATIONS)}")
    for key in ("repository", "branch", "path", "base_commit", "commit_message"):
        _string(manifest, key)
    base_blob = manifest.get("base_blob")
    if operation in {"update", "delete"}:
        if not isinstance(base_blob, str) or not base_blob.strip():
            raise ExactWriteError("base_blob is required for update/delete")
    elif base_blob not in (None, ""):
        raise ExactWriteError("base_blob must be null/omitted for create")
    if operation in {"create", "update"}:
        digest = _string(manifest, "payload_sha256")
        if not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ExactWriteError("payload_sha256 must be 64 lowercase hexadecimal characters")
        count = manifest.get("payload_bytes")
        if not isinstance(count, int) or isinstance(count, bool) or count < 0:
            raise ExactWriteError("payload_bytes must be a nonnegative integer")
        expected = manifest.get("expected_postimage_sha256")
        if expected is not None:
            if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
                raise ExactWriteError("expected_postimage_sha256 must be null or a SHA-256 hex string")
            if expected != digest:
                raise ExactWriteError("expected_postimage_sha256 must equal payload_sha256")
    else:
        if manifest.get("payload_sha256") not in (None, ""):
            raise ExactWriteError("payload_sha256 must be null/omitted for delete")
        if manifest.get("payload_bytes") not in (None, 0):
            raise ExactWriteError("payload_bytes must be null/0 for delete")
        if manifest.get("expected_postimage_sha256") not in (None, ""):
            raise ExactWriteError("expected_postimage_sha256 must be null/omitted for delete")

def safe_target(repo_root: Path, relative: str) -> Path:
    rel = Path(relative)
    if rel.is_absolute() or not rel.parts or ".." in rel.parts or rel.parts[0] == ".git":
        raise ExactWriteError("manifest path must be a safe repository-relative path")
    root = repo_root.resolve()
    target = (root / rel).resolve(strict=False)
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise ExactWriteError("manifest path escapes repository root") from exc
    return target
