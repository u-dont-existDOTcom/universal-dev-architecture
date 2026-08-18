from __future__ import annotations

import os
import shutil
import signal
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

from .common import atomic_write_json, run_command
from .conditions import ConditionRecord, build_condition, codex_overrides
from .fixtures import materialize_fixture


@dataclass(frozen=True)
class TrialSpec:
    task_id: str
    condition_id: str
    repetition: int
    output_root: Path
    codex_root: Path = Path.home() / ".codex"
    codex_executable: str = "codex"
    model: str = "gpt-5.6-sol"
    reasoning_effort: str = "xhigh"
    timeout_s: float = 900
    environment_overrides: dict[str, str] = field(default_factory=dict)

    @property
    def run_id(self) -> str:
        return f"{self.task_id}--{self.condition_id}--r{self.repetition:02d}"


@dataclass(frozen=True)
class TrialRecord:
    run_id: str
    task_id: str
    condition_id: str
    repetition: int
    status: str
    codex_exit_code: int | None
    timed_out: bool
    wall_seconds: float
    run_dir: Path
    events_path: Path
    stderr_path: Path
    last_message_path: Path
    diff_path: Path
    final_workspace_path: Path
    metadata_path: Path


def build_codex_argv(
    spec: TrialSpec,
    condition: ConditionRecord,
    trial_root: Path,
    last_message_path: Path,
) -> list[str]:
    return [
        spec.codex_executable,
        "exec",
        "--ignore-user-config",
        "--ignore-rules",
        "--ephemeral",
        "--json",
        "--model",
        spec.model,
        "--sandbox",
        "workspace-write",
        "--cd",
        str(trial_root),
        "-o",
        str(last_message_path),
        "-c",
        f'model_reasoning_effort="{spec.reasoning_effort}"',
        "-c",
        'approval_policy="never"',
        *codex_overrides(condition),
        "-",
    ]


def _require_git(result_name: str, result: object) -> None:
    returncode = getattr(result, "returncode")
    if returncode != 0:
        stderr = getattr(result, "stderr")
        raise RuntimeError(f"{result_name} failed: {stderr[-2000:]}")


def _snapshot_workspace(source: Path, destination: Path) -> None:
    shutil.copytree(
        source,
        destination,
        ignore=shutil.ignore_patterns(".git", ".agents", ".benchmark-oracle", "AGENTS.md"),
    )


