from __future__ import annotations

import json
import unittest
from pathlib import Path
from tests.root_migration_assertions import assert_routed_rule


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "chatgpt-client-surface-capability-and-thread-recovery.md"
REQUIREMENT = ROOT / "docs" / "requirements" / "2026-09-30-system-capability-claims.owner-requirement.json"
EVAL = ROOT / "evals" / "system-capability-claims.json"
SECTION_HEADING = "## Claims about the system itself"
BULLETS = (
    "Name the layer",
    "Check the routes this session has",
    "Rank evidence about what happened",
    "Treat internal routing as unknown unless shown",
    "Tie sensory claims to the sensory input",
    "Separate intent from outcome",
    "Recheck after a change",
    "Judge the whole chain; locate errors narrowly",
    "Bring in architecture only when it matters",
)


def section(text: str, heading: str) -> str:
    return text.split(heading, 1)[1].split("\n## ", 1)[0]


class SystemCapabilityClaimsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pattern = PATTERN.read_text(encoding="utf-8")
        self.body = section(self.pattern, SECTION_HEADING)
        self.requirement = json.loads(REQUIREMENT.read_text(encoding="utf-8"))

    def test_section_appears_once_before_recovery_order(self) -> None:
        self.assertEqual(self.pattern.count(SECTION_HEADING), 1)
        self.assertLess(self.pattern.index(SECTION_HEADING), self.pattern.index("## Recovery order"))

    def test_each_check_is_present(self) -> None:
        for label in BULLETS:
            with self.subTest(label=label):
                self.assertIn(f"- **{label}.**", self.body)

    def test_key_rules_are_stated(self) -> None:
        for phrase in (
            "A limit of the current model, voice layer, mode, interface, or tool is not a limit of the whole product.",
            "is not available here until this session shows it",
            "Do not hunt for routes it does not have.",
            "A weaker source never overrides a stronger one.",
            "Response quality, latency, and wording are not evidence of routing.",
            "observed (in this interaction), documented (in current product documentation), or inferred",
            "leave the rest open instead of supplying a tidy explanation",
            "Understanding a transcript is not hearing the audio.",
            "a successful handoff from completion of the underlying task",
            "do not patch only the local wording",
            "and to no layer without evidence",
            "make the narrowest claim the strongest available evidence supports",
            "they are not a preamble for every task",
            "`patterns/reasoning-selection.md`",
            "`patterns/context-compaction-resilience.md`",
            "docs/requirements/2026-09-30-system-capability-claims.owner-requirement.json",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.body)

    def test_root_agents_routes_capability_claims(self) -> None:
        assert_routed_rule(self, "patterns/chatgpt-client-surface-capability-and-thread-recovery.md", (
            "Claims about the system itself", "Distinguish an intended action from an attempted one",
        ))

    def test_lesson_index_entry_names_the_rule(self) -> None:
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        entries = [
            line
            for line in index.splitlines()
            if "`patterns/chatgpt-client-surface-capability-and-thread-recovery.md` —" in line
        ]
        self.assertEqual(len(entries), 1)
        self.assertIn("treat internal routing as unknown unless shown", entries[0])
        self.assertIn("keep intended, attempted, and confirmed actions apart", entries[0])

    def test_coverage_map_accounts_for_all_25_instructions(self) -> None:
        coverage = self.requirement["coverage_map"]
        self.assertEqual(set(coverage), {str(number) for number in range(1, 26)})
        for number, targets in coverage.items():
            self.assertIsInstance(targets, list)
            for part in targets:
                with self.subTest(instruction=number, target=part):
                    if part.startswith("Pointer to "):
                        self.assertIn(part.removeprefix("Pointer to "), self.body)
                    elif part in {"Section introduction", "Closing paragraph"}:
                        continue
                    else:
                        self.assertIn(part, BULLETS)

    def test_requirement_records_origin_surfaces_and_limits(self) -> None:
        data = self.requirement
        self.assertEqual(data["requirement_id"], "2026-09-30-system-capability-claims")
        self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
        dispositions = {surface["disposition"] for surface in data["execution_surfaces"]}
        self.assertTrue({"PROJECTED", "DEFERRED"} <= dispositions)
        for surface in data["execution_surfaces"]:
            if surface["disposition"] in {"DEFERRED", "NOT_APPLICABLE"}:
                with self.subTest(surface=surface["surface"]):
                    self.assertTrue(surface.get("reason"))
        self.assertNotIn("LIVE_VERIFIED", data["learning_state_at_merge"])
        self.assertTrue(data["nonclaims"])

    def test_eval_fixture_targets_the_section(self) -> None:
        data = json.loads(EVAL.read_text(encoding="utf-8"))
        self.assertEqual(data["pattern"], "patterns/chatgpt-client-surface-capability-and-thread-recovery.md")
        self.assertEqual(data["section"], SECTION_HEADING.removeprefix("## "))
        checks = {case["check"] for case in data["cases"]}
        self.assertIn("architecture-only-when-it-matters", checks)
        self.assertIn("intent-versus-outcome", checks)
        for case in data["cases"]:
            with self.subTest(case=case["id"]):
                self.assertTrue(case["expected"])
                self.assertTrue(case["mustNot"])

    def test_public_artifacts_carry_no_private_chat_locators(self) -> None:
        for path in (PATTERN, REQUIREMENT, EVAL):
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                self.assertNotIn("claude.ai/chat", text)
                self.assertNotIn("chatgpt.com/c/", text)


if __name__ == "__main__":
    unittest.main()
