#!/usr/bin/env python3
"""Deterministic active-task authority, blocker-scope, and wait controls."""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


class AuthorityValidationError(ValueError):
    """Raised when an authority, blocker, or wait record is structurally invalid."""


GLOBAL_STATE_RELATIONS = {
    "CURRENT_AND_APPLICABLE",
    "CURRENT_BUT_UNRELATED",
    "STALE_BUT_APPLICABLE_REVALIDATION_REQUIRED",
    "STALE_AND_UNRELATED",
    "AMBIGUOUS",
}

BLOCKER_APPLICABILITY_STATES = {
    "APPLICABLE",
    "NOT_APPLICABLE",
    "REVALIDATION_REQUIRED",
    "AMBIGUOUS",
}

AUTHORITY_PRECEDENCE = (
    "CURRENT_OWNER_INSTRUCTION",
    "ACTIVE_TASK_CONTRACT_AND_TASK_LOCAL_STATE",
    "TASK_LOCAL_PLAN_AND_CHAT_DIRECTIVE",
    "TASK_PR_CODE_TESTS_CI_AND_EXECUTION_EVIDENCE",
    "REPOSITORY_GLOBAL_STATE_AND_POLICY_WHERE_APPLICABLE",
    "HISTORICAL_TASK_STATE_AND_ARCHIVED_CHECKPOINTS",
)


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise AuthorityValidationError(message)


def _nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _string_list(value: Any, field: str) -> list[str]:
    _require(isinstance(value, list), f"{field} must be a list")
    _require(
        all(_nonempty(item) for item in value),
        f"{field} must contain only nonempty strings",
    )
    return value


def _parse_utc(value: Any, field: str) -> datetime:
    _require(_nonempty(value), f"{field} is required")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise AuthorityValidationError(f"{field} must be an ISO timestamp") from exc
    _require(parsed.tzinfo is not None, f"{field} must include a timezone")
    return parsed


def _append_once(values: list[str], value: str) -> None:
    if value not in values:
        values.append(value)


def _active_context(active_task: dict[str, Any]) -> dict[str, Any]:
    _require(_nonempty(active_task.get("taskId")), "active taskId is required")
    _require(_nonempty(active_task.get("requiredBranch")), "requiredBranch is required")
    _require(_nonempty(active_task.get("requiredRef")), "requiredRef is required")
    outcome = active_task.get("ownerOutcome", {})
    _require(_nonempty(outcome.get("ownerOutcomeId")), "ownerOutcomeId is required")
    _require(isinstance(outcome.get("epoch"), int), "ownerOutcome.epoch is required")
    _require(_nonempty(outcome.get("sha256")), "ownerOutcome.sha256 is required")
    frontier = active_task.get("executionFrontier", {})
    _require(_nonempty(frontier.get("state")), "executionFrontier.state is required")
    return {
        "taskId": active_task["taskId"],
        "strategyFamilyId": frontier.get("strategyFamilyId"),
        "directiveId": frontier.get("directiveId"),
        "operation": frontier.get("operation"),
        "requiredCapabilityIds": set(
            _string_list(
                frontier.get("requiredCapabilityIds", []),
                "executionFrontier.requiredCapabilityIds",
            )
        ),
    }


def _global_relation(freshness: str, applicability: str) -> str:
    if applicability == "AMBIGUOUS" or freshness == "UNKNOWN":
        return "AMBIGUOUS"
    if applicability == "REVALIDATION_REQUIRED":
        return "STALE_BUT_APPLICABLE_REVALIDATION_REQUIRED"
    if applicability == "APPLICABLE":
        return "CURRENT_AND_APPLICABLE"
    if freshness == "STALE":
        return "STALE_AND_UNRELATED"
    return "CURRENT_BUT_UNRELATED"


