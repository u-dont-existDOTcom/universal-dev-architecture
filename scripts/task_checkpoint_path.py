#!/usr/bin/env python3
"""Derive a portable checkpoint path from a branch and stable task ID."""

from __future__ import annotations

import argparse
import hashlib


def checkpoint_path(branch: str, task_id: str) -> str:
    if not branch or not task_id:
        raise ValueError("branch and task ID must not be empty")
    digest = hashlib.sha256(f"{branch}\0{task_id}".encode("utf-8")).hexdigest()
    return f"state/tasks/task-{digest}.md"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("branch", help="exact Git branch name")
    parser.add_argument("task_id", help="stable unique ID for this task, such as pr-281")
    args = parser.parse_args()
    try:
        print(checkpoint_path(args.branch, args.task_id))
    except ValueError as exc:
        parser.error(str(exc))
