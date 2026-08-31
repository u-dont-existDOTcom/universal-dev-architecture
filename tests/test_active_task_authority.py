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
from scripts.executor_handoff_state import validate_directive


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
            "repositoryWidePolicy": scope_type == "SECURITY_POLICY",
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
        blocker["ownerAction"] = {"required": False, "action": "NONE"}
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
                "pollingNeeded": False,
                "nextCheckAt": None,
            }
        )
        wait["conditionExpectedToChange"] = {
            "kind": "EXACT_EXTERNAL_STATE",
            "identity": blocker["unblockEvent"]["identity"],
            "currentState": "PENDING",
            "expectedState": blocker["unblockEvent"]["expectedState"],
            "sourceRef": blocker["unblockEvent"]["sourceRef"],
            "actorOrMechanism": blocker["unblockEvent"]["actorOrMechanism"],
        }
        wait["pollOrNotificationMechanism"] = {
            "mode": "NOTIFICATION",
            "identity": f"notification-{blocker['blockerId']}",
        }
        return wait

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
        admission = validate_wait_admission(wait, self.active, result)
        self.assertFalse(admission["admitted"])
        self.assertIn("WAIT_CONDITION_IDENTITY_REQUIRED", admission["findings"])

    def test_09_issue_wait_with_no_actor_is_not_actionable(self) -> None:
        blocker = self.applicable_blocker()
        result = evaluate_blocker_applicability(self.active, blocker)
        wait = self.admitted_wait(blocker)
        wait["conditionExpectedToChange"]["actorOrMechanism"] = "NONE"
        admission = validate_wait_admission(wait, self.active, result)
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
            self.admitted_wait(blocker), self.active, result
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
        admission = validate_wait_admission(wait, self.active, result)
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
        admission = validate_wait_admission(wait, self.active, result)
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
        )
        result = evaluate_blocker_applicability(self.active, blocker)
        self.assertEqual(result["applicability"], "NOT_APPLICABLE")

    def test_16_repository_security_freeze_propagates_to_write(self) -> None:
        blocker = self.applicable_blocker(
            blocker_id="credential-leak-freeze",
            scope_type="SECURITY_POLICY",
            operation="WRITE",
            capability="repository-write",
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
        admission = validate_wait_admission(wait, self.active, result)
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
        self.assertTrue(validate_directive(directive))
        authority = directive["authorityContext"]
        self.assertIn("currentBlockerIds", authority)
        self.assertIn("waitAdmissionId", authority)

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
        self.assertIn("conditionExpectedToChange", wait)
        self.assertIn("authorityResolution", active)
        self.assertIn("executionFrontier", active)
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        docs = (ROOT / "docs" / "INDEX.md").read_text(encoding="utf-8")
        for text in (index, docs):
            self.assertIn("SCOPED-BLOCKER.json", text)
            self.assertIn("WAIT-ADMISSION.json", text)


if __name__ == "__main__":
    unittest.main()
