from __future__ import annotations

import contextlib
import hashlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import uda_bootstrap  # noqa: E402


def run(*args: str) -> tuple[int, str]:
    out = io.StringIO()
    err = io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = uda_bootstrap.main(list(args))
    return code, out.getvalue() + err.getvalue()


class UdaBootstrapTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "AGENTS.md").write_text("# Root rules\n\nAlways stamp the time.\n", encoding="utf-8")
        (self.root / "LESSON-INDEX.md").write_text(
            "# Index\n\n"
            "1. `patterns/a.md` — When doing A, do it carefully and then check it again.\n"
            "2. `patterns/b.md` — Before B, ask.\n"
            "Not an entry line.\n",
            encoding="utf-8",
        )
        (self.root / "patterns").mkdir()
        (self.root / "patterns" / "a.md").write_text("line1\nline2\nline3\nline4\n", encoding="utf-8")
        (self.root / "rules").mkdir()
        (self.root / "rules" / "UDA-RULE-GRAPH.json").write_text(
            json.dumps({"nodes": [{"rule_id": "a", "canonical_path": "patterns/a.md"}]}), encoding="utf-8"
        )
        self.agents_sha = hashlib.sha256((self.root / "AGENTS.md").read_bytes()).hexdigest()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_prints_agents_and_compact_index_with_graph_marks(self) -> None:
        code, out = run("--root", str(self.root))
        self.assertEqual(code, 0)
        self.assertIn("Always stamp the time.", out)
        self.assertIn(f"sha256 {self.agents_sha}", out)
        self.assertIn("1. patterns/a.md [graph] — When doing A", out)
        self.assertIn("2. patterns/b.md — Before B, ask.", out)
        self.assertNotIn("Not an entry line", out)
        self.assertIn("2 entries", out)

    def test_known_sha_skips_reprinting_unchanged_agents(self) -> None:
        code, out = run("--root", str(self.root), "--known-sha", self.agents_sha, "--index", "none")
        self.assertEqual(code, 0)
        self.assertIn("AGENTS.md unchanged", out)
        self.assertNotIn("Always stamp the time.", out)

    def test_stale_known_sha_prints_agents(self) -> None:
        code, out = run("--root", str(self.root), "--known-sha", "0" * 64, "--index", "none")
        self.assertEqual(code, 0)
        self.assertIn("Always stamp the time.", out)

    def test_width_truncates_long_entries(self) -> None:
        code, out = run("--root", str(self.root), "--width", "12")
        self.assertEqual(code, 0)
        self.assertIn("— When doing…", out)

    def test_read_with_line_range_and_missing_and_outside(self) -> None:
        code, out = run(
            "--root", str(self.root), "--index", "none",
            "--read", "patterns/a.md:2-3", "patterns/missing.md", "../etc/passwd",
        )
        self.assertEqual(code, 0)
        self.assertIn("patterns/a.md (lines 2-3 of 4", out)
        self.assertIn("line2\nline3", out)
        self.assertNotIn("line1", out)
        self.assertIn("patterns/missing.md: not found", out)
        self.assertIn("refused (outside the repository root)", out)

    def test_missing_agents_reports_not_loaded(self) -> None:
        (self.root / "AGENTS.md").unlink()
        code, out = run("--root", str(self.root))
        self.assertEqual(code, 2)
        self.assertIn("NOT_LOADED", out)

    def test_real_repository_index_parses_every_numbered_entry(self) -> None:
        text = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        numbered = [line for line in text.splitlines() if line.lstrip()[:1].isdigit() and ". `" in line]
        entries = uda_bootstrap.compact_index(text, uda_bootstrap.graph_paths(ROOT), 150)
        self.assertEqual(len(entries), len(numbered))


if __name__ == "__main__":
    unittest.main()
