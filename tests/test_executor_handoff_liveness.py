from __future__ import annotations

import copy
import base64
import hashlib
import json
import unittest
from pathlib import Path

from scripts.executor_handoff_state import (
    HandoffValidationError,
    apply_handoff_event,
    compact_poll_projection,
    validate_directive,
    validate_response_identity,
)


ROOT = Path(__file__).resolve().parents[1]


class ExecutorHandoffLivenessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.directive_template = json.loads(
            (ROOT / "templates" / "CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json").read_text()
        )
        cls.handoff_template = json.loads(
            (ROOT / "templates" / "EXECUTOR-REASONING-HANDOFF.json").read_text()
        )
        cls.receipt_template = json.loads(
            (ROOT / "templates" / "CODEX-EXECUTION-RECEIPT.json").read_text()
        )
        cls.fixture = json.loads(
            (ROOT / "evals" / "mission-control" / "executor-handoff-dropped.json").read_text()
        )

    def setUp(self) -> None:
        self.directive = copy.deepcopy(self.directive_template)
        self.directive.update({"directiveId": "directive-001", "taskId": "task-001"})
        self.directive["ownerOutcome"]["epoch"] = 7
        self.directive["reasoningSupervisor"].update(
            {
                "surface": "PRO",
                "chatEpoch": "chat-epoch-003",
                "reviewedEvidenceBoundary": "git:abc123",
            }
        )
        self.handoff = copy.deepcopy(self.handoff_template)
        self.handoff.update(
            {
                "handoffId": "handoff-001",
                "taskId": "task-001",
                "directiveId": "directive-001",
                "receiptId": "receipt-001",
                "runId": "run-001",
            }
        )
        self.handoff["lease"].update(
            {
                "owner": "CODEX_CONTROLLER",
                "acquiredAt": "2026-08-31T00:00:00Z",
                "expiresAt": "2026-08-31T00:10:00Z",
            }
        )
        self.handoff["reviewRequest"].update(
            {
                "requestId": "review-001",
                "idempotencyKey": "receipt-001:review-001",
                "targetSurface": "PRO",
                "targetSessionId": "chat-session-001",
                "targetChatEpoch": "chat-epoch-003",
                "packetRef": "feedback/review-packet.json",
                "packetSha256": "a" * 64,
            }
        )
        self.response = {
            "responseId": "response-001",
            "responseKind": "NEXT_EXECUTION_DIRECTIVE",
            "requestIdEcho": "review-001",
            "taskIdEcho": "task-001",
            "ownerOutcomeEpochEcho": 7,
            "chatEpochEcho": "chat-epoch-003",
            "reviewedEvidenceBoundaryEcho": "git:abc123",
            "nextDirectiveSchemaVersion": 2,
        }

    def event(self, state, event_type, at, **values):
        return apply_handoff_event(state, {"type": event_type, "at": at, **values})

    def waiting(self):
        state = self.event(
            self.handoff,
            "SUBMIT_REVIEW_REQUEST",
            "2026-08-31T00:01:00Z",
            requestId="review-001",
        )
        state = self.event(state, "CONFIRM_REVIEW_DELIVERY", "2026-08-31T00:02:00Z")
        return self.event(state, "BEGIN_REASONING_WAIT", "2026-08-31T00:03:00Z")

    def ready(self):
        state = self.waiting()
        self.assertTrue(validate_response_identity(self.directive, state, self.response))
        return self.event(
            state,
            "POLL_READY",
            "2026-08-31T00:04:00Z",
            response=self.response,
        )

    def persisted(self):
        return self.event(
            self.ready(),
            "PERSIST_RESPONSE",
            "2026-08-31T00:05:00Z",
            responseId="response-001",
            responseRef="feedback/full-response.json",
            sha256="b" * 64,
            sizeBytes=12345,
        )

    def imported(self):
        return self.event(
            self.persisted(),
            "IMPORT_RESPONSE",
            "2026-08-31T00:06:00Z",
            importIdempotencyKey="response-001:import-v1",
        )

    def validated(self):
        return self.event(
            self.imported(),
            "VALIDATE_NEXT_DIRECTIVE",
            "2026-08-31T00:07:00Z",
            nextDirectiveId="directive-002",
            nextDirectiveRevision=1,
        )

    def test_01_directive_and_template_require_all_response_identity_fields(self) -> None:
        self.assertTrue(validate_directive(self.directive))
        handling = self.directive["handoffPolicy"]["responseHandling"]
        for field in (
            "requiredRequestIdEcho",
            "requiredTaskIdEcho",
            "requiredOwnerOutcomeEpochEcho",
            "requiredChatEpochEcho",
            "requiredReviewedEvidenceBoundaryEcho",
            "requiredResponseKind",
        ):
            self.assertIs(handling[field], True)
        self.assertEqual(handling["requiredNextDirectiveSchemaVersion"], 2)

    def test_02_duplicate_review_request_is_rejected(self) -> None:
        submitted = self.event(
            self.handoff,
            "SUBMIT_REVIEW_REQUEST",
            "2026-08-31T00:01:00Z",
            requestId="review-001",
        )
        with self.assertRaisesRegex(HandoffValidationError, "DUPLICATE_REASONING_REQUEST"):
            self.event(
                submitted,
                "SUBMIT_REVIEW_REQUEST",
                "2026-08-31T00:01:01Z",
                requestId="review-001",
            )

    def test_03_one_hundred_pending_polls_have_constant_size_projection(self) -> None:
        state = self.waiting()
        projections = []
        for index in range(100):
            state = self.event(
                state,
                "POLL_PENDING",
                f"2026-08-31T00:{3 + index // 60:02d}:{index % 60:02d}Z",
                nextPollAt="2026-08-31T00:09:59Z",
            )
            projections.append(json.dumps(compact_poll_projection(state), sort_keys=True))
        self.assertEqual(len(set(projections)), 1)
        self.assertEqual(json.loads(projections[0])["state"], "PENDING")
        self.assertEqual(state["polling"]["fullConversationPayloadsRetrieved"], 0)
        self.assertEqual(state["polling"]["messagesSentAfterInitialRequest"], 0)

    def test_04_duplicate_ready_is_idempotent_and_conflicting_ready_is_rejected(self) -> None:
        ready = self.ready()
        duplicate = self.event(
            ready,
            "POLL_READY",
            "2026-08-31T00:04:30Z",
            response=self.response,
        )
        self.assertEqual(duplicate, ready)
        conflict = {**self.response, "responseId": "response-other"}
        with self.assertRaises(HandoffValidationError):
            self.event(
                ready,
                "POLL_READY",
                "2026-08-31T00:04:31Z",
                response=conflict,
            )

    def test_05_duplicate_response_persistence_is_idempotent(self) -> None:
        persisted = self.persisted()
        duplicate = self.event(
            persisted,
            "PERSIST_RESPONSE",
            "2026-08-31T00:05:30Z",
            responseId="response-001",
            responseRef="feedback/full-response.json",
            sha256="b" * 64,
            sizeBytes=12345,
        )
        self.assertEqual(duplicate, persisted)
        self.assertEqual(persisted["polling"]["fullConversationPayloadsRetrieved"], 1)

    def test_06_duplicate_import_is_exactly_once(self) -> None:
        imported = self.imported()
        duplicate = self.event(
            imported,
            "IMPORT_RESPONSE",
            "2026-08-31T00:06:30Z",
            importIdempotencyKey="response-001:import-v1",
        )
        self.assertEqual(duplicate, imported)
        with self.assertRaises(HandoffValidationError):
            self.event(
                imported,
                "IMPORT_RESPONSE",
                "2026-08-31T00:06:31Z",
                importIdempotencyKey="response-001:import-v2",
            )

    def test_07_duplicate_directive_application_is_exactly_once(self) -> None:
        validated = self.validated()
        duplicate = self.event(
            validated,
            "VALIDATE_NEXT_DIRECTIVE",
            "2026-08-31T00:07:30Z",
            nextDirectiveId="directive-002",
            nextDirectiveRevision=1,
        )
        self.assertEqual(duplicate, validated)
        with self.assertRaises(HandoffValidationError):
            self.event(
                validated,
                "VALIDATE_NEXT_DIRECTIVE",
                "2026-08-31T00:07:31Z",
                nextDirectiveId="directive-other",
                nextDirectiveRevision=1,
            )

    def test_08_duplicate_execution_resume_is_exactly_once(self) -> None:
        resumed = self.event(
            self.validated(), "RESUME_EXECUTION", "2026-08-31T00:08:00Z"
        )
        duplicate = self.event(
            resumed, "RESUME_EXECUTION", "2026-08-31T00:08:30Z"
        )
        self.assertEqual(duplicate, resumed)
        self.assertEqual(resumed["state"], "EXECUTION_RESUMED")

    def test_09_all_response_identity_mismatches_are_rejected(self) -> None:
        waiting = self.waiting()
        wrong_values = {
            "requestIdEcho": "review-other",
            "taskIdEcho": "task-other",
            "ownerOutcomeEpochEcho": 8,
            "chatEpochEcho": "chat-epoch-other",
            "reviewedEvidenceBoundaryEcho": "git:other",
            "nextDirectiveSchemaVersion": 1,
            "responseKind": "UNRECOGNIZED",
        }
        for field, wrong in wrong_values.items():
            with self.subTest(field=field), self.assertRaises(HandoffValidationError):
                validate_response_identity(
                    self.directive, waiting, {**self.response, field: wrong}
                )

    def test_10_ready_projection_does_not_replay_response_payload(self) -> None:
        ready = self.ready()
        projection = compact_poll_projection(ready)
        self.assertEqual(projection["state"], "READY")
        self.assertEqual(set(projection), {"handoffId", "requestId", "taskId", "state"})
        self.assertNotIn("response", projection)

    def test_11_transport_refetch_before_persistence_is_idempotent(self) -> None:
        ready = self.ready()
        refetched = self.event(
            ready,
            "POLL_READY",
            "2026-08-31T00:04:59Z",
            response=self.response,
        )
        self.assertEqual(refetched, ready)
        self.assertIsNone(refetched["response"]["persistedAt"])
        self.assertEqual(refetched["polling"]["fullConversationPayloadsRetrieved"], 0)

    def test_12_parking_without_accepted_lease_transfer_is_rejected(self) -> None:
        with self.assertRaisesRegex(HandoffValidationError, "EXECUTOR_HANDOFF_DROPPED"):
            self.event(
                self.waiting(),
                "WAIT_HORIZON_EXCEEDED",
                "2026-08-31T00:10:00Z",
            )

    def test_13_wait_horizon_with_transfer_is_nonterminal_handoff_block(self) -> None:
        waiting = self.waiting()
        transferred = self.event(
            waiting,
            "TRANSFER_HANDOFF_LEASE",
            "2026-08-31T00:09:00Z",
            transferredTo="MISSION_CONTROL",
            transferAcceptedAt="2026-08-31T00:09:01Z",
        )
        blocked = self.event(
            transferred,
            "WAIT_HORIZON_EXCEEDED",
            "2026-08-31T00:10:00Z",
        )
        self.assertEqual(blocked["state"], "HANDOFF_BLOCKED")
        self.assertFalse(blocked["taskTerminal"])
        self.assertFalse(blocked["blocker"]["taskTerminal"])

    def test_14_codex_authored_strategy_or_review_question_is_rejected(self) -> None:
        bad_supervisor = copy.deepcopy(self.directive)
        bad_supervisor["reasoningSupervisor"]["surface"] = "CODEX"
        with self.assertRaises(HandoffValidationError):
            validate_directive(bad_supervisor)
        bad_question = copy.deepcopy(self.directive)
        bad_question["handoffPolicy"]["reviewRequestTemplateRef"] = "CODEX-AUTHORED-QUESTION"
        with self.assertRaises(HandoffValidationError):
            validate_directive(bad_question)
        bad_strategy = copy.deepcopy(self.directive)
        bad_strategy["strategy"]["authoredBy"] = "CODEX"
        with self.assertRaises(HandoffValidationError):
            validate_directive(bad_strategy)

    def test_15_observed_somatic_failure_requires_routing_not_rerun(self) -> None:
        given = self.fixture["given"]
        expected = self.fixture["expected"]
        self.assertTrue(given["receipt_created"])
        self.assertFalse(given["receipt_routed"])
        self.assertTrue(given["owner_had_to_ask_why_it_stopped"])
        self.assertEqual(expected["alert"], "EXECUTOR_HANDOFF_DROPPED")
        self.assertFalse(expected["task_terminal"])
        self.assertEqual(
            expected["required_recovery"],
            "ROUTE_EXISTING_RECEIPT_WITHOUT_RESUBMITTING_EXECUTION",
        )
        self.assertFalse(given["completed_experiment_may_be_rerun"])

    def test_16_architecture_conformance_constants_remain_bound(self) -> None:
        receipt_handoff = self.receipt_template["reasoningHandoff"]
        policy = self.directive_template["handoffPolicy"]
        handling = policy["responseHandling"]
        expected = self.fixture["expected"]
        self.assertEqual(receipt_handoff["initialState"], "RECEIPT_PERSISTED")
        self.assertFalse(receipt_handoff["terminal"])
        self.assertEqual(receipt_handoff["nextRequiredState"], "REVIEW_REQUEST_SUBMITTED")
        self.assertEqual(
            policy["requestIdempotency"],
            "ONE_LOGICAL_REQUEST_PER_RECEIPT_AND_REVIEW_BOUNDARY",
        )
        self.assertEqual(policy["polling"]["mode"], "READ_ONLY_COMPACT_STATUS")
        self.assertEqual(
            policy["polling"]["intermediatePayload"],
            "PENDING_OR_READY_WITH_IDENTIFIERS_ONLY",
        )
        self.assertEqual(
            handling["largePayloadPolicy"],
            "PERSIST_OUTSIDE_CONVERSATION_AND_REFERENCE",
        )
        self.assertEqual(
            handling["transportSemantics"],
            "IDEMPOTENT_REFETCH_ALLOWED_BEFORE_PERSISTENCE",
        )
        self.assertEqual(
            handling["processingSemantics"],
            "EXACTLY_ONCE_IMPORT_AND_DIRECTIVE_APPLICATION",
        )
        self.assertEqual(
            policy["onWaitHorizonExceeded"],
            "PERSIST_HANDOFF_BLOCKED_AND_TRANSFER_DURABLE_LEASE",
        )
        self.assertFalse(policy["ownerMayBeUsedAsMessageBus"])
        self.assertIn("OWNER_DECISION_REQUIRED", self.handoff_template["suspendingOrTerminalStates"])
        self.assertIn("HANDOFF_BLOCKED", self.handoff_template["permittedStates"])
        self.assertIn("EXECUTION_RESUMED", self.handoff_template["permittedStates"])
        self.assertEqual(expected["intermediate_full_conversation_turns"], 0)
        self.assertEqual(expected["intermediate_repeated_evidence_packets"], 0)
        self.assertEqual(expected["intermediate_additional_chat_messages"], 0)
        self.assertTrue(expected["transport_refetch_before_persistence_allowed"])
        self.assertTrue(expected["automatic_continuation_required"])
        self.assertEqual(expected["pending_poll_context_growth"], "CONSTANT_SIZE")
        pattern = (
            ROOT / "patterns" / "chat-led-reasoning-codex-execution-separation.md"
        ).read_text()
        self.assertIn("DUPLICATE_REASONING_REQUEST", pattern)

    def test_17_live_implementation_handoff_replays_to_exactly_one_resume(self) -> None:
        handoff_path = (
            ROOT
            / "feedback"
            / "mission-control"
            / "SDF-20260831-EXECUTOR-HANDOFF-LIVENESS-001-IMPLEMENTATION-HANDOFF.json"
        )
        response_path = (
            ROOT
            / "feedback"
            / "mission-control"
            / "SDF-20260831-EXECUTOR-HANDOFF-LIVENESS-001-IMPLEMENTATION-PRO-RESPONSE.json"
        )
        expected = json.loads(handoff_path.read_text())
        persisted = json.loads(response_path.read_text())
        body = base64.b64decode(persisted["bodyBase64"], validate=True)
        self.assertEqual(len(body), persisted["bodySizeBytes"])
        self.assertEqual(hashlib.sha256(body).hexdigest(), persisted["bodySha256"])

        directive = copy.deepcopy(self.directive_template)
        directive.update(
            {
                "directiveId": expected["directiveId"],
                "taskId": expected["taskId"],
            }
        )
        directive["ownerOutcome"]["epoch"] = expected["response"]["ownerOutcomeEpochEcho"]
        directive["reasoningSupervisor"].update(
            {
                "surface": "PRO",
                "chatEpoch": expected["response"]["chatEpochEcho"],
                "reviewedEvidenceBoundary": expected["response"][
                    "reviewedEvidenceBoundaryEcho"
                ],
            }
        )
        handoff = copy.deepcopy(self.handoff_template)
        for field in ("handoffId", "taskId", "runId", "directiveId", "receiptId"):
            handoff[field] = expected[field]
        handoff["lease"] = copy.deepcopy(expected["lease"])
        handoff["reviewRequest"].update(
            {
                key: expected["reviewRequest"][key]
                for key in (
                    "requestId",
                    "idempotencyKey",
                    "targetSurface",
                    "targetSessionId",
                    "targetChatEpoch",
                    "packetRef",
                    "packetSha256",
                )
            }
        )
        response = {
            key: expected["response"][key]
            for key in (
                "responseId",
                "responseKind",
                "requestIdEcho",
                "taskIdEcho",
                "ownerOutcomeEpochEcho",
                "chatEpochEcho",
                "reviewedEvidenceBoundaryEcho",
                "nextDirectiveSchemaVersion",
            )
        }
        self.assertTrue(validate_response_identity(directive, handoff, response))
        handoff = self.event(
            handoff,
            "SUBMIT_REVIEW_REQUEST",
            expected["events"][0]["at"],
            requestId=expected["reviewRequest"]["requestId"],
        )
        handoff = self.event(
            handoff, "CONFIRM_REVIEW_DELIVERY", expected["events"][1]["at"]
        )
        handoff = self.event(
            handoff, "BEGIN_REASONING_WAIT", expected["events"][2]["at"]
        )
        handoff = self.event(
            handoff, "POLL_READY", expected["events"][3]["at"], response=response
        )
        handoff = self.event(
            handoff,
            "PERSIST_RESPONSE",
            expected["events"][4]["at"],
            responseId=expected["response"]["responseId"],
            responseRef=expected["response"]["responseRef"],
            sha256=expected["response"]["sha256"],
            sizeBytes=expected["response"]["sizeBytes"],
        )
        handoff = self.event(
            handoff,
            "IMPORT_RESPONSE",
            expected["events"][5]["at"],
            importIdempotencyKey=expected["response"]["importIdempotencyKey"],
        )
        handoff = self.event(
            handoff,
            "VALIDATE_NEXT_DIRECTIVE",
            expected["events"][6]["at"],
            nextDirectiveId=expected["continuation"]["nextDirectiveId"],
            nextDirectiveRevision=expected["continuation"]["nextDirectiveRevision"],
        )
        handoff = self.event(
            handoff, "RESUME_EXECUTION", expected["events"][7]["at"]
        )
        self.assertEqual(handoff["state"], expected["state"])
        self.assertEqual(handoff["lease"]["owner"], "CODEX_CONTROLLER")
        self.assertEqual(len(handoff["events"]), 8)
        self.assertEqual(expected["importCount"], 1)
        self.assertEqual(expected["directiveApplicationCount"], 1)
        self.assertEqual(expected["executionResumeCount"], 1)


if __name__ == "__main__":
    unittest.main()
