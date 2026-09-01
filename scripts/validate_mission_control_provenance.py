#!/usr/bin/env python3
"""Validate Mission Control provenance JSON, schemas, templates, and fixtures."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

try:
    from scripts.mission_control_provenance import (
        BROWSER_FAILURE_CODES,
        CLAIM_FAILURE_CODES,
        REASONING_FAILURE_CODES,
        _jcs_text,
        claim_digest,
        evaluate_browser_operation,
        evaluate_reasoning_surface_receipt,
        parse_all_json,
        validate_claim_record,
    )
except ModuleNotFoundError:  # Direct script execution places scripts/ on sys.path.
    from mission_control_provenance import (
        BROWSER_FAILURE_CODES,
        CLAIM_FAILURE_CODES,
        REASONING_FAILURE_CODES,
        _jcs_text,
        claim_digest,
        evaluate_browser_operation,
        evaluate_reasoning_surface_receipt,
        parse_all_json,
        validate_claim_record,
    )


class SchemaError(ValueError):
    """Raised when a template does not satisfy its checked JSON Schema."""


def _types_match(value: Any, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "null":
        return value is None
    raise SchemaError(f"unsupported schema type {expected}")


def _resolve_ref(root_schema: dict[str, Any], ref: str) -> Any:
    if not ref.startswith("#/"):
        raise SchemaError(f"only local JSON Pointer refs are supported: {ref}")
    current: Any = root_schema
    for raw_part in ref[2:].split("/"):
        part = raw_part.replace("~1", "/").replace("~0", "~")
        current = current[part]
    return current


def validate_instance(
    instance: Any,
    schema: Any,
    *,
    root_schema: dict[str, Any],
    path: str = "$",
) -> None:
    """Validate the Draft 2020-12 subset used by this repository's templates."""

    if schema is True:
        return
    if schema is False:
        raise SchemaError(f"{path}: false schema")
    if "$ref" in schema:
        validate_instance(
            instance,
            _resolve_ref(root_schema, schema["$ref"]),
            root_schema=root_schema,
            path=path,
        )
        return
    for branch in schema.get("allOf", []):
        validate_instance(instance, branch, root_schema=root_schema, path=path)
    if "if" in schema:
        try:
            validate_instance(instance, schema["if"], root_schema=root_schema, path=path)
        except SchemaError:
            branch = schema.get("else")
        else:
            branch = schema.get("then")
        if branch is not None:
            validate_instance(instance, branch, root_schema=root_schema, path=path)

    if "const" in schema and instance != schema["const"]:
        raise SchemaError(f"{path}: expected constant {schema['const']!r}")
    if "enum" in schema and instance not in schema["enum"]:
        raise SchemaError(f"{path}: {instance!r} not in enum")
    expected_type = schema.get("type")
    if expected_type is not None:
        expected_types = [expected_type] if isinstance(expected_type, str) else expected_type
        if not any(_types_match(instance, item) for item in expected_types):
            raise SchemaError(f"{path}: invalid type {type(instance).__name__}")

    if isinstance(instance, dict):
        for required in schema.get("required", []):
            if required not in instance:
                raise SchemaError(f"{path}: missing required property {required}")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            unexpected = set(instance) - set(properties)
            if unexpected:
                raise SchemaError(f"{path}: unexpected properties {sorted(unexpected)}")
        for key, child in instance.items():
            if key in properties:
                validate_instance(
                    child,
                    properties[key],
                    root_schema=root_schema,
                    path=f"{path}.{key}",
                )
        if len(instance) < schema.get("minProperties", 0):
            raise SchemaError(f"{path}: too few properties")

    if isinstance(instance, list):
        if len(instance) < schema.get("minItems", 0):
            raise SchemaError(f"{path}: too few items")
        if schema.get("uniqueItems"):
            rendered = [_jcs_text(item) for item in instance]
            if len(rendered) != len(set(rendered)):
                raise SchemaError(f"{path}: duplicate array items")
        if "items" in schema:
            for index, item in enumerate(instance):
                validate_instance(
                    item,
                    schema["items"],
                    root_schema=root_schema,
                    path=f"{path}[{index}]",
                )

    if isinstance(instance, str):
        if len(instance) < schema.get("minLength", 0):
            raise SchemaError(f"{path}: string too short")
        if "pattern" in schema and re.search(schema["pattern"], instance) is None:
            raise SchemaError(f"{path}: string does not match {schema['pattern']}")
    if isinstance(instance, (int, float)) and not isinstance(instance, bool):
        if "minimum" in schema and instance < schema["minimum"]:
            raise SchemaError(f"{path}: value below minimum")


