from __future__ import annotations

import json
import unittest
from pathlib import Path
from tests.root_migration_assertions import assert_routed_rule


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "owner-questions-page.md"
REQUIREMENT = ROOT / "docs" / "requirements" / "2026-09-30-owner-questions-page.owner-requirement.json"

STATUS_COLOURS_REQUIREMENT = ROOT / "docs" / "requirements" / "2026-10-10-owner-page-status-colours.owner-requirement.json"


class OwnerQuestionsPageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pattern = PATTERN.read_text(encoding="utf-8")

    def test_rule_states_one_page_its_sections_and_question_fields(self) -> None:
        for phrase in (
            "**One page per workstream.**",
            "The page is the complete list of what that workstream needs from the owner.",
            "A question that appears only in chat has not been asked.",
            "`OWNER-QUESTIONS.md`",
            "authoritative copy is one file, `OWNER-QUESTIONS.md`, in Git",
            "The published page is a view: update the file first, then republish it.",
            "A file in a public repository is public",
            "Never start a second page.",
            "**Open questions.** Each question has a number that is never reused.",
            "**For you to do (no decision needed).**",
            "**Decided.**",
            "**Coming up (not a question yet).**",
            "a title that names the decision in plain words, never a pull request, branch or issue number;",
            "the options, each with what it gets and what it costs;",
            "the agent's recommendation and why",
            "how to answer, for example `4: B`.",
            "that project's own agent decides first, through its lane (`patterns/suggested-fix-queue.md`)",
            "update the page in the same turn",
            "The page adds no gate and grants no authority.",
            "**Status at a glance.**",
            "a one-line legend under the header",
            "`> [!IMPORTANT]` for open questions",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.pattern)

    def test_sections_are_listed_in_order(self) -> None:
        order = [
            self.pattern.index("**Open questions.**"),
            self.pattern.index("**For you to do (no decision needed).**"),
            self.pattern.index("**Decided.**"),
            self.pattern.index("**Coming up (not a question yet).**"),
        ]
        self.assertEqual(order, sorted(order))

    def test_routes(self) -> None:
        assert_routed_rule(self, "patterns/human-readable-operational-references.md", (
            "Keep every open owner question on one continuously updated page: `patterns/owner-questions-page.md`.",
        ), compact=True)
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        self.assertEqual(sum("`patterns/owner-questions-page.md` —" in line for line in index.splitlines()), 1)
        self.assertIn("`../patterns/owner-questions-page.md`", (ROOT / "docs" / "INDEX.md").read_text(encoding="utf-8"))
        failure_map = (ROOT / "patterns" / "logic-failure-map.md").read_text(encoding="utf-8")
        row = [line for line in failure_map.splitlines() if line.startswith("| LF-9.8 |")]
        self.assertEqual(len(row), 1)
        self.assertIn("`patterns/owner-questions-page.md`", row[0])

    def test_requirement_quotes_the_owner(self) -> None:
        data = json.loads(REQUIREMENT.read_text(encoding="utf-8"))
        self.assertEqual(data["requirement_id"], "2026-09-30-owner-questions-page")
        self.assertIn("use the method the AskRigor worker uses", data["owner_statement"])
        self.assertIn("that should also be a standard UDA method", data["owner_statement"])
        self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
        for surface in data["execution_surfaces"]:
            if surface["disposition"] in {"DEFERRED", "NOT_APPLICABLE", "QUEUED"}:
                with self.subTest(surface=surface["surface"]):
                    self.assertTrue(surface.get("reason"))
        self.assertNotIn("LIVE_VERIFIED", data["learning_state_at_merge"])
        self.assertTrue(data["nonclaims"])

    def test_status_colours_requirement_quotes_the_owner(self) -> None:
        data = json.loads(STATUS_COLOURS_REQUIREMENT.read_text(encoding="utf-8"))
        self.assertEqual(data["requirement_id"], "2026-10-10-owner-page-status-colours")
        self.assertEqual(
            data["owner_statement"],
            "you need to fix the owwner questions page, it used to be color coded so i could see what was questions vs todo, and what was done",
        )
        self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
        for surface in data["execution_surfaces"]:
            if surface["disposition"] == "QUEUED":
                with self.subTest(surface=surface["surface"]):
                    self.assertTrue(surface.get("reason"))
        self.assertNotIn("LIVE_VERIFIED", data["learning_state_at_merge"])
        self.assertTrue(data["nonclaims"])
        docs = (ROOT / "docs" / "INDEX.md").read_text(encoding="utf-8")
        self.assertIn("`requirements/2026-10-10-owner-page-status-colours.owner-requirement.json`", docs)

    def test_no_private_chat_locators(self) -> None:
        for path in (PATTERN, REQUIREMENT, STATUS_COLOURS_REQUIREMENT):
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                self.assertNotIn("claude.ai/chat", text)
                self.assertNotIn("claude.ai/artifact", text)
                self.assertNotIn("chatgpt.com/c/", text)


if __name__ == "__main__":
    unittest.main()
