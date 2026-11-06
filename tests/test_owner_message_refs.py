"""The owner can open every file a message points him to (owner, 2026-10-12)."""
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import owner_message_refs as omr  # noqa: E402


class OwnerMessageRefs(unittest.TestCase):
    def test_the_message_that_failed(self):
        msg = "The reasoning for all of these is in `sweep-20261012/SWEEP-RESULTS.md`."
        self.assertEqual(omr.unresolved(msg, []), ["sweep-20261012/SWEEP-RESULTS.md"])

    def test_sent_files_and_links_pass(self):
        msg = ("Attached: the section page (community-section12-side-by-side.html). "
               "The rules are at https://github.com/example/repo/pull/166 and the checks at https://claude.ai/artifact/abc.")
        self.assertEqual(omr.unresolved(msg, ["/x/y/community-section12-side-by-side.html"]), [])

    def test_paths_of_every_kind_are_found(self):
        msg = "See ~/notes/plan.md, ./build/out.json and /home/me/a/b.txt, or `report.pdf`."
        self.assertEqual(omr.refs(msg), ["report.pdf", "~/notes/plan.md", "./build/out.json", "/home/me/a/b.txt"])

    def test_plain_words_and_fractions_are_not_paths(self):
        msg = "We scored 3/4 of them, and/or kept them; the dyads/romance question is answered. P3 and P16 read 100% Human."
        self.assertEqual(omr.refs(msg), [])

    def test_the_command(self):
        with tempfile.TemporaryDirectory() as d:
            f = pathlib.Path(d) / "draft.md"
            f.write_text("The page is `in-context/ic12-v3.json`.\n", encoding="utf-8")
            bad = subprocess.run([sys.executable, str(ROOT / "scripts" / "owner_message_refs.py"), str(f)], capture_output=True, text=True)
            ok = subprocess.run([sys.executable, str(ROOT / "scripts" / "owner_message_refs.py"), str(f), "--sent", "ic12-v3.json"],
                                capture_output=True, text=True)
        self.assertEqual((bad.returncode, ok.returncode), (1, 0), bad.stderr + ok.stderr)
        self.assertIn("NOT OPENABLE: in-context/ic12-v3.json", bad.stdout)


if __name__ == "__main__":
    unittest.main()
