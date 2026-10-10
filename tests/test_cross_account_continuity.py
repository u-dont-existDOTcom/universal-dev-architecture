from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "cross-account-continuity.md"
REQUIREMENT = ROOT / "docs" / "requirements" / "2026-10-10-cross-account-continuity.owner-requirement.json"


class CrossAccountContinuityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pattern = PATTERN.read_text(encoding="utf-8")

    def test_four_rules_and_successor_state(self) -> None:
        for phrase in (
            "1. **Git holds everything a successor needs.**",
            "2. **Private state goes in a private repository.**",
            "3. **One handoff note per line of work, in the owner's local handoff folder.**",
            "4. **Before the turn ends,**",
            "at a path the project's bootstrap or checkpoint names",
            "the current-state checkpoint, open obligations, the owner's decisions in his own words",
            "`OWNER-QUESTIONS.md`",
            "it is never the only copy",
            "Update the Git copy first, then the view.",
            "A file in a public repository is public.",
            "Never record the value of a secret anywhere; record only where the secret is kept.",
            "named after the work, not the session",
            "what is running and what is waiting",
            "repositories, paths and branches",
            "what comes next, and any open owner question",
            "which account and session wrote it",
            "a one-line resume instruction that works from any account",
            "The note points to Git; it does not replace it.",
            "adds its note to the folder's index",
            "the Git copy and the handoff note are both current",
            "republishes it from the Git copy",
            "This adds no gate and grants no authority.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.pattern)

    def test_owner_deployment_is_labeled_as_an_example(self) -> None:
        section = "## Reference implementation (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)"
        self.assertIn(section, self.pattern)
        universal, example = self.pattern.split(section, 1)
        self.assertNotIn("~/claude-acceptance-transfer/handoffs/", universal)
        self.assertIn("~/claude-acceptance-transfer/handoffs/", example)
        self.assertIn("`README.md` holds the index table", example)
        self.assertIn("Continue my <work name> work:", example)

    def test_requirement_preserves_owner_statement_and_evidence_limits(self) -> None:
        data = json.loads(REQUIREMENT.read_text(encoding="utf-8"))
        self.assertEqual(data["requirement_id"], "2026-10-10-cross-account-continuity")
        self.assertEqual(
            data["owner_statement"],
            "that's weird the owner question page wasn't stored on github? fix that in UDA rules then, "
            "anything that should be continuable between accounts needs to really be stored on github clearly "
            "and there should be the continuation handoff always stored in the claude-acceptance-transfer folder "
            "in my home folder, isn't that in UDA rules?",
        )
        self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
        for surface in data["execution_surfaces"]:
            with self.subTest(surface=surface["surface"]):
                if surface["disposition"] == "QUEUED":
                    self.assertTrue(surface.get("reason", "").strip())
                self.assertNotEqual(surface["disposition"], "LIVE_VERIFIED")
        self.assertNotIn("LIVE_VERIFIED", data["learning_state_at_merge"])
        self.assertTrue(data["nonclaims"])
        self.assertTrue(all(isinstance(claim, str) and claim.strip() for claim in data["nonclaims"]))

    def test_routes(self) -> None:
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        self.assertEqual(sum("`patterns/cross-account-continuity.md` —" in line for line in index.splitlines()), 1)
        docs = (ROOT / "docs" / "INDEX.md").read_text(encoding="utf-8")
        self.assertIn("`../patterns/cross-account-continuity.md`", docs)
        self.assertIn("`requirements/2026-10-10-cross-account-continuity.owner-requirement.json`", docs)
        failure_map = (ROOT / "patterns" / "logic-failure-map.md").read_text(encoding="utf-8")
        row = [line for line in failure_map.splitlines() if line.startswith("| LF-2.2 |")]
        self.assertEqual(len(row), 1)
        self.assertIn("`patterns/cross-account-continuity.md`", row[0])

    def test_no_private_chat_locators(self) -> None:
        for path in (PATTERN, REQUIREMENT):
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                for locator in ("claude.ai/chat", "claude.ai/artifact", "chatgpt.com/c/"):
                    self.assertNotIn(locator, text)


if __name__ == "__main__":
    unittest.main()
