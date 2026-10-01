from __future__ import annotations

import json
import unittest
from pathlib import Path
from tests.root_migration_assertions import assert_routed_rule


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "durable-chat-learning.md"
REQUIREMENT = ROOT / "docs" / "requirements" / "2026-09-30-saved-user-instructions.owner-requirement.json"
SECTION_HEADING = "### 12. User-specific instructions: where they persist and when they are promoted"


class SavedUserInstructionsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pattern = PATTERN.read_text(encoding="utf-8")
        self.body = self.pattern.split(SECTION_HEADING, 1)[1].split("\n## ", 1)[0]

    def test_section_follows_section_11_once(self) -> None:
        self.assertEqual(self.pattern.count(SECTION_HEADING), 1)
        self.assertLess(
            self.pattern.index("### 11. Promote cross-project lessons twice"),
            self.pattern.index(SECTION_HEADING),
        )
        self.assertLess(self.pattern.index(SECTION_HEADING), self.pattern.index("## Reference implementation evidence"))

    def test_persistence_rules(self) -> None:
        for phrase in (
            "**User-specific by default.**",
            "Saving it is not a reason to add it to AskRigor's Universal Instructions, this repository, or any other universal instruction set.",
            "**Memory first.**",
            "ChatGPT Memory, or the memory tools in Claude",
            "**The ChatGPT Library fallback is one file.**",
            "one being unavailable says nothing about the other",
            "look for the exact file `/Saved Instructions.md`",
            "update that same file, preserving unrelated entries",
            "Never invent another filename or keep a second instructions file.",
            "**Verify before claiming.**",
            "say that durable saving could not be verified",
            "**Read it back when needed.**",
            "do not assume any one of them is complete or current",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.body)

    def test_classification_and_promotion(self) -> None:
        for phrase in (
            "**Promote only on purpose.**",
            "only when asked or during an authorized instruction-maintenance review",
            "`USER_SPECIFIC`",
            "`UDA_CANDIDATE`",
            "`ASKRIGOR_UNIVERSAL_CANDIDATE`",
            "owner approval for this repository, and AskRigor's own protocol review for its instructions",
            "Usefulness to one user is not enough.",
            "docs/requirements/2026-09-30-saved-user-instructions.owner-requirement.json",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.body)

    def test_root_agents_routes_save_requests(self) -> None:
        assert_routed_rule(self, "patterns/durable-chat-learning.md", (
            "12. User-specific instructions", "Saved Instructions.md",
        ))

    def test_lesson_index_entry_names_the_rule(self) -> None:
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        entries = [line for line in index.splitlines() if "`patterns/durable-chat-learning.md` —" in line]
        self.assertEqual(len(entries), 1)
        self.assertIn("user-specific saved instructions", entries[0])
        self.assertIn("`/Saved Instructions.md`", entries[0])

    def test_requirement_records_origin_surfaces_and_limits(self) -> None:
        data = json.loads(REQUIREMENT.read_text(encoding="utf-8"))
        self.assertEqual(data["requirement_id"], "2026-09-30-saved-user-instructions")
        self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
        dispositions = {surface["disposition"] for surface in data["execution_surfaces"]}
        self.assertTrue({"PROJECTED", "DEFERRED"} <= dispositions)
        for surface in data["execution_surfaces"]:
            if surface["disposition"] in {"DEFERRED", "NOT_APPLICABLE"}:
                with self.subTest(surface=surface["surface"]):
                    self.assertTrue(surface.get("reason"))
        self.assertNotIn("LIVE_VERIFIED", data["learning_state_at_merge"])
        self.assertTrue(data["nonclaims"])


if __name__ == "__main__":
    unittest.main()
