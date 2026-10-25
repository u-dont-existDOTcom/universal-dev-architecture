#!/usr/bin/env python3
"""Portable research continuation stop-loss.

Reads a small explicit self-authored record; classification needs independent
semantic review. An admitted continuation is NOT consent, release approval,
production authorization, or proof of progress. No network, no side effects.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

SCHEMA = "UDA_RESEARCH_OUTCOME_PROXIMITY_V1"
EVIDENCE_CLASSES = {
    "DIRECT_OUTCOME_EVIDENCE",
    "NECESSARY_ENABLEMENT",
    "SOURCE_EVIDENCE",
    "SUPPORTING_QUALITY",
    "ACCESS_OR_CONSENT_GATE",
}
GOAL_KINDS = {"EMPIRICAL_VALIDATION", "SOURCE_ACQUISITION", "OTHER"}
STATES = {"OPEN", "SATISFIED", "SUPERSEDED", "CANCELED", "AUTHORITY_UNRESOLVED"}


def _boolean(obj: dict, field: str) -> bool:
    value = obj.get(field)
    if type(value) is not bool:
        raise ValueError(field + " must be an actual bool")
    return value


def _nonnegative_int(obj: dict, field: str) -> int:
    value = obj.get(field)
    if type(value) is not int or value < 0:
        raise ValueError(field + " must be a nonnegative integer")
    return value


def _str(obj: dict, field: str) -> str:
    value = obj.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(field + " must be a nonempty string")
    return value.strip()


def assess(record: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(record, dict) or record.get("schema") != SCHEMA:
        raise ValueError("wrong research-proximity schema")
    root = record.get("root")
    proposed = record.get("proposed")
    if not isinstance(root, dict) or not isinstance(proposed, dict):
        raise ValueError("root and proposed must be objects")
    name = _str(root, "owner_requested_result")
    kind = _str(root, "kind")
    if kind not in GOAL_KINDS:
        raise ValueError("unknown root outcome kind")
    state = _str(root, "status")
    if state not in STATES:
        raise ValueError("unknown owner goal status")
    before = _nonnegative_int(root, "direct_observations_before")
    after = _nonnegative_int(root, "direct_observations_now")
    preparations = _nonnegative_int(root, "successive_preparation_only_cycles")
    if after < before:
        raise ValueError("direct observation count shrank; preserve outcome history")
    cls = _str(proposed, "evidence_class")
    if cls not in EVIDENCE_CLASSES:
        raise ValueError("invalid evidence class")
    objective = _str(proposed, "objective")
    nearest = _str(proposed, "closest_direct_observation_or_human_gate")
    owner_requested = _boolean(proposed, "explicit_owner_source_request")
    verified_blocker = _boolean(proposed, "specific_blocker_independently_verified")
    unlocks = _boolean(proposed, "material_real_observation_unlocked")
    requires_consent = _boolean(proposed, "needs_new_third_party_consent_or_access")
    authorization = _boolean(proposed, "that_consent_or_access_obtained")
    previously_repeated = _boolean(proposed, "repeats_prior_preparatory_method")
    claimed_direct = _boolean(proposed, "claims_new_real_outcome_evidence")

    outcome_status = (
        "ADVANCING" if after > before else
        "SATISFIED" if state == "SATISFIED" else
        "NOT_YET_MEASURED" if kind == "EMPIRICAL_VALIDATION" and after == 0
        else "FLAT"
    )
    rule = "outcome_proximity_guard"
    admissible = False
    if state in ("SATISFIED", "SUPERSEDED", "CANCELED") and not owner_requested:
        decision, reason = "STOP_OWNER_ROOT_COMPLETE", "No owner-requested unfinished target supports another inferred subtask."
    elif state == "AUTHORITY_UNRESOLVED":
        decision, reason = "HOLD_AUTHORITY_UNRESOLVED", "Recover exact original owner authority without inventing a new target."
    elif requires_consent and not authorization:
        decision, reason = "EXTERNAL_EVIDENCE_GATE", "Needed real-world consent/access has not been granted; synthetic activity cannot substitute for it."
    elif claimed_direct and (cls != "DIRECT_OUTCOME_EVIDENCE" or after == before):
        decision, reason = "REJECT_UNSUPPORTED_DIRECT_CLAIM", "Do not equate source, code, tests or simulation with independently observed results."
    elif cls == "DIRECT_OUTCOME_EVIDENCE":
        if after == before and claimed_direct:
            decision, reason = "REJECT_UNSUPPORTED_DIRECT_CLAIM", "No new real observations were recorded."
        else:
            decision, reason, admissible = (
                "ADMIT_DIRECT_TEST", "The action addresses the owner outcome at its independent evidence boundary.", True
            )
    elif cls == "SOURCE_EVIDENCE" and (kind == "SOURCE_ACQUISITION" or owner_requested):
        decision, reason, admissible = (
            "ADMIT_OWNER_SOURCE_TASK", "Actual source coverage is explicitly the current owner target.", True
        )
    elif cls == "NECESSARY_ENABLEMENT" and verified_blocker and unlocks and not previously_repeated:
        decision, reason, admissible = (
            "ADMIT_ONE_BOUNDED_REPAIR", "Independently verified blocker; this distinct repair enables a specific next real observation.", True
        )
    elif cls == "ACCESS_OR_CONSENT_GATE":
        decision, reason = (
            "EXTERNAL_EVIDENCE_GATE", "Prepare the minimum lawful usable handoff; no new mock cohort or participant contact."
        )
    elif kind == "EMPIRICAL_VALIDATION" and after == before and preparations >= 2 and not owner_requested:
        decision, reason = (
            "REJECT_PROXY_LOOP", "Successive preparation-only rounds did not create new independent owner outcome evidence; choose the shortest direct observation or exact external gate."
        )
    elif kind == "EMPIRICAL_VALIDATION" and cls == "NECESSARY_ENABLEMENT":
        decision, reason = (
            "REJECT_UNNECESSARY_ENABLEMENT", "Demonstrated blocker and actual unblock effect are both required for another prerequisite."
        )
    elif cls == "SOURCE_EVIDENCE" and kind != "SOURCE_ACQUISITION":
        decision, reason = (
            "REJECT_UNLINKED_SOURCE_EXPANSION", "No owner source request or independently demonstrated relevance to the next direct observation."
        )
    else:
        decision, reason, admissible = (
            "ADMIT_SINGLE_BOUNDED_EXPLORATION", "A limited reversible first preparatory exploration is permitted without calling it outcome progress.", True
        )

    return {
        "schema": "UDA_RESEARCH_CONTINUATION_ADMISSION_RESULT_V1",
        "root_owner_result": name,
        "proposed_objective": objective,
        "evidence_class": cls,
        "new_direct_observations": after - before,
        "direct_evidence_status": outcome_status,
        "supporting_only_cycles_prior": preparations,
        "decision": decision,
        "allowed_under_this_stoploss": admissible,
        "reason": reason,
        "closest_direct_observation_or_human_gate": nearest,
        "never_authorizes_third_party_consent_or_data_use": True,
        "never_certifies_source_classification_or_scientific_validity": True,
        "control": rule,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    result = assess(json.loads(args.input.read_text(encoding="utf8")))
    text = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.out is not None:
        if args.out.exists():
            raise FileExistsError("Refusing to overwrite a prior admission receipt")
        args.out.write_text(text, encoding="utf8")
    else:
        print(text, end="")
    return 0 if result["allowed_under_this_stoploss"] else 3


if __name__ == "__main__":
    raise SystemExit(main())
