from __future__ import annotations

import argparse
import json
import re
import statistics
from pathlib import Path
from typing import Iterable, Sequence

from .conditions import effective_surface_sha256
from .report import render_benchmark_table
from .scorer import ScoredTrial


def _escape(value: object) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def _replace_section(document: str, name: str, body: str) -> str:
    begin = f"<!-- BEGIN {name} -->"
    end = f"<!-- END {name} -->"
    replacement = f"{begin}\n{body.rstrip()}\n{end}"
    paired = re.compile(re.escape(begin) + r".*?" + re.escape(end), re.S)
    if paired.search(document):
        return paired.sub(lambda _: replacement, document)
    single = f"<!-- {name} -->"
    if single not in document:
        raise ValueError(f"missing report marker: {name}")
    return document.replace(single, replacement)


def _median(records: Sequence[ScoredTrial], field: str) -> float | None:
    values = [float(value) for record in records if (value := getattr(record, field)) is not None]
    return statistics.median(values) if values else None


def _current_records(
    records: Sequence[ScoredTrial], configurations_dir: Path | None
) -> list[ScoredTrial]:
    """Exclude trials produced by superseded condition manifests.

    Raw evidence is intentionally append-only.  Configuration hashes are strict by
    default; a versioned equivalence manifest can retain older hashes only when the
    audit has established that their effective exposed surface is identical.
    """
    if configurations_dir is None:
        return list(records)
    accepted: dict[str, tuple[set[str], str]] = {}
    for path in configurations_dir.glob("*.json"):
        value = json.loads(path.read_text(encoding="utf-8"))
        condition_id = value.get("condition_id")
        content_sha256 = value.get("content_sha256")
        if isinstance(condition_id, str) and isinstance(content_sha256, str):
            surface_sha256 = value.get("effective_surface_sha256")
            if not isinstance(surface_sha256, str):
                surface_sha256 = effective_surface_sha256(value)
            accepted[condition_id] = ({content_sha256}, surface_sha256)
    equivalence_path = configurations_dir / "evidence-equivalence.json"
    if equivalence_path.is_file():
        equivalence = json.loads(equivalence_path.read_text(encoding="utf-8"))
        for condition_id, hashes in equivalence.get("accepted_condition_hashes", {}).items():
            if condition_id in accepted and isinstance(hashes, list):
                accepted[condition_id][0].update(
                    value for value in hashes if isinstance(value, str)
                )
    return [
        record
        for record in records
        if record.condition_id in accepted
        and record.condition_sha256 in accepted[record.condition_id][0]
        and record.effective_surface_sha256 == accepted[record.condition_id][1]
    ]


def _summary(records: Sequence[ScoredTrial]) -> str:
    if not records:
        return "not measured"
    successes = sum(record.success for record in records)
    implementation = sum(record.implementation_correct for record in records)
    total = len(records)

    def measured(field: str, formatter: str, label: str) -> str:
        values = [
            float(value)
            for record in records
            if (value := getattr(record, field)) is not None
        ]
        if not values:
            return f"{label} unavailable (0/{total} measured)"
        rendered = format(statistics.median(values), formatter)
        coverage = f" ({len(values)}/{total} measured)" if len(values) != total else ""
        return f"{rendered}{label}{coverage}"

    return (
        f"{successes}/{total} end-to-end; {implementation}/{total} correct workspaces; median "
        f"{measured('wall_seconds', '.1f', 's')}, "
        f"{measured('input_tokens', '.0f', ' input tokens')}, "
        f"{measured('tool_calls', '.1f', ' calls')}"
    )


def _matched(
    records: Sequence[ScoredTrial], condition: str, baseline: str
) -> tuple[list[ScoredTrial], list[ScoredTrial]]:
    treatment_tasks = {record.task_id for record in records if record.condition_id == condition}
    baseline_tasks = {record.task_id for record in records if record.condition_id == baseline}
    common = treatment_tasks & baseline_tasks
    treatment = [
        record for record in records if record.condition_id == condition and record.task_id in common
    ]
    control = [record for record in records if record.condition_id == baseline and record.task_id in common]
    return treatment, control


