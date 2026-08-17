from __future__ import annotations

import json
import re
import shutil
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Sequence

from .common import atomic_write_json, run_command, sha256_path
from .fixtures import materialize_fixture


@dataclass(frozen=True)
class ScoredTrial:
    run_id: str
    task_id: str
    condition_id: str
    repetition: int
    condition_sha256: str | None
    fixture_sha256: str | None
    oracle_sha256: str
    visible_command_sha256: str
    hidden_command_sha256: str
    evaluation_contract_sha256: str
    scorer_schema_version: int
    model: str | None
    reasoning_effort: str | None
    infrastructure_status: str
    success: bool
    implementation_correct: bool
    visible_tests_passed: bool
    hidden_tests_passed: bool
    correctness_score: float
    engineering_quality_score: float
    verification_score: float
    autonomy_score: float
    overall_score: float
    wall_seconds: float | None
    agent_wall_seconds: float | None
    tool_calls: int | None
    test_command_count: int
    failed_command_count: int
    input_tokens: int | None
    output_tokens: int | None
    changed_file_count: int
    changed_source_file_count: int
    changed_test_file_count: int
    diff_added_lines: int
    diff_deleted_lines: int
    subagent_count: int | None
    collaboration_wait_count: int
    unattributed_collaboration_wait_count: int
    user_question_count: int
    workflow_overhead_artifact_count: int
    workflow_overhead_artifacts: tuple[str, ...]
    false_completion_claims: int
    last_message_present: bool
    visible_test_exit_code: int | None
    hidden_test_exit_code: int | None
    notes: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def _events(path: Path) -> tuple[list[dict[str, object]], int]:
    events: list[dict[str, object]] = []
    invalid = 0
    if not path.is_file():
        return events, invalid
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            invalid += 1
            continue
        if isinstance(value, dict):
            events.append(value)
    return events, invalid


def _event_metrics(events: list[dict[str, object]]) -> dict[str, int | None]:
    tool_calls = 0
    test_commands = 0
    failed_commands = 0
    subagents = 0
    collaboration_waits = 0
    unattributed_collaboration_waits = 0
    questions = 0
    input_tokens = 0
    output_tokens = 0
    saw_usage = False
    for event in events:
        encoded = json.dumps(event, sort_keys=True)
        item = event.get("item") if isinstance(event.get("item"), dict) else {}
        item_type = item.get("type") if isinstance(item, dict) else None
        completed_item = event.get("type") == "item.completed"
        if completed_item and item_type in {
            "command_execution",
            "mcp_tool_call",
            "tool_call",
            "collaboration_tool_call",
            "collab_tool_call",
            "file_change",
        }:
            tool_calls += 1
        command = item.get("command", "") if isinstance(item, dict) else ""
        if (
            completed_item
            and item_type == "command_execution"
            and isinstance(item.get("exit_code"), int)
            and item.get("exit_code") != 0
        ):
            failed_commands += 1
        if (
            completed_item
            and item_type == "command_execution"
            and isinstance(command, str)
            and re.search(
                r"(?:npm\s+test|node\s+--test|python\S*\s+-m\s+(?:pytest|unittest)|pytest|cargo\s+test|go\s+test)",
                command,
            )
        ):
            test_commands += 1
        tool_name = item.get("tool") if isinstance(item, dict) else None
        if completed_item and tool_name == "spawn_agent":
            subagents += 1
        if completed_item and tool_name == "wait":
            collaboration_waits += 1
            receivers = item.get("receiver_thread_ids")
            if isinstance(receivers, list) and not receivers:
                unattributed_collaboration_waits += 1
        if completed_item and tool_name == "request_user_input":
            questions += 1
        if event.get("type") == "turn.completed" and isinstance(event.get("usage"), dict):
            usage = event["usage"]
            assert isinstance(usage, dict)
            numeric_input = usage.get("input_tokens")
            numeric_output = usage.get("output_tokens")
            if isinstance(numeric_input, int):
                input_tokens += numeric_input
                saw_usage = True
            if isinstance(numeric_output, int):
                output_tokens += numeric_output
                saw_usage = True
    return {
        "tool_calls": tool_calls if events else None,
        "test_commands": test_commands,
        "failed_commands": failed_commands,
        "subagents": subagents,
        "collaboration_waits": collaboration_waits,
        "unattributed_collaboration_waits": unattributed_collaboration_waits,
        "questions": questions,
        "input_tokens": input_tokens if saw_usage else None,
        "output_tokens": output_tokens if saw_usage else None,
    }


def _file_hashes(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root).as_posix(): sha256_path(path)
        for path in sorted(root.rglob("*"))
        if path.is_file() and ".benchmark-oracle" not in path.parts
    }


