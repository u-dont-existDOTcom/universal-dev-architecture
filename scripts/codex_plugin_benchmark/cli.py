from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

from .common import atomic_write_json
from .inventory import collect_inventory
from .fixtures import verify_all_fixtures


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
    raise AssertionError(f"unhandled command: {arguments.command}")


if __name__ == "__main__":
    raise SystemExit(main())