def _delta(treatment: Sequence[ScoredTrial], baseline: Sequence[ScoredTrial], field: str) -> str:
    paired_deltas: list[float] = []
    common_tasks = {record.task_id for record in treatment} & {
        record.task_id for record in baseline
    }
    for task_id in common_tasks:
        left_records = [record for record in treatment if record.task_id == task_id]
        right_records = [record for record in baseline if record.task_id == task_id]
        if any(getattr(record, field) is None for record in left_records + right_records):
            return "n/a (incomplete)"
        left = _median(left_records, field)
        right = _median(right_records, field)
        assert left is not None and right is not None
        paired_deltas.append(left - right)
    if not paired_deltas:
        return "n/a"
    return f"{statistics.median(paired_deltas):+.1f}"


def render_ablation_table(records: Sequence[ScoredTrial]) -> str:
    rows = [
        ("Engineering Guardrails", "guardrails", "b0", "Task H workspace was correct but timed out while native returned; no net correctness win and Task E regressed.", "High"),
        ("Superpowers engineering", "superpowers-engineering", "b0", "No repeatable benefit; successful B produced the same behavior.", "High"),
        ("Guardrails + Superpowers", "guardrails-plus-superpowers", "guardrails", "Adding Superpowers preserved the same 3/4 correctness and added substantial cost; no marginal gain.", "High"),
        ("Coordinator", "coordinator", "b0", "Same correctness on C/H after prompt-aligned adjudication; added cost on C but one substantially faster H run. Unique board remained off, so marginal value is uncertain.", "Medium-low; one run per task"),
        ("Superpowers coordination", "superpowers-coordination", "b0", "Task H workspace was correct but timed out after repeated review gates while native returned; Task C was a zero-file failure.", "High for default-path harm; same-task variance remains limited"),
        ("Coordinator + Superpowers vs native", "coordinator-plus-superpowers", "b0", "None; zero-file failure on Task C.", "High"),
        ("Adding Superpowers to Coordinator", "coordinator-plus-superpowers", "coordinator", "Lost Task C correctness; no synergy.", "High"),
        ("Adding Coordinator to Superpowers coordination", "coordinator-plus-superpowers", "superpowers-coordination", "No correctness gain; added cost.", "Medium"),
        ("Codex Security fix-finding skill", "security", "b0", "One additional TOCTOU idea on F, but no portable outcome lift; same-prompt I matched native.", "High for default-path harm; medium for specialized analysis"),
        ("Codex Security formal scan/tool pipeline", "security-full", "b0", "Canonical scan/report lifecycle; no correctness lift on same-prompt Task I.", "Medium; one role-relevant trial"),
        ("Current maximum", "maximum", "b0", "No paired correctness advantage.", "High"),
        ("Repository instructions / minimal finalist", "b1", "b0", "Repository-specific invariants and verification contract.", "Medium"),
        ("GitHub workflow skill surface", "github", "b0", "No ordinary-coding outcome advantage; connector was disabled in this condition.", "Medium"),
        ("Guardrails inside maximum", "maximum", "maximum-minus-guardrails", "Partially suppressed Superpowers ceremony in this interaction; no standalone gain.", "Medium"),
        ("Superpowers inside maximum", "maximum", "maximum-minus-superpowers", "None; removing it preserved correctness while sharply reducing cost.", "High"),
        ("Coordinator inside maximum", "maximum", "maximum-minus-coordinator", "None; both variants failed Task C.", "Medium"),
        ("Security skills inside maximum", "maximum", "maximum-minus-security", "Prevented Superpowers' approval stop on F; plugin tools remained enabled in both variants.", "Medium"),
        ("GitHub skills inside maximum", "maximum", "maximum-minus-github", "None on Task A; connector remained enabled in both variants.", "Medium"),
    ]
    lines = [
        "| Component | Performance with | Performance without | Marginal benefit | Marginal harm | Confidence |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for component, condition, baseline, benefit, confidence in rows:
        treatment, control = _matched(records, condition, baseline)
        if not treatment or not control:
            continue
        treatment_questions = sum(item.user_question_count for item in treatment)
        treatment_artifacts = sum(item.workflow_overhead_artifact_count for item in treatment)
        treatment_false = sum(item.false_completion_claims for item in treatment)
        harm = (
            f"median deltas: {_delta(treatment, control, 'wall_seconds')}s, "
            f"{_delta(treatment, control, 'input_tokens')} input tokens, "
            f"{_delta(treatment, control, 'tool_calls')} calls; "
            f"{treatment_questions} user gates, {treatment_artifacts} workflow artifacts, "
            f"{treatment_false} false completion claims"
        )
        lines.append(
            "| {} | {} | {} | {} | {} | {} |".format(
                _escape(component),
                _escape(_summary(treatment)),
                _escape(_summary(control)),
                _escape(benefit),
                _escape(harm),
                _escape(confidence),
            )
        )
    return "\n".join(lines) + "\n"


def render_decision_table(components: Iterable[dict[str, object]]) -> str:
    lines = [
        "| Component | Decision | Empirical improvement | Unique capability | Redundancy | Harm/overhead | Consequence of removal | Confidence |",
        "| --- | --- | ---: | --- | --- | --- | --- | ---: |",
    ]
    for item in components:
        confidence = item.get("confidence")
        rendered_confidence = f"{float(confidence):.0%}" if confidence is not None else "n/a"
        lines.append(
            "| {component} | {decision} | {empirical} | {unique} | {redundancy} | {harm} | {removal} | {confidence} |".format(
                component=_escape(item["component"]),
                decision=_escape(item["decision"]),
                empirical=_escape(item["empirical_improvement"]),
                unique=_escape(item["unique_capability"]),
                redundancy=_escape(item["redundancy"]),
                harm=_escape(item["harm_overhead"]),
                removal=_escape(item["consequence_of_removal"]),
                confidence=rendered_confidence,
            )
        )
    return "\n".join(lines) + "\n"


def render_long_running(records: Sequence[ScoredTrial]) -> str:
    b0 = [record for record in records if record.task_id == "task-g" and record.condition_id == "b0"]
    maximum = [
        record for record in records if record.task_id == "task-g" and record.condition_id == "maximum"
    ]
    if not b0:
        return "Task G is pending."
    native = b0[0]
    text = (
        f"Native Task G {'completed' if native.success else 'failed'} end to end in "
        f"{native.wall_seconds:.1f} seconds with {native.tool_calls} completed calls. It observed "
        "the first terminal failure, reused the saved state on the second invocation, and ran the "
        "verification suite instead of detaching the command."
    )
    if maximum:
        full = maximum[0]
        text += (
            f" Maximum {'completed' if full.success else 'failed'} in {full.wall_seconds:.1f} seconds "
            f"with {full.tool_calls} calls and {full.input_tokens} input tokens, versus native's "
            f"{native.tool_calls} calls and {native.input_tokens} input tokens."
        )
    text += (
        " Process Jobs was not reinstalled after owner removal. Its direct pre-removal audit showed "
        "a deliberate detach/release-turn policy and measurable global hook overhead. Native owns "
        "same-turn process completion; a future durable registry must be explicit and must not change that default."
    )
    return text


def finalize_report(
    report_path: Path,
    normalized_path: Path,
    decisions_path: Path,
    configurations_dir: Path | None = None,
) -> None:
    values = json.loads(normalized_path.read_text(encoding="utf-8"))
    records = _current_records([ScoredTrial(**value) for value in values], configurations_dir)
    decisions = json.loads(decisions_path.read_text(encoding="utf-8"))["components"]
    document = report_path.read_text(encoding="utf-8")
    document = _replace_section(document, "BENCHMARK_TABLE", render_benchmark_table(records))
    document = _replace_section(document, "LONG_RUNNING_FINDING", render_long_running(records))
    document = _replace_section(document, "ABLATION_TABLE", render_ablation_table(records))
    document = _replace_section(document, "DECISION_TABLE", render_decision_table(decisions))
    report_path.write_text(document, encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--normalized", type=Path, required=True)
    parser.add_argument("--decisions", type=Path, required=True)
    parser.add_argument("--configurations", type=Path)
    arguments = parser.parse_args(argv)
    finalize_report(
        arguments.report,
        arguments.normalized,
        arguments.decisions,
        arguments.configurations,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
