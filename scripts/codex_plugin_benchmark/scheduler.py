from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

from .common import atomic_write_json
from .runner import TrialSpec, run_trial


_SECRET_MARKER = re.compile(r"(?i)\b(token|key|secret)\s*=\s*([^\s,;]+)")


def _validated_trials(schedule_path: Path) -> list[dict[str, object]]:
    value = json.loads(schedule_path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or not isinstance(value.get("trials"), list):
        raise TypeError("schedule must be an object with a trials list")
    trials = value["trials"]
    assert isinstance(trials, list)
    validated: list[dict[str, object]] = []
    for index, trial in enumerate(trials, start=1):
        if not isinstance(trial, dict):
            raise TypeError(f"trial {index} must be an object")
        task_id = trial.get("task_id")
        condition_id = trial.get("condition_id")
        repetition = trial.get("repetition")
        if not isinstance(task_id, str) or not task_id.strip():
            raise ValueError(f"trial {index} has invalid task_id")
        if not isinstance(condition_id, str) or not condition_id.strip():
            raise ValueError(f"trial {index} has invalid condition_id")
        if isinstance(repetition, bool) or not isinstance(repetition, int) or repetition <= 0:
            raise ValueError(f"trial {index} has invalid repetition")
        validated.append(
            {
                "task_id": task_id,
                "condition_id": condition_id,
                "repetition": repetition,
            }
        )
    return validated


def _terminal_metadata(run_dir: Path) -> bool:
    metadata = run_dir / "metadata.json"
    if not metadata.is_file():
        return False
    try:
        value = json.loads(metadata.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return False
    return isinstance(value, dict) and value.get("terminal") is True


def _relocate_incomplete(run_dir: Path, output_root: Path) -> Path:
    excluded = output_root / "excluded"
    excluded.mkdir(parents=True, exist_ok=True)
    for suffix in range(1, 10_000):
        destination = excluded / f"{run_dir.name}--incomplete-{suffix:03d}"
        if not destination.exists():
            shutil.move(str(run_dir), destination)
            return destination
    raise RuntimeError(f"unable to allocate excluded evidence path for {run_dir.name}")


def _bounded_redacted_error(error: Exception, limit: int = 1000) -> str:
    message = _SECRET_MARKER.sub(lambda match: f"{match.group(1)}=[REDACTED]", str(error))
    return message[:limit]


def run_schedule(
    schedule_path: Path,
    output_root: Path,
    codex_root: Path,
    model: str,
    reasoning_effort: str,
    timeout_s: float,
) -> list[dict[str, object]]:
    """Run a validated schedule synchronously and checkpoint every terminal decision."""
    trials = _validated_trials(schedule_path)
    output_root.mkdir(parents=True, exist_ok=True)
    ledger_path = output_root / f"schedule-ledger-{schedule_path.stem}.json"
    ledger: list[dict[str, object]] = []

    for index, trial in enumerate(trials, start=1):
        spec = TrialSpec(
            task_id=str(trial["task_id"]),
            condition_id=str(trial["condition_id"]),
            repetition=int(trial["repetition"]),
            output_root=output_root,
            codex_root=codex_root,
            model=model,
            reasoning_effort=reasoning_effort,
            timeout_s=timeout_s,
        )
        run_dir = output_root / spec.run_id
        if _terminal_metadata(run_dir):
            entry = {
                "run_id": spec.run_id,
                "schedule_index": index,
                "state": "skipped-existing-terminal",
            }
            ledger.append(entry)
            atomic_write_json(ledger_path, ledger)
            print(f"[{index}/{len(trials)}] {spec.run_id}: skipped-existing-terminal", flush=True)
            continue
        if run_dir.exists():
            _relocate_incomplete(run_dir, output_root)

        print(f"[{index}/{len(trials)}] {spec.run_id}: starting", flush=True)
        try:
            record = run_trial(spec)
            entry = {
                "run_id": spec.run_id,
                "schedule_index": index,
                "state": record.status,
            }
        except Exception as error:
            entry = {
                "run_id": spec.run_id,
                "schedule_index": index,
                "state": "runner-exception",
                "error_type": type(error).__name__,
                "error": _bounded_redacted_error(error),
            }
        ledger.append(entry)
        atomic_write_json(ledger_path, ledger)
        print(f"[{index}/{len(trials)}] {spec.run_id}: {entry['state']}", flush=True)

    return ledger
