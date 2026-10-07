"""Isolate fixed serialization predicates from broader source admission.

These test-local contracts deliberately require the built-in fixed-format
timestamp/elapsed syntax. Production enforces timestamp shape mechanically;
clock provenance and broader elapsed-time wording use bound semantic judgments.
"""

import copy


def predicate_catalog(catalog):
    result = copy.deepcopy(catalog)
    result["records"] = [r for r in result["records"] if not r["rule_id"].startswith("uda.kernel.")]
    timestamp = next(r for r in result["records"] if r["rule_id"] == "uda.final.timestamp")
    checks = {"final-first-line-timestamp": "final_timestamp_first_line", "final-elapsed-time": "final_elapsed_time"}
    timestamp["obligations"] = [o for o in timestamp["obligations"] if o["obligation_id"] in checks]
    for ob in timestamp["obligations"]:
        ob.update(enforcement="mechanical", mechanical_check={"kind": checks[ob["obligation_id"]]})
    return result


def pass_receipts(tt, contract, phase, payload):
    data = tt.receipt_skeleton(contract, phase, payload.encode() if isinstance(payload, str) else payload)
    for receipt in data["receipts"]:
        receipt.update(verdict="PASS", evidence="Synthetic boundary evidence supplied for this serialization/CLI test.",
                       actor={"id": "fixture-author", "kind": "fixture", "relation": "SAME_AGENT"},
                       issued_at="2030-01-02T10:02:00Z")
    return data
