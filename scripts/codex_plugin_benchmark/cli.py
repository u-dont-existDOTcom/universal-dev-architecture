from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

from .common import atomic_write_json
from .conditions import CONDITION_IDS, build_condition, run_prompt_preflight
from .inventory import collect_inventory
from .fixtures import verify_all_fixtures
from .runner import TrialSpec, run_trial


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="codex-plugin-benchmark")
    subparsers = parser.add_subparsers(dest="command", required=True)
    inventory = subparsers.add_parser("inventory")
    inventory.add_argument("--codex-root", type=Path, required=True)
    inventory.add_argument("--output", type=Path, required=True)
    fixtures = subparsers.add_parser("fixtures")
    fixture_subparsers = fixtures.add_subparsers(dest="fixture_command", required=True)
    verify = fixture_subparsers.add_parser("verify")
    verify.add_argument("--all", action="store_true", required=True)
    verify.add_argument("--output", type=Path)
    conditions = subparsers.add_parser("conditions")
    conditions.add_argument("--all", action="store_true", required=True)
    conditions.add_argument("--codex-root", type=Path, required=True)
    conditions.add_argument("--output", type=Path, required=True)
    preflight = subparsers.add_parser("preflight")
    preflight.add_argument("--all", action="store_true", required=True)
    preflight.add_argument("--codex-root", type=Path, required=True)
    preflight.add_argument("--output", type=Path, required=True)
    run = subparsers.add_parser("run")
    run.add_argument("--task", required=True)
    run.add_argument("--condition", required=True)
    run.add_argument("--repeat", type=int, required=True)
    run.add_argument("--output", type=Path, required=True)
    run.add_argument("--codex-root", type=Path, default=Path("/home/joel/.codex"))
    run.add_argument("--codex-executable", default="codex")
    run.add_argument("--model", default="gpt-5.6-sol")
    run.add_argument("--reasoning-effort", default="xhigh")
    run.add_argument("--timeout", type=float, default=900)
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    if arguments.command == "inventory":
        atomic_write_json(arguments.output, collect_inventory(arguments.codex_root))
        return 0
    if arguments.command == "fixtures" and arguments.fixture_command == "verify":
        with tempfile.TemporaryDirectory(prefix="codex-benchmark-fixtures-") as temporary:
            results = verify_all_fixtures(Path(temporary) / "materialized")
        if arguments.output:
            atomic_write_json(arguments.output, results)
        else:
            print(json.dumps(results, indent=2, sort_keys=True))
        return 0 if all(result["valid"] for result in results.values()) else 1
    if arguments.command == "conditions":
        arguments.output.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="codex-benchmark-condition-manifests-") as temporary:
            for condition_id in CONDITION_IDS:
                trial_root = Path(temporary) / condition_id
                trial_root.mkdir()
                record = build_condition(condition_id, trial_root, arguments.codex_root)
                atomic_write_json(arguments.output / f"{condition_id}.json", record.to_dict())
        return 0
    if arguments.command == "preflight":
        with tempfile.TemporaryDirectory(prefix="codex-benchmark-preflight-") as temporary:
            root = Path(temporary)
            results = {}
            for condition_id in CONDITION_IDS:
                trial_root = root / condition_id
                trial_root.mkdir()
                condition = build_condition(condition_id, trial_root, arguments.codex_root)
                results[condition_id] = run_prompt_preflight(condition, trial_root)
        atomic_write_json(arguments.output, results)
        return 0 if all(result["valid"] for result in results.values()) else 1
    if arguments.command == "run":
        record = run_trial(
            TrialSpec(
                task_id=arguments.task,
                condition_id=arguments.condition,
                repetition=arguments.repeat,
                output_root=arguments.output,
                codex_root=arguments.codex_root,
                codex_executable=arguments.codex_executable,
                model=arguments.model,
                reasoning_effort=arguments.reasoning_effort,
                timeout_s=arguments.timeout,
            )
        )
        print(record.metadata_path)
        return 0 if record.status == "completed" else 1
    raise AssertionError(f"unhandled command: {arguments.command}")


if __name__ == "__main__":
    raise SystemExit(main())
