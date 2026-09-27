#!/usr/bin/env python3
"""Validate portable check packs and the development-side transfer ledger.

Public products do not load this repository at runtime, so a product that needs
a portable check carries its own adaptation. This tool keeps the record of those
adaptations honest: the ledger's pack digests match the pack files, every
recorded check has a disposition, and a project clone still contains every
anchor phrase the ledger says it carries.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "portable" / "TRANSFER-LEDGER.json"

PROJECT_STATES = {
    "PROPOSED",
    "PROJECTED",
    "TESTED",
    "DEPLOYED",
    "LIVE_VERIFIED",
    "NOT_APPLICABLE",
    "DEFERRED",
}
DISPOSITIONS = {"ADDED", "COVERED_BY_EXISTING", "NOT_APPLICABLE", "DEFERRED"}
ANCHORED = {"ADDED", "COVERED_BY_EXISTING"}
HEADING = re.compile(r"^## (CI-[0-9A-Z]+) (.+)$", re.MULTILINE)


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_checks(path: Path) -> dict[str, dict[str, str]]:
    text = path.read_text(encoding="utf-8")
    checks: dict[str, dict[str, str]] = {}
    matches = list(HEADING.finditer(text))
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = text[match.end():end]
        applies = re.search(r"^Applies to: (.+)$", body, re.MULTILINE)
        checks[match.group(1)] = {
            "title": match.group(2).strip(),
            "applies_to": applies.group(1).strip() if applies else "",
        }
    return checks


def load_ledger(path: Path = LEDGER) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate(ledger: dict, root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    packs = ledger.get("packs", {})
    if not packs:
        errors.append("ledger declares no packs")
    for name, pack in packs.items():
        path = root / pack.get("file", "")
        if not path.is_file():
            errors.append(f"pack {name}: missing file {pack.get('file')}")
            continue
        if pack.get("sha256") != digest(path):
            errors.append(f"pack {name}: sha256 does not match {pack['file']}")
        parsed = parse_checks(path)
        if list(parsed) != pack.get("check_ids"):
            errors.append(f"pack {name}: check_ids do not match the headings in {pack['file']}")
        for check_id, check in parsed.items():
            if not check["applies_to"]:
                errors.append(f"pack {name}: {check_id} has no 'Applies to' line")
    seen: set[tuple[str, str]] = set()
    for project in ledger.get("projects", []):
        repository = project.get("repository", "<unnamed>")
        pack_name = project.get("pack")
        key = (repository, pack_name or "")
        if key in seen:
            errors.append(f"{repository}: duplicate ledger entry for pack {pack_name}")
        seen.add(key)
        for field in ("visibility", "product_types", "pack", "pack_version", "state", "evidence"):
            if field not in project:
                errors.append(f"{repository}: missing field {field}")
        if project.get("state") not in PROJECT_STATES:
            errors.append(f"{repository}: unknown state {project.get('state')!r}")
        pack = packs.get(pack_name)
        if pack is None:
            errors.append(f"{repository}: unknown pack {pack_name!r}")
            continue
        if project.get("pack_version") != pack.get("version"):
            errors.append(f"{repository}: records pack version {project.get('pack_version')} but the pack is at {pack.get('version')}")
        checks = project.get("checks", {})
        if project.get("state") not in {"NOT_APPLICABLE", "DEFERRED"}:
            missing = [check_id for check_id in pack.get("check_ids", []) if check_id not in checks]
            if missing:
                errors.append(f"{repository}: no disposition for {', '.join(missing)}")
        elif not project.get("reason"):
            errors.append(f"{repository}: {project.get('state')} needs a reason")
        for check_id, record in checks.items():
            if check_id not in pack.get("check_ids", []):
                errors.append(f"{repository}: {check_id} is not in pack {pack_name}")
            disposition = record.get("disposition")
            if disposition not in DISPOSITIONS:
                errors.append(f"{repository}: {check_id} has unknown disposition {disposition!r}")
            if disposition in ANCHORED and not (record.get("file") and record.get("anchor")):
                errors.append(f"{repository}: {check_id} is {disposition} without a file and anchor")
            if disposition in {"NOT_APPLICABLE", "DEFERRED"} and not record.get("reason"):
                errors.append(f"{repository}: {check_id} is {disposition} without a reason")
    for item in ledger.get("assessed_not_applicable", []):
        if not (item.get("repository") and item.get("reason") and item.get("evidence")):
            errors.append(f"assessed_not_applicable entry needs repository, reason, and evidence: {item}")
    return errors


def verify_project(ledger: dict, repository: str, project_root: Path) -> list[str]:
    entries = [project for project in ledger.get("projects", []) if project.get("repository") == repository]
    if not entries:
        return [f"{repository}: no ledger entry"]
    problems: list[str] = []
    for project in entries:
        for check_id, record in project.get("checks", {}).items():
            if record.get("disposition") not in ANCHORED:
                continue
            path = project_root / record["file"]
            if not path.is_file():
                problems.append(f"{repository}: {check_id} file missing: {record['file']}")
                continue
            if normalize(record["anchor"]) not in normalize(path.read_text(encoding="utf-8")):
                problems.append(f"{repository}: {check_id} anchor not found in {record['file']}")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("validate", help="validate the ledger against the pack files")
    digest_parser = commands.add_parser("digest", help="print a pack file's sha256")
    digest_parser.add_argument("pack")
    verify_parser = commands.add_parser("verify-project", help="check a project clone for every recorded anchor")
    verify_parser.add_argument("--repository", required=True)
    verify_parser.add_argument("--root", required=True, type=Path)
    args = parser.parse_args(argv)

    ledger = load_ledger()
    if args.command == "digest":
        pack = ledger["packs"].get(args.pack)
        if pack is None:
            print(f"unknown pack {args.pack}", file=sys.stderr)
            return 2
        print(digest(ROOT / pack["file"]))
        return 0
    if args.command == "validate":
        errors = validate(ledger)
    else:
        errors = verify_project(ledger, args.repository, args.root)
    for error in errors:
        print(error, file=sys.stderr)
    print(json.dumps({"ok": not errors, "problems": len(errors)}))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
