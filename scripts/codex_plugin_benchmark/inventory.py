from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from . import SCHEMA_VERSION
from .common import sha256_path

FRONTMATTER_FIELD = re.compile(r"^(name|description):\s*(.*?)\s*$")
CONFIG_ASSIGNMENT = re.compile(r"^([A-Za-z0-9_.-]+)\s*=")
CONFIG_TABLE = re.compile(r"^\s*\[+([^\]]+)\]+\s*$")
QUOTED_TABLE_SEGMENT = re.compile(r"\.(?:\"[^\"]*\"|'[^']*')")


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def _skill_metadata(path: Path) -> dict[str, Any]:
    name = path.parent.name
    description = ""
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError):
        lines = []
    for line in lines[1:]:
        if line == "---":
            break
        match = FRONTMATTER_FIELD.match(line)
        if not match:
            continue
        if match.group(1) == "name":
            name = match.group(2).strip('"\'')
        else:
            description = match.group(2).strip('"\'')
    return {
        "name": name,
        "description": description,
        "path": str(path.parent),
        "sha256": sha256_path(path),
    }


def _hook_events(root: Path, manifest: dict[str, Any]) -> list[str]:
    hook_reference = manifest.get("hooks")
    candidates: list[Path] = []
    if isinstance(hook_reference, str):
        candidates.append(root / hook_reference)
    candidates.append(root / "hooks" / "hooks.json")
    for candidate in candidates:
        if not candidate.is_file():
            continue
        hooks = _read_json(candidate).get("hooks")
        if isinstance(hooks, dict):
            return sorted(str(key) for key in hooks)
    return []


def _plugin_metadata(manifest_path: Path) -> dict[str, Any]:
    root = manifest_path.parent.parent
    manifest = _read_json(manifest_path)
    receipt = root / ".codex-remote-plugin-install.json"
    skill_paths = sorted(root.glob("skills/**/SKILL.md"))
    return {
        "name": str(manifest.get("name") or root.parent.name),
        "version": str(manifest.get("version") or root.name),
        "description": str(manifest.get("description") or ""),
        "root": str(root),
        "manifest_sha256": sha256_path(manifest_path),
        "install_state": "installed" if receipt.is_file() else "cached-unverified",
        "receipt_present": receipt.is_file(),
        "skills": [_skill_metadata(path) for path in skill_paths],
        "hook_events": _hook_events(root, manifest),
        "mcp_declared": (root / ".mcp.json").is_file(),
        "app_declared": (root / ".app.json").is_file(),
    }


def _standalone_skills(codex_root: Path) -> list[dict[str, Any]]:
    skill_root = codex_root / "skills"
    if not skill_root.is_dir():
        return []
    return [_skill_metadata(path) for path in sorted(skill_root.glob("**/SKILL.md"))]


def _redacted_config_metadata(config_path: Path) -> dict[str, Any]:
    if not config_path.is_file():
        return {"present": False, "top_level_keys": [], "tables": []}
    keys: set[str] = set()
    tables: set[str] = set()
    try:
        lines = config_path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError):
        return {"present": True, "readable": False, "top_level_keys": [], "tables": []}
    current_table = ""
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        table_match = CONFIG_TABLE.match(line)
        if table_match:
            current_table = QUOTED_TABLE_SEGMENT.sub(".*", table_match.group(1).strip())
            tables.add(current_table)
            continue
        assignment = CONFIG_ASSIGNMENT.match(line)
        if assignment and not current_table:
            keys.add(assignment.group(1))
    return {
        "present": True,
        "readable": True,
        "top_level_keys": sorted(keys),
        "tables": sorted(tables),
        "values_recorded": False,
    }


def collect_inventory(codex_root: Path) -> dict[str, Any]:
    """Collect effective-stack metadata while leaving credential files unread."""
    manifest_paths = sorted((codex_root / "plugins" / "cache").glob("*/*/*/.codex-plugin/plugin.json"))
    auth_present = (codex_root / "auth.json").is_file()
    return {
        "schema_version": SCHEMA_VERSION,
        "codex_root": str(codex_root),
        "auth": {
            "configured": auth_present,
            "mode": "configured-unread" if auth_present else "not-configured",
            "mode_source": "auth-file-presence" if auth_present else "none",
            "secret_values_read": False,
        },
        "plugins": [_plugin_metadata(path) for path in manifest_paths],
        "standalone_skills": _standalone_skills(codex_root),
        "config": _redacted_config_metadata(codex_root / "config.toml"),
    }
