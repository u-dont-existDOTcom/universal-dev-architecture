from __future__ import annotations

import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "written-rule-checker-coverage.md"
REQUIREMENT = ROOT / "docs" / "requirements" / "2026-10-11-written-rule-checker-coverage.owner-requirement.json"
EXAMPLE_SECTION = "## Reference implementation (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)"
RULE_HEADINGS = [
    "A written rule that names a mechanical check is a control.",
    "Keep a registry that ties each written item to its check.",
    "Test the registry, both ways.",
    "Add to both in the same change.",
    "When something doesn't run as intended, debug the mechanism, not the instance.",
    "A flag is resolved by the rule's own exceptions, not by where the text came from.",
]
OWNER_FILE_NAMES = (
    "tools/humanization/",
    "tells_lint.py",
    "tells_registry.json",
    "HUMANIZATION-GATE",
)


class WrittenRuleCheckerCoverageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pattern = PATTERN.read_text(encoding="utf-8")

    def rule_headings(self, text: str) -> list[str]:
        rule = text.split("## Rule", 1)[1].split("\n## ", 1)[0]
        numbers = re.findall(r"(?m)^(\d+)\. \*\*", rule)
        self.assertEqual(numbers, [str(n) for n in range(1, len(RULE_HEADINGS) + 1)])
        return re.findall(r"(?m)^\d+\. \*\*(.+?)\*\*", rule)

    def test_six_rules_and_key_phrases(self) -> None:
        self.assertEqual(self.rule_headings(self.pattern), RULE_HEADINGS)
        for phrase in (
            "It is not active until a check implements it and a test shows the check firing on an example of the thing the rule names",
            "Do not claim a control is active without mechanical evidence",
            "LF-7.1 and LF-7.3",
            "One machine-readable file lists every item the written rules name",
            "where it is written (file and the exact quoted words)",
            "whether a machine can check it, the check that does, and one example that should trigger it",
            "Items only a reader can judge are listed too, with the reason, so the registry is the complete inventory.",
            "A test runs the checker on every mechanical item's example and fails when the named check doesn't fire.",
            "It also fails when a registry entry's quoted words are no longer in the file it names",
            "so a rewritten rule can't leave a stale entry behind",
            "adds its registry entry, and its check and example when it is mechanical, in the same commit.",
            "A reviewer who sees one without the other treats the change as incomplete.",
            "Find why it didn't run: a missing check, a check that can't match, an input it never sees, a disposition that waved it through.",
            "Then audit every sibling item that shares the cause (the same list, the same matcher, the same normalization)",
            "because one instance found by the owner usually means more that nobody has found",
            "Add the test that would have caught it.",
            "Record the finding on the logic-failure map (`patterns/logic-failure-map.md`, rule 1).",
            "the reviewer keeps it only for a reason the rule itself gives.",
            "\"It was already there\" is not one of those reasons unless the rule says so.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.pattern)

    def test_problem_names_the_three_ways_a_rule_and_its_check_drift_apart(self) -> None:
        problem = self.pattern.split("## Problem", 1)[1].split("\n## ", 1)[0]
        for phrase in (
            "**A rule with no check.**",
            "**A check that can't fire.**",
            "**A flag that gets waved through.**",
            "Nothing ties them together, so they drift apart without anyone noticing",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, problem)

    def test_bounds_state_what_the_registry_does_not_prove(self) -> None:
        bounds = self.pattern.split("## Bounds", 1)[1].split("\n## ", 1)[0]
        for phrase in (
            "This adds no gate on work that has no written mechanical rules.",
            "Rules about meaning stay with a reader or a model judge.",
            "The registry test proves that each check fires on its example. It does not prove the check catches every phrasing a reader would call the same thing.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, bounds)

    def test_status_keeps_the_owner_origin_and_requirement_route(self) -> None:
        status = self.pattern.split("## Status", 1)[1].split("\n## ", 1)[0]
        self.assertIn("Origin: **OWNER**, 2026-10-11.", status)
        self.assertIn("any time something is not executing as intended it should be debugged", status)
        self.assertIn(
            "`docs/requirements/2026-10-11-written-rule-checker-coverage.owner-requirement.json`",
            status,
        )

    def test_owner_deployment_is_labeled_as_an_example(self) -> None:
        self.assertEqual(self.pattern.count(EXAMPLE_SECTION), 1)
        universal, example = self.pattern.split(EXAMPLE_SECTION, 1)
        for name in OWNER_FILE_NAMES:
            with self.subTest(name=name):
                self.assertNotIn(name, universal)
        self.assertIn("`tools/humanization/tells_lint.py`", example)
        self.assertIn("`tools/humanization/tells_registry.json`", example)
        self.assertIn("`tools/humanization/TELLS-COVERAGE-20261011.md`", example)
        self.assertNotIn("\n## ", example)
        # The reusable rules must survive deleting the example.
        self.assertEqual(self.rule_headings(universal), RULE_HEADINGS)

    def test_requirement_preserves_owner_statement_and_evidence_limits(self) -> None:
        data = json.loads(REQUIREMENT.read_text(encoding="utf-8"))
        self.assertEqual(data["requirement_id"], "2026-10-11-written-rule-checker-coverage")
        self.assertEqual(
            data["owner_statement"],
            "you mention that boring and quietly were in the tells list, but never checked? why is that? "
            "can we debug that? any time something is not executing as intended it should be debugged. "
            "make sure to send that to UDA worker it should be in UDA.",
        )
        self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
        self.assertTrue(data["authority"].startswith("OWNER_REQUIRED"))
        self.assertTrue(data["execution_surfaces"])
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
        self.assertEqual(sum("`patterns/written-rule-checker-coverage.md` —" in line for line in index.splitlines()), 1)
        docs = (ROOT / "docs" / "INDEX.md").read_text(encoding="utf-8")
        self.assertIn("`../patterns/written-rule-checker-coverage.md`", docs)
        self.assertIn("`requirements/2026-10-11-written-rule-checker-coverage.owner-requirement.json`", docs)
        failure_map = (ROOT / "patterns" / "logic-failure-map.md").read_text(encoding="utf-8")
        row = [line for line in failure_map.splitlines() if line.startswith("| LF-7.1 |")]
        self.assertEqual(len(row), 1)
        covered_by = row[0].split("|")[4]
        self.assertIn("`patterns/written-rule-checker-coverage.md`", covered_by)

    def test_no_private_chat_locators(self) -> None:
        for path in (PATTERN, REQUIREMENT):
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                for locator in ("claude.ai/chat", "claude.ai/artifact", "claude.ai/code/session", "chatgpt.com/c/"):
                    self.assertNotIn(locator, text)


if __name__ == "__main__":
    unittest.main()
