from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "cross-family-reasoning-check.md"


class CrossFamilyReasoningCheckTests(unittest.TestCase):
    def test_instruction_surfaces_route_to_the_pattern(self) -> None:
        for relative_path in ("AGENTS.md", "LESSON-INDEX.md", "docs/INDEX.md"):
            with self.subTest(path=relative_path):
                self.assertIn("cross-family-reasoning-check.md", (ROOT / relative_path).read_text(encoding="utf-8"))
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.assertIn("Hard, costly-if-wrong reasoning: `patterns/cross-family-reasoning-check.md`.", agents)

    def test_reviewer_is_the_other_family_and_never_a_disguised_substitute(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "Origin: **OWNER** instruction, 2026-09-24",
            "Claude Opus 5.5 at effort `max`",
            "GPT-5.6 Sol at Extra High (XHigh)",
            "Never present one as a cross-family check.",
            "`Cross-family check: not run (<reason>)`",
            "no API-key fallback",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_trigger_is_scoped_and_bounded_for_cost(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "only when **all three** of the following hold",
            "Run those cheaper checks first.",
            "the owner's trial is the check",
            "**one check per conclusion, at the point of use**",
            "at most one reconciliation round",
            "do not add a third model",
            "Do not run both.",
            "does not import release gates into Iteration",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_blind_packet_reuses_independent_evaluation_separation(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        self.assertIn("patterns/independent-evaluation-separation.md", text)
        self.assertIn("Withhold the producer's confidence", text)
        for verdict in ("`AGREES`", "`FINDS_ERROR`", "`UNCERTAIN`"):
            self.assertIn(verdict, text)

    def test_rule_graph_node_is_active_with_existing_dependencies(self) -> None:
        graph = json.loads((ROOT / "rules" / "UDA-RULE-GRAPH.json").read_text(encoding="utf-8"))
        nodes = {node["rule_id"]: node for node in graph["nodes"]}
        node = nodes["cross-family-reasoning-check"]
        self.assertEqual(node["canonical_path"], "patterns/cross-family-reasoning-check.md")
        self.assertEqual(node["status"], "active")
        for dependency in node["requires"]:
            self.assertIn(dependency, nodes)
        self.assertTrue(set(node["enforcement_phase"]) <= set(graph["allowed_enforcement_phases"]))


if __name__ == "__main__":
    unittest.main()
