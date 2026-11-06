#!/usr/bin/env python3
"""Print a turn's UDA bootstrap in one command: commit, root AGENTS.md, a compact
lesson index, and any pattern files the agent asks for.

Origin: owner report 2026-10-16 (audits/2026-10-16-claude-uda-bootstrap-latency.md).
A Claude turn spent about four minutes and some sixteen tool calls loading these
rules; the shallow fetch itself takes about two seconds. The time went to a wrong
first route, exploring the rule-graph tool, and reading files one call at a time.
This script turns the reading part into one call, so the agent's tool calls are:
fetch + this script, then (if needed) this script again with --read.

Usage, from a fresh or existing checkout:
  python3 scripts/uda_bootstrap.py
  python3 scripts/uda_bootstrap.py --known-sha <sha256 of the AGENTS.md already in context>
  python3 scripts/uda_bootstrap.py --index none --read patterns/reasoning-selection.md:55-68

--known-sha: when the current AGENTS.md has this sha256, the script says so instead
of printing it again. The fetch still happened; only the reread of identical bytes
is skipped. --known-index-sha does the same for LESSON-INDEX.md.

--index compact (default) prints one line per numbered index entry, cut to
--width characters, marked [graph] when uda_rule_graph.py covers that pattern;
other patterns are index-routed only, so don't try to resolve them in the graph.
--index full prints the whole index; --index none skips it.

--read takes paths relative to the root, each optionally with :START-END lines.

Selection stays with the agent: the script prints triggers, it does not decide
which apply (patterns/reasoning-selection.md, pattern-matching fit check).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

DEFAULT_ROOT = Path(__file__).resolve().parents[1]
_ENTRY = re.compile(r"^\s*(\d+)\.\s+`([^`]+)`\s*[—-]\s*(.*)$")
_READ = re.compile(r"^(?P<path>.+?)(?::(?P<start>\d+)-(?P<end>\d+))?$")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def commit_line(root: Path) -> str:
    try:
        out = subprocess.run(
            ["git", "-C", str(root), "log", "-1", "--format=%H %cI %s"],
            capture_output=True, text=True, timeout=10, check=True,
        ).stdout.strip()
        return out or "unknown"
    except (OSError, subprocess.SubprocessError):
        return "unknown (not a git checkout or git unavailable)"


def graph_paths(root: Path) -> set[str]:
    graph = root / "rules" / "UDA-RULE-GRAPH.json"
    try:
        nodes = json.loads(graph.read_text(encoding="utf-8")).get("nodes", [])
    except (OSError, ValueError):
        return set()
    return {n.get("canonical_path", "") for n in nodes if isinstance(n, dict)}


def compact_index(text: str, covered: set[str], width: int) -> list[str]:
    lines = []
    for raw in text.splitlines():
        m = _ENTRY.match(raw)
        if not m:
            continue
        number, path, rest = m.groups()
        rest = " ".join(rest.split())
        if len(rest) > width:
            rest = rest[: width - 1].rstrip() + "…"
        mark = " [graph]" if path in covered else ""
        lines.append(f"{number}. {path}{mark} — {rest}")
    return lines


def read_spec(root: Path, spec: str) -> str:
    m = _READ.match(spec)
    rel = m.group("path") if m else spec
    path = (root / rel).resolve()
    if root.resolve() not in path.parents and path != root.resolve():
        return f"===== {spec}: refused (outside the repository root)"
    if not path.is_file():
        return f"===== {spec}: not found"
    lines = path.read_text(encoding="utf-8").splitlines()
    start, end = 1, len(lines)
    if m and m.group("start"):
        start, end = int(m.group("start")), int(m.group("end"))
    body = "\n".join(lines[start - 1 : end])
    return f"===== {rel} (lines {start}-{min(end, len(lines))} of {len(lines)}, sha256 {sha256(path)[:12]})\n{body}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--known-sha", default="")
    parser.add_argument("--known-index-sha", default="")
    parser.add_argument("--index", choices=["compact", "full", "none"], default="compact")
    parser.add_argument("--width", type=int, default=150)
    parser.add_argument("--read", nargs="*", default=[])
    args = parser.parse_args(argv)

    root = args.root
    agents = root / "AGENTS.md"
    index = root / "LESSON-INDEX.md"
    if not agents.is_file():
        print(f"AGENTS.md not found under {root}: bootstrap NOT_LOADED", file=sys.stderr)
        return 2

    out = [f"commit: {commit_line(root)}"]
    agents_sha = sha256(agents)
    if args.known_sha and args.known_sha == agents_sha:
        out.append(f"AGENTS.md unchanged (sha256 {agents_sha}); the copy already in context is current")
    else:
        out.append(f"===== AGENTS.md (sha256 {agents_sha})")
        out.append(agents.read_text(encoding="utf-8").rstrip())

    if args.index != "none" and index.is_file():
        index_sha = sha256(index)
        if args.known_index_sha and args.known_index_sha == index_sha:
            out.append(f"LESSON-INDEX.md unchanged (sha256 {index_sha})")
        elif args.index == "full":
            out.append(f"===== LESSON-INDEX.md (sha256 {index_sha})")
            out.append(index.read_text(encoding="utf-8").rstrip())
        else:
            entries = compact_index(index.read_text(encoding="utf-8"), graph_paths(root), args.width)
            out.append(
                f"===== LESSON-INDEX.md compact (sha256 {index_sha}; {len(entries)} entries; "
                "[graph] = covered by uda_rule_graph.py, others are index-routed only; "
                "read a full entry with --index full or --read LESSON-INDEX.md:START-END)"
            )
            out.extend(entries)

    for spec in args.read:
        out.append(read_spec(root, spec))

    print("\n".join(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
