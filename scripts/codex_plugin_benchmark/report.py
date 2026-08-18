from __future__ import annotations

import statistics
from dataclasses import asdict, dataclass
from typing import Sequence

from .scorer import ScoredTrial


@dataclass(frozen=True)
class MarginalComparison:
    task_id: str
    baseline_condition: str
    treatment_condition: str
    baseline_trials: int
    treatment_trials: int
    success_rate_delta: float
    overall_score_delta: float
    verification_score_delta: float
    wall_seconds_delta: float | None
    tool_calls_delta: float | None
    input_tokens_delta: float | None
    overhead_artifact_delta: float

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def _mean(records: Sequence[ScoredTrial], field: str) -> float | None:
    values = [getattr(record, field) for record in records]
    measured = [float(value) for value in values if value is not None]
    return statistics.fmean(measured) if measured else None


def compare_conditions(
    records: Sequence[ScoredTrial],
    *,
    baseline_condition: str = "b0",
) -> list[MarginalComparison]:
    by_task_condition: dict[tuple[str, str], list[ScoredTrial]] = {}
    for record in records:
        by_task_condition.setdefault((record.task_id, record.condition_id), []).append(record)
    comparisons: list[MarginalComparison] = []
    for (task_id, treatment), treatment_records in sorted(by_task_condition.items()):
        if treatment == baseline_condition:
            continue
        baseline = by_task_condition.get((task_id, baseline_condition))
        if not baseline:
            continue
        baseline_wall = _mean(baseline, "wall_seconds")
        treatment_wall = _mean(treatment_records, "wall_seconds")
        baseline_tools = _mean(baseline, "tool_calls")
        treatment_tools = _mean(treatment_records, "tool_calls")
        baseline_tokens = _mean(baseline, "input_tokens")
        treatment_tokens = _mean(treatment_records, "input_tokens")
        comparisons.append(
            MarginalComparison(
                task_id=task_id,
                baseline_condition=baseline_condition,
                treatment_condition=treatment,
                baseline_trials=len(baseline),
                treatment_trials=len(treatment_records),
                success_rate_delta=round(
                    (_mean(treatment_records, "success") or 0) - (_mean(baseline, "success") or 0), 4
                ),
                overall_score_delta=round(
                    (_mean(treatment_records, "overall_score") or 0)
                    - (_mean(baseline, "overall_score") or 0),
                    2,
                ),
                verification_score_delta=round(
                    (_mean(treatment_records, "verification_score") or 0)
                    - (_mean(baseline, "verification_score") or 0),
                    2,
                ),
                wall_seconds_delta=(
                    round(treatment_wall - baseline_wall, 2)
                    if treatment_wall is not None and baseline_wall is not None
                    else None
                ),
                tool_calls_delta=(
                    round(treatment_tools - baseline_tools, 2)
                    if treatment_tools is not None and baseline_tools is not None
                    else None
                ),
                input_tokens_delta=(
                    round(treatment_tokens - baseline_tokens, 2)
                    if treatment_tokens is not None and baseline_tokens is not None
                    else None
                ),
                overhead_artifact_delta=round(
                    (_mean(treatment_records, "workflow_overhead_artifact_count") or 0)
                    - (_mean(baseline, "workflow_overhead_artifact_count") or 0),
                    2,
                ),
            )
        )
    return comparisons


def render_benchmark_table(records: Sequence[ScoredTrial]) -> str:
    lines = [
        "| Task | Configuration | Success | Engineering-quality proxy | Verification | Time (s) | Overhead | Human intervention | Notes |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for record in sorted(records, key=lambda item: (item.task_id, item.condition_id, item.repetition)):
        outcome = "yes" if record.success else "no"
        if record.implementation_correct and not record.success:
            outcome = "no (implementation correct; run failed)"
        overhead_parts = [
            f"{record.tool_calls if record.tool_calls is not None else 'n/a'} calls",
            f"{record.input_tokens if record.input_tokens is not None else 'n/a'} input tokens",
            f"{record.changed_file_count} files",
        ]
        if record.workflow_overhead_artifact_count:
            overhead_parts.append(f"{record.workflow_overhead_artifact_count} workflow artifacts")
        if record.collaboration_wait_count:
            overhead_parts.append(f"{record.collaboration_wait_count} waits")
        if record.failed_command_count:
            overhead_parts.append(f"{record.failed_command_count} failed commands")
        notes = list(record.notes)
        if record.false_completion_claims:
            notes.append(f"{record.false_completion_claims} false completion claim")
        lines.append(
            "| {task} | {condition} r{repeat} | {success} | {quality:.1f} | {verification:.1f} | {wall} | {overhead} | {questions} | {notes} |".format(
                task=record.task_id,
                condition=record.condition_id,
                repeat=record.repetition,
                success=outcome,
                quality=record.engineering_quality_score,
                verification=record.verification_score,
                wall=f"{record.wall_seconds:.1f}" if record.wall_seconds is not None else "n/a",
                overhead="; ".join(overhead_parts),
                questions=record.user_question_count,
                notes="; ".join(notes).replace("|", "\\|") or "—",
            )
        )
    return "\n".join(lines) + "\n"
