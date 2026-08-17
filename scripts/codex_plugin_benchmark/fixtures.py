from __future__ import annotations

import hashlib
import shutil
from dataclasses import dataclass
from pathlib import Path

from .common import CommandResult, run_command, sha256_path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_ROOT = REPOSITORY_ROOT / "audits" / "codex-plugin-stack" / "fixtures"
FIXTURE_DIRECTORIES = {
    "task-a": "task-a-small-bug",
    "task-b": "task-b-ambiguous-feature",
    "task-c": "task-c-multi-component",
    "task-d": "task-d-debugging",
    "task-e": "task-e-refactor",
    "task-f": "task-f-security",
    "task-g": "task-g-long-running",
}
ALL_TASK_IDS = tuple(FIXTURE_DIRECTORIES)


@dataclass(frozen=True)
class FixtureRecord:
    task_id: str
    root: Path
    prompt_path: Path
    content_sha256: str

    def run_visible_tests(self, timeout_s: float | None = None) -> CommandResult:
        tests = [str(path) for path in sorted((self.root / "test").glob("*.test.mjs"))]
        return run_command(["node", "--test", *tests], self.root, timeout_s=timeout_s)

    def run_hidden_tests(self, timeout_s: float | None = None) -> CommandResult:
        oracle = self.root / ".benchmark-oracle" / "hidden.test.mjs"
        if not oracle.is_file():
            raise FileNotFoundError(oracle)
        return run_command(["node", "--test", str(oracle)], self.root, timeout_s=timeout_s)


def _content_hash(seed: Path, prompt: Path) -> str:
    digest = hashlib.sha256()
    for label, value in (("seed", sha256_path(seed)), ("prompt", sha256_path(prompt))):
        digest.update(label.encode("ascii"))
        digest.update(b"\0")
        digest.update(value.encode("ascii"))
        digest.update(b"\0")
    return digest.hexdigest()


def materialize_fixture(
    task_id: str,
    destination: Path,
    *,
    include_oracle: bool = False,
) -> FixtureRecord:
    directory = FIXTURE_DIRECTORIES.get(task_id)
    if directory is None:
        raise ValueError(f"unknown fixture: {task_id}")
    source = FIXTURE_ROOT / directory
    seed = source / "seed"
    prompt = source / "prompt.md"
    oracle = source / "oracle" / "hidden.test.mjs"
    if destination.exists():
        raise FileExistsError(destination)
    if not seed.is_dir() or not prompt.is_file() or not oracle.is_file():
        raise FileNotFoundError(f"incomplete fixture definition: {source}")
    shutil.copytree(seed, destination)
    if include_oracle:
        oracle_destination = destination / ".benchmark-oracle" / "hidden.test.mjs"
        oracle_destination.parent.mkdir(parents=True)
        shutil.copy2(oracle, oracle_destination)
    return FixtureRecord(
        task_id=task_id,
        root=destination,
        prompt_path=prompt,
        content_sha256=_content_hash(seed, prompt),
    )


def verify_all_fixtures(destination_root: Path) -> dict[str, dict[str, object]]:
    """Materialize and verify every seed without treating an oracle failure as an error."""
    destination_root.mkdir(parents=True, exist_ok=False)
    results: dict[str, dict[str, object]] = {}
    for task_id in ALL_TASK_IDS:
        record = materialize_fixture(
            task_id,
            destination_root / task_id,
            include_oracle=True,
        )
        visible = record.run_visible_tests(timeout_s=15)
        oracle = record.run_hidden_tests(timeout_s=15)
        results[task_id] = {
            "content_sha256": record.content_sha256,
            "visible_test_exit_code": visible.returncode,
            "seed_oracle_exit_code": oracle.returncode,
            "visible_test_wall_seconds": visible.wall_seconds,
            "seed_oracle_wall_seconds": oracle.wall_seconds,
            "valid": visible.returncode == 0 and oracle.returncode != 0,
        }
    return results
