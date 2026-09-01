#!/usr/bin/env python3
"""Validate exact owner-request records and fail closed on proxy completion."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

VERIFIED_STATUSES = {"MET", "LIVE_VERIFIED", "VERIFIED"}


def sha256_utf8(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def validate_record(record: dict[str, Any], source: Path) -> list[str]:
    errors: list[str] = []

    for field in (
        "schema_version",
        "requirement_id",
        "recorded_at",
        "status",
        "completion_allowed",
        "owner_source",
        "normalized_outcome",
        "required_outcomes",
        "non_satisfying_proxies",
        "next_direct_evidence",
    ):
        if field not in record:
            errors.append(f"{source}: missing {field}")

    if record.get("schema_version") != 1:
        errors.append(f"{source}: schema_version must equal 1")

    owner_source = record.get("owner_source")
    if not isinstance(owner_source, dict):
        errors.append(f"{source}: owner_source must be an object")
    else:
        verbatim = owner_source.get("verbatim")
        digest = owner_source.get("sha256")
        if not isinstance(verbatim, str) or not verbatim:
            errors.append(f"{source}: owner_source.verbatim must be nonempty")
        elif digest != sha256_utf8(verbatim):
            errors.append(f"{source}: owner_source.sha256 does not match exact UTF-8 owner wording")

    normalized = record.get("normalized_outcome")
    if not isinstance(normalized, str) or not normalized.strip():
        errors.append(f"{source}: normalized_outcome must be nonempty")

    proxies = record.get("non_satisfying_proxies")
    if not isinstance(proxies, list) or not proxies or not all(isinstance(item, str) and item.strip() for item in proxies):
        errors.append(f"{source}: non_satisfying_proxies must contain explicit nonempty proxy descriptions")

    outcomes = record.get("required_outcomes")
    if not isinstance(outcomes, list) or not outcomes:
        errors.append(f"{source}: required_outcomes must be a nonempty array")
        outcomes = []

    ids: set[str] = set()
    terminal = []
    for index, outcome in enumerate(outcomes):
        prefix = f"{source}: required_outcomes[{index}]"
        if not isinstance(outcome, dict):
            errors.append(f"{prefix} must be an object")
            continue
        outcome_id = outcome.get("id")
        if not isinstance(outcome_id, str) or not outcome_id:
            errors.append(f"{prefix}.id must be nonempty")
        elif outcome_id in ids:
            errors.append(f"{prefix}.id is duplicated")
        else:
            ids.add(outcome_id)
        if not isinstance(outcome.get("observable"), str) or not outcome["observable"].strip():
            errors.append(f"{prefix}.observable must state an owner-visible result")
        if not isinstance(outcome.get("status"), str) or not outcome["status"]:
            errors.append(f"{prefix}.status must be nonempty")
        refs = outcome.get("evidence_refs")
        if not isinstance(refs, list):
            errors.append(f"{prefix}.evidence_refs must be an array")
            refs = []
        if outcome.get("terminal_required") is True:
            terminal.append((outcome, refs, prefix))

    if not terminal:
        errors.append(f"{source}: at least one required outcome must be terminal_required")

    completion_allowed = record.get("completion_allowed")
    if not isinstance(completion_allowed, bool):
        errors.append(f"{source}: completion_allowed must be boolean")
    elif completion_allowed:
        if record.get("status") not in {"LIVE_VERIFIED", "VERIFIED"}:
            errors.append(f"{source}: completion_allowed requires a VERIFIED status")
        for outcome, refs, prefix in terminal:
            if outcome.get("status") not in VERIFIED_STATUSES:
                errors.append(f"{prefix}: terminal outcome is not verified but completion_allowed is true")
            if not refs:
                errors.append(f"{prefix}: terminal verification requires direct evidence refs")

    next_evidence = record.get("next_direct_evidence")
    if not isinstance(next_evidence, str) or not next_evidence.strip():
        errors.append(f"{source}: next_direct_evidence must be explicit")

    return errors


def load_record(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"{path}: invalid UTF-8 JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{path}: record root must be an object")
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("records", nargs="+", type=Path)
    args = parser.parse_args()

    errors: list[str] = []
    for path in args.records:
        try:
            errors.extend(validate_record(load_record(path), path))
        except ValueError as exc:
            errors.append(str(exc))

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print(f"OWNER_REQUEST_INTEGRITY_PASS records={len(args.records)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
