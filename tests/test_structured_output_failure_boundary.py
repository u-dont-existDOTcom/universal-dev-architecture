from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class StructuredOutputFailureBoundaryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pattern = (
            ROOT / "patterns" / "structured-output-failure-boundary.md"
        ).read_text(encoding="utf-8")
        self.template = json.loads(
            (ROOT / "templates" / "STRUCTURED-OUTPUT-FAILURE.json").read_text(
                encoding="utf-8"
            )
        )

    def test_pattern_separates_serialization_from_semantic_and_scientific_failure(self) -> None:
        required = (
            "STRUCTURED_OUTPUT_SYNTAX_FAILURE",
            "serialization/interface",
            "does not mean the underlying reasoning, scientific hypothesis",
            "raw output",
            "parser error and parser position",
            "input or sealed-packet hash",
            "attempt number and source-fixed maximum-attempt ceiling",
            "strict validator result",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.pattern)

    def test_pattern_enforces_attempt_and_repair_boundary(self) -> None:
        required = (
            "NEW\nsource-bound directive",
            "make a third or otherwise additional attempt",
            "change the model or mode",
            "deterministic repair, JSON cleanup, or semantic correction",
            "alternate or relaxed parser",
            "No silent repair",
            "does **not** cancel, consume, or revoke attempts already",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.pattern)

    def test_machine_state_fails_closed_without_reclassifying_science(self) -> None:
        state = self.template
        self.assertEqual(state["schemaVersion"], 1)
        self.assertEqual(state["failureClass"], "STRUCTURED_OUTPUT_SYNTAX_FAILURE")
        self.assertEqual(state["failureDomain"], "SERIALIZATION_INTERFACE")
        self.assertFalse(state["semanticFailure"])
        self.assertFalse(state["scientificFailure"])
        self.assertFalse(state["workerMisalignment"])
        self.assertFalse(state["attempt"]["validator"]["semanticCorrectionApplied"])
        self.assertTrue(state["attemptBoundary"]["newSourceBoundDirectiveRequired"])
        self.assertFalse(state["repairAuthorization"]["authorized"])
        self.assertFalse(state["downstreamAdmission"]["validStructuredArtifactAvailable"])
        self.assertEqual(state["blockedState"]["scientificAdequacy"], "UNAVAILABLE")

        prohibited = set(state["attemptBoundary"]["prohibitedWithoutNewDirective"])
        self.assertTrue(
            {
                "ADDITIONAL_ATTEMPT",
                "MODEL_CHANGE",
                "PROMPT_CHANGE",
                "PACKET_CHANGE",
                "DETERMINISTIC_REPAIR",
                "JSON_CLEANUP",
                "ALTERNATE_PARSER",
                "SEMANTIC_CORRECTION",
            }.issubset(prohibited)
        )
        self.assertEqual(
            set(state["downstreamAdmission"]["blockedOperations"]),
            {
                "COMPARISON",
                "SCORING",
                "METRICS",
                "AGGREGATION",
                "UNBLINDING",
                "SUBSTITUTION",
            },
        )

    def test_indexes_and_bootstrap_route_the_boundary(self) -> None:
        for relative_path in (
            "LESSON-INDEX.md",
            "docs/INDEX.md",
            "templates/CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md",
        ):
            text = (ROOT / relative_path).read_text(encoding="utf-8")
            with self.subTest(path=relative_path):
                self.assertIn("patterns/structured-output-failure-boundary.md", text)
                self.assertIn("templates/STRUCTURED-OUTPUT-FAILURE.json", text)


if __name__ == "__main__":
    unittest.main()
