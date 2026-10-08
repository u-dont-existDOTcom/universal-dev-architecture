from __future__ import annotations

import re
import unittest
from math import ceil, comb
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
            "by ID, exact content and the complete evaluator configuration",
            "never by asking the reviewer",
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

    def test_carried_verdicts_bind_the_complete_evaluator_configuration(self) -> None:
        rule = self.pattern.split("1. **", 1)[1].split("\n2. **", 1)[0]
        for phrase in (
            "by ID, exact content and the complete evaluator configuration",
            "reviewer prompt", "rubric", "model/version", "sampling settings",
            "frozen reference", "hashes are enough",
            "configuration change counts every affected item as changed",
            "requires re-review before aggregate acceptance",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, rule)

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

    def test_nonzero_miss_floors_use_the_binomial_tail_and_threshold(self) -> None:
        problem = self.pattern.split("## Problem", 1)[1].split("## Rules", 1)[0]
        for phrase in (
            "k = n - ceil(r*n)",
            "P(Binomial(n, p) > k)",
            "sum from j = k + 1 to n of C(n, j) p^j (1 - p)^(n - j)",
            "With k = 0 this reduces to the zero-miss formula above.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, problem)
        example = re.search(
            r"r = ([\d.]+), n = (\d+) and p = ([\d.]+) allow k = (\d+) misses "
            r"and give about ([\d.]+)% false failures, versus about ([\d.]+)% for zero allowed misses",
            problem,
        )
        self.assertIsNotNone(example)
        r, n, p, k, tail_percent, zero_percent = map(float, example.groups())
        n, k = int(n), int(k)
        self.assertEqual(n - ceil(r * n), k)
        tail = sum(comb(n, j) * p**j * (1 - p)**(n - j) for j in range(k + 1, n + 1))
        self.assertAlmostEqual(tail * 100, tail_percent, places=4)
        self.assertAlmostEqual((1 - (1 - p)**n) * 100, zero_percent, places=1)
        rule = self.pattern.split("4. **", 1)[1].split("\n5. **", 1)[0]
        self.assertIn("each aggregate, per-unit and per-stratum floor", rule)
        self.assertIn("its own n, p and allowed misses k", rule)
        self.assertIn("binomial tail", rule)
        self.assertIn("independently known-correct", rule)

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

    def test_false_positive_rate_requires_adjudicated_known_correct_records(self) -> None:
        rule = self.pattern.split("4. **", 1)[1].split("\n5. **", 1)[0]
        for phrase in (
            "earlier cycles' records only for items independently known to be correct",
            "findings adjudicated false",
            "adjudicated false flags divided by all reviewed known-correct items, including unflagged items",
            "exclude genuine defects and unadjudicated records",
            "When those labels are unavailable, treat p as a guess and say so.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, rule)

    def test_pilot_uncertainty_controls_scale_admission(self) -> None:
        rule = self.pattern.split("4. **", 1)[1].split("\n5. **", 1)[0]
        for phrase in (
            "State the confidence level and method",
            "size a representative pilot in advance",
            "tolerable false-failure rate at the intended scale",
            "one-sided upper confidence bound p_upper in place of the point estimate p",
            "every unit/run and hard-floor calculation",
            "one-sided lower confidence bound on each directly measured floor pass rate",
            "Report the pilot counts and bounds",
            "too small to rule out material rejection",
            "enlarge it with a predeclared sample size or redesign before scale",
            "rather than admitting the gate on a point estimate",
            "If the conservative bound would reject enough correct work",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, rule)

    def test_zero_flag_and_all_pass_pilots_retain_uncertainty(self) -> None:
        rule = self.pattern.split("4. **", 1)[1].split("\n5. **", 1)[0]
        self.assertIn("p_upper = 1 - alpha^(1/t) at confidence 1 - alpha", rule)
        self.assertIn("q_lower = alpha^(1/u), not 1", rule)
        example = re.search(
            r"with t = (\d+) and alpha = ([\d.]+) this is about ([\d.]+)%, not zero",
            rule,
        )
        self.assertIsNotNone(example)
        t, alpha, percent = map(float, example.groups())
        p_upper = 1 - alpha ** (1 / t)
        self.assertAlmostEqual(p_upper * 100, percent, places=1)
        # Inverting the zero-event binomial probability must recover alpha.
        self.assertAlmostEqual((1 - p_upper) ** t, alpha)
        self.assertGreater(1 - (1 - p_upper) ** 100, 0.99)
        q_lower = alpha ** (1 / 5)
        self.assertAlmostEqual(q_lower ** 5, alpha)
        self.assertLess(q_lower ** 162, 0.01)

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
