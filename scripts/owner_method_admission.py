"""Mechanical owner-method projection check, not a semantic-authority oracle.

Call at launch on a projection derived from the ACTUAL runnable configuration.
Semantic approval of the owner projection remains a separate obligation.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from typing import Any


def violations(owner: dict[str, Any], operation: dict[str, Any]) -> list[str]:
    if not isinstance(owner, dict) or not isinstance(operation, dict):
        return ["CONTRACT_MALFORMED"]
    errors: list[str] = []
    if not owner.get("owner_outcome_id") or operation.get("owner_outcome_id") != owner["owner_outcome_id"]:
        errors.append("OWNER_OUTCOME_IDENTITY_MISMATCH")
    protected = owner.get("protected_dimensions")
    actual = operation.get("protected_dimensions")
    if not isinstance(protected, dict) or not protected or not isinstance(actual, dict):
        errors.append("PROTECTED_DIMENSIONS_MISSING")
    else:
        for key, expected in protected.items():
            if key not in actual or actual[key] != expected:
                errors.append(f"OWNER_DIMENSION_CHANGED:{key}")
    required = owner.get("required_operations")
    present = operation.get("operations")
    if not isinstance(required, list) or not required or not isinstance(present, list):
        errors.append("OPERATIONS_MALFORMED")
    else:
        for item in required:
            if item not in present:
                errors.append(f"OWNER_OPERATION_OMITTED:{item}")
    permitted = owner.get("permitted_operations", [])
    prohibited = operation.get("prohibited_operations", [])
    if not isinstance(permitted, list) or not isinstance(prohibited, list):
        errors.append("PERMISSIONS_MALFORMED")
    else:
        for item in prohibited:
            if item in permitted:
                errors.append(f"OWNER_PERMISSION_REMOVED:{item}")
    requirements = operation.get("added_requirements", [])
    if not isinstance(requirements, list):
        errors.append("REQUIREMENTS_MALFORMED")
        requirements = []
    for gate in requirements:
        if not isinstance(gate, dict):
            errors.append("REQUIREMENT_MALFORMED")
            continue
        if gate.get("effect") == "claim_qualification_only":
            continue
        established = gate.get("necessity") == "ESTABLISHED" and bool(gate.get("evidence"))
        if gate.get("origin") not in {"OWNER_REQUIRED", "EXTERNAL_HARD_REQUIREMENT"} and not established:
            errors.append("UNAUTHORIZED_MANDATORY_REQUIREMENT:" + str(gate.get("id", "unknown")))
    status = operation.get("parent_outcome_status")
    if status not in {"OPEN", "SATISFIED"}:
        errors.append("OUTCOME_STATUS_UNRECOGNIZED")
    if status == "SATISFIED":
        outcomes = owner.get("required_outcomes", [])
        evidence = operation.get("outcome_evidence", {})
        if not isinstance(evidence, dict) or not isinstance(outcomes, list) or not outcomes or any(evidence.get(key) != "MET" for key in outcomes):
            errors.append("CHILD_COMPLETION_CANNOT_CLOSE_PARENT")
    return errors


def admit(owner: dict[str, Any], operation: dict[str, Any]) -> None:
    errors = violations(owner, operation)
    if errors:
        raise ValueError("OWNER_METHOD_ADMISSION_REJECTED: " + "; ".join(errors))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--owner-contract", type=Path, required=True)
    parser.add_argument("--operation", type=Path, required=True)
    args = parser.parse_args()
    errors = violations(json.loads(args.owner_contract.read_text()), json.loads(args.operation.read_text()))
    print(json.dumps({"admitted": not errors, "violations": errors}, indent=2))
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())
