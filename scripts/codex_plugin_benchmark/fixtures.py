from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import tarfile
import tempfile
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
    "task-h": "task-h-real-project-scheduler",
    "task-i": "task-i-formal-security",
}
ALL_TASK_IDS = tuple(FIXTURE_DIRECTORIES)


@dataclass(frozen=True)
class FixtureRecord:
    task_id: str
    root: Path
    prompt_path: Path
    content_sha256: str
    visible_command: tuple[str, ...]
    hidden_command: tuple[str, ...]
    verification_timeout_s: float
    oracle_sha256: str
    visible_command_sha256: str
    hidden_command_sha256: str
    evaluation_contract_sha256: str

    def run_visible_tests(self, timeout_s: float | None = None) -> CommandResult:
        return run_command(list(self.visible_command), self.root, timeout_s=timeout_s)

    def run_hidden_tests(self, timeout_s: float | None = None) -> CommandResult:
        oracle = self.root / ".benchmark-oracle"
        if not oracle.is_dir():
            raise FileNotFoundError(oracle)
        return run_command(list(self.hidden_command), self.root, timeout_s=timeout_s)


def _content_hash(seed_identity: str, prompt: Path, definition: dict[str, object]) -> str:
    digest = hashlib.sha256()
    definition_sha256 = hashlib.sha256(
        json.dumps(definition, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    for label, value in (
        ("seed", seed_identity),
        ("prompt", sha256_path(prompt)),
        ("definition", definition_sha256),
    ):
        digest.update(label.encode("ascii"))
        digest.update(b"\0")
        digest.update(value.encode("ascii"))
        digest.update(b"\0")
    return digest.hexdigest()


def _fixture_definition(source: Path) -> dict[str, object]:
    value = json.loads((source / "fixture.json").read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"fixture definition must be an object: {source}")
    return value


def _commands(source: Path, destination: Path) -> tuple[tuple[str, ...], tuple[str, ...]]:
    definition = _fixture_definition(source)
    visible = definition.get("visible_command")
    hidden = definition.get("hidden_command")
    if isinstance(visible, list) and all(isinstance(item, str) for item in visible):
        visible_command = tuple(visible)
    else:
        tests = [path.relative_to(destination).as_posix() for path in sorted((destination / "test").glob("*.test.mjs"))]
        visible_command = ("node", "--test", *tests)
    if isinstance(hidden, list) and all(isinstance(item, str) for item in hidden):
        hidden_command = tuple(hidden)
    else:
        hidden_command = ("node", "--test", ".benchmark-oracle/hidden.test.mjs")
    return visible_command, hidden_command


def _materialize_source_commit(commit: str, destination: Path) -> str:
    resolved = run_command(["git", "rev-parse", f"{commit}^{{tree}}"], REPOSITORY_ROOT, timeout_s=20)
    if resolved.returncode != 0:
        raise RuntimeError(f"fixture source commit is unavailable: {commit}: {resolved.stderr}")
    destination.mkdir(parents=True)
    with tempfile.NamedTemporaryFile(suffix=".tar") as archive:
        completed = subprocess.run(
            ["git", "archive", "--format=tar", commit],
            cwd=REPOSITORY_ROOT,
            stdout=archive,
            stderr=subprocess.PIPE,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr.decode("utf-8", errors="replace"))
        archive.flush()
        archive.seek(0)
        with tarfile.open(fileobj=archive, mode="r:") as bundle:
            bundle.extractall(destination, filter="data")
    return resolved.stdout.strip()


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
    definition = _fixture_definition(source)
    seed_from = definition.get("seed_from")
    oracle_from = definition.get("oracle_from")
    seed_source = (
        FIXTURE_ROOT / seed_from / "seed" if isinstance(seed_from, str) else source / "seed"
    )
    oracle = (
        FIXTURE_ROOT / oracle_from / "oracle"
        if isinstance(oracle_from, str)
        else source / "oracle"
    )
    if destination.exists():
        raise FileExistsError(destination)
    if not prompt.is_file() or not oracle.is_dir():
        raise FileNotFoundError(f"incomplete fixture definition: {source}")
    if seed_source.is_dir():
        shutil.copytree(seed_source, destination)
        seed_identity = sha256_path(seed_source)
    elif isinstance(definition.get("source_commit"), str):
        seed_identity = _materialize_source_commit(str(definition["source_commit"]), destination)
    else:
        raise FileNotFoundError(f"fixture has no seed or source commit: {source}")
    stripped = definition.get("strip_instruction_paths", [])
    if not isinstance(stripped, list) or not all(isinstance(item, str) for item in stripped):
        raise ValueError(f"strip_instruction_paths must be a string list: {source}")
    for relative in stripped:
        candidate = destination / relative
        if candidate.is_dir():
            shutil.rmtree(candidate)
        else:
            candidate.unlink(missing_ok=True)
    if stripped:
        digest = hashlib.sha256()
        digest.update(seed_identity.encode("ascii"))
        for relative in stripped:
            digest.update(b"\0")
            digest.update(relative.encode("utf-8"))
        seed_identity = digest.hexdigest()
    if include_oracle:
        shutil.copytree(oracle, destination / ".benchmark-oracle")
    visible_command, hidden_command = _commands(source, destination)
    verification_timeout_s = definition.get("verification_timeout_s", 15)
    if not isinstance(verification_timeout_s, (int, float)) or verification_timeout_s <= 0:
        raise ValueError(f"verification_timeout_s must be positive: {source}")
    oracle_sha256 = sha256_path(oracle)
    visible_command_sha256 = hashlib.sha256(
        json.dumps(visible_command, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    hidden_command_sha256 = hashlib.sha256(
        json.dumps(hidden_command, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    evaluation_contract_sha256 = hashlib.sha256(
        json.dumps(
            {
                "oracle_sha256": oracle_sha256,
                "visible_command_sha256": visible_command_sha256,
                "hidden_command_sha256": hidden_command_sha256,
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    return FixtureRecord(
        task_id=task_id,
        root=destination,
        prompt_path=prompt,
        content_sha256=_content_hash(seed_identity, prompt, definition),
        visible_command=visible_command,
        hidden_command=hidden_command,
        verification_timeout_s=float(verification_timeout_s),
        oracle_sha256=oracle_sha256,
        visible_command_sha256=visible_command_sha256,
        hidden_command_sha256=hidden_command_sha256,
        evaluation_contract_sha256=evaluation_contract_sha256,
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
        visible = record.run_visible_tests(timeout_s=record.verification_timeout_s)
        oracle = record.run_hidden_tests(timeout_s=record.verification_timeout_s)
        results[task_id] = {
            "content_sha256": record.content_sha256,
            "oracle_sha256": record.oracle_sha256,
            "visible_command_sha256": record.visible_command_sha256,
            "hidden_command_sha256": record.hidden_command_sha256,
            "evaluation_contract_sha256": record.evaluation_contract_sha256,
            "visible_test_exit_code": visible.returncode,
            "seed_oracle_exit_code": oracle.returncode,
            "visible_test_wall_seconds": visible.wall_seconds,
            "seed_oracle_wall_seconds": oracle.wall_seconds,
            "valid": visible.returncode == 0 and oracle.returncode != 0,
        }
    return results
