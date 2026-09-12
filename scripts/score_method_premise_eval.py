#!/usr/bin/env python3
"""Score frozen predictions for the method-premise supervision blind pilot.

This scorer intentionally does not judge free-text rationale. It checks the discrete
method/activation decisions and owner-interruption errors against the development
answer key. Semantic rationale quality remains a separate review.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_KEY = ROOT / "evals" / "method-premise" / "blind-supervision-answer-key-v1.json"


def _load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def score_predictions(predictions: dict[str, Any], answer_key: dict[str, Any]) -> dict[str, Any]:
    expected_methods = answer_key.get("method_cases")
    expected_activation = answer_key.get("activation_cases")
    actual_methods = predictions.get("method_cases")
    actual_activation = predictions.get("activation_cases")
    if not all(isinstance(x, dict) for x in (expected_methods, expected_activation, actual_methods, actual_activation)):
        raise ValueError("method_cases and activation_cases must be JSON objects in both prediction and key")

    if set(actual_methods) != set(expected_methods):
        raise ValueError("prediction method case IDs do not exactly match answer key")
    if set(actual_activation) != set(expected_activation):
        raise ValueError("prediction activation case IDs do not exactly match answer key")

    method_fields = ("necessity_state", "disposition", "owner_action")
    method_results: dict[str, Any] = {}
    method_exact = 0
    false_owner_interruptions = 0
    missed_owner_decisions = 0

    for case_id, expected in expected_methods.items():
        actual = actual_methods[case_id]
        expected_trigger = expected["triggered"]
        actual_trigger = actual.get("gate_triggered")
        field_matches = {"gate_triggered": actual_trigger == expected_trigger}
        for field in method_fields:
            field_matches[field] = actual.get(field) == expected.get(field)
        exact = all(field_matches.values())
        method_exact += int(exact)
        if expected.get("owner_action") == "NONE" and actual.get("owner_action") == "DECISION_REQUIRED":
            false_owner_interruptions += 1
        if expected.get("owner_action") == "DECISION_REQUIRED" and actual.get("owner_action") != "DECISION_REQUIRED":
            missed_owner_decisions += 1
        method_results[case_id] = {
            "exact": exact,
            "field_matches": field_matches,
        }

    activation_results: dict[str, Any] = {}
    activation_exact = 0
    for case_id, expected in expected_activation.items():
        actual = actual_activation[case_id]
        exact = actual.get("activation_status") == expected.get("activation_status")
        activation_exact += int(exact)
        activation_results[case_id] = {"exact": exact}

    method_total = len(expected_methods)
    activation_total = len(expected_activation)
    critical_cases = ("CASE-A", "CASE-E", "CASE-G")
    critical_exact = {
        case_id: bool(method_results.get(case_id, {}).get("exact")) for case_id in critical_cases
    }

    strict_pass = (
        method_exact == method_total
        and activation_exact == activation_total
        and false_owner_interruptions == 0
        and missed_owner_decisions == 0
    )

    return {
        "schema_version": 1,
        "suite_id": answer_key.get("suite_id"),
        "candidate_head": predictions.get("candidate_head"),
        "method": {
            "exact": method_exact,
            "total": method_total,
            "accuracy": method_exact / method_total if method_total else 0.0,
            "cases": method_results,
        },
        "activation": {
            "exact": activation_exact,
            "total": activation_total,
            "accuracy": activation_exact / activation_total if activation_total else 0.0,
            "cases": activation_results,
        },
        "owner_supervision": {
            "false_owner_interruptions": false_owner_interruptions,
            "missed_owner_decisions": missed_owner_decisions,
        },
        "critical_method_cases_exact": critical_exact,
        "strict_structured_pass": strict_pass,
        "semantic_rationale_review_required": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("prediction", type=Path)
    parser.add_argument("--answer-key", type=Path, default=DEFAULT_KEY)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    result = score_predictions(_load(args.prediction), _load(args.answer_key))
    text = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")
    return 0 if result["strict_structured_pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