SCHEMA_TEMPLATE_PAIRS = {
    "claim-record.schema.json": "CLAIM-RECORD.json",
    "claim-transition.schema.json": "CLAIM-TRANSITION.json",
    "claim-reproduction-receipt.schema.json": "CLAIM-REPRODUCTION-RECEIPT.json",
    "reasoning-surface-observation-receipt.schema.json": "REASONING-SURFACE-OBSERVATION-RECEIPT.json",
    "supervision-verdict-admission.schema.json": "SUPERVISION-VERDICT-ADMISSION.json",
    "browser-operation-receipt.schema.json": "BROWSER-OPERATION-RECEIPT.json",
}


def validate_repository(root: Path) -> list[str]:
    findings: list[str] = []
    invalid_json = parse_all_json(root)
    if invalid_json:
        raise SchemaError(f"invalid JSON: {invalid_json}")

    for schema_name, template_name in SCHEMA_TEMPLATE_PAIRS.items():
        schema = json.loads((root / "schemas" / schema_name).read_text(encoding="utf-8"))
        template = json.loads((root / "templates" / template_name).read_text(encoding="utf-8"))
        if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
            raise SchemaError(f"{schema_name}: unsupported or missing meta-schema")
        validate_instance(template, schema, root_schema=schema)
        findings.append(f"schema+template:{schema_name}:{template_name}:PASS")

    claim = json.loads((root / "templates" / "CLAIM-RECORD.json").read_text(encoding="utf-8"))
    claim["claimDigest"]["value"] = claim_digest(claim)
    claim["claimDigest"]["byteLength"] = len(_jcs_text({key: value for key, value in claim.items() if key != "claimDigest"}).encode("utf-8"))
    validate_claim_record(claim)
    findings.append("template-instantiation:claim-record:PASS")

    reasoning = json.loads((root / "templates" / "REASONING-SURFACE-OBSERVATION-RECEIPT.json").read_text(encoding="utf-8"))
    reasoning_result = evaluate_reasoning_surface_receipt(reasoning)
    if reasoning_result["aggregateState"] != "PARTIAL" or "REASONING_RECEIPT_INCOMPLETE" not in reasoning_result["failureCodes"]:
        raise SchemaError("partial reasoning template did not fail closed")
    findings.append("template-instantiation:reasoning-partial-fails-closed:PASS")

    browser = json.loads((root / "templates" / "BROWSER-OPERATION-RECEIPT.json").read_text(encoding="utf-8"))
    if not evaluate_browser_operation(browser)["allowed"]:
        raise SchemaError("browser template is not a valid signed-in reasoning route")
    findings.append("template-instantiation:browser-operation:PASS")

    expected_codes = CLAIM_FAILURE_CODES | REASONING_FAILURE_CODES | BROWSER_FAILURE_CODES | {"ROOT_RED", "RELEASE_BLOCKED", "UNKNOWN", "SCHEMA_REJECTED", "SCIENTIFIC_SCOPE_UNAUTHORIZED", "AUTHORIZED_POLICY"}
    for fixture_name in (
        "claim-authority-provenance-hostile.json",
        "reasoning-surface-receipt-hostile.json",
        "browser-operation-hostile.json",
    ):
        fixture = json.loads((root / "evals" / "mission-control" / fixture_name).read_text(encoding="utf-8"))
        scenario_ids = [scenario["id"] for scenario in fixture["scenarios"]]
        if len(scenario_ids) != len(set(scenario_ids)):
            raise SchemaError(f"{fixture_name}: duplicate scenario id")
        invalid_expected = [scenario["expected"] for scenario in fixture["scenarios"] if scenario["expected"] not in expected_codes]
        if invalid_expected:
            raise SchemaError(f"{fixture_name}: invalid expected codes {invalid_expected}")
        findings.append(f"hostile-fixture:{fixture_name}:PASS")

    browser_incident = json.loads((root / "feedback" / "mission-control" / "MC-BROWSER-REPO-TAB-SPRAWL-20260901-001.json").read_text(encoding="utf-8"))
    if browser_incident["disposition"] != {
        "currentTabState": "CLOSED_OR_STALE_AS_REPORTED",
        "closedByActor": "UNKNOWN",
        "cleanupAttributionState": "UNATTRIBUTED",
        "inferenceAuthorized": False,
    }:
        raise SchemaError("browser incident attribution is not fail closed")
    mode_incident = json.loads((root / "feedback" / "mission-control" / "MC-PRO-MODE-RECEIPT-MISMATCH-20260901-001.json").read_text(encoding="utf-8"))
    if mode_incident["priorTransaction"]["proMetaReviewAuthoritative"] is not False:
        raise SchemaError("prior mode mismatch was made authoritative")
    findings.append("incident-dispositions:PASS")
    return findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    args = parser.parse_args()
    try:
        findings = validate_repository(Path(args.root).resolve())
    except (OSError, KeyError, ValueError, SchemaError) as exc:
        print(f"Mission Control provenance validation failed: {exc}", file=sys.stderr)
        return 1
    for finding in findings:
        print(finding)
    print(f"Mission Control provenance validation passed ({len(findings)} checks)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
