from __future__ import annotations

import re
import unittest
from pathlib import Path

from tests.root_migration_assertions import assert_routed_rule


ROOT = Path(__file__).resolve().parents[1]
RELATIVE = "patterns/convergent-review-acceptance-gates.md"
PATTERN = ROOT / RELATIVE


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class ConvergentReviewAcceptanceGatesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pattern = PATTERN.read_text(encoding="utf-8")

    def test_rules_state_each_requirement(self) -> None:
        for phrase in (
            "**Re-review the change, not the whole unit.**",
            "send the reviewer only the earlier findings and the items the repair changed",
            "Carry forward every item that passed and did not change.",
            "by ID and exact content (a hash is enough), never by asking the reviewer",
            "**Bound the repairs and degrade by item.**",
            "Fix the number of repair cycles before the first cycle runs.",
            "withhold only the items still flagged and mark them for review",
            "record each omission that is still flagged",
            "Do not discard the unit, and do not halt the pipeline",
            "never stop units that do not depend on it",
            "A unit that consumes or checks the withheld items waits until they are reviewed, or runs without them and records the gap",
            "Keep the independent units moving while the question waits.",
            "**Gate on aggregates with hard floors.**",
            "pooled recall against a frozen reference",
            "plus zero critical misses",
            "add a per-unit or per-stratum minimum to the floors",
            "Report the failed units and the error counts beside the aggregate",
            "**Estimate the false-failure rate before running at scale.**",
            "**Track findings per cycle and stop early when they do not fall.**",
            "flat or bounces across repairs",
            "(`patterns/owner-questions-page.md`)",
            "the per-cycle counts",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.pattern)

    def test_rules_are_listed_in_order(self) -> None:
        order = [
            self.pattern.index("1. **Re-review the change, not the whole unit.**"),
            self.pattern.index("2. **Bound the repairs and degrade by item.**"),
            self.pattern.index("3. **Gate on aggregates with hard floors.**"),
            self.pattern.index("4. **Estimate the false-failure rate before running at scale.**"),
            self.pattern.index("5. **Track findings per cycle and stop early when they do not fall.**"),
        ]
        self.assertEqual(order, sorted(order))

    def test_stated_arithmetic_matches_the_formulas(self) -> None:
        # (1 - p)^n for p = 0.05 and n = 27, and q^N for q = 0.99 and N = 162.
        self.assertAlmostEqual((1 - 0.05) ** 27, 0.25, places=2)
        self.assertAlmostEqual(0.99**162, 0.20, places=2)
        for phrase in (
            "(1 - p)^n",
            "With p = 0.05 and n = 27 that is about 25%.",
            "q^N",
            "0.99^162, about 20%, across 162 units",
            "1 - (1 - p)^m",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.pattern)

    def test_declared_gates_and_directive_ceilings_stay_hard(self) -> None:
        for phrase in (
            "**Declared gates stay hard.**",
            "They never lower a gate the owner or the project's authority has declared blocking.",
            "keep running the declared gate until the owner or the project authority changes it",
            "**A directive's ceiling stays a ceiling.**",
            "the stall rule can end repairs sooner and never extends them",
            "**A bound ends spend and proves nothing else.**",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.pattern)
        # The sections the Bounds point to exist.
        self.assertIn("### Declared gates are not accretion", read("patterns/owner-goal-followup-and-requirement-accretion.md"))
        self.assertIn("## Source-fixed attempt ceiling", read("patterns/structured-output-failure-boundary.md"))
        self.assertIn("### 9.4 Strategy exhaustion", read("patterns/outcome-advancement-and-strategy-efficacy.md"))

    def test_routes(self) -> None:
        assert_routed_rule(self, RELATIVE, (
            "Current universal pattern, promoted 2026-10-03",
            "## Transfer rationale and limits",
        ))
        index = read("LESSON-INDEX.md")
        entry = [line for line in index.splitlines() if f"`{RELATIVE}` —" in line]
        self.assertEqual(len(entry), 1)
        self.assertRegex(entry[0].split(" — ", 1)[1], r"^When\b")
        self.assertIn("a gate the owner or project declared is run as declared and changed only by them", entry[0])
        self.assertIn("`../patterns/convergent-review-acceptance-gates.md`", read("docs/INDEX.md"))
        failure_map = read("patterns/logic-failure-map.md")
        for row_id in ("LF-7.7", "LF-5.2"):
            row = [line for line in failure_map.splitlines() if line.startswith(f"| {row_id} |")]
            with self.subTest(row=row_id):
                self.assertEqual(len(row), 1)
                self.assertIn(f"`{RELATIVE}`", row[0])
        self.assertIn(f"`{RELATIVE}`", read("patterns/independent-evaluation-separation.md"))

    def test_every_cited_pattern_exists(self) -> None:
        cited = set(re.findall(r"`(patterns/[A-Za-z0-9._-]+\.md)`", self.pattern))
        self.assertTrue(cited)
        for path in sorted(cited):
            with self.subTest(path=path):
                self.assertTrue((ROOT / path).is_file(), path)

    def test_pattern_carries_no_owner_person_or_project_data(self) -> None:
        self.assertNotRegex(self.pattern, r"https?://")
        self.assertNotRegex(self.pattern, r"(?i)claude\.ai|chatgpt\.com|u-dont-exist")
        self.assertNotRegex(self.pattern, r"(?<![\w`])#\d+\b")
        self.assertNotRegex(self.pattern, r"(?:^|[\s`(])(?:~?/|[A-Za-z]:\\)[^\s`]+")


if __name__ == "__main__":
    unittest.main()
