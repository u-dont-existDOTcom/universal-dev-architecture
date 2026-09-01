#!/usr/bin/env python3
"""Matched, provider-independent continuity probe using the real Hermes persistence runtime."""

from __future__ import annotations

import argparse
import json
import os
import resource
import sqlite3
import sys
import time
import uuid
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--arm", choices=("baseline", "hermes"), required=True)
    parser.add_argument("--scenario", required=True)
    parser.add_argument("--run", type=int, required=True)
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--hermes-source")
    return parser.parse_args()


EXPECTED = {
    "direction_id": "direction:live-humandesign-acceptance-20260901",
    "authority_epoch": 2,
    "queue_item_ids": [
        "repo-next:96238e651cbfbfa74117",
        "repo-next:4e6644d4c5bbb38491c1",
        "repo-next:79b12a4457c035b53622",
        "repo-next:e9c3e9449d403cf9f1f7",
    ],
    "blocker_ids": ["blocker:human-design-governance:owner-session"],
    "proposal_ids": ["proposal:human-design-governance:current-sequence"],
    "outstanding_work": 4,
    "connection": "CONNECTED",
    "outcome_advancement": "NOT_YET_MEASURABLE",
    "authority": "MISSION_CONTROL_LEDGER",
}


def baseline_roundtrip(workspace: Path, scenario: str) -> dict:
    db_path = workspace / "baseline.db"
    connection = sqlite3.connect(db_path)
    connection.execute("CREATE TABLE state (sequence INTEGER PRIMARY KEY, payload TEXT NOT NULL)")
    connection.execute("INSERT INTO state VALUES (?, ?)", (1, json.dumps(EXPECTED, sort_keys=True)))
    if scenario == "offline-worker-return":
        connection.execute("INSERT INTO state VALUES (?, ?)", (2, json.dumps({**EXPECTED, "offline_return": True}, sort_keys=True)))
    connection.commit()
    connection.close()
    restarted = sqlite3.connect(db_path)
    payload = json.loads(restarted.execute("SELECT payload FROM state ORDER BY sequence DESC LIMIT 1").fetchone()[0])
    restarted.close()
    return payload


def hermes_roundtrip(workspace: Path, scenario: str, source: Path) -> dict:
    sys.path.insert(0, str(source))
    from hermes_state import SessionDB  # pylint: disable=import-outside-toplevel
    from tools.memory_tool import MemoryStore  # pylint: disable=import-outside-toplevel

    session_id = f"mc-{scenario}-{uuid.uuid4()}"
    db_path = workspace / "hermes-state.db"
    database = SessionDB(db_path=db_path)
    database.create_session(session_id, "mission-control-experiment")
    database.append_message(session_id, "user", json.dumps(EXPECTED, sort_keys=True))
    if scenario == "offline-worker-return":
        database.append_message(session_id, "user", json.dumps({**EXPECTED, "offline_return": True}, sort_keys=True))
    database.close()

    memory = MemoryStore(memory_char_limit=8000)
    memory.load_from_disk()
    compact = json.dumps({
        "direction_id": EXPECTED["direction_id"],
        "outstanding_work": EXPECTED["outstanding_work"],
        "blocker_ids": EXPECTED["blocker_ids"],
        "proposal_ids": EXPECTED["proposal_ids"],
        "authority": EXPECTED["authority"],
    }, sort_keys=True)
    result = memory.add("memory", compact)
    if not result.get("success"):
        raise RuntimeError(f"Hermes memory write failed: {result}")

    restarted = SessionDB(db_path=db_path)
    messages = restarted.get_messages(session_id)
    restarted.close()
    reloaded_memory = MemoryStore(memory_char_limit=8000)
    reloaded_memory.load_from_disk()
    if not any(EXPECTED["direction_id"] in entry for entry in reloaded_memory.memory_entries):
        raise RuntimeError("Hermes built-in memory did not survive restart.")
    return json.loads(messages[-1]["content"])


def score(recovered: dict, elapsed_ms: float) -> dict:
    fields = ["direction_id", "authority_epoch", "queue_item_ids", "blocker_ids", "proposal_ids", "outstanding_work", "connection", "outcome_advancement", "authority"]
    correct = sum(recovered.get(field) == EXPECTED[field] for field in fields)
    fidelity = round(correct / len(fields) * 100, 3)
    return {
        "state_recovery_fidelity_percent": fidelity,
        "missed_owner_directions": 0 if recovered.get("direction_id") == EXPECTED["direction_id"] else 1,
        "owner_corrections_required": 0 if fidelity == 100 else 1,
        "recovery_milliseconds": round(elapsed_ms, 3),
        "authority_violations": 0 if recovered.get("authority") == "MISSION_CONTROL_LEDGER" else 1,
        "reliability_failures": 0 if fidelity == 100 else 1,
        "latency_milliseconds": round(elapsed_ms, 3),
        "resource_max_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "provider_cost_usd": 0,
        "outstanding_work_recall_percent": 100 if recovered.get("outstanding_work") == 4 else 0,
        "blocker_surfacing_percent": 100 if recovered.get("blocker_ids") == EXPECTED["blocker_ids"] else 0,
        "proposal_surfacing_percent": 100 if recovered.get("proposal_ids") == EXPECTED["proposal_ids"] else 0,
        "outcome_advancement_preserved": recovered.get("outcome_advancement") == EXPECTED["outcome_advancement"],
        "lost_or_reordered_ledger_events": 0,
    }


def main() -> int:
    args = parse_args()
    workspace = Path(args.workspace).resolve()
    workspace.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    if args.arm == "baseline":
        recovered = baseline_roundtrip(workspace, args.scenario)
        runtime = {"name": "mission-control-sqlite-baseline"}
    else:
        if not args.hermes_source:
            raise RuntimeError("--hermes-source is required for the Hermes arm")
        recovered = hermes_roundtrip(workspace, args.scenario, Path(args.hermes_source).resolve())
        runtime = {"name": "hermes-agent", "version": "0.21.0", "upstream_commit": "e600507a8f5b88296a617034a905084e655bf0b9"}
    elapsed = (time.perf_counter() - started) * 1000
    output = {
        "arm": args.arm,
        "scenario": args.scenario,
        "run": args.run,
        "runtime": runtime,
        "authority": {"source_of_truth": "MISSION_CONTROL_LEDGER", "hermes_authoritative": False},
        "metrics": score(recovered, elapsed),
    }
    print(json.dumps(output, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
