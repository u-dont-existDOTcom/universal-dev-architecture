#!/usr/bin/env python3
"""Derive the task checkpoint path from a Git branch name."""

from __future__ import annotations

import argparse
import hashlib
from urllib.parse import quote


def checkpoint_path(branch: str) -> str:
    encoded = quote(branch, safe="")
    if len(encoded) + len(".md") > 255:
        # Git branch names cannot contain "~", so this cannot alias an encoded name.
        encoded = "~" + hashlib.sha256(branch.encode("utf-8")).hexdigest()
    return f"state/tasks/{encoded}.md"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("branch", help="exact Git branch name")
    args = parser.parse_args()
    if not args.branch:
        parser.error("branch name must not be empty")
    print(checkpoint_path(args.branch))
