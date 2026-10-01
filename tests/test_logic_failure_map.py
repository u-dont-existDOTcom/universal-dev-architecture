"""Keep the failure inventory and standalone-project route complete."""

import re
import unittest
from pathlib import Path
from tests.root_migration_assertions import assert_routed_rule


ROOT = Path(__file__).resolve().parents[1]
MAP = ROOT / "patterns/logic-failure-map.md"
CARRYING = ROOT / "patterns/carrying-uda-into-standalone-projects.md"
INDEX = ROOT / "LESSON-INDEX.md"
# Retained provenance and domain-specific symbolic-analysis methods are not
# general architecture rules that the logic failure map routes.
EXCLUDED_PATTERNS = {
    "patterns/codex-github-operating-standard.md",  # superseded
    "patterns/dynamic-successor-discovery-for-monitoring.md",  # superseded
    "patterns/context-gated-symbolic-personality-synthesis.md",
    "patterns/context-gated-symbolic-personality-synthesis-errata.md",
    "patterns/contextual-symbolic-prediction-causality-and-phase-controls.md",
    "patterns/continuous-candidate-signature-ranking.md",
    "patterns/fixed-target-symbolic-profile-fit-evaluation.md",
    "patterns/structured-natal-chart-comparison.md",
}


class LogicFailureMapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.map_text = MAP.read_text(encoding="utf-8")
        cls.carrying_text = CARRYING.read_text(encoding="utf-8")
        cls.index_text = INDEX.read_text(encoding="utf-8")

    def test_cited_repository_paths_exist(self):
        # The carrying pattern's example manifest is in a different project,
        # not a citation of a file in this repository.
        citation = re.compile(r"`([A-Za-z0-9._/-]+\.md)`")
        for source in (self.map_text, self.carrying_text):
            for relative in citation.findall(source):
                with self.subTest(path=relative):
                    if relative == "docs/uda-imports.md":
                        self.assertIn("such as `docs/uda-imports.md`", self.carrying_text)
                        continue
                    self.assertTrue((ROOT / relative).is_file(), relative)

    def test_every_active_canonical_pattern_is_placed(self):
        patterns = {path.relative_to(ROOT).as_posix() for path in (ROOT / "patterns").glob("*.md")}
        self.assertTrue(EXCLUDED_PATTERNS <= patterns)
        rows = [line.split("|")[4] for line in self.map_text.splitlines() if line.startswith("| LF-")]
        not_failure_rules = self.map_text.split("### Not failure rules", 1)[1].split("\n## ", 1)[0]
        for pattern in sorted(patterns - EXCLUDED_PATTERNS):
            with self.subTest(pattern=pattern):
                citation = f"`{pattern}`"
                self.assertTrue(any(citation in cell for cell in rows) or citation in not_failure_rules)

    def test_rows_have_five_cells_unique_ids_and_valid_mast(self):
        table = self.map_text.split("## The map", 1)[1].split("## Keeping the map complete", 1)[0]
        valid_mast = {
            *(f"FM-1.{n}" for n in range(1, 6)),
            *(f"FM-2.{n}" for n in range(1, 7)),
            *(f"FM-3.{n}" for n in range(1, 4)),
        }
        ids = []
        for line in table.splitlines():
            if not line.startswith("|"):
                continue
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            self.assertEqual(len(cells), 5, line)
            if not cells[0].startswith("LF-"):
                continue
            self.assertRegex(cells[0], r"^LF-\d+\.\d+$")
            ids.append(cells[0])
            if cells[4]:
                self.assertIn(cells[4], valid_mast, line)
        self.assertEqual(len(ids), len(set(ids)))

    def test_routes_exist(self):
        docs = (ROOT / "docs/INDEX.md").read_text(encoding="utf-8")
        assert_routed_rule(self, "patterns/logic-failure-map.md", (
            "Place every failure on the map first: `patterns/logic-failure-map.md`.",
        ), compact=True)
        assert_routed_rule(self, "patterns/carrying-uda-into-standalone-projects.md", (
            "A project whose runtime runs outside this architecture imports what applies to it: `patterns/carrying-uda-into-standalone-projects.md`.",
        ), compact=True)
        for pattern in ("logic-failure-map", "carrying-uda-into-standalone-projects"):
            self.assertIn(f"`patterns/{pattern}.md`", self.index_text)
            self.assertIn(f"`../patterns/{pattern}.md`", docs)

    def test_map_classifies_before_repairing_the_diagnosed_boundary(self):
        guidance = self.map_text.split("1. **When something goes wrong", 1)[1].split("\n2. **", 1)[0]
        self.assertIn("classify the failure", guidance)
        self.assertIn("repair the diagnosed", guidance)
        self.assertIn("implementation boundary", guidance)
        self.assertIn("only if that check or rule is itself defective", guidance)

    def test_documentation_index_routes_repair_to_diagnosed_boundary(self):
        docs = (ROOT / "docs/INDEX.md").read_text(encoding="utf-8")
        route = docs.split("For any failure diagnosis,", 1)[1].split("For a project", 1)[0]
        self.assertIn("repairing the diagnosed boundary", route)
        self.assertIn("only if it is itself defective", route)
        self.assertNotIn("repairing its check or rule", route)

    def test_safe_reversible_choices_do_not_require_owner_interruption(self):
        row = next(line for line in self.map_text.splitlines() if line.startswith("| LF-1.5 |"))
        check = row.split("|")[3]
        self.assertIn("safe, in-scope, reversible", check)
        self.assertIn("decide", check)
        self.assertIn("material owner tradeoff", check)
        self.assertIn("genuine human gate", check)
        self.assertNotIn("routine and reversible", check)

    def test_independent_evaluation_is_risk_adjusted(self):
        row = next(line for line in self.map_text.splitlines() if line.startswith("| LF-4.6 |"))
        failure, check = row.split("|")[2:4]
        self.assertIn("when independent evaluation is materially valuable", failure)
        self.assertIn("If independence is materially valuable", check)
        self.assertIn("otherwise ordinary self-review suffices", check)

    def test_live_bootstrap_check_requires_an_active_requirement(self):
        row = next(line for line in self.map_text.splitlines() if line.startswith("| LF-2.1 |"))
        check = row.split("|")[3]
        self.assertIn("owner or project instructions require", check)
        self.assertIn("otherwise compile", check)
        self.assertIn("authoritative route", check)

    def test_standalone_selection_preserves_development_reference_route(self):
        rule = self.carrying_text.split("## Rule", 1)[1].split("\n## ", 1)[0]
        selection = rule.split("2. **Select what applies.**", 1)[1].split("3. **Import", 1)[0]
        self.assertIn("For runtime imports, leave out development-process rules", selection)
        self.assertIn("Keep applicable development-time rules in the selection", selection)
        self.assertIn("project's `AGENTS.md`", selection)
        bounds = self.carrying_text.split("## Bounds", 1)[1].split("\n## ", 1)[0]
        self.assertIn("Import into runtime only", bounds)
        self.assertIn("referenced from the project's `AGENTS.md`", bounds)

    def test_carrying_rules_and_example_boundary(self):
        self.assert_carrying_rules_and_example_boundary(self.carrying_text)

    def test_carrying_rules_survive_example_removal(self):
        without_example = self.carrying_text.split("## Example", 1)[0]
        self.assert_carrying_rules_and_example_boundary(without_example)

    def assert_carrying_rules_and_example_boundary(self, carrying_text):
        rule = carrying_text.split("## Rule", 1)[1].split("\n## ", 1)[0]
        headings = re.findall(r"(?m)^\d+\. \*\*([^*]+)\*\*", rule)
        self.assertEqual(headings, [
            "Name the runtime.",
            "Select what applies.",
            "Import each item in the most enforceable form that fits:",
            "Adapt, don't paste.",
            "Record where it came from.",
            "Keep it in sync on purpose.",
            "Test the imports.",
        ])
        _, heading, example = carrying_text.partition("## Example")
        if heading:
            self.assertIn("NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT", example)
            self.assertNotRegex(example, r"(?im)(?:^|[\s`(])(?:~?/|[a-z]:\\)[^\s`]+|file://")


if __name__ == "__main__":
    unittest.main()
