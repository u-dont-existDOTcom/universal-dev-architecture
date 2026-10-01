from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from tests.root_migration_assertions import assert_routed_rule


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "suggested-fix-queue.md"
LANES = ROOT / "suggested-fixes"
README = LANES / "README.md"
REQUIREMENT = ROOT / "docs" / "requirements" / "2026-09-30-suggested-fix-lanes.owner-requirement.json"
HEADER_FIELDS = ("For", "Filed", "From", "Owner request", "Existing pull request", "Supersedes")
SECTIONS = ("## What to do", "## Why", "## Check first")
ITEM_NAME = re.compile(r"^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$")


def lane_items() -> list[Path]:
    return sorted(path for path in LANES.glob("*/*.md"))


class SuggestedFixQueueTests(unittest.TestCase):
    def test_pattern_states_filing_checking_deciding_recording_and_wiring(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "`suggested-fixes/<repository>/`",
            "It does not open a pull request in the project or give the owner a file to relay.",
            "**Public by default.**",
            "reads its lane before starting other fixes in that project, once per work session",
            "adopts it, adapts it, declines it with a reason, defers it until a named trigger, or puts a question with the tradeoffs on its owner questions page",
            "Items are advice, and the project's own authority decides.",
            "it asks the owner before declining or deferring it",
            "`docs/suggested-fixes-ledger.md`",
            "`patterns/carrying-uda-into-standalone-projects.md`",
            "**Wiring.**",
            "`suggested-fixes/<repository>/done/`",
            "A lane adds no authority and bypasses no gate.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_routes(self) -> None:
        assert_routed_rule(self, "patterns/suggested-fix-queue.md", (
            "Before other fixes in a project, read its lane in `suggested-fixes/`; file suggestions for other projects there, not as pull requests in them: `patterns/suggested-fix-queue.md`.",
        ), compact=True)
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        self.assertEqual(sum("`patterns/suggested-fix-queue.md` —" in line for line in index.splitlines()), 1)
        self.assertIn("`../patterns/suggested-fix-queue.md`", (ROOT / "docs" / "INDEX.md").read_text(encoding="utf-8"))
        failure_map = (ROOT / "patterns" / "logic-failure-map.md").read_text(encoding="utf-8")
        row = [line for line in failure_map.splitlines() if line.startswith("| LF-10.8 |")]
        self.assertEqual(len(row), 1)
        self.assertIn("`patterns/suggested-fix-queue.md`", row[0])

    def test_readme_lists_every_lane_and_carries_the_wiring_section(self) -> None:
        readme = README.read_text(encoding="utf-8")
        lanes = sorted(path.name for path in LANES.iterdir() if path.is_dir())
        self.assertTrue(lanes)
        for lane in lanes:
            with self.subTest(lane=lane):
                self.assertIn(f"| `{lane}/` | `u-dont-existDOTcom/{lane}` |", readme)
        for phrase in (
            "## Suggested fixes from other projects",
            "`suggested-fixes/<repository>/` on its default branch",
            "`docs/suggested-fixes-ledger.md`",
            "an item marked as an owner request goes to the owner before you decline or defer it",
            "`patterns/suggested-fix-queue.md` in that repository",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, readme)

    def test_every_item_follows_the_format(self) -> None:
        items = lane_items()
        self.assertTrue(items)
        for path in items:
            with self.subTest(item=str(path.relative_to(ROOT))):
                self.assertRegex(path.name, ITEM_NAME)
                text = path.read_text(encoding="utf-8")
                self.assertTrue(text.startswith("# "))
                head = text.split("\n## ", 1)[0]
                for field in HEADER_FIELDS:
                    self.assertRegex(head, re.compile(rf"(?m)^- {re.escape(field)}: \S"))
                target = re.search(r"(?m)^- For: `([^`]+)`$", head)
                self.assertIsNotNone(target)
                self.assertEqual(target.group(1), f"u-dont-existDOTcom/{path.parent.name}")
                self.assertRegex(head, re.compile(r"(?m)^- Owner request: (yes|no)\b"))
                positions = [text.find(section + "\n") for section in SECTIONS]
                self.assertNotIn(-1, positions)
                self.assertEqual(positions, sorted(positions))
                self.assertNotIn("claude.ai/chat", text)
                self.assertNotIn("chatgpt.com/c/", text)

    def test_requirement_quotes_the_owner(self) -> None:
        data = json.loads(REQUIREMENT.read_text(encoding="utf-8"))
        self.assertEqual(data["requirement_id"], "2026-09-30-suggested-fix-lanes")
        self.assertIn("suggested fix queue", data["owner_statement"])
        self.assertIn("you don't have to update all the projects you don't work on, just UDA", data["owner_statement"])
        self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
        for surface in data["execution_surfaces"]:
            if surface["disposition"] in {"DEFERRED", "NOT_APPLICABLE", "QUEUED"}:
                with self.subTest(surface=surface["surface"]):
                    self.assertTrue(surface.get("reason"))
        self.assertNotIn("LIVE_VERIFIED", data["learning_state_at_merge"])
        self.assertTrue(data["nonclaims"])


if __name__ == "__main__":
    unittest.main()
