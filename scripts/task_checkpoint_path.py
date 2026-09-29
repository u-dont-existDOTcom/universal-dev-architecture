#!/usr/bin/env python3
"""Derive the task checkpoint path from a Git branch name."""

from __future__ import annotations

import argparse
from urllib.parse import quote


def checkpoint_path(branch: str) -> str:
    return f"state/tasks/{quote(branch, safe='')}.md"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("branch", help="exact Git branch name")
    args = parser.parse_args()
    if not args.branch:
        parser.error("branch name must not be empty")
    print(checkpoint_path(args.branch))