def evaluate_blocker_applicability(
    active_task: dict[str, Any], blocker: dict[str, Any]
) -> dict[str, Any]:
    """Resolve a declared blocker without inferring scope from a status label."""
    context = _active_context(active_task)
    blocker_id = blocker.get("blockerId")
    _require(_nonempty(blocker_id), "blockerId is required")
    _require(
        blocker.get("status") in {"UNRESOLVED", "RESOLVED", "SUPERSEDED"},
        "blocker status is invalid",
    )
    scope = blocker.get("scope", {})
    _require(
        scope.get("type")
        in {
            "REPOSITORY",
            "TASK",
            "STRATEGY_FAMILY",
            "DIRECTIVE",
            "RELEASE",
            "SECURITY_POLICY",
            "EXTERNAL_SERVICE",
            "OWNER_DECISION",
        },
        "blocker scope.type is invalid",
    )
    _require(_nonempty(scope.get("id")), "blocker scope.id is required")
    source = blocker.get("source", {})
    freshness = source.get("freshnessState")
    _require(freshness in {"CURRENT", "STALE", "UNKNOWN"}, "freshness is invalid")
    _require(_nonempty(source.get("ref")), "blocker source.ref is required")
    _parse_utc(source.get("observedAt"), "blocker source.observedAt")

    alerts: list[str] = []
    reasons: list[str] = []
    if blocker["status"] in {"RESOLVED", "SUPERSEDED"}:
        reasons.append(f"BLOCKER_{blocker['status']}")
        return {
            "blockerId": blocker_id,
            "applicability": "NOT_APPLICABLE",
            "globalStateRelation": _global_relation(freshness, "NOT_APPLICABLE"),
            "sourceDisposition": "SUSPENDED_COMPETING_SOURCE",
            "alerts": alerts,
            "reasons": reasons,
        }

    authority = active_task.get("authorityResolution", {})
    independent_ids = _string_list(
        authority.get("independentOfBlockerIds", []),
        "authorityResolution.independentOfBlockerIds",
    )
    if blocker_id in independent_ids:
        reasons.append("HIGHER_PRECEDENCE_TASK_AUTHORITY_ESTABLISHES_INDEPENDENCE")
        if blocker.get("inheritanceAttempted") is True:
            _append_once(alerts, "CROSS_TASK_BLOCKER_LEAKAGE")
        if freshness == "STALE":
            _append_once(alerts, "STALE_GLOBAL_BLOCKER_INHERITED")
            _append_once(alerts, "GLOBAL_STATE_STALE_FOR_ACTIVE_TASK")
        return {
            "blockerId": blocker_id,
            "applicability": "NOT_APPLICABLE",
            "globalStateRelation": _global_relation(freshness, "NOT_APPLICABLE"),
            "sourceDisposition": "SUSPENDED_COMPETING_SOURCE",
            "alerts": alerts,
            "reasons": reasons,
        }

    applies_to = blocker.get("appliesTo", {})
    task_ids = _string_list(applies_to.get("taskIds", []), "appliesTo.taskIds")
    strategy_ids = _string_list(
        applies_to.get("strategyFamilyIds", []), "appliesTo.strategyFamilyIds"
    )
    directive_ids = _string_list(
        applies_to.get("directiveIds", []), "appliesTo.directiveIds"
    )
    operations = _string_list(
        applies_to.get("operations", []), "appliesTo.operations"
    )
    scope_matches = any(
        (
            context["taskId"] in task_ids or "*" in task_ids,
            bool(context["strategyFamilyId"])
            and context["strategyFamilyId"] in strategy_ids,
            bool(context["directiveId"]) and context["directiveId"] in directive_ids,
            bool(context["operation"]) and context["operation"] in operations,
        )
    )

    dependency = blocker.get("causalDependency", {})
    dependency_task_ids = _string_list(
        dependency.get("requiredByTaskIds", []),
        "causalDependency.requiredByTaskIds",
    )
    required_capability_id = dependency.get("requiredCapabilityId")
    required_operation = dependency.get("requiredOperation")
    task_dependency = context["taskId"] in dependency_task_ids or "*" in dependency_task_ids
    capability_dependency = bool(required_capability_id) and (
        required_capability_id in context["requiredCapabilityIds"]
    )
    operation_dependency = bool(required_operation) and (
        required_operation == context["operation"]
    )
    causal_dependency = task_dependency and (
        capability_dependency or operation_dependency
    )

    if not scope_matches:
        reasons.append("BLOCKER_SCOPE_DOES_NOT_INCLUDE_ACTIVE_TASK_FRONTIER")
        _append_once(alerts, "BLOCKER_SCOPE_MISMATCH")
    if not causal_dependency:
        reasons.append("ACTIVE_TASK_HAS_NO_CAUSAL_DEPENDENCY")
        _append_once(alerts, "BLOCKER_CAUSAL_DEPENDENCY_MISSING")
    if not scope_matches or not causal_dependency:
        if blocker.get("inheritanceAttempted") is True:
            _append_once(alerts, "CROSS_TASK_BLOCKER_LEAKAGE")
        if freshness == "STALE":
            _append_once(alerts, "STALE_GLOBAL_BLOCKER_INHERITED")
            _append_once(alerts, "GLOBAL_STATE_STALE_FOR_ACTIVE_TASK")
        return {
            "blockerId": blocker_id,
            "applicability": "NOT_APPLICABLE",
            "globalStateRelation": _global_relation(freshness, "NOT_APPLICABLE"),
            "sourceDisposition": "SUSPENDED_COMPETING_SOURCE",
            "alerts": alerts,
            "reasons": reasons,
        }

    if freshness == "UNKNOWN":
        reasons.append("BLOCKER_FRESHNESS_AMBIGUOUS")
        return {
            "blockerId": blocker_id,
            "applicability": "AMBIGUOUS",
            "globalStateRelation": "AMBIGUOUS",
            "sourceDisposition": "PENDING_REASONING_REVIEW",
            "alerts": alerts,
            "reasons": reasons,
        }
    if freshness == "STALE":
        reasons.append("APPLICABLE_BLOCKER_REQUIRES_FRESH_REVALIDATION")
        _append_once(alerts, "GLOBAL_STATE_STALE_FOR_ACTIVE_TASK")
        return {
            "blockerId": blocker_id,
            "applicability": "REVALIDATION_REQUIRED",
            "globalStateRelation": "STALE_BUT_APPLICABLE_REVALIDATION_REQUIRED",
            "sourceDisposition": "REVALIDATION_REQUIRED",
            "alerts": alerts,
            "reasons": reasons,
        }

    reasons.append("CURRENT_EXPLICIT_SCOPE_AND_CAUSAL_DEPENDENCY_MATCH")
    return {
        "blockerId": blocker_id,
        "applicability": "APPLICABLE",
        "globalStateRelation": "CURRENT_AND_APPLICABLE",
        "sourceDisposition": "ACTIVE_AUTHORITY_SOURCE",
        "causalDependency": {
            "requiredCapabilityId": required_capability_id,
            "requiredOperation": required_operation,
            "requiredByTaskIds": dependency_task_ids,
        },
        "alerts": alerts,
        "reasons": reasons,
    }


