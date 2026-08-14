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
USES_RE = re.compile(
    r"(?m)^\s*-?\s*uses:\s*[\"']?([^@\s\"']+)@([^\s#\"']+)"
)
TOP_LEVEL_PERMISSIONS_RE = re.compile(r"(?m)^permissions\s*:")
WRITE_ALL_RE = re.compile(r"(?m)^\s*permissions\s*:\s*write-all\s*(?:#.*)?$")
PULL_REQUEST_TARGET_RE = re.compile(
    r"(?m)^\s*(?:on\s*:\s*)?pull_request_target\s*:\s*(?:#.*)?$|"
    r"(?m)^\s*on\s*:\s*pull_request_target\s*(?:#.*)?$"
)
CHECKOUT_RE = re.compile(r"(?m)^\s*-?\s*uses:\s*[\"']?actions/checkout@")


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

        if not TOP_LEVEL_PERMISSIONS_RE.search(text):
            findings.append(
                finding(
                    "warning",
                    "actions.permissions.implicit",
                    "Workflow does not set explicit top-level `permissions`; repository defaults may grant more than intended.",
                    relative,
                    "Declare the smallest read/write permissions needed, normally starting with `contents: read`.",
                )
            )

        if WRITE_ALL_RE.search(text):
            findings.append(
                finding(
                    "error",
                    "actions.permissions.write-all",
                    "Workflow grants `write-all`, violating least privilege.",
                    relative,
                )
            )

        if PULL_REQUEST_TARGET_RE.search(text) and CHECKOUT_RE.search(text):
            findings.append(
                finding(
                    "error",
                    "actions.pull-request-target.checkout",
                    "Workflow combines `pull_request_target` with checkout; untrusted pull-request code must not execute in a privileged context.",
                    relative,
                    "Use `pull_request` with read-only permissions, or redesign the privileged workflow so it never checks out or executes untrusted code.",
                )
            )

        for action, ref in USES_RE.findall(text):
            if action.startswith("./") or action.startswith("docker://"):
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
    if profile.get("active") and kind == "software":
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
