from __future__ import annotations

import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERN_PATH = "patterns/book-research-reader-reviews.md"
PATTERN = ROOT / PATTERN_PATH
REQUIREMENT_PATH = "docs/requirements/2026-10-20-book-research-reader-reviews.owner-requirement.json"
REQUIREMENT = ROOT / REQUIREMENT_PATH

FIRST_SENTENCE = (
    "Book research should include reader-review evidence alongside primary-text reading, identifying "
    "practical difficulties, negative experiences, differences in usability, and criticisms that the "
    "author might not address."
)
SECOND_SENTENCE = (
    "Reviews must be checked against the book, duplicates should not be counted as independent evidence, "
    "and self-selected reviews must not be mistaken for clinical outcome studies."
)
OWNER_STATEMENT = (
    "new universal instructions item:\n" + FIRST_SENTENCE + "\n" + SECOND_SENTENCE + "\n(send that to UDA also)"
)
TRIGGER = "owner rule: when research reads, assesses or recommends a book or a method a book teaches"


def section(text: str, heading: str) -> str:
    return text.split(f"\n## {heading}\n", 1)[1].split("\n## ", 1)[0]


class BookResearchReaderReviewTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pattern = PATTERN.read_text(encoding="utf-8")
        self.requirement = json.loads(REQUIREMENT.read_text(encoding="utf-8"))

    def test_rule_is_the_owners_two_sentences_verbatim(self) -> None:
        self.assertIn(FIRST_SENTENCE, self.pattern)
        self.assertIn(SECOND_SENTENCE, self.pattern)
        paragraphs = [p.strip() for p in section(self.pattern, "Rule").strip().split("\n\n")]
        self.assertEqual([FIRST_SENTENCE, SECOND_SENTENCE], paragraphs)

    def test_requirement_quotes_the_owner_verbatim(self) -> None:
        data = self.requirement
        self.assertEqual("2026-10-20-book-research-reader-reviews", data["requirement_id"])
        self.assertEqual(OWNER_STATEMENT, data["owner_statement"])
        self.assertIn(FIRST_SENTENCE, data["required_behavior"])
        self.assertIn(SECOND_SENTENCE, data["required_behavior"])
        self.assertEqual("OWNER_REQUIRED", data["origin"]["classification"])
        for surface in data["execution_surfaces"]:
            with self.subTest(surface=surface["surface"]):
                if surface["disposition"] == "QUEUED":
                    self.assertTrue(surface.get("reason", "").strip())
                self.assertNotEqual("LIVE_VERIFIED", surface["disposition"])
        self.assertNotIn("LIVE_VERIFIED", data["learning_state_at_merge"])
        self.assertTrue(data["nonclaims"])
        self.assertTrue(all(isinstance(claim, str) and claim.strip() for claim in data["nonclaims"]))

    def test_trigger_and_bounds(self) -> None:
        trigger = section(self.pattern, "Trigger")
        self.assertIn(
            "Book research is research that reads, assesses or recommends a book or a method a book teaches.",
            trigger,
        )
        self.assertIn("A passing mention of a book is not book research.", trigger)
        bounds = section(self.pattern, "Bounds")
        self.assertIn("This adds no gate and grants no authority.", bounds)
        self.assertIn("It sets no quota of reviews or sources.", bounds)
        not_adopted = next(line for line in bounds.splitlines() if "are not adopted" in line)
        for detail in (
            "counting only readers who tried the method",
            "editions, formats and translations",
            "blurbs and endorsements",
            "how many reviews were read or that none were found",
            "only if the owner adopts them",
        ):
            with self.subTest(detail=detail):
                self.assertIn(detail, not_adopted)
        self.assertEqual(4, len(self.requirement["not_adopted"]))

    def test_regression_case_is_synthetic_and_follows_the_owner_sentences(self) -> None:
        regression = section(self.pattern, "Regression")
        self.assertIn("A synthetic case.", regression)
        passing = next(line for line in regression.splitlines() if line.startswith("- **Pass:**"))
        failing = next(line for line in regression.splitlines() if line.startswith("- **Fail:**"))
        for phrase in ("practical difficulties", "negative experiences", "usability",
                       "criticisms that the author might not address", "self-selected"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, passing)
        for phrase in ("rests on the book alone", "two independent accounts", "how often the method works"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, failing)

    def test_cited_patterns_exist(self) -> None:
        cited = set(re.findall(r"`(patterns/[A-Za-z0-9._-]+\.md)`", self.pattern))
        self.assertTrue({
            "patterns/source-interpretation-provenance.md",
            "patterns/whole-argument-reconstruction.md",
            "patterns/consilience-and-expected-observability.md",
            "patterns/coverage-before-depth-in-selection.md",
            "patterns/research-before-reinvention.md",
        } <= cited)
        for relative in sorted(cited):
            with self.subTest(path=relative):
                self.assertTrue((ROOT / relative).is_file())

    def test_routes(self) -> None:
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        lines = [line for line in index.splitlines() if f"`{PATTERN_PATH}` —" in line]
        self.assertEqual(1, len(lines))
        self.assertRegex(lines[0], r"^\d+\. ")
        self.assertIn(f"`{PATTERN_PATH}` — {TRIGGER}, include reader-review evidence", lines[0])
        self.assertIn("a passing mention of a book is not book research", lines[0])
        docs = (ROOT / "docs" / "INDEX.md").read_text(encoding="utf-8")
        self.assertIn(f"`../{PATTERN_PATH}`", docs)
        self.assertIn("`requirements/2026-10-20-book-research-reader-reviews.owner-requirement.json`", docs)
        failure_map = (ROOT / "patterns" / "logic-failure-map.md").read_text(encoding="utf-8")
        for row_id in ("LF-3.7", "LF-3.9"):
            with self.subTest(row=row_id):
                row = [line for line in failure_map.splitlines() if line.startswith(f"| {row_id} |")]
                self.assertEqual(1, len(row))
                self.assertIn(f"`{PATTERN_PATH}`", row[0].split("|")[4])

    def test_inventory_and_baseline_addition_carry_the_owner_authorization(self) -> None:
        inventory = json.loads((ROOT / "rules/rule-graph/enforcement-coverage.v1.json").read_text(encoding="utf-8"))
        entry = next(e for e in inventory["entries"] if e["id"] == PATTERN_PATH)
        self.assertEqual("LEGACY_UNSTRUCTURED", entry["disposition"])
        self.assertEqual({"kind": "INDEX_TRIGGER", "detail": TRIGGER}, entry["activation_route"])
        self.assertEqual([], entry["task_time_records"])
        baseline = json.loads(
            (ROOT / "rules/rule-graph/enforcement-legacy-baseline.v1.json").read_text(encoding="utf-8")
        )
        addition = next(a for a in baseline["owner_authorized_additions"] if a["id"] == PATTERN_PATH)
        self.assertEqual(OWNER_STATEMENT, addition["owner_quote"])
        self.assertEqual("2026-10-20", addition["date"])
        self.assertEqual(REQUIREMENT_PATH, addition["source"])

    def test_no_private_chat_locators(self) -> None:
        for path in (PATTERN, REQUIREMENT):
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                self.assertNotRegex(text, r"https?://[^\s)\"]*/(?:chat|c|artifact)/")
                self.assertNotIn("innerSignalGraph", text)


if __name__ == "__main__":
    unittest.main()