def _aggregate_global_relation(
    results: Iterable[dict[str, Any]], repository_global_state: dict[str, Any]
) -> str:
    states = [result["globalStateRelation"] for result in results]
    for state in (
        "AMBIGUOUS",
        "STALE_BUT_APPLICABLE_REVALIDATION_REQUIRED",
        "CURRENT_AND_APPLICABLE",
        "STALE_AND_UNRELATED",
        "CURRENT_BUT_UNRELATED",
    ):
        if state in states:
            return state
    freshness = repository_global_state.get("freshnessState", "UNKNOWN")
    if freshness == "STALE":
        return "STALE_AND_UNRELATED"
    if freshness == "CURRENT":
        return "CURRENT_BUT_UNRELATED"
    return "AMBIGUOUS"


def resolve_active_task_authority(
    active_task: dict[str, Any],
    task_local_state: dict[str, Any],
    repository_global_state: dict[str, Any],
    blockers: Iterable[dict[str, Any]],
) -> dict[str, Any]:
    """Resolve authority by fixed precedence, never file-read order."""
    _active_context(active_task)
    findings: list[str] = []
    if task_local_state.get("taskId") != active_task["taskId"]:
        findings.append("TASK_LOCAL_CHECKPOINT_ID_MISMATCH")
    if task_local_state.get("branch") != active_task["requiredBranch"]:
        findings.append("ACTIVE_TASK_BRANCH_MISMATCH")
    if task_local_state.get("ref") != active_task["requiredRef"]:
        findings.append("ACTIVE_TASK_REF_MISMATCH")
    outcome = task_local_state.get("ownerOutcome", {})
    expected_outcome = active_task["ownerOutcome"]
    for field in ("ownerOutcomeId", "epoch", "sha256"):
        if outcome.get(field) != expected_outcome.get(field):
            findings.append(f"OWNER_OUTCOME_{field.upper()}_MISMATCH")
    _require(_nonempty(task_local_state.get("ref")), "task-local ref is required")
    _parse_utc(task_local_state.get("observedAt"), "task-local observedAt")
    _require(
        _nonempty(repository_global_state.get("ref")),
        "repository-global ref is required",
    )
    _parse_utc(
        repository_global_state.get("observedAt"),
        "repository-global observedAt",
    )

    blocker_results = [
        evaluate_blocker_applicability(active_task, blocker) for blocker in blockers
    ]
    relation = _aggregate_global_relation(blocker_results, repository_global_state)
    active_ids = [
        result["blockerId"]
        for result in blocker_results
        if result["applicability"] == "APPLICABLE"
    ]
    ignored_ids = [
        result["blockerId"]
        for result in blocker_results
        if result["applicability"] == "NOT_APPLICABLE"
    ]
    revalidation_ids = [
        result["blockerId"]
        for result in blocker_results
        if result["applicability"] == "REVALIDATION_REQUIRED"
    ]
    ambiguous_ids = [
        result["blockerId"]
        for result in blocker_results
        if result["applicability"] == "AMBIGUOUS"
    ]
    alerts: list[str] = []
    for result in blocker_results:
        for alert in result["alerts"]:
            _append_once(alerts, alert)
    if ambiguous_ids:
        findings.append("BLOCKER_APPLICABILITY_AMBIGUOUS")

    identity_findings = [
        finding
        for finding in findings
        if finding != "BLOCKER_APPLICABILITY_AMBIGUOUS"
    ]
    authority_status = (
        "INVALID"
        if identity_findings
        else "AMBIGUOUS"
        if ambiguous_ids
        else "VALID"
    )
    source_disposition = (
        "SUSPENDED_COMPETING_SOURCE"
        if relation in {"CURRENT_BUT_UNRELATED", "STALE_AND_UNRELATED"}
        else "ACTIVE_AUTHORITY_SOURCE"
    )
    return {
        "authorityResolutionStatus": authority_status,
        "authorityPrecedence": list(AUTHORITY_PRECEDENCE),
        "selectedExecutionSource": (
            "TASK_LOCAL_CHECKPOINT" if authority_status != "INVALID" else "NONE"
        ),
        "taskId": active_task["taskId"],
        "requiredBranch": active_task["requiredBranch"],
        "requiredRef": active_task["requiredRef"],
        "taskLocalCheckpointRef": task_local_state["ref"],
        "repositoryGlobalStateRef": repository_global_state["ref"],
        "repositoryGlobalSourceDisposition": source_disposition,
        "globalStateRelation": relation,
        "activeTaskExecutionState": task_local_state.get("state"),
        "requiredAction": task_local_state.get("requiredAction"),
        "activeBlockerIds": active_ids,
        "ignoredBlockerIds": ignored_ids,
        "revalidationRequiredBlockerIds": revalidation_ids,
        "ambiguousBlockerIds": ambiguous_ids,
        "blockerResults": blocker_results,
        "alerts": alerts,
        "findings": findings,
        "inputReadOrderAuthoritative": False,
    }


