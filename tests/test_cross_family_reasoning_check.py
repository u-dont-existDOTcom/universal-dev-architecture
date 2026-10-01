from __future__ import annotations

import json
import unittest
from pathlib import Path
from tests.root_migration_assertions import assert_routed_rule


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "cross-family-reasoning-check.md"


class CrossFamilyReasoningCheckTests(unittest.TestCase):
    def test_instruction_surfaces_route_to_the_pattern(self) -> None:
        for relative_path in ("LESSON-INDEX.md", "docs/INDEX.md"):
            with self.subTest(path=relative_path):
                self.assertIn("cross-family-reasoning-check.md", (ROOT / relative_path).read_text(encoding="utf-8"))
        assert_routed_rule(self, "patterns/cross-family-reasoning-check.md", (
            "only when **all three** of the following hold", "other model family",
        ))

    def test_reviewer_is_the_other_family_and_never_a_disguised_substitute(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "Origin: **OWNER** instruction, 2026-09-24",
            "Claude Opus 5.5 at effort `max`",
            "GPT-6.1 Sol at Extra High (XHigh), or GPT-6 Sol at Extra High where 6.1 is not offered",
            "GPT (any GPT model",
            "Never present one as a cross-family check.",
            "`Cross-family check: not run (<reason>)`",
            "no API-key fallback",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_active_gpt_5_6_producer_has_a_claude_reviewer(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        rows = [line.split("|") for line in text.splitlines() if line.startswith("| GPT (")]
        self.assertEqual(len(rows), 1)
        producer, reviewer = rows[0][1:3]
        self.assertIn("GPT-5.6", producer)
        self.assertIn("Claude Opus 5.5 at effort `max`", reviewer)

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
        self.assertIn("independent-evaluation-separation", node["requires"])
        for dependency in node["requires"]:
            self.assertIn(dependency, nodes)
        self.assertTrue(set(node["enforcement_phase"]) <= set(graph["allowed_enforcement_phases"]))


    def test_long_running_reviewer_liveness_is_not_inferred_from_elapsed_time(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        section = text.split("## Long-running reviewer liveness", 1)[1].split(
            "## Reviewer unavailable", 1
        )[0]
        for phrase in (
            "Elapsed wall time, a caller/tool timeout, or a long thinking phase is never by itself evidence",
            "query the reviewer runtime itself for liveness",
            "Treat \u0060busy/working\u0060",
            "Treat a wrapper timeout as scoped to the wrapper",
            "Do not use a fixed minute cutoff as the stall criterion",
            "\u0060claude agents --json\u0060",
            "\u0060claude logs <session-id>\u0060",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, section)

    def test_unavailable_path_requires_liveness_evidence_first(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        unavailable = text.split("## Reviewer unavailable", 1)[1].split(
            "## Relation to assurance lanes", 1
        )[0]
        self.assertIn("only after the liveness rule above establishes", unavailable)


if __name__ == "__main__":
    unittest.main()
