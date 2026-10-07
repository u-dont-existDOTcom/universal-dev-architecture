"""Select focused serialization contracts without unrelated kernel judgments.

These test-local contracts deliberately require the built-in fixed-format
timestamp/elapsed syntax from the production catalog. Production enforces both
predicates mechanically; clock provenance uses bound semantic judgments.
"""

import copy


def predicate_catalog(catalog):
    result = copy.deepcopy(catalog)
    result["records"] = [r for r in result["records"] if not r["rule_id"].startswith("uda.kernel.")]
    timestamp = next(r for r in result["records"] if r["rule_id"] == "uda.final.timestamp")
    checks = {"final-first-line-timestamp": "final_timestamp_first_line", "final-elapsed-time": "final_elapsed_time"}
    timestamp["obligations"] = [o for o in timestamp["obligations"] if o["obligation_id"] in checks]
    return result


def pass_receipts(tt, contract, phase, payload, exclude_rules=()):
    data = tt.receipt_skeleton(contract, phase, payload.encode() if isinstance(payload, str) else payload)
    data["receipts"] = [r for r in data["receipts"] if not r["rule_id"].startswith(tuple(exclude_rules))]
    for receipt in data["receipts"]:
        receipt.update(verdict="PASS", evidence="Synthetic boundary evidence supplied for this serialization/CLI test.",
                       actor={"id": "fixture-author", "kind": "fixture", "relation": "SAME_AGENT"},
                       issued_at="2030-01-02T10:02:00Z")
    return data