def validate_wait_admission(
    wait: dict[str, Any],
    active_task: dict[str, Any],
    blocker_result: dict[str, Any] | None,
) -> dict[str, Any]:
    """Admit only exact, causally relevant, actionable, bounded waits."""
    context = _active_context(active_task)
    findings: list[str] = []
    required_strings = (
        "waitId",
        "activeTaskId",
        "reasonForWait",
        "causalDependency",
        "sourceObservedAt",
        "stateIfHorizonExpires",
    )
    for field in required_strings:
        if not _nonempty(wait.get(field)):
            findings.append(f"WAIT_{field.upper()}_REQUIRED")
    if wait.get("activeTaskId") != context["taskId"]:
        findings.append("WAIT_ACTIVE_TASK_ID_MISMATCH")
    try:
        _parse_utc(wait.get("sourceObservedAt"), "wait sourceObservedAt")
    except AuthorityValidationError:
        findings.append("WAIT_SOURCE_TIMESTAMP_INVALID")

    blocker_id = wait.get("blockingBlockerId")
    reasoning_request_id = wait.get("reasoningRequestId")
    if bool(blocker_id) == bool(reasoning_request_id):
        findings.append("WAIT_REQUIRES_EXACTLY_ONE_BLOCKING_SOURCE")
    if blocker_id:
        if blocker_result is None:
            findings.append("WAIT_BLOCKER_APPLICABILITY_MISSING")
        else:
            if blocker_result.get("blockerId") != blocker_id:
                findings.append("WAIT_BLOCKER_ID_MISMATCH")
            if blocker_result.get("applicability") != "APPLICABLE":
                findings.append("WAIT_WITHOUT_ADMISSION")
            else:
                dependency = blocker_result.get("causalDependency", {})
                exact_dependency_ids = {
                    dependency.get("requiredCapabilityId"),
                    dependency.get("requiredOperation"),
                }
                exact_dependency_ids.discard(None)
                if wait.get("causalDependency") not in exact_dependency_ids:
                    findings.append("WAIT_CAUSAL_DEPENDENCY_MISMATCH")

    condition = wait.get("conditionExpectedToChange", {})
    for field in ("kind", "identity", "expectedState", "sourceRef"):
        if not _nonempty(condition.get(field)):
            findings.append(f"WAIT_CONDITION_{field.upper()}_REQUIRED")
    actor = condition.get("actorOrMechanism")
    if not _nonempty(actor) or actor.strip().upper() in {
        "NONE",
        "UNKNOWN",
        "NOBODY",
        "NOT_APPLICABLE",
    }:
        findings.append("WAIT_CONDITION_NOT_ACTIONABLE")
    if (
        _nonempty(condition.get("currentState"))
        and condition.get("currentState") == condition.get("expectedState")
    ):
        findings.append("WAIT_CONDITION_ALREADY_SATISFIED")

    mechanism = wait.get("pollOrNotificationMechanism", {})
    if mechanism.get("mode") not in {"POLL", "NOTIFICATION"}:
        findings.append("WAIT_MECHANISM_INVALID")
    polling_needed = wait.get("pollingNeeded")
    if not isinstance(polling_needed, bool):
        findings.append("WAIT_POLLING_NEEDED_MUST_BE_BOOLEAN")
    if polling_needed is True and mechanism.get("mode") != "POLL":
        findings.append("WAIT_POLL_MECHANISM_REQUIRED")
    if not _nonempty(mechanism.get("identity")):
        findings.append("WAIT_MECHANISM_IDENTITY_REQUIRED")

    next_check = wait.get("nextCheckAt")
    if polling_needed is True:
        try:
            _parse_utc(next_check, "wait nextCheckAt")
        except AuthorityValidationError:
            findings.append("WAIT_NEXT_CHECK_INVALID")
    horizon = wait.get("maximumWaitHorizonSeconds")
    if not isinstance(horizon, int) or isinstance(horizon, bool) or horizon <= 0:
        findings.append("WAIT_MAXIMUM_HORIZON_INVALID")
    if not isinstance(wait.get("ownerActionRequired"), bool):
        findings.append("WAIT_OWNER_ACTION_REQUIRED_MUST_BE_BOOLEAN")
    if not isinstance(wait.get("unrelatedWorkAllowed"), bool):
        findings.append("WAIT_UNRELATED_WORK_ALLOWED_MUST_BE_BOOLEAN")

    unique_findings: list[str] = []
    for finding in findings:
        _append_once(unique_findings, finding)
    condition_text = " ".join(
        str(value)
        for value in (
            wait.get("reasonForWait"),
            condition.get("kind"),
            condition.get("identity"),
            condition.get("sourceRef"),
        )
        if value is not None
    ).upper()
    if "GITHUB" in condition_text and any(
        finding
        in {
            "WAIT_WITHOUT_ADMISSION",
            "WAIT_CAUSAL_DEPENDENCY_MISMATCH",
            "WAIT_REQUIRES_EXACTLY_ONE_BLOCKING_SOURCE",
        }
        for finding in unique_findings
    ):
        _append_once(
            unique_findings,
            "GITHUB_UPDATE_WAIT_WITHOUT_CAUSAL_DEPENDENCY",
        )
    return {
        "waitId": wait.get("waitId"),
        "admitted": not unique_findings,
        "state": "ADMITTED" if not unique_findings else "REJECTED",
        "findings": unique_findings,
        "alerts": [
            finding
            for finding in unique_findings
            if finding
            in {
                "WAIT_WITHOUT_ADMISSION",
                "WAIT_CONDITION_NOT_ACTIONABLE",
                "WAIT_CONDITION_ALREADY_SATISFIED",
                "GITHUB_UPDATE_WAIT_WITHOUT_CAUSAL_DEPENDENCY",
            }
        ],
    }


