from __future__ import annotations

import copy
import json
import unittest
from pathlib import Path

from scripts.active_task_authority import (
    evaluate_blocker_applicability,
    evaluate_fixture,
    project_task_blockers,
    resolve_active_task_authority,
    validate_wait_admission,
)
from scripts.executor_handoff_state import HandoffValidationError, validate_directive


ROOT = Path(__file__).resolve().parents[1]


class ActiveTaskAuthorityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.fixture = json.loads(
            (
                ROOT
                / "evals"
                / "mission-control"
                / "innersignal-commons-stale-global-blocker.json"
            ).read_text(encoding="utf-8")
        )

    def setUp(self) -> None:
        self.active = copy.deepcopy(self.fixture["activeTask"])
        self.task_state = copy.deepcopy(self.fixture["taskLocalState"])
        self.global_state = copy.deepcopy(self.fixture["repositoryGlobalState"])
        self.unrelated = copy.deepcopy(self.fixture["blockers"][0])

    def applicable_blocker(
        self,
        *,
        blocker_id: str = "current-task-capability",
        scope_type: str = "TASK",
        operation: str = "REASONING_REVIEW",
        capability: str = "privacy-security-product-review",
        policy_class: str = "OPERATIONAL",
    ) -> dict:
        blocker = copy.deepcopy(self.unrelated)
        blocker.update(
            {
                "blockerId": blocker_id,
                "status": "UNRESOLVED",
                "inheritanceAttempted": False,
            }
        )
        blocker["scope"] = {
            "type": scope_type,
            "id": self.active["taskId"],
            "repositoryWidePolicy": policy_class != "OPERATIONAL",
        }
        blocker["policy"] = {
            "class": policy_class,
            "nonWaivable": policy_class != "OPERATIONAL",
        }
        blocker["source"].update(
            {
                "ref": f"state/blockers/{blocker_id}.json",
                "taskId": self.active["taskId"],
                "observedAt": "2026-08-31T09:01:00Z",
                "freshnessState": "CURRENT",
            }
        )
        blocker["blockingCondition"].update(
            {"capabilityId": capability, "operation": operation}
        )
        blocker["appliesTo"] = {
            "taskIds": [self.active["taskId"]],
            "strategyFamilyIds": [],
            "directiveIds": [],
            "operations": [operation],
        }
        blocker["causalDependency"] = {
            "requiredByTaskIds": [self.active["taskId"]],
            "requiredCapabilityId": capability,
            "requiredOperation": operation,
            "evidenceRefs": [f"state/blockers/{blocker_id}.json"],
        }
        blocker["unblockEvent"].update(
            {
                "identity": blocker_id,
                "expectedState": "COMPLETE",
                "actorOrMechanism": "EXACT_EXTERNAL_ACTOR",
            }
        )
        blocker["ownerAction"] = {
            "required": False,
            "decisionId": None,
            "action": "NONE",
        }
        blocker["unrelatedWorkAllowed"] = True
        self.active["authorityResolution"]["independentOfBlockerIds"] = []
        return blocker

    def admitted_wait(self, blocker: dict) -> dict:
        wait = copy.deepcopy(self.fixture["proposedWait"])
        wait.update(
            {
                "waitId": f"wait-{blocker['blockerId']}",
                "blockingBlockerId": blocker["blockerId"],
                "causalDependency": blocker["causalDependency"][
                    "requiredCapabilityId"
                ],
                "sourceObservedAt": "2026-08-31T09:02:00Z",
                "waitStartedAt": "2026-08-31T09:02:30Z",
                "pollingNeeded": False,
                "nextCheckAt": "2026-08-31T09:03:00Z",
                "ownerActionRequired": blocker["ownerAction"]["required"],
                "ownerDecisionId": blocker["ownerAction"].get("decisionId"),
                "ownerAction": blocker["ownerAction"]["action"],
            }
        )
        wait["conditionExpectedToChange"] = {
            "kind": blocker["unblockEvent"]["kind"],
            "identity": blocker["unblockEvent"]["identity"],
            "currentState": "PENDING",
            "expectedState": blocker["unblockEvent"]["expectedState"],
            "sourceRef": blocker["unblockEvent"]["sourceRef"],
            "actorOrMechanism": blocker["unblockEvent"]["actorOrMechanism"],
            "requiredCapabilityOrOperation": blocker["causalDependency"][
                "requiredCapabilityId"
            ],
        }
        wait["pollOrNotificationMechanism"] = {
            "mode": "NOTIFICATION",
            "identity": f"notification-{blocker['blockerId']}",
        }
        return wait

    def valid_directive(self) -> dict:
        directive = json.loads(
            (ROOT / "templates" / "CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json").read_text(
                encoding="utf-8"
            )
        )
        directive["allowed"]["actions"] = ["APPLY_BOUNDED_CODE_CHANGE"]
        directive["authorityContext"].update(
            {
                "taskLocalCheckpointGitRef": self.active["taskLocalCheckpoint"][
                    "gitRef"
                ],
                "taskLocalCheckpointGitObjectId": self.active[
                    "taskLocalCheckpoint"
                ]["gitObjectId"],
                "taskLocalCheckpointContentSha256": self.active[
                    "taskLocalCheckpoint"
                ]["contentSha256"],
                "currentOwnerSourceRecordId": self.active["ownerSource"][
                    "currentAuthorityProjection"
                ]["sourceRecordId"],
                "currentOwnerSourceReceiptId": self.active["ownerSource"][
                    "currentAuthorityProjection"
                ]["independentReceiptId"],
                "authorityResolutionStatus": "VALID",
                "selectedExecutionSource": "TASK_LOCAL_CHECKPOINT",
                "substantiveExecutionAuthorized": True,
                "reasoningReviewRequired": False,
                "frontierAuthorization": "AUTHORIZED",
                "affectedOperation": "LOCAL_DEVELOPMENT",
                "currentBlockerIds": [],
                "blockedCapabilityIds": [],
                "blockingBlockerIds": [],
                "revalidationRequiredBlockerIds": [],
                "ambiguousBlockerIds": [],
                "waitAdmissionId": None,
                "waitAdmissionState": "NOT_REQUIRED",
            }
        )
        return directive

    def reasoning_wait_and_handoff(self) -> tuple[dict, dict]:
        handoff = json.loads(
            (ROOT / "templates" / "EXECUTOR-REASONING-HANDOFF.json").read_text(
                encoding="utf-8"
            )
        )
        handoff.update(
            {
                "handoffId": "handoff-active-task-review",
                "taskId": self.active["taskId"],
                "state": "WAITING_FOR_REASONING_REVIEW",
                "taskTerminal": False,
                "ownerActionRequired": False,
            }
        )
        handoff["reviewRequest"].update(
            {
                "requestId": "reasoning-request-active-task-review",
                "targetSurface": "PRO",
                "submittedAt": "2026-08-31T09:01:00Z",
                "deliveryConfirmedAt": "2026-08-31T09:01:30Z",
            }
        )
        handoff["lease"].update(
            {
                "owner": "CODEX_CONTROLLER",
                "acquiredAt": "2026-08-31T09:00:00Z",
                "expiresAt": "2026-08-31T10:00:00Z",
            }
        )
        wait = copy.deepcopy(self.fixture["proposedWait"])
        wait.update(
            {
                "waitId": "wait-reasoning-request-active-task-review",
                "blockingBlockerId": None,
                "reasoningRequestId": "reasoning-request-active-task-review",
                "causalDependency": "reasoning-review",
                "sourceObservedAt": "2026-08-31T09:02:00Z",
                "waitStartedAt": "2026-08-31T09:02:30Z",
                "nextCheckAt": "2026-08-31T09:03:00Z",
                "ownerActionRequired": False,
                "ownerDecisionId": None,
                "ownerAction": "NONE",
            }
        )
        wait["conditionExpectedToChange"] = {
            "kind": "REASONING_RESPONSE",
            "identity": "reasoning-request-active-task-review",
            "currentState": "PENDING",
            "expectedState": "READY",
            "sourceRef": "handoff-active-task-review",
            "actorOrMechanism": "PRO",
            "requiredCapabilityOrOperation": "reasoning-review",
        }
        return wait, handoff

    def test_01_exact_innersignal_regression_rejects_stale_global_wait(self) -> None:
        result = evaluate_fixture(copy.deepcopy(self.fixture))
        expected = self.fixture["expected"]
        resolution = result["resolution"]
        projection = result["projection"]
        self.assertEqual(
            resolution["authorityResolutionStatus"],
            expected["authorityResolutionStatus"],
        )
        self.assertEqual(
            resolution["globalStateRelation"], expected["globalStateRelation"]
        )
        self.assertEqual(
            resolution["repositoryGlobalSourceDisposition"],
            expected["repositoryGlobalSourceDisposition"],
        )
        self.assertEqual(
            resolution["blockerResults"][0]["applicability"],
            expected["blockerApplicability"],
        )
        self.assertEqual(
            resolution["activeTaskExecutionState"],
            expected["activeTaskExecutionState"],
        )
        self.assertFalse(projection["waiting"])
        self.assertEqual(projection["ownerAction"], "NONE")
        self.assertTrue(projection["unrelatedWorkAllowed"])
        self.assertEqual(projection["requiredAction"], expected["requiredAction"])
        self.assertEqual(
            projection["frontierAuthorization"],
            expected["frontierAuthorization"],
        )
        self.assertEqual(
            projection["substantiveExecutionAuthorized"],
            expected["substantiveExecutionAuthorized"],
        )
        alerts = set(projection["alerts"] + projection["waitAdmission"]["findings"])
        self.assertTrue(set(expected["requiredAlerts"]).issubset(alerts))

    def test_02_unrelated_historical_global_blocker_is_not_applicable(self) -> None:
        result = evaluate_blocker_applicability(self.active, self.unrelated)
        self.assertEqual(result["applicability"], "NOT_APPLICABLE")
        self.assertEqual(result["globalStateRelation"], "STALE_AND_UNRELATED")

    def test_03_file_read_order_cannot_change_authority_precedence(self) -> None:
        first = resolve_active_task_authority(
            self.active, self.task_state, self.global_state, [self.unrelated]
        )
        self.task_state["sourceReadOrder"] = 2
        self.global_state["sourceReadOrder"] = 1
        second = resolve_active_task_authority(
            self.active, self.task_state, self.global_state, [self.unrelated]
        )
        self.assertEqual(first, second)
        self.assertFalse(second["inputReadOrderAuthoritative"])

    def test_04_task_local_state_wins_without_weakening_security_policy(self) -> None:
        security = self.applicable_blocker(
            blocker_id="repository-security-freeze",
            scope_type="SECURITY_POLICY",
            operation="WRITE",
            capability="repository-write",
            policy_class="SECURITY",
        )
        security["appliesTo"]["taskIds"] = ["*"]
        security["causalDependency"]["requiredByTaskIds"] = ["*"]
        self.active["executionFrontier"].update(
            {"operation": "WRITE", "requiredCapabilityIds": ["repository-write"]}
        )
        resolution = resolve_active_task_authority(
            self.active,
            self.task_state,
            self.global_state,
            [self.unrelated, security],
        )
        self.assertIn("repository-security-freeze", resolution["activeBlockerIds"])
        self.assertEqual(resolution["globalStateRelation"], "CURRENT_AND_APPLICABLE")

    def test_05_explicit_current_dependency_edge_makes_blocker_applicable(self) -> None:
        blocker = self.applicable_blocker()
        result = evaluate_blocker_applicability(self.active, blocker)
        self.assertEqual(result["applicability"], "APPLICABLE")

    def test_06_removing_dependency_makes_blocker_inapplicable(self) -> None:
        blocker = self.applicable_blocker()
        blocker["causalDependency"]["requiredByTaskIds"] = []
        result = evaluate_blocker_applicability(self.active, blocker)
        self.assertEqual(result["applicability"], "NOT_APPLICABLE")
        self.assertIn("BLOCKER_CAUSAL_DEPENDENCY_MISSING", result["alerts"])

    def test_07_stale_applicable_blocker_requires_revalidation_not_wait(self) -> None:
        blocker = self.applicable_blocker()
        blocker["source"]["freshnessState"] = "STALE"
        result = evaluate_blocker_applicability(self.active, blocker)
        self.assertEqual(result["applicability"], "REVALIDATION_REQUIRED")
        self.assertEqual(
            result["globalStateRelation"],
            "STALE_BUT_APPLICABLE_REVALIDATION_REQUIRED",
        )

    def test_08_wait_without_exact_condition_fails_admission(self) -> None:
        blocker = self.applicable_blocker()
        result = evaluate_blocker_applicability(self.active, blocker)
        wait = self.admitted_wait(blocker)
        wait["conditionExpectedToChange"]["identity"] = ""
        admission = validate_wait_admission(wait, self.active, result, blocker)
        self.assertFalse(admission["admitted"])
        self.assertIn("WAIT_CONDITION_IDENTITY_REQUIRED", admission["findings"])

    def test_09_issue_wait_with_no_actor_is_not_actionable(self) -> None:
        blocker = self.applicable_blocker()
        result = evaluate_blocker_applicability(self.active, blocker)
        wait = self.admitted_wait(blocker)
        wait["conditionExpectedToChange"]["actorOrMechanism"] = "NONE"
        admission = validate_wait_admission(wait, self.active, result, blocker)
        self.assertFalse(admission["admitted"])
        self.assertIn("WAIT_CONDITION_NOT_ACTIONABLE", admission["findings"])

    def test_10_ci_wait_requires_exact_check_identity_and_dependency(self) -> None:
        blocker = self.applicable_blocker(
            blocker_id="required-ci-check",
            operation="CI_CHECK",
            capability="ci:workflow-policy:job-123",
        )
        self.active["executionFrontier"].update(
            {
                "operation": "CI_CHECK",
                "requiredCapabilityIds": ["ci:workflow-policy:job-123"],
            }
        )
        result = evaluate_blocker_applicability(self.active, blocker)
        admission = validate_wait_admission(
            self.admitted_wait(blocker), self.active, result, blocker
        )
        self.assertTrue(admission["admitted"])

    def test_11_completed_ci_invalidates_associated_wait(self) -> None:
        blocker = self.applicable_blocker(
            blocker_id="required-ci-check",
            operation="CI_CHECK",
            capability="ci:workflow-policy:job-123",
        )
        self.active["executionFrontier"].update(
            {
                "operation": "CI_CHECK",
                "requiredCapabilityIds": ["ci:workflow-policy:job-123"],
            }
        )
        result = evaluate_blocker_applicability(self.active, blocker)
        wait = self.admitted_wait(blocker)
        wait["conditionExpectedToChange"]["currentState"] = "COMPLETE"
        admission = validate_wait_admission(wait, self.active, result, blocker)
        self.assertFalse(admission["admitted"])
        self.assertIn("WAIT_CONDITION_ALREADY_SATISFIED", admission["findings"])

    def test_12_owner_decision_wait_has_exact_decision_and_action(self) -> None:
        blocker = self.applicable_blocker(
            blocker_id="owner-decision-privacy-boundary",
            scope_type="OWNER_DECISION",
            operation="OWNER_DECISION",
            capability="owner-decision:privacy-boundary",
        )
        blocker["ownerAction"] = {
            "required": True,
            "decisionId": "owner-decision-privacy-boundary",
            "action": "DECIDE_PRIVACY_BOUNDARY",
        }
        blocker["unblockEvent"]["actorOrMechanism"] = "OWNER"
        self.active["executionFrontier"].update(
            {
                "operation": "OWNER_DECISION",
                "requiredCapabilityIds": ["owner-decision:privacy-boundary"],
            }
        )
        result = evaluate_blocker_applicability(self.active, blocker)
        wait = self.admitted_wait(blocker)
        wait["ownerActionRequired"] = True
        admission = validate_wait_admission(wait, self.active, result, blocker)
        self.assertTrue(admission["admitted"])

    def test_13_unneeded_credential_does_not_block_active_task(self) -> None:
        blocker = self.applicable_blocker(
            blocker_id="credential-unavailable",
            operation="DEPLOY",
            capability="production-credential",
        )
        result = evaluate_blocker_applicability(self.active, blocker)
        self.assertEqual(result["applicability"], "NOT_APPLICABLE")

    def test_14_release_blocker_does_not_block_development(self) -> None:
        blocker = self.applicable_blocker(
            blocker_id="release-only",
            scope_type="RELEASE",
            operation="RELEASE",
            capability="release-approval",
        )
        result = evaluate_blocker_applicability(self.active, blocker)
        self.assertEqual(result["applicability"], "NOT_APPLICABLE")

    def test_15_publication_blocker_does_not_block_local_work(self) -> None:
        blocker = self.applicable_blocker(
            blocker_id="publication-permission",
            operation="PUBLICATION",
            capability="publication-permission",
            policy_class="PUBLICATION",
        )
        result = evaluate_blocker_applicability(self.active, blocker)
        self.assertEqual(result["applicability"], "NOT_APPLICABLE")

    def test_16_repository_security_freeze_propagates_to_write(self) -> None:
        blocker = self.applicable_blocker(
            blocker_id="credential-leak-freeze",
            scope_type="SECURITY_POLICY",
            operation="WRITE",
            capability="repository-write",
            policy_class="SECURITY",
        )
        blocker["appliesTo"]["taskIds"] = ["*"]
        blocker["causalDependency"]["requiredByTaskIds"] = ["*"]
        self.active["executionFrontier"].update(
            {"operation": "WRITE", "requiredCapabilityIds": ["repository-write"]}
        )
        result = evaluate_blocker_applicability(self.active, blocker)
        self.assertEqual(result["applicability"], "APPLICABLE")

    def test_17_superseded_blocker_never_propagates(self) -> None:
        blocker = self.applicable_blocker()
        blocker["status"] = "SUPERSEDED"
        result = evaluate_blocker_applicability(self.active, blocker)
        self.assertEqual(result["applicability"], "NOT_APPLICABLE")

    def test_18_projection_exposes_ignored_blocker_instead_of_hiding_it(self) -> None:
        projection = project_task_blockers(
            self.active,
            self.task_state,
            self.global_state,
            [self.unrelated],
        )
        self.assertEqual(projection["activeBlockers"], [])
        self.assertEqual(
            projection["ignoredOrUnrelatedBlockers"][0]["blockerId"],
            self.unrelated["blockerId"],
        )
        self.assertEqual(projection["activeTaskExecutionState"], "REASONING_REVIEW_DUE")

    def test_19_cross_task_inheritance_attempt_raises_alert(self) -> None:
        result = evaluate_blocker_applicability(self.active, self.unrelated)
        self.assertIn("CROSS_TASK_BLOCKER_LEAKAGE", result["alerts"])

    def test_20_unbounded_wait_for_github_update_is_rejected(self) -> None:
        result = evaluate_blocker_applicability(self.active, self.unrelated)
        wait = copy.deepcopy(self.fixture["proposedWait"])
        wait["maximumWaitHorizonSeconds"] = 0
        admission = validate_wait_admission(wait, self.active, result, self.unrelated)
        self.assertFalse(admission["admitted"])
        self.assertIn("WAIT_WITHOUT_ADMISSION", admission["findings"])
        self.assertIn("WAIT_MAXIMUM_HORIZON_INVALID", admission["findings"])
        self.assertIn(
            "GITHUB_UPDATE_WAIT_WITHOUT_CAUSAL_DEPENDENCY",
            admission["findings"],
        )

    def test_21_wrong_branch_fails_active_task_authority(self) -> None:
        self.task_state["branch"] = "stable"
        result = resolve_active_task_authority(
            self.active, self.task_state, self.global_state, [self.unrelated]
        )
        self.assertEqual(result["authorityResolutionStatus"], "INVALID")
        self.assertIn("ACTIVE_TASK_BRANCH_MISMATCH", result["findings"])

    def test_22_current_unrelated_blocker_remains_nonblocking(self) -> None:
        self.unrelated["source"]["freshnessState"] = "CURRENT"
        result = evaluate_blocker_applicability(self.active, self.unrelated)
        self.assertEqual(result["applicability"], "NOT_APPLICABLE")
        self.assertEqual(result["globalStateRelation"], "CURRENT_BUT_UNRELATED")

    def test_23_directive_binds_current_blockers_and_wait_identity(self) -> None:
        directive = json.loads(
            (ROOT / "templates" / "CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json").read_text(
                encoding="utf-8"
            )
        )
        with self.assertRaises(HandoffValidationError):
            validate_directive(directive)
        completed = self.valid_directive()
        self.assertTrue(validate_directive(completed))
        authority = directive["authorityContext"]
        self.assertIn("currentBlockerIds", authority)
        self.assertIn("waitAdmissionId", authority)
        self.assertIn("frontierAuthorization", authority)

    def test_24_templates_and_routes_are_machine_readable(self) -> None:
        scoped = json.loads(
            (ROOT / "templates" / "SCOPED-BLOCKER.json").read_text(encoding="utf-8")
        )
        wait = json.loads(
            (ROOT / "templates" / "WAIT-ADMISSION.json").read_text(encoding="utf-8")
        )
        active = json.loads(
            (ROOT / "templates" / "ACTIVE-TASK.json").read_text(encoding="utf-8")
        )
        self.assertIn("causalDependency", scoped)
        self.assertIn("policy", scoped)
        self.assertIn("conditionExpectedToChange", wait)
        self.assertIn("waitStartedAt", wait)
        self.assertIn("authorityResolution", active)
        self.assertIn("executionFrontier", active)
        self.assertIn("contentSha256", active["taskLocalCheckpoint"])
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        docs = (ROOT / "docs" / "INDEX.md").read_text(encoding="utf-8")
        for text in (index, docs):
            self.assertIn("SCOPED-BLOCKER.json", text)
            self.assertIn("WAIT-ADMISSION.json", text)

    def test_25_task_independence_cannot_bypass_repository_security(self) -> None:
        blocker = self.applicable_blocker(
            blocker_id="repository-security-freeze",
            scope_type="SECURITY_POLICY",
            operation="WRITE",
            capability="repository-write",
            policy_class="SECURITY",
        )
        blocker["appliesTo"]["taskIds"] = ["*"]
        blocker["causalDependency"]["requiredByTaskIds"] = ["*"]
        self.active["authorityResolution"]["independentOfBlockerIds"] = [
            blocker["blockerId"]
        ]
        self.active["executionFrontier"].update(
            {"operation": "WRITE", "requiredCapabilityIds": ["repository-write"]}
        )
        result = evaluate_blocker_applicability(self.active, blocker)
        self.assertEqual(result["applicability"], "APPLICABLE")
        self.assertIn("INVALID_TASK_INDEPENDENCE_OVERRIDE", result["alerts"])
        projection = project_task_blockers(
            self.active, self.task_state, self.global_state, [blocker]
        )
        self.assertEqual(
            projection["frontierAuthorization"],
            "BLOCKED_BY_APPLICABLE_BLOCKER",
        )
        self.assertFalse(projection["substantiveExecutionAuthorized"])

    def test_26_unresolved_substantive_directive_is_rejected(self) -> None:
        directive = self.valid_directive()
        directive["authorityContext"]["authorityResolutionStatus"] = "UNRESOLVED"
        with self.assertRaises(HandoffValidationError):
            validate_directive(directive)

    def test_27_ambiguous_substantive_directive_routes_to_reasoning(self) -> None:
        directive = self.valid_directive()
        directive["authorityContext"].update(
            {
                "authorityResolutionStatus": "AMBIGUOUS",
                "selectedExecutionSource": "NONE",
                "substantiveExecutionAuthorized": False,
                "reasoningReviewRequired": True,
                "frontierAuthorization": "REASONING_REVIEW_REQUIRED",
                "ambiguousBlockerIds": ["ambiguous-blocker"],
            }
        )
        with self.assertRaises(HandoffValidationError):
            validate_directive(directive)

    def test_28_invalid_substantive_directive_is_rejected(self) -> None:
        directive = self.valid_directive()
        directive["authorityContext"].update(
            {
                "authorityResolutionStatus": "INVALID",
                "selectedExecutionSource": "NONE",
                "substantiveExecutionAuthorized": False,
                "reasoningReviewRequired": True,
                "frontierAuthorization": "INVALID_AUTHORITY",
            }
        )
        with self.assertRaises(HandoffValidationError):
            validate_directive(directive)

    def test_29_ambiguous_authority_allows_only_narrow_preservation(self) -> None:
        directive = self.valid_directive()
        directive["actionClass"] = "EVIDENCE_PRESERVATION"
        directive["allowed"]["actions"] = ["PRESERVE_EVIDENCE"]
        directive["authorityContext"].update(
            {
                "authorityResolutionStatus": "AMBIGUOUS",
                "selectedExecutionSource": "NONE",
                "substantiveExecutionAuthorized": False,
                "reasoningReviewRequired": True,
                "frontierAuthorization": "REASONING_REVIEW_REQUIRED",
            }
        )
        self.assertTrue(validate_directive(directive))
        directive["allowed"]["actions"] = ["APPLY_BOUNDED_CODE_CHANGE"]
        with self.assertRaises(HandoffValidationError):
            validate_directive(directive)

    def test_30_newer_owner_stop_overrides_task_continuation(self) -> None:
        owner_stop = copy.deepcopy(
            self.active["ownerSource"]["currentAuthorityProjection"]
        )
        owner_stop.update(
            {
                "sourceRecordId": "owner-correction-stop-pr15",
                "sourceKind": "OWNER_CORRECTION",
                "relation": "AMENDS",
                "instructionClass": "OWNER_STOP",
                "capturedAt": "2026-08-31T09:05:00Z",
                "sha256": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
                "effectiveEpoch": 2,
            }
        )
        result = resolve_active_task_authority(
            self.active,
            self.task_state,
            self.global_state,
            [self.unrelated],
            owner_stop,
        )
        self.assertEqual(result["authorityResolutionStatus"], "INVALID")
        self.assertEqual(result["selectedExecutionSource"], "NONE")
        self.assertFalse(result["substantiveExecutionAuthorized"])
        self.assertIn("CURRENT_OWNER_STOP", result["findings"])

    def test_31_substituted_checkpoint_hash_is_rejected(self) -> None:
        self.task_state["checkpointIdentity"]["contentSha256"] = "f" * 64
        result = resolve_active_task_authority(
            self.active, self.task_state, self.global_state, [self.unrelated]
        )
        self.assertEqual(result["authorityResolutionStatus"], "INVALID")
        self.assertEqual(result["selectedExecutionSource"], "NONE")
        self.assertIn(
            "TASK_LOCAL_CHECKPOINT_CONTENT_SHA256_MISMATCH",
            result["findings"],
        )

    def test_32_applicable_blocker_blocks_affected_frontier(self) -> None:
        blocker = self.applicable_blocker()
        projection = project_task_blockers(
            self.active, self.task_state, self.global_state, [blocker]
        )
        self.assertEqual(
            projection["frontierAuthorization"],
            "BLOCKED_BY_APPLICABLE_BLOCKER",
        )
        self.assertIn(blocker["blockerId"], projection["blockingBlockerIds"])

    def test_33_stale_applicable_blocker_requires_frontier_revalidation(self) -> None:
        blocker = self.applicable_blocker()
        blocker["source"]["freshnessState"] = "STALE"
        projection = project_task_blockers(
            self.active, self.task_state, self.global_state, [blocker]
        )
        self.assertEqual(
            projection["frontierAuthorization"],
            "BLOCKER_REVALIDATION_REQUIRED",
        )
        self.assertFalse(projection["substantiveExecutionAuthorized"])

    def test_34_wait_must_exactly_match_blocker_unblock_event(self) -> None:
        blocker = self.applicable_blocker()
        result = evaluate_blocker_applicability(self.active, blocker)
        mutations = {
            "identity": "different-identity",
            "sourceRef": "different-source",
            "expectedState": "different-state",
            "actorOrMechanism": "different-actor",
        }
        for field, value in mutations.items():
            with self.subTest(field=field):
                wait = self.admitted_wait(blocker)
                wait["conditionExpectedToChange"][field] = value
                admission = validate_wait_admission(
                    wait, self.active, result, blocker
                )
                self.assertFalse(admission["admitted"])
                self.assertTrue(
                    any(
                        finding.startswith(f"WAIT_CONDITION_{field.upper()}")
                        for finding in admission["findings"]
                    )
                )

    def test_35_owner_wait_requires_exact_decision_id_and_action(self) -> None:
        blocker = self.applicable_blocker(
            blocker_id="owner-decision-required",
            scope_type="OWNER_DECISION",
            operation="OWNER_DECISION",
            capability="owner-decision:policy",
        )
        blocker["ownerAction"] = {
            "required": True,
            "decisionId": "owner-decision-policy-001",
            "action": "DECIDE_POLICY",
        }
        self.active["executionFrontier"].update(
            {
                "operation": "OWNER_DECISION",
                "requiredCapabilityIds": ["owner-decision:policy"],
            }
        )
        result = evaluate_blocker_applicability(self.active, blocker)
        wait = self.admitted_wait(blocker)
        wait["ownerDecisionId"] = None
        wait["ownerAction"] = "NONE"
        admission = validate_wait_admission(wait, self.active, result, blocker)
        self.assertFalse(admission["admitted"])
        self.assertIn("WAIT_OWNER_DECISION_ID_MISMATCH", admission["findings"])
        self.assertIn("WAIT_OWNER_ACTION_MISMATCH", admission["findings"])

    def test_36_reasoning_wait_requires_matching_live_handoff(self) -> None:
        wait, handoff = self.reasoning_wait_and_handoff()
        missing = validate_wait_admission(wait, self.active, None)
        self.assertFalse(missing["admitted"])
        self.assertIn("WAIT_REASONING_HANDOFF_MISSING", missing["findings"])
        admitted = validate_wait_admission(
            wait, self.active, None, None, handoff
        )
        self.assertTrue(admitted["admitted"], admitted["findings"])

    def test_37_next_check_must_follow_start_and_stay_inside_horizon(self) -> None:
        blocker = self.applicable_blocker()
        result = evaluate_blocker_applicability(self.active, blocker)
        before = self.admitted_wait(blocker)
        before["nextCheckAt"] = before["waitStartedAt"]
        admission = validate_wait_admission(before, self.active, result, blocker)
        self.assertIn("WAIT_NEXT_CHECK_NOT_AFTER_START", admission["findings"])
        outside = self.admitted_wait(blocker)
        outside["nextCheckAt"] = "2026-08-31T12:00:00Z"
        admission = validate_wait_admission(outside, self.active, result, blocker)
        self.assertIn("WAIT_NEXT_CHECK_OUTSIDE_HORIZON", admission["findings"])

    def test_38_terminal_or_unknown_horizon_state_is_rejected(self) -> None:
        blocker = self.applicable_blocker()
        result = evaluate_blocker_applicability(self.active, blocker)
        for state in ("COMPLETE", "UNKNOWN_STATE"):
            with self.subTest(state=state):
                wait = self.admitted_wait(blocker)
                wait["stateIfHorizonExpires"] = state
                wait["allowedStatesIfHorizonExpires"].append(state)
                admission = validate_wait_admission(
                    wait, self.active, result, blocker
                )
                self.assertIn(
                    "WAIT_HORIZON_EXPIRY_STATE_INVALID", admission["findings"]
                )

    def test_39_unrelated_operational_blocker_remains_suspended(self) -> None:
        projection = project_task_blockers(
            self.active,
            self.task_state,
            self.global_state,
            [self.unrelated],
        )
        ignored = projection["ignoredOrUnrelatedBlockers"][0]
        self.assertEqual(ignored["sourceDisposition"], "SUSPENDED_COMPETING_SOURCE")
        self.assertEqual(projection["frontierAuthorization"], "AUTHORIZED")

    def test_40_repository_policy_without_causal_relation_does_not_block(self) -> None:
        blocker = self.applicable_blocker(
            blocker_id="repository-security-unrelated-operation",
            scope_type="SECURITY_POLICY",
            operation="WRITE",
            capability="repository-write",
            policy_class="SECURITY",
        )
        blocker["appliesTo"]["taskIds"] = ["*"]
        blocker["causalDependency"]["requiredByTaskIds"] = ["*"]
        result = evaluate_blocker_applicability(self.active, blocker)
        self.assertEqual(result["applicability"], "NOT_APPLICABLE")
        self.assertIn("BLOCKER_CAUSAL_DEPENDENCY_MISSING", result["alerts"])

    def test_41_current_owner_source_requires_independent_match_receipt(self) -> None:
        self.active["ownerSource"]["currentAuthorityProjection"][
            "independentReceiptStatus"
        ] = "SOURCE_UNAVAILABLE"
        result = resolve_active_task_authority(
            self.active, self.task_state, self.global_state, [self.unrelated]
        )
        self.assertEqual(result["authorityResolutionStatus"], "INVALID")
        self.assertIn(
            "CURRENT_OWNER_SOURCE_RECEIPT_NOT_MATCHED", result["findings"]
        )


if __name__ == "__main__":
    unittest.main()