def _change_metrics(task_id: str, workspace: Path) -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix=f"codex-before-{task_id}-") as temporary:
        fixture = materialize_fixture(task_id, Path(temporary) / "workspace")
        before = _file_hashes(fixture.root)
    after = _file_hashes(workspace)
    changed = sorted(path for path in set(before) | set(after) if before.get(path) != after.get(path))
    overhead = tuple(
        path
        for path in changed
        if path.startswith(("docs/", ".superpowers/", "plans/", "handoff/"))
        or Path(path).name.lower() in {"handoff.md", "plan.md", "implementation-plan.md", "agents.md"}
    )
    return {
        "changed": changed,
        "source": [path for path in changed if path.startswith("src/") or path.startswith("scripts/")],
        "tests": [
            path
            for path in changed
            if path.startswith(("test/", "tests/")) or "/test/" in path or "/tests/" in path
        ],
        "overhead": overhead,
    }


def _diff_lines(path: Path) -> tuple[int, int]:
    if not path.is_file():
        return 0, 0
    added = deleted = 0
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("+++") or line.startswith("---"):
            continue
        if line.startswith("+"):
            added += 1
        elif line.startswith("-"):
            deleted += 1
    return added, deleted


def _terminal_message_requests_input(message: str) -> bool:
    if "?" not in message:
        return False
    return bool(
        re.search(
            r"(?:^|\n)[^\n?]*\b(?:should|would|could|can|may|do|does|did|is|are|"
            r"what|which|how|when|where|who|why)\b[^\n?]*\?",
            message,
            re.I | re.M,
        )
        or message.rstrip().endswith("?")
    )


def _terminal_message_claims_completion(message: str) -> bool:
    return bool(
        re.search(r"\b(?:complete|completed|fixed|implemented|done)\b", message, re.I)
        or re.search(
            r"\b(?:all|full|final|verification|tests?|suite)\b[^\n.]{0,40}"
            r"\b(?:passing|passes|passed)\b",
            message,
            re.I,
        )
    )


def _run_oracles(task_id: str, workspace: Path) -> tuple[object, object, object]:
    with tempfile.TemporaryDirectory(prefix=f"codex-score-{task_id}-") as temporary:
        temporary_root = Path(temporary)
        baseline = materialize_fixture(
            task_id, temporary_root / "baseline", include_oracle=True
        )
        scoring_root = temporary_root / "workspace"
        shutil.copytree(workspace, scoring_root)
        shutil.copytree(
            baseline.root / ".benchmark-oracle", scoring_root / ".benchmark-oracle"
        )
        visible = run_command(list(baseline.visible_command), scoring_root, timeout_s=120)
        hidden = run_command(list(baseline.hidden_command), scoring_root, timeout_s=120)
        return visible, hidden, baseline