def project_task_blockers(
    active_task: dict[str, Any],
    task_local_state: dict[str, Any],
    repository_global_state: dict[str, Any],
    blockers: Iterable[dict[str, Any]],
    wait: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a dashboard-safe projection without hiding ignored blockers."""
    blocker_list = list(blockers)
    resolution = resolve_active_task_authority(
        active_task, task_local_state, repository_global_state, blocker_list
    )
    results = {item["blockerId"]: item for item in resolution["blockerResults"]}
    wait_result = None
    if wait is not None:
        wait_result = validate_wait_admission(
            wait, active_task, results.get(wait.get("blockingBlockerId"))
        )
    blocker_by_id = {item["blockerId"]: item for item in blocker_list}
    active = []
    ignored = []
    for blocker_id in resolution["activeBlockerIds"]:
        blocker = blocker_by_id[blocker_id]
        active.append(
            {
                "blockerId": blocker_id,
                "scope": blocker["scope"],
                "sourceRef": blocker["source"]["ref"],
                "ownerActionRequired": blocker["ownerAction"]["required"],
                "unrelatedWorkAllowed": blocker["unrelatedWorkAllowed"],
            }
        )
    for blocker_id in resolution["ignoredBlockerIds"]:
        blocker = blocker_by_id[blocker_id]
        ignored.append(
            {
                "blockerId": blocker_id,
                "scope": blocker["scope"],
                "sourceRef": blocker["source"]["ref"],
                "relation": results[blocker_id]["globalStateRelation"],
                "sourceDisposition": results[blocker_id]["sourceDisposition"],
            }
        )
    owner_action_required = any(item["ownerActionRequired"] for item in active)
    unrelated_work_allowed = all(item["unrelatedWorkAllowed"] for item in active)
    alerts = list(resolution["alerts"])
    if wait_result:
        for alert in wait_result["alerts"]:
            _append_once(alerts, alert)
    return {
        "taskId": active_task["taskId"],
        "activeTaskAuthorityRef": task_local_state["ref"],
        "activeTaskStateObservedAt": task_local_state["observedAt"],
        "activeTaskExecutionState": resolution["activeTaskExecutionState"],
        "repositoryGlobalStateRef": repository_global_state["ref"],
        "repositoryGlobalStateObservedAt": repository_global_state["observedAt"],
        "repositoryGlobalRelation": resolution["globalStateRelation"],
        "activeBlockers": active,
        "ignoredOrUnrelatedBlockers": ignored,
        "revalidationRequiredBlockerIds": resolution[
            "revalidationRequiredBlockerIds"
        ],
        "ambiguousBlockerIds": resolution["ambiguousBlockerIds"],
        "waitAdmission": wait_result,
        "waiting": bool(wait_result and wait_result["admitted"]),
        "requiredAction": resolution["requiredAction"],
        "ownerAction": "REQUIRED" if owner_action_required else "NONE",
        "unrelatedWorkAllowed": unrelated_work_allowed,
        "alerts": alerts,
    }


def evaluate_fixture(fixture: dict[str, Any]) -> dict[str, Any]:
    """Execute a hostile fixture through the real resolver and projection."""
    wait = fixture.get("proposedWait")
    projection = project_task_blockers(
        fixture["activeTask"],
        fixture["taskLocalState"],
        fixture["repositoryGlobalState"],
        fixture["blockers"],
        wait,
    )
    resolution = resolve_active_task_authority(
        fixture["activeTask"],
        fixture["taskLocalState"],
        fixture["repositoryGlobalState"],
        fixture["blockers"],
    )
    return {"resolution": resolution, "projection": projection}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("fixture", type=Path)
    args = parser.parse_args()
    fixture = json.loads(args.fixture.read_text(encoding="utf-8"))
    print(json.dumps(evaluate_fixture(fixture), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
