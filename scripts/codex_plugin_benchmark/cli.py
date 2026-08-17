from __future__ import annotations

import argparse
from pathlib import Path

from .common import atomic_write_json
from .inventory import collect_inventory


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="codex-plugin-benchmark")
    subparsers = parser.add_subparsers(dest="command", required=True)
    inventory = subparsers.add_parser("inventory")
    inventory.add_argument("--codex-root", type=Path, required=True)
    inventory.add_argument("--output", type=Path, required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    if arguments.command == "inventory":
        atomic_write_json(arguments.output, collect_inventory(arguments.codex_root))
        return 0
    raise AssertionError(f"unhandled command: {arguments.command}")


if __name__ == "__main__":
    raise SystemExit(main())
