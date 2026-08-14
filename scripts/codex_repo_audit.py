#!/usr/bin/env python3
"""Audit a repository for the canonical Codex/GitHub operating baseline."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.repo_audit_checks import check_policy_requirements
from scripts.repo_audit_common import Finding, apply_exceptions, read_policy


def audit_repository(root: Path | str, *, today: dt.date | None = None) -> list[Finding]:
    root_path = Path(root).resolve()
    policy, policy_findings = read_policy(root_path)
    findings = [*policy_findings, *check_policy_requirements(root_path, policy)]
    findings = apply_exceptions(findings, policy, today=today)
    return sorted(findings, key=lambda item: ({"error": 0, "warning": 1}.get(item.severity, 2), item.code, item.path or ""))


def _print_human(findings: list[Finding], root: Path) -> None:
    errors = sum(item.severity == "error" for item in findings)
    warnings = sum(item.severity == "warning" for item in findings)
    print(f"{'PASS' if errors == 0 else 'FAIL'} repository={root} errors={errors} warnings={warnings}")
    for item in findings:
        location = f" [{item.path}]" if item.path else ""
        print(f"{item.severity.upper():7} {item.code}{location}: {item.message}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", default=".", help="Repository root (default: current directory)")
    parser.add_argument("--json", action="store_true", dest="as_json", help="Emit machine-readable JSON")
    parser.add_argument("--strict-warnings", action="store_true", help="Return nonzero when warnings are present")
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    findings = audit_repository(root)
    if args.as_json:
        print(json.dumps({"repository": str(root), "ok": not any(f.severity == "error" for f in findings), "findings": [f.as_dict() for f in findings]}, indent=2, sort_keys=True))
    else:
        _print_human(findings, root)
    if any(item.severity == "error" for item in findings):
        return 1
    if args.strict_warnings and any(item.severity == "warning" for item in findings):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
