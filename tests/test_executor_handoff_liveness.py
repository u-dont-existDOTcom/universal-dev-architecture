from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ExecutorHandoffLivenessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.directive = json.loads(
            (ROOT / "templates" / "CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json").read_text(
                encoding="utf-8"
            )
        )
        cls.receipt = json.loads(
            (ROOT / "templates" / "CODEX-EXECUTION-RECEIPT.json").read_text(
                encoding="utf-8"
            )
        )
        cls.handoff = json.loads(
            (ROOT / "templates" / "EXECUTOR-REASONING-HANDOFF.json").read_text(
                encoding="utf-8"
            )
        )
        cls.fixture = json.loads(
            (ROOT / "evals" / "mission-control" / "executor-handoff-dropped.json").read_text(
                encoding="utf-8"
            )
        )

    def test_01_stop_boundary_is_nonterminal(self) -> None:
        state = self.receipt["reasoningHandoff"]
        self.assertEqual(state["initialState"], "RECEIPT_PERSISTED")
        self.assertFalse(state["terminal"])
        self.assertEqual(state["nextRequiredState"], "REVIEW_REQUEST_SUBMITTED")

    def test_02_exact_observed_failure(self) -> None:
        given = self.fixture["given"]
        expected = self.fixture["expected"]
        self.assertTrue(given["receipt_created"])
        self.assertFalse(given["receipt_routed"])
        self.assertTrue(given["owner_had_to_ask_why_it_stopped"])
        self.assertEqual(expected["reasoning_handoff_state"], "FAILED")
        self.assertEqual(expected["alert"], "EXECUTOR_HANDOFF_DROPPED")
        self.assertTrue(expected["owner_became_message_bus"])
        self.assertFalse(expected["task_terminal"])

    def test_03_exactly_one_logical_request(self) -> None:
        policy = self.directive["handoffPolicy"]
        self.assertEqual(
            policy["requestIdempotency"],
            "ONE_LOGICAL_REQUEST_PER_RECEIPT_AND_REVIEW_BOUNDARY",
        )
        pattern = (
            ROOT / "patterns" / "chat-led-reasoning-codex-execution-separation.md"
        ).read_text(encoding="utf-8")
        self.assertIn("DUPLICATE_REASONING_REQUEST", pattern)

    def test_04_compact_polling(self) -> None:
        polling = self.directive["handoffPolicy"]["polling"]
        self.assertEqual(polling["mode"], "READ_ONLY_COMPACT_STATUS")
        self.assertEqual(
            polling["intermediatePayload"],
            "PENDING_OR_READY_WITH_IDENTIFIERS_ONLY",
        )
        expected = self.fixture["expected"]
        self.assertEqual(expected["intermediate_full_conversation_turns"], 0)
        self.assertEqual(expected["intermediate_repeated_evidence_packets"], 0)
        self.assertEqual(expected["intermediate_additional_chat_messages"], 0)

    def test_05_ready_response_externalization(self) -> None:
        response = self.handoff["response"]
        for field in ("responseId", "responseRef", "sha256", "sizeBytes"):
            self.assertIn(field, response)
        self.assertEqual(
            self.directive["handoffPolicy"]["responseHandling"]["largePayloadPolicy"],
            "PERSIST_OUTSIDE_CONVERSATION_AND_REFERENCE",
        )

    def test_06_exactly_once_processing(self) -> None:
        handling = self.directive["handoffPolicy"]["responseHandling"]
        self.assertEqual(
            handling["processingSemantics"],
            "EXACTLY_ONCE_IMPORT_AND_DIRECTIVE_APPLICATION",
        )
        expected = self.fixture["expected"]
        self.assertEqual(expected["response_imports_per_response_id"], 1)
        self.assertEqual(expected["directive_applications_per_response_id"], 1)
        self.assertEqual(expected["execution_resumes_per_response_id"], 1)

    def test_07_interrupted_fetch_recovery(self) -> None:
        handling = self.directive["handoffPolicy"]["responseHandling"]
        self.assertEqual(
            handling["transportSemantics"],
            "IDEMPOTENT_REFETCH_ALLOWED_BEFORE_PERSISTENCE",
        )
        self.assertTrue(
            self.fixture["expected"]["transport_refetch_before_persistence_allowed"]
        )

    def test_08_identity_mismatch_rejected(self) -> None:
        handling = self.directive["handoffPolicy"]["responseHandling"]
        self.assertTrue(handling["requiredRequestIdEcho"])
        self.assertTrue(handling["requiredTaskIdEcho"])
        self.assertTrue(handling["requiredOwnerOutcomeEpochEcho"])
        self.assertEqual(self.fixture["expected"]["identity_mismatch_action"], "REJECT")

    def test_09_automatic_continuation(self) -> None:
        states = self.handoff["permittedStates"]
        self.assertIn("REASONING_RESPONSE_IMPORTED", states)
        self.assertIn("NEXT_DIRECTIVE_VALIDATED", states)
        self.assertIn("EXECUTION_RESUMED", states)
        self.assertTrue(self.fixture["expected"]["automatic_continuation_required"])

    def test_10_genuine_owner_boundary(self) -> None:
        self.assertIn("OWNER_DECISION_REQUIRED", self.handoff["suspendingOrTerminalStates"])
        self.assertEqual(
            self.fixture["expected"]["valid_owner_boundary_state"],
            "OWNER_DECISION_REQUIRED",
        )

    def test_11_bounded_wait_is_not_completion(self) -> None:
        self.assertEqual(
            self.directive["handoffPolicy"]["onWaitHorizonExceeded"],
            "PERSIST_HANDOFF_BLOCKED_AND_TRANSFER_DURABLE_LEASE",
        )
        expected = self.fixture["expected"]
        self.assertEqual(expected["wait_horizon_state"], "HANDOFF_BLOCKED")
        self.assertFalse(expected["wait_horizon_task_terminal"])

    def test_12_no_codex_authored_reasoning(self) -> None:
        self.assertEqual(
            self.directive["handoffPolicy"]["reviewRequestTemplateRef"],
            "replace-with-chat-authored-review-template",
        )
        self.assertFalse(
            self.fixture["expected"]["codex_authored_review_strategy_allowed"]
        )

    def test_13_no_context_window_pollution(self) -> None:
        polling = self.handoff["polling"]
        self.assertEqual(polling["fullConversationPayloadsRetrieved"], 0)
        self.assertEqual(polling["messagesSentAfterInitialRequest"], 0)
        self.assertEqual(
            self.fixture["expected"]["pending_poll_context_growth"],
            "CONSTANT_SIZE",
        )

    def test_14_durable_relay_transfer(self) -> None:
        lease = self.handoff["lease"]
        self.assertIn("transferredTo", lease)
        self.assertIn("transferAcceptedAt", lease)
        self.assertTrue(
            self.fixture["expected"]["durable_relay_transfer_can_park_codex"]
        )

    def test_15_somatic_loop_continuity(self) -> None:
        expected = self.fixture["expected"]
        self.assertEqual(
            expected["required_recovery"],
            "ROUTE_EXISTING_RECEIPT_WITHOUT_RESUBMITTING_EXECUTION",
        )
        self.assertTrue(expected["somatic_result_must_be_routed_under_existing_identity"])
        self.assertFalse(self.fixture["given"]["completed_experiment_may_be_rerun"])


if __name__ == "__main__":
    unittest.main()
