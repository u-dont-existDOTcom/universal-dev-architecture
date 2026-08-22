#!/usr/bin/env python3
"""Measure and de-duplicate agent test execution.

Standard-library only. Telemetry is stored under .git by default so
measurement does not dirty the worktree.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

SCOPES = ("focused", "affected", "full", "mutation", "other")
FULL_TRIGGERS = (
    "baseline",
    "integration-boundary",
    "high-risk-change",
    "pre-commit",
    "pre-pr",
    "pre-handoff",
    "release-gate",
    "ci",
    "owner-request",
)
MUTATION_TRIGGERS = (
    "test-quality-change",
    "high-risk-logic",
    "survivor-followup",
    "explicit-owner",
    "release-gate",
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_git(root: Path, *args: str) -> bytes:
    proc = subprocess.run(
        ["git", "-C", str(root), *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        message = proc.stderr.decode("utf-8", "replace").strip()
        raise RuntimeError(message or "git command failed")
    return proc.stdout


def repo_root(start: Path | None = None) -> Path:
    start = (start or Path.cwd()).resolve()
    proc = subprocess.run(
        ["git", "-C", str(start), "rev-parse", "--show-toplevel"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError("test-efficiency telemetry requires a Git working tree")
    return Path(proc.stdout.strip()).resolve()


def git_dir(root: Path) -> Path:
    raw = run_git(root, "rev-parse", "--git-dir").decode().strip()
    path = Path(raw)
    return path if path.is_absolute() else (root / path).resolve()


def safe_task_id(value: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-")
    if not safe:
        raise ValueError("task id must contain a usable identifier")
    return safe


def log_path_for(root: Path, task_id: str, explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).expanduser().resolve()
    return git_dir(root) / "codex-test-efficiency" / f"{safe_task_id(task_id)}.jsonl"


def append_event(path: Path, event: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True, separators=(",", ":")) + "\n")


def load_events(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    events: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for lineno, line in enumerate(handle, 1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as exc:
                raise RuntimeError(f"invalid telemetry JSON at {path}:{lineno}: {exc}") from exc
            if isinstance(obj, dict):
                events.append(obj)
    return events


def worktree_fingerprint(root: Path) -> str:
    digest = hashlib.sha256()
    digest.update(b"HEAD\0")
    digest.update(run_git(root, "rev-parse", "HEAD").strip())
    digest.update(b"\0DIFF\0")
    digest.update(run_git(root, "diff", "--binary", "HEAD", "--", "."))
    digest.update(b"\0UNTRACKED\0")
    raw = run_git(root, "ls-files", "--others", "--exclude-standard", "-z")
    for item in raw.split(b"\0"):
        if not item:
            continue
        rel = item.decode("utf-8", "surrogateescape")
        digest.update(item)
        digest.update(b"\0")
        path = root / rel
        if path.is_file():
            file_digest = hashlib.sha256()
            with path.open("rb") as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                    file_digest.update(chunk)
            digest.update(file_digest.digest())
        else:
            digest.update(b"<non-file>")
        digest.update(b"\0")
    return digest.hexdigest()


def command_fingerprint(command: list[str]) -> str:
    encoded = json.dumps(command, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def latest_start(events: Iterable[dict[str, Any]]) -> dict[str, Any] | None:
    starts = [event for event in events if event.get("event") == "task_start"]
    return starts[-1] if starts else None


def prior_equivalent_green(
    events: Iterable[dict[str, Any]],
    scope: str,
    state_fingerprint: str,
    command_fp: str,
) -> dict[str, Any] | None:
    for event in reversed(list(events)):
        if (
            event.get("event") == "test_run"
            and event.get("scope") == scope
            and event.get("worktree_fingerprint") == state_fingerprint
            and event.get("command_fingerprint") == command_fp
            and event.get("exit_code") == 0
        ):
            return event
    return None


def require_started(events: list[dict[str, Any]], task_id: str) -> dict[str, Any]:
    start = latest_start(events)
    if start is None:
        raise RuntimeError(
            f"task {task_id!r} has no start event; run the 'start' command before measuring tests"
        )
    return start


def cmd_start(args: argparse.Namespace) -> int:
    root = repo_root(Path(args.root) if args.root else None)
    path = log_path_for(root, args.task_id, args.log)
    event = {
        "event": "task_start",
        "task_id": args.task_id,
        "timestamp": utc_now_iso(),
        "epoch_seconds": time.time(),
        "git_head": run_git(root, "rev-parse", "HEAD").decode().strip(),
    }
    append_event(path, event)
    print(f"test-efficiency telemetry started: {path}")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    root = repo_root(Path(args.root) if args.root else None)
    path = log_path_for(root, args.task_id, args.log)
    events = load_events(path)
    require_started(events, args.task_id)

    if not args.command:
        raise RuntimeError("no test command supplied after '--'")

    if args.scope == "full" and not args.full_trigger:
        allowed = ", ".join(FULL_TRIGGERS)
        raise RuntimeError(
            "full-suite execution is checkpoint-based, not an inner-loop default; "
            f"provide --full-trigger with one of: {allowed}"
        )

    if args.scope == "mutation" and not args.mutation_trigger:
        allowed = ", ".join(MUTATION_TRIGGERS)
        raise RuntimeError(
            "mutation testing is not an inner-loop default; "
            f"provide --mutation-trigger with one of: {allowed}"
        )

    state_fp = worktree_fingerprint(root)
    command = list(args.command)
    command_fp = command_fingerprint(command)
    previous = prior_equivalent_green(events, args.scope, state_fp, command_fp)
    dedupe_scope = args.scope in {"full", "mutation"}

    if previous and dedupe_scope and not args.force_rerun:
        estimate = float(previous.get("duration_seconds") or 0.0)
        event = {
            "event": "test_skip",
            "task_id": args.task_id,
            "timestamp": utc_now_iso(),
            "scope": args.scope,
            "reason": args.reason,
            "command": command,
            "command_fingerprint": command_fp,
            "worktree_fingerprint": state_fp,
            "skip_reason": "redundant-green-same-state",
            "estimated_seconds_avoided": round(estimate, 6),
            "prior_timestamp": previous.get("timestamp"),
        }
        if args.full_trigger:
            event["full_trigger"] = args.full_trigger
        if args.mutation_trigger:
            event["mutation_trigger"] = args.mutation_trigger
        append_event(path, event)
        print(
            "SKIPPED redundant green "
            f"{args.scope} run on unchanged repository state "
            f"(~{estimate:.2f}s avoided). Use --force-rerun only for a material reason."
        )
        return 0

    started = time.time()
    proc = subprocess.run(command, cwd=root, check=False)
    duration = time.time() - started
    event = {
        "event": "test_run",
        "task_id": args.task_id,
        "timestamp": utc_now_iso(),
        "scope": args.scope,
        "reason": args.reason,
        "command": command,
        "command_fingerprint": command_fp,
        "worktree_fingerprint": state_fp,
        "duration_seconds": round(duration, 6),
        "exit_code": proc.returncode,
        "outcome": "green" if proc.returncode == 0 else "failure",
        "forced_redundant_green_rerun": bool(previous and dedupe_scope and args.force_rerun),
    }
    if previous and dedupe_scope and args.force_rerun:
        event["prior_green_duration_seconds"] = previous.get("duration_seconds")
        event["force_reason"] = args.force_reason
    if args.full_trigger:
        event["full_trigger"] = args.full_trigger
    if args.mutation_trigger:
        event["mutation_trigger"] = args.mutation_trigger
    append_event(path, event)
    return proc.returncode


def build_summary(events: list[dict[str, Any]], now: float | None = None) -> dict[str, Any]:
    start = latest_start(events)
    if start is None:
        raise RuntimeError("no task_start event found")
    now = time.time() if now is None else now
    elapsed = max(0.0, now - float(start["epoch_seconds"]))

    totals = defaultdict(lambda: {"runs": 0, "seconds": 0.0, "failures": 0})
    test_seconds = 0.0
    forced_redundant_seconds = 0.0
    avoided_seconds = 0.0
    skipped_redundant = 0

    for event in events:
        if event.get("event") == "test_run":
            scope = str(event.get("scope", "other"))
            seconds = float(event.get("duration_seconds") or 0.0)
            totals[scope]["runs"] += 1
            totals[scope]["seconds"] += seconds
            if int(event.get("exit_code", 0)) != 0:
                totals[scope]["failures"] += 1
            test_seconds += seconds
            if event.get("forced_redundant_green_rerun"):
                forced_redundant_seconds += seconds
        elif event.get("event") == "test_skip" and event.get("skip_reason") == "redundant-green-same-state":
            skipped_redundant += 1
            avoided_seconds += float(event.get("estimated_seconds_avoided") or 0.0)

    by_scope = {
        scope: {
            "runs": int(data["runs"]),
            "seconds": round(float(data["seconds"]), 6),
            "failures": int(data["failures"]),
        }
        for scope, data in sorted(totals.items())
    }
    return {
        "task_id": start.get("task_id"),
        "task_elapsed_seconds": round(elapsed, 6),
        "test_wall_seconds": round(test_seconds, 6),
        "test_share_percent": round((100.0 * test_seconds / elapsed) if elapsed else 0.0, 2),
        "forced_redundant_green_seconds": round(forced_redundant_seconds, 6),
        "forced_redundant_green_share_of_test_percent": round(
            (100.0 * forced_redundant_seconds / test_seconds) if test_seconds else 0.0, 2
        ),
        "redundant_runs_skipped": skipped_redundant,
        "estimated_seconds_avoided": round(avoided_seconds, 6),
        "by_scope": by_scope,
    }


def cmd_summary(args: argparse.Namespace) -> int:
    root = repo_root(Path(args.root) if args.root else None)
    path = log_path_for(root, args.task_id, args.log)
    summary = build_summary(load_events(path))
    if args.json:
        print(json.dumps(summary, indent=2, sort_keys=True))
        return 0

    print(f"Task: {summary['task_id']}")
    print(f"Elapsed wall time: {summary['task_elapsed_seconds']:.2f}s")
    print(
        f"Observed test time: {summary['test_wall_seconds']:.2f}s "
        f"({summary['test_share_percent']:.2f}% of task wall time)"
    )
    print(
        "Forced redundant green reruns: "
        f"{summary['forced_redundant_green_seconds']:.2f}s "
        f"({summary['forced_redundant_green_share_of_test_percent']:.2f}% of test time)"
    )
    print(
        f"Redundant green runs skipped: {summary['redundant_runs_skipped']} "
        f"(~{summary['estimated_seconds_avoided']:.2f}s avoided)"
    )
    if summary["by_scope"]:
        print("By scope:")
        for scope, data in summary["by_scope"].items():
            print(
                f"  {scope}: {data['runs']} run(s), {data['seconds']:.2f}s, "
                f"{data['failures']} failure-discovering run(s)"
            )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", help="Git repository root or any path inside it")
    parser.add_argument("--log", help="override telemetry JSONL path")
    sub = parser.add_subparsers(dest="subcommand", required=True)

    start = sub.add_parser("start", help="start task wall-clock measurement")
    start.add_argument("--task-id", required=True)
    start.set_defaults(func=cmd_start)

    run = sub.add_parser("run", help="measure one test invocation")
    run.add_argument("--task-id", required=True)
    run.add_argument("--scope", choices=SCOPES, required=True)
    run.add_argument("--reason", required=True)
    run.add_argument("--full-trigger", choices=FULL_TRIGGERS)
    run.add_argument("--mutation-trigger", choices=MUTATION_TRIGGERS)
    run.add_argument("--force-rerun", action="store_true")
    run.add_argument("--force-reason", help="material reason for an identical green rerun")
    run.add_argument("command", nargs=argparse.REMAINDER)
    run.set_defaults(func=cmd_run)

    summary = sub.add_parser("summary", help="summarize test cost and redundancy")
    summary.add_argument("--task-id", required=True)
    summary.add_argument("--json", action="store_true")
    summary.set_defaults(func=cmd_summary)
    return parser


def normalize_remainder(args: argparse.Namespace) -> None:
    if getattr(args, "command", None) and args.command[0] == "--":
        args.command = args.command[1:]


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    normalize_remainder(args)
    if getattr(args, "force_rerun", False) and not getattr(args, "force_reason", None):
        parser.error("--force-rerun requires --force-reason")
    try:
        return int(args.func(args))
    except (RuntimeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
