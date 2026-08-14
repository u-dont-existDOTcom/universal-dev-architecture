#!/usr/bin/env python3
"""Audit a repository for Codex/GitHub operating and security hygiene.

The audit is intentionally conservative and standard-library-only. It checks
facts visible in the working tree. GitHub-hosted settings such as rulesets,
secret scanning, and push protection must be verified separately and recorded
in the repository profile; this tool never guesses their state.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Iterable

PROFILE_DEFAULT = ".github/codex-repository.json"
AGENTS_SOFT_LIMIT_BYTES = 24 * 1024

REPOSITORY_KINDS = {
    "software",
    "research",
    "content",
    "artifact",
    "policy",
    "archive",
}
VISIBILITIES = {"public", "private", "internal"}
RISKS = {"normal", "high", "critical"}
CONTROL_STATES = {"verified", "enabled", "disabled", "unverified", "not_applicable"}

CURRENT_STATE_HEADINGS = (
    "goal",
    "authority / baseline",
    "completed",
    "current checkpoint",
    "remaining",
    "blockers / unresolved",
    "evidence / artifacts",
    "next safe action",
)

LOCKFILES = {
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
    "uv.lock",
    "poetry.lock",
    "Pipfile.lock",
    "requirements.lock",
    "requirements.resolved.lock",
    "Cargo.lock",
    "go.sum",
    "Gemfile.lock",
    "composer.lock",
    "mix.lock",
    "Package.resolved",
}

IGNORED_WALK_DIRS = {
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    ".venv",
    "venv",
    "dist",
    "build",
    ".tox",
    ".mypy_cache",
    ".pytest_cache",
    "__pycache__",
}

FULL_SHA_RE = re.compile(r"^[0-9a-fA-F]{40}$")
TOP_LEVEL_PERMISSIONS_RE = re.compile(r"(?m)^permissions\s*:")
WRITE_ALL_RE = re.compile(r"(?m)^\s*permissions\s*:\s*write-all\s*(?:#.*)?$")
ON_TRIGGER_LINE_RE = re.compile(
    r"^(?P<indent>[ \t]*)(?P<quote>[\"']?)on(?P=quote)[ \t]*:[ \t]*(?P<value>[^\r\n]*)$"
)
BLOCK_SCALAR_RE = re.compile(
    r":\s*[>|](?:(?:[+-][1-9]?)|(?:[1-9][+-]?))?\s*(?:#.*)?$"
)


def finding(
    severity: str,
    code: str,
    message: str,
    path: str | None = None,
    remediation: str | None = None,
) -> dict[str, object]:
    item: dict[str, object] = {
        "severity": severity,
        "code": code,
        "message": message,
    }
    if path:
        item["path"] = path
    if remediation:
        item["remediation"] = remediation
    return item


def _safe_relative_path(root: Path, relative: str) -> Path | None:
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate


def _tracked_or_present_files(root: Path) -> set[str]:
    """Return Git-tracked files when possible, otherwise visible repository files."""
    if (root / ".git").exists():
        try:
            result = subprocess.run(
                ["git", "-C", str(root), "ls-files", "-z"],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=15,
            )
            return {
                value.decode("utf-8", errors="replace")
                for value in result.stdout.split(b"\0")
                if value
            }
        except (OSError, subprocess.SubprocessError):
            pass

    files: set[str] = set()
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(root)
        if any(part in IGNORED_WALK_DIRS for part in relative.parts):
            continue
        files.add(relative.as_posix())
    return files


def _load_profile(
    root: Path, profile_relative: str, findings: list[dict[str, object]]
) -> dict[str, Any] | None:
    profile_path = _safe_relative_path(root, profile_relative)
    if profile_path is None:
        findings.append(
            finding(
                "error",
                "repo.profile.path-invalid",
                "The repository profile path escapes the repository root.",
                profile_relative,
            )
        )
        return None

    if not profile_path.is_file():
        findings.append(
            finding(
                "error",
                "repo.profile.missing",
                "The machine-readable Codex repository profile is missing.",
                profile_relative,
                "Create the profile from the universal template and record only verified facts.",
            )
        )
        return None

    try:
        loaded = json.loads(profile_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        findings.append(
            finding(
                "error",
                "repo.profile.invalid",
                f"The repository profile is not valid UTF-8 JSON: {exc}",
                profile_relative,
            )
        )
        return None

    if not isinstance(loaded, dict):
        findings.append(
            finding(
                "error",
                "repo.profile.invalid",
                "The repository profile root must be a JSON object.",
                profile_relative,
            )
        )
        return None

    profile: dict[str, Any] = loaded
    if profile.get("schema_version") != 1:
        findings.append(
            finding(
                "error",
                "repo.profile.schema",
                "`schema_version` must currently be 1.",
                profile_relative,
            )
        )

    kind = profile.get("repository_kind")
    if kind not in REPOSITORY_KINDS:
        findings.append(
            finding(
                "error",
                "repo.profile.kind",
                f"`repository_kind` must be one of: {', '.join(sorted(REPOSITORY_KINDS))}.",
                profile_relative,
            )
        )

    visibility = profile.get("visibility")
    if visibility not in VISIBILITIES:
        findings.append(
            finding(
                "error",
                "repo.profile.visibility",
                f"`visibility` must be one of: {', '.join(sorted(VISIBILITIES))}.",
                profile_relative,
            )
        )

    risk = profile.get("risk")
    if risk not in RISKS:
        findings.append(
            finding(
                "error",
                "repo.profile.risk",
                f"`risk` must be one of: {', '.join(sorted(RISKS))}.",
                profile_relative,
            )
        )

    for boolean_field in ("active", "long_running"):
        if not isinstance(profile.get(boolean_field), bool):
            findings.append(
                finding(
                    "error",
                    f"repo.profile.{boolean_field.replace('_', '-')}",
                    f"`{boolean_field}` must be true or false.",
                    profile_relative,
                )
            )

    commands = profile.get("commands")
    if not isinstance(commands, dict):
        findings.append(
            finding(
                "error",
                "repo.profile.commands",
                "`commands` must be a JSON object mapping operation names to exact commands.",
                profile_relative,
            )
        )

    controls = profile.get("github_controls")
    if controls is not None and not isinstance(controls, dict):
        findings.append(
            finding(
                "error",
                "repo.profile.github-controls",
                "`github_controls` must be a JSON object.",
                profile_relative,
            )
        )
    elif isinstance(controls, dict):
        for name, state in controls.items():
            if state not in CONTROL_STATES:
                findings.append(
                    finding(
                        "error",
                        "repo.profile.github-control-state",
                        f"GitHub control `{name}` has unsupported state `{state}`.",
                        profile_relative,
                    )
                )

    return profile


def _audit_foundation(
    root: Path, files: set[str], findings: list[dict[str, object]]
) -> None:
    agents = root / "AGENTS.md"
    if not agents.is_file():
        findings.append(
            finding(
                "error",
                "codex.agents.missing",
                "Root `AGENTS.md` is missing, so Codex has no repository-persistent operating contract.",
                "AGENTS.md",
            )
        )
    else:
        try:
            content = agents.read_text(encoding="utf-8")
            size = len(content.encode("utf-8"))
            if size > AGENTS_SOFT_LIMIT_BYTES:
                findings.append(
                    finding(
                        "warning",
                        "codex.agents.oversized",
                        f"Root `AGENTS.md` is {size} bytes; keep root instructions concise and move local differences into nested files.",
                        "AGENTS.md",
                    )
                )
            lowered = content.lower()
            if not any(
                token in lowered
                for token in ("test", "verify", "validation", "repository profile")
            ):
                findings.append(
                    finding(
                        "warning",
                        "codex.agents.verification-missing",
                        "`AGENTS.md` does not appear to name a verification gate or repository profile.",
                        "AGENTS.md",
                    )
                )
        except (OSError, UnicodeError) as exc:
            findings.append(
                finding(
                    "error",
                    "codex.agents.unreadable",
                    f"`AGENTS.md` is not readable UTF-8: {exc}",
                    "AGENTS.md",
                )
            )

    if not any(Path(name).name.lower().startswith("readme") for name in files):
        findings.append(
            finding(
                "error",
                "repo.readme.missing",
                "A repository README is missing.",
                "README.md",
            )
        )

    if ".gitignore" not in files:
        findings.append(
            finding(
                "warning",
                "repo.gitignore.missing",
                "`.gitignore` is missing; generated files and local secrets are easier to commit accidentally.",
                ".gitignore",
            )
        )


def _audit_current_state(
    root: Path,
    profile: dict[str, Any],
    findings: list[dict[str, object]],
) -> None:
    if not (profile.get("active") and profile.get("long_running")):
        return

    relative = profile.get("current_state")
    if not isinstance(relative, str) or not relative.strip():
        findings.append(
            finding(
                "error",
                "continuity.current-state.path-missing",
                "Active long-running repositories must declare `current_state` in the profile.",
                PROFILE_DEFAULT,
            )
        )
        return

    state_path = _safe_relative_path(root, relative)
    if state_path is None:
        findings.append(
            finding(
                "error",
                "continuity.current-state.path-invalid",
                "The current-state path escapes the repository root.",
                relative,
            )
        )
        return

    if not state_path.is_file():
        findings.append(
            finding(
                "error",
                "continuity.current-state.missing",
                "Active long-running work has no canonical recovery checkpoint.",
                relative,
                "Create the checkpoint from `templates/CURRENT-STATE.md` and keep it synchronized at durable boundaries.",
            )
        )
        return

    try:
        text = state_path.read_text(encoding="utf-8").lower()
    except (OSError, UnicodeError) as exc:
        findings.append(
            finding(
                "error",
                "continuity.current-state.unreadable",
                f"The current-state checkpoint is not readable UTF-8: {exc}",
                relative,
            )
        )
        return

    missing = [heading for heading in CURRENT_STATE_HEADINGS if heading not in text]
    if missing:
        findings.append(
            finding(
                "warning",
                "continuity.current-state.incomplete",
                "The recovery checkpoint is missing expected sections: " + ", ".join(missing),
                relative,
            )
        )


def _workflow_files(root: Path) -> list[Path]:
    workflow_dir = root / ".github" / "workflows"
    if not workflow_dir.is_dir():
        return []
    return sorted(
        path
        for path in workflow_dir.iterdir()
        if path.is_file() and path.suffix.lower() in {".yml", ".yaml"}
    )


def _workflow_structure(text: str) -> str:
    """Remove block-scalar bodies while retaining physical workflow keys."""

    structural: list[str] = []
    block_indent: int | None = None
    for line in text.splitlines():
        stripped = line.strip()
        indent = len(line) - len(line.lstrip(" "))
        if block_indent is not None:
            if not stripped or indent > block_indent:
                structural.append("")
                continue
            block_indent = None
        structural.append(line)
        if BLOCK_SCALAR_RE.search(line):
            block_indent = indent
    return "\n".join(structural)


def _yaml_code(line: str) -> str:
    if line.lstrip().startswith("#"):
        return ""
    return line.split("#", 1)[0].rstrip()


def _yaml_indent(line: str) -> int:
    return len(line) - len(line.lstrip(" \t"))


def _flow_balance(value: str) -> int:
    balance = 0
    quote: str | None = None
    escaped = False
    for character in value:
        if quote is not None:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == quote:
                quote = None
            continue
        if character in {'"', "'"}:
            quote = character
        elif character in "[{":
            balance += 1
        elif character in "]}":
            balance -= 1
    return balance


def _normalized_scalar(value: str) -> str | None:
    scalar = value.strip()
    if "\\" in scalar:
        return None
    if (
        len(scalar) >= 2
        and scalar[0] == scalar[-1]
        and scalar[0] in {'"', "'"}
    ):
        return scalar[1:-1]
    return scalar


def _normalized_key(value: str) -> str | None:
    key = value.strip()
    if len(key) >= 2 and key[0] == key[-1] == '"':
        try:
            decoded = json.loads(key)
        except json.JSONDecodeError:
            return None
        return decoded if isinstance(decoded, str) else None
    if len(key) >= 2 and key[0] == key[-1] == "'":
        return key[1:-1].replace("''", "'")
    if "\\" in key:
        return None
    return key


def _yaml_key_is_unresolved(key: str) -> bool:
    return key.startswith(("*", "&", "!", "|", ">", "?", ":", "$"))


def _flow_parts(value: str) -> list[str] | None:
    if len(value) < 2 or value[0] not in "[{" or value[-1] not in "]}":
        return None
    parts: list[str] = []
    depth = 0
    quote: str | None = None
    escaped = False
    start = 1
    for index, character in enumerate(value[1:-1], start=1):
        if quote is not None:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == quote:
                quote = None
            continue
        if character in {'"', "'"}:
            quote = character
        elif character in "[{":
            depth += 1
        elif character in "]}":
            depth -= 1
            if depth < 0:
                return None
        elif character == "," and depth == 0:
            parts.append(value[start:index].strip())
            start = index + 1
    if quote is not None or depth != 0:
        return None
    final = value[start:-1].strip()
    if final:
        parts.append(final)
    return parts


def _top_level_colon(value: str) -> int | None:
    depth = 0
    quote: str | None = None
    escaped = False
    for index, character in enumerate(value):
        if quote is not None:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == quote:
                quote = None
            continue
        if character in {'"', "'"}:
            quote = character
        elif character in "[{":
            depth += 1
        elif character in "]}":
            depth -= 1
        elif character == ":" and depth == 0:
            return index
    return None


def _flow_uses_pull_request_target(value: str) -> bool | None:
    parts = _flow_parts(value)
    if parts is None:
        return None
    if value.startswith("["):
        for part in parts:
            event = _normalized_scalar(part)
            if event is None or event.startswith(("*", "!", "&", "|", ">", "?", ":")):
                return None
            if event == "pull_request_target":
                return True
        return False

    for part in parts:
        colon = _top_level_colon(part)
        if colon is None:
            return None
        event = _normalized_scalar(part[:colon])
        if event is None or event.startswith(("*", "!", "&", "|", ">", "?", ":")):
            return None
        if event == "pull_request_target":
            return True
    return False


def _action_scalar(value: str) -> str:
    scalar = value.strip()
    if (
        len(scalar) >= 2
        and scalar[0] == scalar[-1]
        and scalar[0] in {'"', "'"}
    ):
        return scalar[1:-1]
    return scalar


def _flow_mapping_items(value: str) -> list[tuple[str, str]] | None:
    if not value.startswith("{"):
        return None
    parts = _flow_parts(value)
    if parts is None:
        return None
    items: list[tuple[str, str]] = []
    for part in parts:
        colon = _top_level_colon(part)
        if colon is None:
            return None
        key_source = part[:colon].strip()
        if key_source.startswith("?") and (
            len(key_source) == 1 or key_source[1].isspace()
        ):
            key_source = key_source[1:].lstrip(" \t")
        key = _normalized_key(key_source)
        if key is None:
            key = ":unresolved-yaml-key"
        items.append((key, part[colon + 1 :].strip()))
    return items


def _flow_step_uses_values(value: str) -> list[str]:
    value = value.strip()
    if value.startswith(("*", "&", "!", "|", ">", "?", ":", "$")):
        return [value]
    parts = _flow_parts(value)
    if parts is None:
        return []
    if value.startswith("["):
        values: list[str] = []
        for part in parts:
            if part.startswith("{"):
                values.extend(_flow_step_uses_values(part))
            elif part.startswith(("*", "&", "!", "|", ">", "?", ":", "$")):
                values.append(part)
        return values

    items = _flow_mapping_items(value)
    if items is None:
        return []
    values: list[str] = []
    for key, raw in items:
        if key == "uses":
            values.append(_action_scalar(raw))
        elif _yaml_key_is_unresolved(key):
            values.append(key)
    return values


def _flow_job_uses_values(value: str) -> list[str]:
    items = _flow_mapping_items(value)
    if items is None:
        return []
    values: list[str] = []
    for key, raw in items:
        if key == "uses":
            values.append(_action_scalar(raw))
        elif _yaml_key_is_unresolved(key):
            values.append(key)
        elif key == "<<" and raw.startswith(("*", "&", "!", "$")):
            values.append(raw)
        elif key == "steps":
            values.extend(_flow_step_uses_values(raw))
    return values


def _flow_jobs_uses_values(value: str) -> list[str]:
    items = _flow_mapping_items(value)
    if items is None:
        return []
    values: list[str] = []
    for _job, raw in items:
        if raw.startswith("{"):
            values.extend(_flow_job_uses_values(raw))
        elif raw.startswith(("*", "&", "!", "|", ">", "?", ":", "$")):
            values.append(raw)
    return values


def _block_mapping_entry(line: str) -> tuple[int, bool, str, str] | None:
    indent = _yaml_indent(line)
    content = line.lstrip(" \t")
    sequence_item = False
    if content.startswith("-") and (
        len(content) == 1 or content[1].isspace()
    ):
        sequence_item = True
        content = content[1:].lstrip(" \t")
    colon = _top_level_colon(content)
    if colon is None:
        return None
    key = _normalized_key(content[:colon])
    if key is None:
        key = ":unresolved-yaml-key"
    if not key:
        return None
    return indent, sequence_item, key, content[colon + 1 :].strip()


def _explicit_mapping_entry(
    lines: list[str], index: int
) -> tuple[int, bool, str, str, int] | None:
    line = _yaml_code(lines[index])
    indent = _yaml_indent(line)
    content = line.lstrip(" \t")
    sequence_item = False
    if content.startswith("-") and (
        len(content) == 1 or content[1].isspace()
    ):
        sequence_item = True
        content = content[1:].lstrip(" \t")
    if not content.startswith("?") or (
        len(content) > 1 and not content[1].isspace()
    ):
        return None

    explicit = content[1:].lstrip(" \t")
    colon = _top_level_colon(explicit)
    if colon is not None:
        key = _normalized_key(explicit[:colon])
        if not key:
            return None
        return indent, sequence_item, key, explicit[colon + 1 :].strip(), index

    key = _normalized_key(explicit)
    if not key:
        return None
    value_indent = indent + 2 if sequence_item else indent
    lookahead = index + 1
    while lookahead < len(lines):
        value_line = _yaml_code(lines[lookahead])
        if not value_line.strip():
            lookahead += 1
            continue
        value_content = value_line.lstrip(" \t")
        if _yaml_indent(value_line) == value_indent and value_content.startswith(":"):
            return (
                indent,
                sequence_item,
                key,
                value_content[1:].lstrip(" \t"),
                lookahead,
            )
        break
    return indent, sequence_item, key, "", index


def _collect_flow_value(
    lines: list[str], index: int, initial: str
) -> tuple[str, int]:
    value = initial.strip()
    end = index
    if not value.startswith(("[", "{")):
        return value, end
    while _flow_balance(value) > 0 and end + 1 < len(lines):
        end += 1
        value += "\n" + _yaml_code(lines[end]).strip()
    return value, end


def _uses_values(structure: str) -> list[str]:
    """Return action references only from step and reusable-job `uses` nodes."""

    lines = structure.splitlines()
    code = "\n".join(
        code_line
        for line in lines
        if (code_line := _yaml_code(line)).strip() not in {"---", "..."}
    ).strip()
    if code.startswith("{") and _flow_balance(code) == 0:
        root_items = _flow_mapping_items(code)
        if root_items is None:
            return []
        values: list[str] = []
        for key, raw in root_items:
            if key == "jobs":
                values.extend(_flow_jobs_uses_values(raw))
            elif _yaml_key_is_unresolved(key):
                values.append(key)
        return values

    values: list[str] = []
    stack: list[tuple[int, str]] = []
    index = 0
    while index < len(lines):
        line = _yaml_code(lines[index])
        if not line.strip():
            index += 1
            continue
        indent = _yaml_indent(line)
        stripped = line.lstrip(" \t")
        sequence_line = stripped.startswith("-") and (
            len(stripped) == 1 or stripped[1].isspace()
        )
        while stack and stack[-1][0] >= indent:
            if sequence_line and stack[-1] == (indent, "steps"):
                break
            stack.pop()
        parent = [key for _level, key in stack]

        explicit_entry = _explicit_mapping_entry(lines, index)
        if explicit_entry is None:
            entry = _block_mapping_entry(line)
            value_index = index
        else:
            entry = explicit_entry[:4]
            value_index = explicit_entry[4]
        if entry is None:
            if (
                sequence_line
                and len(stripped) > 1
                and len(parent) == 3
                and parent[0] == "jobs"
                and parent[2] == "steps"
            ):
                flow, end = _collect_flow_value(
                    lines, index, stripped[1:].lstrip(" \t")
                )
                values.extend(_flow_step_uses_values(flow))
                index = end + 1
                continue
            index += 1
            continue

        _indent, sequence_item, key, raw = entry
        direct_job = len(parent) == 2 and parent[0] == "jobs"
        direct_step_item = (
            len(parent) == 3
            and parent[0] == "jobs"
            and parent[2] == "steps"
            and sequence_item
        ) or (
            len(parent) == 4
            and parent[0] == "jobs"
            and parent[2:] == ["steps", "[]"]
            and not sequence_item
        )

        flow, end = _collect_flow_value(lines, value_index, raw)
        if key == "uses" and (direct_job or direct_step_item):
            values.append(_action_scalar(flow))
        elif _yaml_key_is_unresolved(key) and (
            direct_job or direct_step_item or not parent
        ):
            values.append(key)
        elif key == "<<" and (direct_job or direct_step_item) and flow.startswith(
            ("*", "&", "!", "$")
        ):
            values.append(flow)
        elif key == "jobs" and not parent and flow.startswith("{"):
            values.extend(_flow_jobs_uses_values(flow))
        elif len(parent) == 1 and parent[0] == "jobs":
            if flow.startswith("{"):
                values.extend(_flow_job_uses_values(flow))
            elif flow.startswith(("*", "&", "!", "|", ">", "?", ":", "$")):
                values.append(flow)
        elif key == "steps" and direct_job:
            values.extend(_flow_step_uses_values(flow))

        if sequence_item:
            stack.append((indent, "[]"))
            stack.append((indent + 2, key))
        else:
            stack.append((indent, key))
        index = end + 1
    return values


def _uses_value_is_unresolved(value: str) -> bool:
    return "\\" in value or value.startswith(("*", "&", "!", "|", ">", "?", ":", "$"))


def _uses_value_may_be_checkout(value: str) -> bool:
    if value.startswith("./") or value.startswith("docker://"):
        return False
    if _uses_value_is_unresolved(value):
        return True
    action, separator, _ref = value.rpartition("@")
    if not separator:
        return True
    return action.lower() == "actions/checkout"


def _uses_pull_request_target(structure: str) -> bool:
    """Recognize common trigger forms and fail closed on unresolved root syntax."""

    lines = structure.splitlines()
    root_indents = [
        _yaml_indent(code)
        for line in lines
        if (code := _yaml_code(line)).strip()
        and code.strip() not in {"---", "..."}
    ]
    if not root_indents:
        return True
    root_indent = min(root_indents)
    saw_trigger_node = False

    for index, line in enumerate(lines):
        code = _yaml_code(line)
        match = ON_TRIGGER_LINE_RE.match(code)
        if match is None or _yaml_indent(code) != root_indent:
            continue
        saw_trigger_node = True
        base_indent = _yaml_indent(code)
        value = match.group("value").strip()
        while value.startswith(("&", "!")):
            node_property = value.split(None, 1)
            value = node_property[1].lstrip() if len(node_property) == 2 else ""

        # Resolving aliases, escaped scalars, and block scalars requires more
        # YAML semantics than this standard-library audit claims to implement.
        if value.startswith(("*", "|", ">")):
            return True
        if value:
            if value.startswith(("[", "{")):
                balance = _flow_balance(value)
                flow = value
                for continuation in lines[index + 1 :]:
                    if balance <= 0:
                        break
                    continuation_code = _yaml_code(continuation)
                    flow += "\n" + continuation_code
                    balance += _flow_balance(continuation_code)
                if balance != 0:
                    return True
                result = _flow_uses_pull_request_target(flow)
                if result is None or result:
                    return True
                continue
            event = _normalized_scalar(value)
            if event is None:
                return True
            if event == "pull_request_target":
                return True
            continue

        direct_child_indent: int | None = None
        sequence_indent: int | None = None
        children = lines[index + 1 :]
        for child_index, child in enumerate(children):
            child_code = _yaml_code(child)
            if not child_code.strip():
                continue
            indent = _yaml_indent(child_code)
            stripped = child_code.strip()
            if direct_child_indent is None and sequence_indent is None:
                if stripped.startswith("-") and indent >= base_indent:
                    sequence_indent = indent
                elif indent > base_indent:
                    direct_child_indent = indent
                else:
                    break

            if sequence_indent is not None:
                if indent < sequence_indent:
                    break
                if indent != sequence_indent:
                    continue
                if not stripped.startswith("-"):
                    break
                event = stripped[1:].strip()
                if not event:
                    for nested in children[child_index + 1 :]:
                        nested_code = _yaml_code(nested)
                        if not nested_code.strip():
                            continue
                        if _yaml_indent(nested_code) <= sequence_indent:
                            break
                        event = nested_code.strip()
                        break
                if "\\" in event or "*" in event or event.startswith(
                    ("?", ":", "!", "&", "|", ">")
                ):
                    return True
                event = event.split(":", 1)[0].strip().strip("\"'")
                if event == "pull_request_target":
                    return True
                continue

            if indent <= base_indent:
                break
            if indent != direct_child_indent:
                continue
            event = stripped
            if "\\" in event or "*" in event or event.startswith(
                ("?", ":", "!", "&", "|", ">")
            ):
                return True
            event = event.split(":", 1)[0].strip().strip("\"'")
            if event == "pull_request_target":
                return True

    # Root flow mappings, explicit keys, and other unresolved root forms are
    # not proven safe by this dependency-free parser.
    return not saw_trigger_node


def _audit_workflows(
    root: Path,
    workflows: Iterable[Path],
    findings: list[dict[str, object]],
) -> None:
    for path in workflows:
        relative = path.relative_to(root).as_posix()
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            findings.append(
                finding(
                    "error",
                    "actions.workflow.unreadable",
                    f"Workflow is not readable UTF-8: {exc}",
                    relative,
                )
            )
            continue

        structure = _workflow_structure(text)
        code_structure = "\n".join(
            _yaml_code(line) for line in structure.splitlines()
        )
        uses_values = _uses_values(code_structure)

        if not TOP_LEVEL_PERMISSIONS_RE.search(structure):
            findings.append(
                finding(
                    "warning",
                    "actions.permissions.implicit",
                    "Workflow does not set explicit top-level `permissions`; repository defaults may grant more than intended.",
                    relative,
                    "Declare the smallest read/write permissions needed, normally starting with `contents: read`.",
                )
            )

        if WRITE_ALL_RE.search(structure):
            findings.append(
                finding(
                    "error",
                    "actions.permissions.write-all",
                    "Workflow grants `write-all`, violating least privilege.",
                    relative,
                )
            )

        if _uses_pull_request_target(structure) and any(
            _uses_value_may_be_checkout(value) for value in uses_values
        ):
            findings.append(
                finding(
                    "error",
                    "actions.pull-request-target.checkout",
                    "Workflow combines `pull_request_target` with checkout; untrusted pull-request code must not execute in a privileged context.",
                    relative,
                    "Use `pull_request` with read-only permissions, or redesign the privileged workflow so it never checks out or executes untrusted code.",
                )
            )

        for value in uses_values:
            if value.startswith("./") or value.startswith("docker://"):
                continue
            if _uses_value_is_unresolved(value):
                findings.append(
                    finding(
                        "warning",
                        "actions.ref.unresolved",
                        f"Action reference `{value}` cannot be resolved statically.",
                        relative,
                        "Use a direct remote action reference pinned to a reviewed full commit SHA.",
                    )
                )
                continue
            action, separator, ref = value.rpartition("@")
            if not separator:
                findings.append(
                    finding(
                        "warning",
                        "actions.ref.unresolved",
                        f"Action reference `{value}` has no statically verifiable ref.",
                        relative,
                        "Use a direct remote action reference pinned to a reviewed full commit SHA.",
                    )
                )
                continue
            if not FULL_SHA_RE.fullmatch(ref):
                findings.append(
                    finding(
                        "warning",
                        "actions.ref.unpinned",
                        f"Remote action or reusable workflow `{action}@{ref}` is not pinned to an immutable 40-character commit SHA.",
                        relative,
                        "Pin the dependency to a reviewed full commit SHA and let Dependabot propose controlled updates.",
                    )
                )


def _audit_software(
    root: Path,
    files: set[str],
    profile: dict[str, Any],
    workflows: list[Path],
    findings: list[dict[str, object]],
) -> None:
    if profile.get("repository_kind") != "software":
        return

    commands = profile.get("commands")
    commands = commands if isinstance(commands, dict) else {}
    test_command = commands.get("test")
    if not isinstance(test_command, str) or not test_command.strip():
        findings.append(
            finding(
                "error",
                "software.command.test.missing",
                "Software repository profile does not provide one exact test command.",
                PROFILE_DEFAULT,
            )
        )

    bootstrap = commands.get("bootstrap")
    if not isinstance(bootstrap, str) or not bootstrap.strip():
        findings.append(
            finding(
                "warning",
                "software.command.bootstrap.missing",
                "Software repository profile does not provide one reproducible bootstrap/install command.",
                PROFILE_DEFAULT,
            )
        )

    if profile.get("active") and not workflows:
        findings.append(
            finding(
                "error",
                "software.ci.missing",
                "Active software repository has no GitHub Actions workflow.",
                ".github/workflows",
            )
        )

    if not any(Path(name).name in LOCKFILES for name in files):
        findings.append(
            finding(
                "warning",
                "software.lockfile.missing",
                "No recognized dependency lock/resolution file was found.",
            )
        )

    if ".github/dependabot.yml" not in files and ".github/dependabot.yaml" not in files:
        findings.append(
            finding(
                "warning",
                "supply-chain.dependabot.missing",
                "Dependabot version-update configuration was not found.",
                ".github/dependabot.yml",
            )
        )

    pr_templates = {
        ".github/pull_request_template.md",
        "pull_request_template.md",
        "docs/pull_request_template.md",
    }
    has_pr_template = bool(pr_templates.intersection({name.lower() for name in files}))
    has_pr_template_dir = any(
        name.lower().startswith(".github/pull_request_template/") for name in files
    )
    if profile.get("active") and not (has_pr_template or has_pr_template_dir):
        findings.append(
            finding(
                "warning",
                "pull-request.template.missing",
                "Active software repository has no pull-request template requiring acceptance and verification evidence.",
            )
        )


def _audit_public_and_risk_controls(
    files: set[str],
    profile: dict[str, Any],
    findings: list[dict[str, object]],
) -> None:
    visibility = profile.get("visibility")
    risk = profile.get("risk")
    kind = profile.get("repository_kind")
    lower_files = {name.lower() for name in files}

    security_present = "security.md" in lower_files or ".github/security.md" in lower_files
    if visibility == "public" and not security_present:
        findings.append(
            finding(
                "error" if risk in {"high", "critical"} else "warning",
                "security.policy.missing",
                "Public repository has no security policy describing private vulnerability reporting.",
                "SECURITY.md",
            )
        )

    if visibility == "public" and not any(
        Path(name).name.lower().startswith(("license", "copying")) for name in files
    ):
        findings.append(
            finding(
                "warning",
                "repo.license.missing",
                "Public repository does not declare a license; public visibility alone does not grant reuse rights.",
            )
        )

    if visibility == "public" and not any(
        Path(name).name.lower().startswith("contributing") for name in files
    ):
        findings.append(
            finding(
                "warning",
                "repo.contributing.missing",
                "Public repository has no contributing guide.",
            )
        )

    codeowners_present = (
        "codeowners" in lower_files
        or ".github/codeowners" in lower_files
        or "docs/codeowners" in lower_files
    )
    if (visibility == "public" or risk in {"high", "critical"}) and not codeowners_present:
        findings.append(
            finding(
                "warning",
                "review.codeowners.missing",
                "Public or high-risk repository has no CODEOWNERS routing for sensitive paths.",
                ".github/CODEOWNERS",
            )
        )

    controls = profile.get("github_controls")
    controls = controls if isinstance(controls, dict) else {}
    controls_to_check: list[tuple[str, str]] = []
    if profile.get("active") and (
        kind == "software"
        or visibility == "public"
        or risk in {"high", "critical"}
    ):
        controls_to_check.append(("default_branch_rules", "default-branch ruleset"))
    if visibility == "public" or risk in {"high", "critical"}:
        controls_to_check.extend(
            [
                ("secret_scanning", "secret scanning"),
                ("push_protection", "secret-scanning push protection"),
            ]
        )
    if kind == "software" and (visibility == "public" or risk in {"high", "critical"}):
        controls_to_check.append(("code_scanning", "code scanning"))

    seen: set[str] = set()
    for key, label in controls_to_check:
        if key in seen:
            continue
        seen.add(key)
        state = controls.get(key, "unverified")
        if state == "unverified" or key not in controls:
            findings.append(
                finding(
                    "warning",
                    f"github-control.{key.replace('_', '-')}.unverified",
                    f"GitHub-hosted {label} has not been verified. The working tree cannot prove this setting.",
                    PROFILE_DEFAULT,
                )
            )
        elif state == "disabled":
            findings.append(
                finding(
                    "warning",
                    f"github-control.{key.replace('_', '-')}.disabled",
                    f"GitHub-hosted {label} is recorded as disabled.",
                    PROFILE_DEFAULT,
                )
            )


def _looks_like_secret_file(relative: str) -> tuple[bool, str]:
    path = Path(relative)
    base = path.name.lower()

    if base in {".env.example", ".env.sample", ".env.template"}:
        return False, ""
    if base == ".env" or (
        base.startswith(".env.")
        and not base.endswith((".example", ".sample", ".template"))
    ):
        return True, "environment file"

    if base in {
        "id_rsa",
        "id_ed25519",
        "credentials.json",
        "service-account.json",
        "service_account.json",
        "secrets.json",
    }:
        return True, "credential/private-key file"

    if base.endswith((".p12", ".pfx")):
        return True, "private-key bundle"

    if base.endswith((".pem", ".key")) and any(
        token in base for token in ("private", "secret", "credential", "id_")
    ):
        return True, "probable private-key file"

    return False, ""


def _audit_secret_filenames(
    files: set[str], findings: list[dict[str, object]]
) -> None:
    for relative in sorted(files):
        likely, category = _looks_like_secret_file(relative)
        if likely:
            findings.append(
                finding(
                    "error",
                    "secrets.likely-file",
                    f"Repository contains a likely {category}. The audit does not read or expose its contents.",
                    relative,
                    "Remove it from Git history if it contains a real secret, rotate the credential, and keep only a redacted example file.",
                )
            )


def audit_repository(
    root: Path | str,
    profile_relative: str = PROFILE_DEFAULT,
) -> list[dict[str, object]]:
    root_path = Path(root).resolve()
    findings: list[dict[str, object]] = []

    if not root_path.is_dir():
        return [
            finding(
                "error",
                "repo.root.invalid",
                f"Repository root does not exist or is not a directory: {root_path}",
            )
        ]

    files = _tracked_or_present_files(root_path)
    _audit_foundation(root_path, files, findings)
    profile = _load_profile(root_path, profile_relative, findings)
    _audit_secret_filenames(files, findings)

    workflows = _workflow_files(root_path)
    _audit_workflows(root_path, workflows, findings)

    if profile is not None:
        _audit_current_state(root_path, profile, findings)
        _audit_software(root_path, files, profile, workflows, findings)
        _audit_public_and_risk_controls(files, profile, findings)

    severity_order = {"error": 0, "warning": 1, "info": 2}
    return sorted(
        findings,
        key=lambda item: (
            severity_order.get(str(item.get("severity")), 9),
            str(item.get("code", "")),
            str(item.get("path", "")),
            str(item.get("message", "")),
        ),
    )


def _render_text(findings: list[dict[str, object]]) -> str:
    if not findings:
        return "PASS: no findings.\n"

    lines: list[str] = []
    counts = {"error": 0, "warning": 0, "info": 0}
    for item in findings:
        severity = str(item["severity"])
        counts[severity] = counts.get(severity, 0) + 1
        location = f" ({item['path']})" if item.get("path") else ""
        lines.append(
            f"[{severity.upper()}] {item['code']}{location}: {item['message']}"
        )
        if item.get("remediation"):
            lines.append(f"  Fix: {item['remediation']}")

    lines.append("")
    lines.append(
        "Summary: "
        f"{counts.get('error', 0)} error(s), "
        f"{counts.get('warning', 0)} warning(s), "
        f"{counts.get('info', 0)} informational finding(s)."
    )
    return "\n".join(lines) + "\n"


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".", help="Repository root (default: .)")
    parser.add_argument(
        "--profile",
        default=PROFILE_DEFAULT,
        help=f"Profile path relative to root (default: {PROFILE_DEFAULT})",
    )
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument(
        "--fail-on",
        choices=("error", "warning", "never"),
        default="error",
        help="Exit non-zero at this minimum severity (default: error)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    findings = audit_repository(Path(args.root), args.profile)

    if args.format == "json":
        print(json.dumps({"findings": findings}, indent=2, sort_keys=True))
    else:
        print(_render_text(findings), end="")

    if args.fail_on == "never":
        return 0
    if any(item["severity"] == "error" for item in findings):
        return 1
    if args.fail_on == "warning" and any(
        item["severity"] == "warning" for item in findings
    ):
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
