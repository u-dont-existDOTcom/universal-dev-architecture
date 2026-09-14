from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS = ROOT / "AGENTS.md"
CHAT_WORK = ROOT / "patterns" / "chat-work-execution-routing-threshold.md"
INDEX = ROOT / "LESSON-INDEX.md"
PATTERN = ROOT / "patterns" / "work-model-and-effort-routing.md"
TELEMETRY = ROOT / "templates" / "WORK-MODEL-ROUTING-TELEMETRY.json"


class WorkModelAndEffortRoutingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.agents = AGENTS.read_text(encoding="utf-8")
        self.chat_work = CHAT_WORK.read_text(encoding="utf-8")
        self.index = INDEX.read_text(encoding="utf-8")
        self.pattern = PATTERN.read_text(encoding="utf-8")
        self.telemetry = json.loads(TELEMETRY.read_text(encoding="utf-8"))

    def test_canonical_pattern_is_discoverable_from_all_required_entry_points(self) -> None:
        ref = "work-model-and-effort-routing.md"
        self.assertIn(ref, self.agents)
        self.assertIn(ref, self.chat_work)
        self.assertIn(ref, self.index)

    def test_canonical_ladder_preserves_durable_routing_invariants(self) -> None:
        normalized = " ".join(self.pattern.split())
        for phrase in (
            "Tier 1 — GPT-5.6 Sol Low",
            "deterministic or near-deterministic execution",
            "Tier 2 — GPT-5.6 Sol Medium",
            "default bounded implementation tier",
            "Tier 3 — GPT-6 Astra Low",
            "rather than reflexively escalating Sol Medium to Sol High",
            "Tier 4 — GPT-6 Astra Medium",
            "at least one concrete condition holds",
            "Tier 5 — GPT-6 Astra High, XHigh, or Max",
            "exception tiers",
            "Consumer-seam correctness is the acceptance boundary",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, normalized)

    def test_failure_policy_allows_only_execution_reasoning_to_escalate(self) -> None:
        normalized = " ".join(self.pattern.split())
        for classification in (
            "CHAT_PLAN_DEFECT",
            "ACCESS_CONTEXT_DEFECT",
            "EXECUTION_REASONING_SHORTFALL",
            "MECHANICAL_EXECUTION_FAILURE",
        ):
            self.assertIn(classification, self.pattern)
        self.assertIn(
            "Only `EXECUTION_REASONING_SHORTFALL` directly justifies model/effort escalation",
            self.pattern,
        )
        self.assertIn("model escalation is forbidden as a substitute", normalized)

    def test_fast_mode_and_telemetry_window_are_bounded(self) -> None:
        self.assertIn("Fast mode defaults to a `DO_NOT_ENABLE_FAST` request", self.pattern)
        self.assertIn("observed state `null`", self.pattern)
        self.assertIn("never translate “do not enable”", self.pattern)
        self.assertIn("next 10 nontrivial Work executions", self.pattern)
        self.assertIn("Never create a broad benchmark suite", self.pattern)
        self.assertEqual(self.telemetry["window"]["targetCount"], 10)
        self.assertFalse(self.telemetry["window"]["broadBenchmarkAuthorized"])
        self.assertFalse(self.telemetry["window"]["automaticPolicyMutationAuthorized"])
        self.assertEqual(
            self.telemetry["entryTemplate"]["fastModeRequest"],
            "DO_NOT_ENABLE_FAST | ENABLE_FAST",
        )
        self.assertIsNone(self.telemetry["entryTemplate"]["fastModeObserved"])

    def test_telemetry_template_contains_every_required_field_and_checkpoint(self) -> None:
        entry = self.telemetry["entryTemplate"]
        required = {
            "taskId",
            "repository",
            "residualExecutionClass",
            "chosenModel",
            "chosenEffort",
            "routingTriggers",
            "modelIdentityEvidence",
            "directConsumerSeamResult",
            "failureClassification",
            "wallTimeSeconds",
            "retries",
            "interventions",
            "testWallTimeSeconds",
            "allowanceDelta",
            "escalationOccurred",
            "finalSuccessfulTier",
            "hindsightInitialTier",
        }
        self.assertTrue(required.issubset(entry))
        self.assertEqual(
            [checkpoint["afterCompletedCount"] for checkpoint in self.telemetry["checkpoints"]],
            [5, 10],
        )
        self.assertEqual(
            self.telemetry["futurePairedCalibration"]["maximumFrozenTasksWithoutNewChatDirective"],
            2,
        )

    def test_provenance_distinguishes_current_sources_from_owner_policy(self) -> None:
        self.assertIn("Official-source provenance — checked 2026-09-14", self.pattern)
        self.assertIn("not preserved as a current OpenAI quote or fact", self.pattern)
        self.assertIn("owner's explicit optimization policy", self.pattern)


if __name__ == "__main__":
    unittest.main()