def score_trial(run_dir: Path) -> ScoredTrial:
    metadata = json.loads((run_dir / "metadata.json").read_text(encoding="utf-8"))
    workspace = run_dir / "final-workspace"
    events, invalid_events = _events(run_dir / "events.jsonl")
    event_metrics = _event_metrics(events)
    notes: list[str] = []
    visible_exit: int | None = None
    hidden_exit: int | None = None
    evaluator = None
    if workspace.is_dir():
        visible, hidden, evaluator = _run_oracles(metadata["task_id"], workspace)
        visible_exit = visible.returncode
        hidden_exit = hidden.returncode
        if metadata.get("status") != "completed":
            notes.append("scored preserved workspace despite trial infrastructure failure")
    else:
        notes.append("trial infrastructure did not complete")
    visible_passed = visible_exit == 0
    hidden_passed = hidden_exit == 0
    implementation_correct = visible_passed and hidden_passed
    success = implementation_correct and metadata.get("status") == "completed"
    changes = _change_metrics(metadata["task_id"], workspace) if workspace.is_dir() else {
        "changed": [], "source": [], "tests": [], "overhead": ()
    }
    added, deleted = _diff_lines(run_dir / "changes.diff")
    last_message_present = (run_dir / "last-message.txt").is_file()
    message = (
        (run_dir / "last-message.txt").read_text(encoding="utf-8", errors="replace")
        if last_message_present
        else ""
    )
    if not last_message_present:
        notes.append("final message unavailable")
    terminal_question = int(_terminal_message_requests_input(message))
    question_count = max(int(event_metrics["questions"] or 0), terminal_question)
    false_completion = int(
        not implementation_correct
        and _terminal_message_claims_completion(message)
    )
    correctness = 100.0 if implementation_correct else (35.0 if visible_passed else 0.0)
    changed_count = len(changes["changed"])
    test_count = len(changes["tests"])
    overhead_count = len(changes["overhead"])
    engineering = 55.0
    engineering += 20.0 if test_count or metadata["task_id"] == "task-g" else 0.0
    engineering += 15.0 if changed_count <= 5 else max(0.0, 15.0 - (changed_count - 5) * 3)
    engineering -= min(30.0, overhead_count * 10.0)
    if not implementation_correct:
        engineering = min(engineering, 55.0)
    verification = (
        100.0
        if implementation_correct and event_metrics["test_commands"]
        else (60.0 if implementation_correct else 0.0)
    )
    autonomy = max(0.0, 100.0 - question_count * 25.0)
    if success:
        overall = correctness * 0.55 + engineering * 0.2 + verification * 0.15 + autonomy * 0.1
    else:
        overall = min(
            49.0,
            correctness * 0.55 + engineering * 0.2 + verification * 0.15 + autonomy * 0.1,
        )
    if invalid_events:
        notes.append(f"ignored {invalid_events} invalid JSONL event lines")
    if event_metrics["input_tokens"] is None:
        notes.append("token usage unavailable")
    return ScoredTrial(
        run_id=metadata["run_id"],
        task_id=metadata["task_id"],
        condition_id=metadata["condition_id"],
        repetition=int(metadata["repetition"]),
        condition_sha256=metadata.get("condition_sha256"),
        fixture_sha256=metadata.get("fixture_sha256"),
        oracle_sha256=evaluator.oracle_sha256 if evaluator is not None else "unavailable",
        visible_command_sha256=(
            evaluator.visible_command_sha256 if evaluator is not None else "unavailable"
        ),
        hidden_command_sha256=(
            evaluator.hidden_command_sha256 if evaluator is not None else "unavailable"
        ),
        evaluation_contract_sha256=(
            evaluator.evaluation_contract_sha256 if evaluator is not None else "unavailable"
        ),
        scorer_schema_version=2,
        model=metadata.get("model"),
        reasoning_effort=metadata.get("reasoning_effort"),
        infrastructure_status=metadata.get("status", "unknown"),
        success=success,
        implementation_correct=implementation_correct,
        visible_tests_passed=visible_passed,
        hidden_tests_passed=hidden_passed,
        correctness_score=correctness,
        engineering_quality_score=round(engineering, 2),
        verification_score=verification,
        autonomy_score=autonomy,
        overall_score=round(overall, 2),
        wall_seconds=metadata.get("wall_seconds"),
        agent_wall_seconds=metadata.get("agent_wall_seconds"),
        tool_calls=event_metrics["tool_calls"],
        test_command_count=int(event_metrics["test_commands"] or 0),
        failed_command_count=int(event_metrics["failed_commands"] or 0),
        input_tokens=event_metrics["input_tokens"],
        output_tokens=event_metrics["output_tokens"],
        changed_file_count=changed_count,
        changed_source_file_count=len(changes["source"]),
        changed_test_file_count=test_count,
        diff_added_lines=added,
        diff_deleted_lines=deleted,
        subagent_count=(int(event_metrics["subagents"]) if event_metrics["subagents"] else None),
        collaboration_wait_count=int(event_metrics["collaboration_waits"] or 0),
        unattributed_collaboration_wait_count=int(
            event_metrics["unattributed_collaboration_waits"] or 0
        ),
        user_question_count=question_count,
        workflow_overhead_artifact_count=overhead_count,
        workflow_overhead_artifacts=tuple(changes["overhead"]),
        false_completion_claims=false_completion,
        last_message_present=last_message_present,
        visible_test_exit_code=visible_exit,
        hidden_test_exit_code=hidden_exit,
        notes=tuple(notes),
    )


def rank_trials(records: Sequence[ScoredTrial]) -> list[ScoredTrial]:
    return sorted(
        records,
        key=lambda record: (
            record.success,
            record.overall_score,
            record.verification_score,
            -record.workflow_overhead_artifact_count,
            -(record.wall_seconds or float("inf")),
        ),
        reverse=True,
    )


def score_all(raw_root: Path, output_root: Path) -> list[ScoredTrial]:
    output_root.mkdir(parents=True, exist_ok=True)
    records: list[ScoredTrial] = []
    for metadata_path in sorted(raw_root.glob("*/metadata.json")):
        record = score_trial(metadata_path.parent)
        atomic_write_json(output_root / f"{record.run_id}.json", record.to_dict())
        records.append(record)
    atomic_write_json(output_root / "all-trials.json", [record.to_dict() for record in records])
    return records
