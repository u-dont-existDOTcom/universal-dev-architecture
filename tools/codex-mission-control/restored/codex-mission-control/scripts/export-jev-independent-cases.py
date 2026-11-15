#!/usr/bin/env python3
"""Export existing Jev telemetry to a BLIND state ledger and a separate review ledger.

Read only, zero provider calls. Do not commit exported outputs: even allowlisted
state summaries are private operational context. The blind file deliberately
contains neither deterministic decisions nor prior Jev answers.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

STATE_FIELDS = (
    "chain_valid", "queue_terminal", "owner_action_kind", "open_blocker_present",
    "blocker_actor_kind", "delivery_status", "delivery_error_family",
    "contract_owner_alignment", "outcome_advancement", "strategy_efficacy",
    "correction_owner_action_type", "pending_reasoning_review", "review_freshness",
    "active_directive_present", "execution_state",
)


def export(database: Path, blind_path: Path, reconciliation_path: Path) -> dict:
    if not database.exists() or database.is_dir():
        raise FileNotFoundError("A persisted Jev SQLite database is required.")
    if blind_path == reconciliation_path or blind_path == database or reconciliation_path == database:
        raise ValueError("Blind and reconciliation outputs must be separate from each other and the source.")
    uri = database.resolve().as_uri() + "?mode=ro"
    db = sqlite3.connect(uri, uri=True, timeout=5)
    try:
        db.execute("PRAGMA query_only=ON")
        required = {"observed_at", "source", "project_id", "status", "error_code",
                    "deterministic_trigger", "response_id", "state_fingerprint",
                    "state_json", "jev_next_action", "latency_ms", "cost_usd", "model"}
        available = {row[1] for row in db.execute("PRAGMA table_info(jev_shadow_observations)")}
        if not required <= available:
            raise ValueError("Source telemetry missing required persisted Jev fields.")
        query = """
          SELECT observed_at, source, project_id, deterministic_trigger, status,
                 error_code, response_id, state_fingerprint, state_json,
                 jev_next_action, latency_ms, cost_usd, model
          FROM jev_shadow_observations
          ORDER BY observed_at, sequence
        """
        raw = db.execute(query)
        seen = set()
        grouped = defaultdict(list)
        provider_observations = 0
        for row in raw:
            observed_at, source, project_id, trigger, status, error, response_id, fingerprint, state_json, action, latency, cost, model = row
            # Mirrors can appear in a live record and a separately imported log. A
            # response ID is authoritative for dedup. For ID-less observations,
            # compare the persisted event identity; never count status-only entries
            # as successful independent classifications.
            key = ("response", response_id) if response_id else (
                "fallback", observed_at, project_id or "", trigger, status, error or "",
                fingerprint or "", model,
            )
            if key in seen:
                continue
            seen.add(key)
            provider_observations += 1
            if fingerprint is None or state_json is None:
                continue
            state = json.loads(state_json)
            if not isinstance(state, dict) or any(field not in state for field in STATE_FIELDS):
                raise ValueError("Persisted state is missing privacy allowlist fields.")
            sanitized = {field: state[field] for field in STATE_FIELDS}
            grouped[fingerprint].append({
                "state": sanitized, "status": status, "observed_at": observed_at,
                "deterministic_trigger": trigger, "jev_action": action,
                "latency_ms": latency, "cost_usd": cost, "error_code": error,
            })
    finally:
        db.close()

    if not blind_path.parent.exists() or not reconciliation_path.parent.exists():
        raise FileNotFoundError("Export directories must already exist.")
    if blind_path.exists() or reconciliation_path.exists():
        raise FileExistsError("Refusing to overwrite potentially already adjudicated evidence.")
    blind_rows = []
    comparison_rows = []
    for fingerprint, values in sorted(grouped.items()):
        different_states = {json.dumps(r["state"], sort_keys=True) for r in values}
        if len(different_states) != 1:
            raise ValueError("One persisted fingerprint maps to conflicting state bytes.")
        case_id = "state:" + fingerprint[:16]
        blind_rows.append({
            "case_id": case_id, "state_fingerprint": fingerprint, "state": values[0]["state"],
            "evidence_ref": None, "gold_action": None,
            "adjudication": "NOT_YET_INDEPENDENTLY_ADJUDICATED",
            "cohort": "UNASSIGNED",
        })
        actions = Counter((r["status"], r["jev_action"]) for r in values)
        comparison_rows.append({
            "case_id": case_id, "state_fingerprint": fingerprint,
            "prior_deterministic_triggers": sorted({r["deterministic_trigger"] for r in values}),
            "historical_v1_actions": [
                {"status": status, "action": action, "n": n}
                for (status, action), n in sorted(actions.items(), key=lambda x: str(x[0]))
            ],
            "historical_unique_observations_for_state": len(values),
            "successful_v1_observations": sum(r["status"] == "OK" for r in values),
            "known_v1_cost_usd": round(sum(float(r["cost_usd"] or 0) for r in values), 9),
            "known_v1_latency_ms": [r["latency_ms"] for r in values if r["status"] == "OK" and r["latency_ms"] is not None],
        })
    # Restrict access to exported state even though sensitive strings are dropped.
    for path, rows in ((blind_path, blind_rows), (reconciliation_path, comparison_rows)):
        with path.open("x", encoding="utf-8") as output:
            path.chmod(0o600)
            for item in rows:
                output.write(json.dumps(item, ensure_ascii=False, separators=(",", ":")) + "\n")
    return {
        "deduplicated_provider_observations": provider_observations,
        "distinct_real_state_fingerprints": len(grouped),
        "with_successful_v1_observation": sum(row["successful_v1_observations"] > 0 for row in comparison_rows),
        "blind_and_reconciliation_exports_separated": True,
        "gold_labels_created": 0,
        "new_provider_calls": 0,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--database", required=True, type=Path)
    ap.add_argument("--blind-out", required=True, type=Path)
    ap.add_argument("--comparison-out", required=True, type=Path)
    args = ap.parse_args()
    print(json.dumps(export(args.database, args.blind_out, args.comparison_out)))


if __name__ == "__main__":
    main()
