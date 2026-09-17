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
OWNER_REQUIREMENT = ROOT / "docs" / "requirements" / "2026-09-17-work-model-routing-calibration.owner-requirement.json"


class WorkModelAndEffortRoutingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.agents = AGENTS.read_text(encoding="utf-8")
        self.chat_work = CHAT_WORK.read_text(encoding="utf-8")
        self.index = INDEX.read_text(encoding="utf-8")
        self.pattern = PATTERN.read_text(encoding="utf-8")
        self.telemetry = json.loads(TELEMETRY.read_text(encoding="utf-8"))
        self.requirement = json.loads(OWNER_REQUIREMENT.read_text(encoding="utf-8"))

    def test_canonical_pattern_is_discoverable_from_all_required_entry_points(self) -> None:
        ref = "work-model-and-effort-routing.md"
        self.assertIn(ref, self.agents)
        self.assertIn(ref, self.chat_work)
        self.assertIn(ref, self.index)

    def test_canonical_ladder_preserves_active_trial_routing_invariants(self) -> None:
        normalized = " ".join(self.pattern.split())
        for phrase in (
            "Tier 1 — GPT-5.6 Sol Low",
            "deterministic or near-deterministic execution",
            "Tier 2 — GPT-5.6 Sol Medium",
            "default bounded implementation tier",
            "Optional intermediate — GPT-5.6 Sol High",
            "Tier 3 — GPT-5.6 Sol Extra High: difficult-task baseline",
            "GENUINELY_DIFFICULT",
            "Browser, GUI, or computer use alone is not an Astra-first trigger",
            "Tier 4 — GPT-6 Astra Extra High: matched challenger",
            "Other Astra efforts",
            "Astra Low, Medium, High, or Max are not default rungs in this trial",
            "Consumer-seam correctness is the acceptance boundary",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, normalized)

    def test_failure_policy_only_admits_qualified_execution_failures_to_astra_challenger(self) -> None:
        normalized = " ".join(self.pattern.split())
        for classification in (
            "CHAT_PLAN_DEFECT",
            "ACCESS_CONTEXT_DEFECT",
            "EXECUTION_REASONING_SHORTFALL",
            "EXECUTION_SCOPE_JUDGMENT_FAILURE",
            "MECHANICAL_EXECUTION_FAILURE",
        ):
            self.assertIn(classification, self.pattern)
        self.assertIn(
            "Only `EXECUTION_REASONING_SHORTFALL` and `EXECUTION_SCOPE_JUDGMENT_FAILURE` directly admit an Astra XHigh challenger",
            self.pattern,
        )
        self.assertIn("Model escalation is forbidden as a substitute", normalized)
        self.assertEqual(
            self.telemetry["routingExperiment"]["challengerAfterQualifiedFailure"]["requiresFailureClassification"],
            ["EXECUTION_REASONING_SHORTFALL", "EXECUTION_SCOPE_JUDGMENT_FAILURE"],
        )
        self.assertEqual(
            self.telemetry["routingExperiment"]["doNotEscalateFor"],
            ["CHAT_PLAN_DEFECT", "ACCESS_CONTEXT_DEFECT", "MECHANICAL_EXECUTION_FAILURE"],
        )

    def test_fast_mode_and_trial_review_window_are_bounded(self) -> None:
        self.assertIn("Fast mode defaults to a `DO_NOT_ENABLE_FAST` request", self.pattern)
        self.assertIn("observed state `null`", self.pattern)
        self.assertIn("never translate “do not enable”", self.pattern)
        self.assertIn("Review the evidence around **2026-10-08**", self.pattern)
        self.assertIn("10 genuinely difficult Sol-baseline tasks", self.pattern)
        self.assertEqual(self.telemetry["window"]["scheduledReviewOn"], "2026-10-08")
        self.assertEqual(self.telemetry["window"]["alsoReviewAfterDifficultBaselineCount"], 10)
        self.assertFalse(self.telemetry["window"]["broadBenchmarkAuthorized"])
        self.assertFalse(self.telemetry["window"]["automaticPolicyMutationAuthorized"])
        self.assertEqual(
            self.telemetry["entryTemplate"]["fastModeRequest"],
            "DO_NOT_ENABLE_FAST | ENABLE_FAST",
        )
        self.assertIsNone(self.telemetry["entryTemplate"]["fastModeObserved"])

    def test_telemetry_template_contains_active_trial_fields_and_routing_contract(self) -> None:
        entry = self.telemetry["entryTemplate"]
        required = {
            "taskId",
            "repository",
            "taskCategory",
            "privacySafeTaskSummary",
            "residualExecutionClass",
            "difficultyClass",
            "attemptRole",
            "chosenModel",
            "chosenEffort",
            "routingTier",
            "routingTriggers",
            "modelIdentityEvidence",
            "setterEvidenceId",
            "directConsumerSeamResult",
            "scopeOrGateViolation",
            "stopConditionViolation",
            "unauthorizedAdjacentAction",
            "failureClassification",
            "wallTimeSeconds",
            "retries",
            "ownerCorrectionsRequired",
            "interventions",
            "testWallTimeSeconds",
            "allowanceDelta",
            "allowanceDeltaEvidence",
            "fastModeRequest",
            "fastModeObserved",
            "challengerAdmitted",
            "challengerReason",
            "matchedComparisonQuality",
            "comparisonOutcome",
            "hindsightInitialTier",
        }
        self.assertTrue(required.issubset(entry))
        experiment = self.telemetry["routingExperiment"]
        self.assertEqual(
            experiment["genuinelyDifficultPrimary"],
            {"model": "GPT_5_6_SOL", "effort": "XHIGH"},
        )
        self.assertEqual(
            experiment["challengerAfterQualifiedFailure"]["model"],
            "GPT_6_ASTRA",
        )
        self.assertEqual(
            experiment["challengerAfterQualifiedFailure"]["effort"],
            "XHIGH",
        )
        self.assertFalse(experiment["astraLowFirstDefault"])
        self.assertFalse(experiment["broadComputerUseAstraException"])

    def test_owner_requirement_and_pattern_describe_the_same_active_trial(self) -> None:
        self.assertEqual(
            self.requirement["requirement_id"],
            "REQ-WORK-MODEL-ROUTING-CALIBRATION-20260917",
        )
        self.assertEqual(self.requirement["status"], "ACTIVE_TRIAL")
        trial = self.requirement["trial"]
        self.assertEqual(
            trial["baseline_for_genuinely_difficult_work"],
            {"model": "GPT_5_6_SOL", "effort": "XHIGH"},
        )
        self.assertEqual(
            trial["failure_challenger"],
            {"model": "GPT_6_ASTRA", "effort": "XHIGH"},
        )
        self.assertFalse(trial["astra_low_first_default"])
        self.assertFalse(trial["broad_computer_use_exception"])
        self.assertFalse(trial["automatic_policy_mutation_authorized"])
        self.assertIn("Owner trial requirement", self.pattern)
        self.assertIn("trial hypothesis", self.pattern)
        self.assertIn("Official and community model behavior can change", self.pattern)


if __name__ == "__main__":
    unittest.main()
