from __future__ import annotations

import argparse
import json
from pathlib import Path

from .common import atomic_write_json


METADATA_FIELDS = (
    "schema_version",
    "run_id",
    "task_id",
    "condition_id",
    "condition_label",
    "condition_sha256",
    "fixture_sha256",
    "oracle_sha256",
    "visible_command_sha256",
    "hidden_command_sha256",
    "evaluation_contract_sha256",
    "repetition",
    "model",
    "reasoning_effort",
    "status",
    "terminal",
    "codex_exit_code",
    "timed_out",
    "wall_seconds",
    "agent_wall_seconds",
    "used_process_jobs",
)


def _relative_file(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.replace("\\", "/")
    marker = "/workspace/"
    if marker in normalized:
        return normalized.split(marker, 1)[1]
    if normalized.startswith("/"):
        return Path(normalized).name
    return normalized


def _event_facts(path: Path) -> list[dict[str, object]]:
    facts: list[dict[str, object]] = []
    if not path.is_file():
        return facts
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict):
            continue
        if event.get("type") == "turn.completed" and isinstance(event.get("usage"), dict):
            usage = event["usage"]
            assert isinstance(usage, dict)
            facts.append(
                {
                    "event": "turn.completed",
                    "input_tokens": usage.get("input_tokens"),
                    "output_tokens": usage.get("output_tokens"),
                }
            )
            continue
        if event.get("type") != "item.completed" or not isinstance(event.get("item"), dict):
            continue
        item = event["item"]
        assert isinstance(item, dict)
        item_type = item.get("type")
        if item_type not in {
            "command_execution",
            "mcp_tool_call",
            "tool_call",
            "collaboration_tool_call",
            "collab_tool_call",
            "file_change",
        }:
            continue
        fact: dict[str, object] = {"event": "item.completed", "item_type": item_type}
        for key in ("tool", "server", "status", "exit_code"):
            value = item.get(key)
            if isinstance(value, (str, int, bool)) or value is None:
                fact[key] = value
        if item_type == "command_execution":
            command = item.get("command")
            if isinstance(command, str):
                lowered = command.lower()
                fact["command_class"] = (
                    "test"
                    if any(
                        token in lowered
                        for token in (
                            "npm test",
                            "node --test",
                            "unittest",
                            "pytest",
                            "cargo test",
                            "go test",
                        )
                    )
                    else "git"
                    if "git " in lowered
                    else "inspection"
                )
        if item_type == "file_change" and isinstance(item.get("changes"), list):
            paths = [
                relative
                for change in item["changes"]
                if isinstance(change, dict)
                if (relative := _relative_file(change.get("path"))) is not None
            ]
            fact["paths"] = paths
        facts.append(fact)
    return facts


def publish_results(raw_root: Path, normalized_path: Path, output_root: Path) -> int:
    records = json.loads(normalized_path.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        raise ValueError("normalized results must be a list")
    by_run = {
        record["run_id"]: record
        for record in records
        if isinstance(record, dict) and isinstance(record.get("run_id"), str)
    }
    output_root.mkdir(parents=True, exist_ok=True)
    published = 0
    for run_id, record in sorted(by_run.items()):
        run_dir = raw_root / run_id
        metadata_path = run_dir / "metadata.json"
        if not metadata_path.is_file():
            continue
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        destination = output_root / run_id
        destination.mkdir(parents=True, exist_ok=True)
        terminal = {key: metadata[key] for key in METADATA_FIELDS if key in metadata}
        evaluator_fields = (
            "oracle_sha256",
            "visible_command_sha256",
            "hidden_command_sha256",
            "evaluation_contract_sha256",
        )
        for key in evaluator_fields:
            if key not in terminal and key in record:
                terminal[key] = record[key]
        atomic_write_json(destination / "terminal-metadata.json", terminal)
        atomic_write_json(destination / "event-facts.json", _event_facts(run_dir / "events.jsonl"))
        atomic_write_json(destination / "scored-result.json", record)
        published += 1
    ledgers = []
    for path in sorted(raw_root.glob("schedule-ledger-*.json")):
        value = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(value, list):
            entries = []
            for item in value:
                if not isinstance(item, dict):
                    continue
                entries.append(
                    {
                        key: item[key]
                        for key in ("run_id", "schedule_index", "state", "error_type")
                        if key in item
                    }
                )
            ledgers.append(
                {
                    "schedule": path.stem.removeprefix("schedule-ledger-"),
                    "entries": entries,
                }
            )
    atomic_write_json(output_root / "schedule-ledgers.json", ledgers)
    atomic_write_json(
        output_root / "publication-manifest.json",
        {
            "schema_version": 1,
            "published_trial_count": published,
            "excluded_content": [
                "agent messages and reasoning",
                "command text and command output",
                "stderr and raw logs",
                "last messages",
                "workspace snapshots and diffs",
                "absolute paths and host identity",
                "installed skill bodies",
            ],
            "source_retention": "Verbatim raw evidence is retained outside the public repository.",
        },
    )
    return published


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--normalized", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args(argv)
    count = publish_results(arguments.raw, arguments.normalized, arguments.output)
    print(f"published {count} sanitized trial records")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