def run_trial(spec: TrialSpec) -> TrialRecord:
    run_dir = (spec.output_root / spec.run_id).resolve()
    run_dir.mkdir(parents=True, exist_ok=False)
    events_path = run_dir / "events.jsonl"
    stderr_path = run_dir / "stderr.log"
    last_message_path = run_dir / "last-message.txt"
    diff_path = run_dir / "changes.diff"
    status_path = run_dir / "git-status.txt"
    final_workspace_path = run_dir / "final-workspace"
    metadata_path = run_dir / "metadata.json"
    started = time.monotonic()
    agent_started: float | None = None
    agent_wall_seconds: float | None = None
    exit_code: int | None = None
    timed_out = False
    status = "infrastructure-failed"

    atomic_write_json(
        metadata_path,
        {
            "schema_version": 1,
            "run_id": spec.run_id,
            "task_id": spec.task_id,
            "condition_id": spec.condition_id,
            "repetition": spec.repetition,
            "terminal": False,
            "used_process_jobs": False,
        },
    )

    with tempfile.TemporaryDirectory(prefix=f"codex-ablation-{spec.run_id}-") as temporary:
        trial_root = Path(temporary) / "workspace"
        fixture = materialize_fixture(spec.task_id, trial_root)
        _require_git("git init", run_command(["git", "init", "--quiet"], trial_root, timeout_s=20))
        _require_git(
            "git config user.name",
            run_command(["git", "config", "user.name", "Codex Benchmark"], trial_root, timeout_s=20),
        )
        _require_git(
            "git config user.email",
            run_command(
                ["git", "config", "user.email", "benchmark@invalid.example"],
                trial_root,
                timeout_s=20,
            ),
        )
        _require_git("git add", run_command(["git", "add", "."], trial_root, timeout_s=20))
        _require_git(
            "git commit",
            run_command(["git", "commit", "--quiet", "-m", "seed fixture"], trial_root, timeout_s=20),
        )
        condition = build_condition(spec.condition_id, trial_root, spec.codex_root)
        exclude = trial_root / ".git" / "info" / "exclude"
        exclude.write_text(".agents/\n.benchmark-oracle/\n/AGENTS.md\n", encoding="utf-8")
        prompt = fixture.prompt_path.read_text(encoding="utf-8")
        argv = build_codex_argv(spec, condition, trial_root, last_message_path)
        environment = os.environ.copy()
        environment.update(spec.environment_overrides)

        with events_path.open("w", encoding="utf-8") as stdout_handle, stderr_path.open(
            "w", encoding="utf-8"
        ) as stderr_handle:
            agent_started = time.monotonic()
            process = subprocess.Popen(
                argv,
                cwd=trial_root,
                env=environment,
                stdin=subprocess.PIPE,
                stdout=stdout_handle,
                stderr=stderr_handle,
                text=True,
                start_new_session=True,
            )
            try:
                assert process.stdin is not None
                process.stdin.write(prompt)
                process.stdin.close()
            except BrokenPipeError:
                pass
            try:
                exit_code = process.wait(timeout=spec.timeout_s)
            except subprocess.TimeoutExpired:
                timed_out = True
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    exit_code = process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    exit_code = process.wait(timeout=5)
            agent_wall_seconds = time.monotonic() - agent_started

        diff = run_command(["git", "diff", "--binary", "HEAD"], trial_root, timeout_s=30)
        git_status = run_command(
            ["git", "status", "--short", "--untracked-files=all"],
            trial_root,
            timeout_s=30,
        )
        diff_path.write_text(diff.stdout, encoding="utf-8")
        status_path.write_text(git_status.stdout, encoding="utf-8")
        _snapshot_workspace(trial_root, final_workspace_path)
        status = "completed" if exit_code == 0 and not timed_out else "infrastructure-failed"
        wall_seconds = time.monotonic() - started
        atomic_write_json(
            metadata_path,
            {
                "schema_version": 1,
                "run_id": spec.run_id,
                "task_id": spec.task_id,
                "condition_id": spec.condition_id,
                "condition_label": condition.label,
                "condition_sha256": condition.content_sha256,
                "effective_surface_sha256": condition.to_dict()["effective_surface_sha256"],
                "fixture_sha256": fixture.content_sha256,
                "oracle_sha256": fixture.oracle_sha256,
                "visible_command_sha256": fixture.visible_command_sha256,
                "hidden_command_sha256": fixture.hidden_command_sha256,
                "evaluation_contract_sha256": fixture.evaluation_contract_sha256,
                "repetition": spec.repetition,
                "model": spec.model,
                "reasoning_effort": spec.reasoning_effort,
                "status": status,
                "terminal": True,
                "codex_exit_code": exit_code,
                "timed_out": timed_out,
                "wall_seconds": wall_seconds,
                "agent_wall_seconds": agent_wall_seconds,
                "used_process_jobs": False,
                "environment_override_names": sorted(spec.environment_overrides),
                "argv_without_prompt": argv,
                "artifacts": {
                    "events": events_path.name,
                    "stderr": stderr_path.name,
                    "last_message": last_message_path.name,
                    "diff": diff_path.name,
                    "git_status": status_path.name,
                    "final_workspace": final_workspace_path.name,
                },
            },
        )

    return TrialRecord(
        run_id=spec.run_id,
        task_id=spec.task_id,
        condition_id=spec.condition_id,
        repetition=spec.repetition,
        status=status,
        codex_exit_code=exit_code,
        timed_out=timed_out,
        wall_seconds=wall_seconds,
        run_dir=run_dir,
        events_path=events_path,
        stderr_path=stderr_path,
        last_message_path=last_message_path,
        diff_path=diff_path,
        final_workspace_path=final_workspace_path,
        metadata_path=metadata_path,
    )
