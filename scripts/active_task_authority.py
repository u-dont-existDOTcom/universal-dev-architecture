#!/usr/bin/env python3
"""Deterministic active-task authority, blocker-scope, and wait controls."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta
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

NON_WAIVABLE_POLICY_CLASSES = {
    "SAFETY",
    "PRIVACY",
    "SECURITY",
    "PERMISSION",
    "SPENDING",
    "PUBLICATION",
    "IRREVERSIBLE_ACTION",
}

BLOCKER_POLICY_CLASSES = {"OPERATIONAL", *NON_WAIVABLE_POLICY_CLASSES}

FRONTIER_AUTHORIZATION_STATES = {
    "AUTHORIZED",
    "BLOCKED_BY_APPLICABLE_BLOCKER",
    "BLOCKER_REVALIDATION_REQUIRED",
    "REASONING_REVIEW_REQUIRED",
    "INVALID_AUTHORITY",
}

ALLOWED_NONTERMINAL_HORIZON_STATES = {
    "BLOCKED_EXTERNAL",
    "OWNER_DECISION_REQUIRED",
    "NO_VALID_STRATEGY",
    "HANDOFF_BLOCKED",
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


def _require_sha256(value: Any, field: str) -> str:
    _require(
        _nonempty(value)
        and len(value) == 64
        and all(character in "0123456789abcdefABCDEF" for character in value),
        f"{field} must be a 64-character hexadecimal SHA-256",
    )
    return value


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
    checkpoint = active_task.get("taskLocalCheckpoint", {})
    for field in ("sourcePath", "gitRef", "gitObjectId", "taskId", "branch"):
        _require(
            _nonempty(checkpoint.get(field)),
            f"taskLocalCheckpoint.{field} is required",
        )
    _require_sha256(
        checkpoint.get("contentSha256"),
        "taskLocalCheckpoint.contentSha256",
    )
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


def _checkpoint_findings(
    active_task: dict[str, Any], task_local_state: dict[str, Any]
) -> list[str]:
    """Bind the selected task checkpoint to exact repository identities."""
    findings: list[str] = []
    expected = active_task["taskLocalCheckpoint"]
    actual = task_local_state.get("checkpointIdentity", {})
    identity_fields = (
        ("sourcePath", "TASK_LOCAL_CHECKPOINT_SOURCE_PATH_MISMATCH"),
        ("gitRef", "TASK_LOCAL_CHECKPOINT_GIT_REF_MISMATCH"),
        ("gitObjectId", "TASK_LOCAL_CHECKPOINT_GIT_OBJECT_MISMATCH"),
        ("contentSha256", "TASK_LOCAL_CHECKPOINT_CONTENT_SHA256_MISMATCH"),
        ("taskId", "TASK_LOCAL_CHECKPOINT_ID_MISMATCH"),
        ("branch", "ACTIVE_TASK_BRANCH_MISMATCH"),
    )
    for field, finding in identity_fields:
        if actual.get(field) != expected.get(field):
            _append_once(findings, finding)
    try:
        _require_sha256(
            actual.get("contentSha256"),
            "task-local checkpointIdentity.contentSha256",
        )
    except AuthorityValidationError:
        _append_once(findings, "TASK_LOCAL_CHECKPOINT_CONTENT_SHA256_INVALID")
    if expected.get("gitRef") != active_task.get("requiredRef"):
        _append_once(findings, "ACTIVE_TASK_SELECTED_CHECKPOINT_REF_INVALID")
    if expected.get("ref") != expected.get("sourcePath"):
        _append_once(findings, "ACTIVE_TASK_SELECTED_CHECKPOINT_SOURCE_INVALID")
    if expected.get("branch") != active_task.get("requiredBranch"):
        _append_once(findings, "ACTIVE_TASK_SELECTED_CHECKPOINT_BRANCH_INVALID")

    expected_outcome = active_task["ownerOutcome"]
    actual_outcome = actual.get("ownerOutcome", {})
    for field in ("ownerOutcomeId", "epoch", "sha256"):
        if actual_outcome.get(field) != expected_outcome.get(field):
            _append_once(
                findings,
                f"TASK_LOCAL_CHECKPOINT_OWNER_OUTCOME_{field.upper()}_MISMATCH",
            )
    return findings


def _owner_authority_findings(
    active_task: dict[str, Any],
    current_owner_source: dict[str, Any] | None,
) -> tuple[dict[str, Any], list[str]]:
    """Validate the existing owner-source/correction chain's current projection."""
    findings: list[str] = []
    owner_source = active_task.get("ownerSource", {})
    active_projection = owner_source.get("currentAuthorityProjection", {})
    current = current_owner_source or active_projection
    required = (
        "sourceRecordId",
        "sourceKind",
        "relation",
        "instructionClass",
        "ownerRequestId",
        "canonicalLocator",
        "capturedAt",
        "sha256",
        "taskId",
        "ownerOutcomeId",
        "ownerOutcomeSha256",
        "independentReceiptId",
        "independentReceiptStatus",
    )
    for field in required:
        if not _nonempty(current.get(field)):
            _append_once(findings, f"CURRENT_OWNER_SOURCE_{field.upper()}_REQUIRED")
    if not isinstance(current.get("effectiveEpoch"), int):
        _append_once(findings, "CURRENT_OWNER_SOURCE_EFFECTIVE_EPOCH_REQUIRED")
    if current.get("sourceKind") not in {"OWNER_REQUEST", "OWNER_CORRECTION"}:
        _append_once(findings, "CURRENT_OWNER_SOURCE_KIND_INVALID")
    if current.get("relation") not in {"ROOT", "AMENDS", "SUPERSEDES"}:
        _append_once(findings, "CURRENT_OWNER_SOURCE_RELATION_INVALID")
    if current.get("instructionClass") not in {
        "CONTINUE",
        "OWNER_STOP",
        "OWNER_AMENDMENT",
    }:
        _append_once(findings, "CURRENT_OWNER_INSTRUCTION_CLASS_INVALID")
    if current.get("independentReceiptStatus") != "MATCH":
        _append_once(findings, "CURRENT_OWNER_SOURCE_RECEIPT_NOT_MATCHED")
    try:
        current_at = _parse_utc(current.get("capturedAt"), "current owner capturedAt")
    except AuthorityValidationError:
        current_at = None
        _append_once(findings, "CURRENT_OWNER_SOURCE_TIMESTAMP_INVALID")
    try:
        _require_sha256(current.get("sha256"), "current owner sha256")
        _require_sha256(
            current.get("ownerOutcomeSha256"),
            "current owner ownerOutcomeSha256",
        )
    except AuthorityValidationError:
        _append_once(findings, "CURRENT_OWNER_SOURCE_SHA256_INVALID")

    if current.get("ownerRequestId") != owner_source.get("ownerRequestId"):
        _append_once(findings, "CURRENT_OWNER_REQUEST_ID_MISMATCH")
    if current.get("taskId") not in {active_task.get("taskId"), "*"}:
        _append_once(findings, "CURRENT_OWNER_TASK_ID_MISMATCH")
    expected_outcome = active_task["ownerOutcome"]
    if current.get("ownerOutcomeId") != expected_outcome.get("ownerOutcomeId"):
        _append_once(findings, "CURRENT_OWNER_OUTCOME_ID_MISMATCH")

    active_at = None
    if active_projection:
        try:
            active_at = _parse_utc(
                active_projection.get("capturedAt"),
                "active owner authority capturedAt",
            )
        except AuthorityValidationError:
            _append_once(findings, "ACTIVE_OWNER_SOURCE_TIMESTAMP_INVALID")
    if current_at and active_at and current_at < active_at:
        _append_once(findings, "CURRENT_OWNER_SOURCE_STALE")
    active_epoch = active_projection.get("effectiveEpoch")
    if isinstance(active_epoch, int) and isinstance(current.get("effectiveEpoch"), int):
        if current["effectiveEpoch"] < active_epoch:
            _append_once(findings, "CURRENT_OWNER_SOURCE_EPOCH_STALE")

    instruction = current.get("instructionClass")
    if instruction == "CONTINUE":
        if current.get("effectiveEpoch") != expected_outcome.get("epoch"):
            _append_once(findings, "CURRENT_OWNER_OUTCOME_EPOCH_MISMATCH")
        if current.get("ownerOutcomeSha256") != expected_outcome.get("sha256"):
            _append_once(findings, "CURRENT_OWNER_OUTCOME_SHA256_MISMATCH")
    elif instruction == "OWNER_AMENDMENT":
        _append_once(findings, "OWNER_OUTCOME_AMENDED_AFTER_ACTIVE_TASK")
    elif instruction == "OWNER_STOP":
        _append_once(findings, "CURRENT_OWNER_STOP")
    return current, findings


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
    policy = blocker.get("policy", {})
    policy_class = policy.get("class")
    _require(
        policy_class in BLOCKER_POLICY_CLASSES,
        "blocker policy.class is invalid",
    )
    _require(
        isinstance(policy.get("nonWaivable"), bool),
        "blocker policy.nonWaivable must be a boolean",
    )
    _require(
        policy["nonWaivable"] == (policy_class in NON_WAIVABLE_POLICY_CLASSES),
        "blocker policy.nonWaivable must match its policy class",
    )
    _require(
        scope.get("repositoryWidePolicy") is policy["nonWaivable"],
        "scope.repositoryWidePolicy must match the non-waivable policy class",
    )
    _require(
        scope.get("type") != "SECURITY_POLICY" or policy_class == "SECURITY",
        "SECURITY_POLICY scope requires SECURITY policy classification",
    )
    owner_action = blocker.get("ownerAction", {})
    _require(
        isinstance(owner_action.get("required"), bool),
        "blocker ownerAction.required must be a boolean",
    )
    if owner_action["required"]:
        _require(
            _nonempty(owner_action.get("decisionId")),
            "blocker ownerAction.decisionId is required",
        )
        _require(
            _nonempty(owner_action.get("action"))
            and owner_action.get("action") != "NONE",
            "blocker ownerAction.action is required",
        )
    else:
        _require(
            owner_action.get("decisionId") is None,
            "non-owner blocker ownerAction.decisionId must be null",
        )
        _require(
            owner_action.get("action") == "NONE",
            "non-owner blocker ownerAction.action must be NONE",
        )

    alerts: list[str] = []
    reasons: list[str] = []
    if blocker["status"] in {"RESOLVED", "SUPERSEDED"}:
        reasons.append(f"BLOCKER_{blocker['status']}")
        return {
            "blockerId": blocker_id,
            "policyClass": policy_class,
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

    authority = active_task.get("authorityResolution", {})
    independent_ids = _string_list(
        authority.get("independentOfBlockerIds", []),
        "authorityResolution.independentOfBlockerIds",
    )
    independence_declared = blocker_id in independent_ids
    non_waivable_policy = policy_class in NON_WAIVABLE_POLICY_CLASSES
    if independence_declared and scope_matches and causal_dependency:
        if non_waivable_policy:
            _append_once(alerts, "INVALID_TASK_INDEPENDENCE_OVERRIDE")
            reasons.append("NON_WAIVABLE_POLICY_REQUIRES_CAUSAL_APPLICABILITY")
        else:
            reasons.append("HIGHER_PRECEDENCE_TASK_AUTHORITY_ESTABLISHES_INDEPENDENCE")
            if blocker.get("inheritanceAttempted") is True:
                _append_once(alerts, "CROSS_TASK_BLOCKER_LEAKAGE")
            if freshness == "STALE":
                _append_once(alerts, "STALE_GLOBAL_BLOCKER_INHERITED")
                _append_once(alerts, "GLOBAL_STATE_STALE_FOR_ACTIVE_TASK")
            return {
                "blockerId": blocker_id,
                "policyClass": policy_class,
                "applicability": "NOT_APPLICABLE",
                "globalStateRelation": _global_relation(
                    freshness, "NOT_APPLICABLE"
                ),
                "sourceDisposition": "SUSPENDED_COMPETING_SOURCE",
                "alerts": alerts,
                "reasons": reasons,
            }

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
            "policyClass": policy_class,
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
            "policyClass": policy_class,
            "applicability": "AMBIGUOUS",
            "globalStateRelation": "AMBIGUOUS",
            "sourceDisposition": "PENDING_REASONING_REVIEW",
            "causalDependency": {
                "requiredCapabilityId": required_capability_id,
                "requiredOperation": required_operation,
                "requiredByTaskIds": dependency_task_ids,
            },
            "alerts": alerts,
            "reasons": reasons,
        }
    if freshness == "STALE":
        reasons.append("APPLICABLE_BLOCKER_REQUIRES_FRESH_REVALIDATION")
        _append_once(alerts, "GLOBAL_STATE_STALE_FOR_ACTIVE_TASK")
        return {
            "blockerId": blocker_id,
            "policyClass": policy_class,
            "applicability": "REVALIDATION_REQUIRED",
            "globalStateRelation": "STALE_BUT_APPLICABLE_REVALIDATION_REQUIRED",
            "sourceDisposition": "REVALIDATION_REQUIRED",
            "causalDependency": {
                "requiredCapabilityId": required_capability_id,
                "requiredOperation": required_operation,
                "requiredByTaskIds": dependency_task_ids,
            },
            "alerts": alerts,
            "reasons": reasons,
        }

    reasons.append("CURRENT_EXPLICIT_SCOPE_AND_CAUSAL_DEPENDENCY_MATCH")
    return {
        "blockerId": blocker_id,
        "policyClass": policy_class,
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
    current_owner_source: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Resolve authority by fixed precedence, never file-read order."""
    context = _active_context(active_task)
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
    for finding in _checkpoint_findings(active_task, task_local_state):
        _append_once(findings, finding)
    owner_authority, owner_findings = _owner_authority_findings(
        active_task, current_owner_source
    )
    for finding in owner_findings:
        _append_once(findings, finding)
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

    blocker_list = list(blockers)
    blocker_results = [
        evaluate_blocker_applicability(active_task, blocker)
        for blocker in blocker_list
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
    blocking_ids = active_ids + revalidation_ids + ambiguous_ids
    blocker_by_id = {
        blocker["blockerId"]: blocker
        for blocker in blocker_list
        if _nonempty(blocker.get("blockerId"))
    }
    blocked_capabilities: list[str] = []
    for result in blocker_results:
        if result["blockerId"] not in blocking_ids:
            continue
        dependency = result.get("causalDependency", {})
        capability = dependency.get("requiredCapabilityId")
        if _nonempty(capability):
            _append_once(blocked_capabilities, capability)

    if authority_status == "INVALID":
        frontier_authorization = "INVALID_AUTHORITY"
    elif authority_status == "AMBIGUOUS" or ambiguous_ids:
        frontier_authorization = "REASONING_REVIEW_REQUIRED"
    elif revalidation_ids:
        frontier_authorization = "BLOCKER_REVALIDATION_REQUIRED"
    elif active_ids:
        frontier_authorization = "BLOCKED_BY_APPLICABLE_BLOCKER"
    else:
        frontier_authorization = "AUTHORIZED"
    _require(
        frontier_authorization in FRONTIER_AUTHORIZATION_STATES,
        "frontier authorization projection is invalid",
    )
    independent_frontiers_allowed = all(
        blocker_by_id[blocker_id].get("unrelatedWorkAllowed") is True
        for blocker_id in blocking_ids
        if blocker_id in blocker_by_id
    )
    if authority_status == "INVALID":
        independent_frontiers_allowed = False
    reasoning_review_required = authority_status != "VALID" or bool(ambiguous_ids)
    return {
        "authorityResolutionStatus": authority_status,
        "authorityPrecedence": list(AUTHORITY_PRECEDENCE),
        "selectedExecutionSource": (
            "TASK_LOCAL_CHECKPOINT" if authority_status == "VALID" else "NONE"
        ),
        "ownerAuthoritySourceRecordId": owner_authority.get("sourceRecordId"),
        "ownerInstructionClass": owner_authority.get("instructionClass"),
        "taskId": active_task["taskId"],
        "requiredBranch": active_task["requiredBranch"],
        "requiredRef": active_task["requiredRef"],
        "taskLocalCheckpointRef": active_task["taskLocalCheckpoint"]["ref"],
        "taskLocalCheckpointIdentity": {
            field: active_task["taskLocalCheckpoint"][field]
            for field in (
                "sourcePath",
                "gitRef",
                "gitObjectId",
                "contentSha256",
                "taskId",
                "branch",
            )
        },
        "repositoryGlobalStateRef": repository_global_state["ref"],
        "repositoryGlobalSourceDisposition": source_disposition,
        "globalStateRelation": relation,
        "activeTaskExecutionState": task_local_state.get("state"),
        "requiredAction": task_local_state.get("requiredAction"),
        "activeBlockerIds": active_ids,
        "ignoredBlockerIds": ignored_ids,
        "revalidationRequiredBlockerIds": revalidation_ids,
        "ambiguousBlockerIds": ambiguous_ids,
        "frontierAuthorization": frontier_authorization,
        "affectedOperation": context.get("operation"),
        "blockedCapabilityIds": blocked_capabilities,
        "blockingBlockerIds": blocking_ids,
        "independentFrontiersAllowed": independent_frontiers_allowed,
        "reasoningReviewRequired": reasoning_review_required,
        "substantiveExecutionAuthorized": (
            frontier_authorization == "AUTHORIZED"
        ),
        "blockerResults": blocker_results,
        "alerts": alerts,
        "findings": findings,
        "inputReadOrderAuthoritative": False,
    }


def _reasoning_handoff_wait_findings(
    reasoning_handoff: dict[str, Any] | None,
    task_id: str,
    request_id: str,
    observed_at: datetime | None,
) -> list[str]:
    """Validate a wait against the accepted executor-reasoning handoff path."""
    findings: list[str] = []
    if reasoning_handoff is None:
        return ["WAIT_REASONING_HANDOFF_MISSING"]
    if reasoning_handoff.get("schemaVersion") != 2:
        findings.append("WAIT_REASONING_HANDOFF_SCHEMA_INVALID")
    if reasoning_handoff.get("taskId") != task_id:
        findings.append("WAIT_REASONING_HANDOFF_TASK_MISMATCH")
    review_request = reasoning_handoff.get("reviewRequest", {})
    if review_request.get("requestId") != request_id:
        findings.append("WAIT_REASONING_REQUEST_ID_MISMATCH")
    if reasoning_handoff.get("state") != "WAITING_FOR_REASONING_REVIEW":
        findings.append("WAIT_REASONING_HANDOFF_STATE_INVALID")
    if not _nonempty(review_request.get("submittedAt")):
        findings.append("WAIT_REASONING_REQUEST_NOT_SUBMITTED")
    if not _nonempty(review_request.get("deliveryConfirmedAt")):
        findings.append("WAIT_REASONING_DELIVERY_UNCONFIRMED")
    lease = reasoning_handoff.get("lease", {})
    if not _nonempty(lease.get("owner")):
        findings.append("WAIT_REASONING_LEASE_OWNER_MISSING")
    try:
        acquired_at = _parse_utc(
            lease.get("acquiredAt"), "reasoning handoff lease acquiredAt"
        )
        expires_at = _parse_utc(
            lease.get("expiresAt"), "reasoning handoff lease expiresAt"
        )
        if expires_at <= acquired_at:
            findings.append("WAIT_REASONING_LEASE_INVALID")
        if observed_at is not None and expires_at <= observed_at:
            findings.append("WAIT_REASONING_LEASE_EXPIRED")
    except AuthorityValidationError:
        findings.append("WAIT_REASONING_LEASE_TIMESTAMP_INVALID")
    if reasoning_handoff.get("taskTerminal") is not False:
        findings.append("WAIT_REASONING_HANDOFF_TERMINAL")
    if reasoning_handoff.get("ownerActionRequired") is not False:
        findings.append("WAIT_REASONING_OWNER_ACTION_CONFLICT")
    return findings


def validate_wait_admission(
    wait: dict[str, Any],
    active_task: dict[str, Any],
    blocker_result: dict[str, Any] | None,
    blocker: dict[str, Any] | None = None,
    reasoning_handoff: dict[str, Any] | None = None,
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
        "waitStartedAt",
        "stateIfHorizonExpires",
    )
    for field in required_strings:
        if not _nonempty(wait.get(field)):
            findings.append(f"WAIT_{field.upper()}_REQUIRED")
    if wait.get("activeTaskId") != context["taskId"]:
        findings.append("WAIT_ACTIVE_TASK_ID_MISMATCH")
    source_observed_at = None
    wait_started_at = None
    next_check_at = None
    try:
        source_observed_at = _parse_utc(
            wait.get("sourceObservedAt"), "wait sourceObservedAt"
        )
    except AuthorityValidationError:
        findings.append("WAIT_SOURCE_TIMESTAMP_INVALID")
    try:
        wait_started_at = _parse_utc(
            wait.get("waitStartedAt"), "wait waitStartedAt"
        )
    except AuthorityValidationError:
        findings.append("WAIT_STARTED_AT_INVALID")
    try:
        next_check_at = _parse_utc(wait.get("nextCheckAt"), "wait nextCheckAt")
    except AuthorityValidationError:
        findings.append("WAIT_NEXT_CHECK_INVALID")
    if (
        source_observed_at is not None
        and wait_started_at is not None
        and wait_started_at < source_observed_at
    ):
        findings.append("WAIT_STARTED_BEFORE_SOURCE_OBSERVED")

    blocker_id = wait.get("blockingBlockerId")
    reasoning_request_id = wait.get("reasoningRequestId")
    if bool(blocker_id) == bool(reasoning_request_id):
        findings.append("WAIT_REQUIRES_EXACTLY_ONE_BLOCKING_SOURCE")
    condition = wait.get("conditionExpectedToChange", {})
    if blocker_id:
        if blocker_result is None:
            findings.append("WAIT_BLOCKER_APPLICABILITY_MISSING")
        elif blocker_result.get("blockerId") != blocker_id:
            findings.append("WAIT_BLOCKER_ID_MISMATCH")
        elif blocker_result.get("applicability") != "APPLICABLE":
            findings.append("WAIT_WITHOUT_ADMISSION")
        if blocker is None:
            findings.append("WAIT_EXACT_BLOCKER_RECORD_MISSING")
        elif blocker.get("blockerId") != blocker_id:
            findings.append("WAIT_EXACT_BLOCKER_RECORD_MISMATCH")
        else:
            dependency = blocker.get("causalDependency", {})
            exact_dependency_ids = {
                dependency.get("requiredCapabilityId"),
                dependency.get("requiredOperation"),
            }
            exact_dependency_ids.discard(None)
            if wait.get("causalDependency") not in exact_dependency_ids:
                findings.append("WAIT_CAUSAL_DEPENDENCY_MISMATCH")
            if condition.get("requiredCapabilityOrOperation") not in exact_dependency_ids:
                findings.append("WAIT_CONDITION_CAUSAL_FRONTIER_MISMATCH")
            unblock = blocker.get("unblockEvent", {})
            for field in (
                "kind",
                "identity",
                "sourceRef",
                "expectedState",
                "actorOrMechanism",
            ):
                if condition.get(field) != unblock.get(field):
                    findings.append(
                        f"WAIT_CONDITION_{field.upper()}_BLOCKER_MISMATCH"
                    )
            blocker_owner = blocker.get("ownerAction", {})
            if blocker_owner.get("required") is True:
                if wait.get("ownerActionRequired") is not True:
                    findings.append("WAIT_OWNER_ACTION_REQUIRED_MISMATCH")
                if not _nonempty(blocker_owner.get("decisionId")):
                    findings.append("WAIT_BLOCKER_OWNER_DECISION_ID_MISSING")
                if not _nonempty(wait.get("ownerDecisionId")):
                    findings.append("WAIT_OWNER_DECISION_ID_REQUIRED")
                if wait.get("ownerDecisionId") != blocker_owner.get("decisionId"):
                    findings.append("WAIT_OWNER_DECISION_ID_MISMATCH")
                if (
                    not _nonempty(blocker_owner.get("action"))
                    or blocker_owner.get("action") == "NONE"
                ):
                    findings.append("WAIT_BLOCKER_OWNER_ACTION_MISSING")
                if not _nonempty(wait.get("ownerAction")) or wait.get("ownerAction") == "NONE":
                    findings.append("WAIT_OWNER_ACTION_REQUIRED")
                if wait.get("ownerAction") != blocker_owner.get("action"):
                    findings.append("WAIT_OWNER_ACTION_MISMATCH")
            else:
                if wait.get("ownerActionRequired") is not False:
                    findings.append("WAIT_OWNER_ACTION_REQUIRED_MISMATCH")
                if wait.get("ownerDecisionId") is not None:
                    findings.append("WAIT_OWNER_DECISION_ID_UNEXPECTED")
                if wait.get("ownerAction") != "NONE":
                    findings.append("WAIT_OWNER_ACTION_UNEXPECTED")
            blocker_horizon = blocker.get("maximumWaitHorizonSeconds")
            wait_horizon = wait.get("maximumWaitHorizonSeconds")
            if (
                isinstance(blocker_horizon, int)
                and blocker_horizon > 0
                and isinstance(wait_horizon, int)
                and wait_horizon > blocker_horizon
            ):
                findings.append("WAIT_EXCEEDS_BLOCKER_HORIZON")
    elif reasoning_request_id:
        for finding in _reasoning_handoff_wait_findings(
            reasoning_handoff,
            context["taskId"],
            reasoning_request_id,
            source_observed_at,
        ):
            findings.append(finding)
        if condition.get("identity") != reasoning_request_id:
            findings.append("WAIT_REASONING_CONDITION_IDENTITY_MISMATCH")
        if reasoning_handoff is not None:
            review_request = reasoning_handoff.get("reviewRequest", {})
            if condition.get("kind") != "REASONING_RESPONSE":
                findings.append("WAIT_REASONING_CONDITION_KIND_MISMATCH")
            if condition.get("sourceRef") != reasoning_handoff.get("handoffId"):
                findings.append("WAIT_REASONING_CONDITION_SOURCE_MISMATCH")
            if condition.get("expectedState") != "READY":
                findings.append("WAIT_REASONING_EXPECTED_STATE_MISMATCH")
            if condition.get("actorOrMechanism") != review_request.get(
                "targetSurface"
            ):
                findings.append("WAIT_REASONING_ACTOR_MISMATCH")

    for field in (
        "kind",
        "identity",
        "expectedState",
        "sourceRef",
        "requiredCapabilityOrOperation",
    ):
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

    horizon = wait.get("maximumWaitHorizonSeconds")
    if not isinstance(horizon, int) or isinstance(horizon, bool) or horizon <= 0:
        findings.append("WAIT_MAXIMUM_HORIZON_INVALID")
    elif wait_started_at is not None and next_check_at is not None:
        if next_check_at <= wait_started_at:
            findings.append("WAIT_NEXT_CHECK_NOT_AFTER_START")
        if next_check_at > wait_started_at + timedelta(seconds=horizon):
            findings.append("WAIT_NEXT_CHECK_OUTSIDE_HORIZON")
    expiry_state = wait.get("stateIfHorizonExpires")
    if expiry_state not in ALLOWED_NONTERMINAL_HORIZON_STATES:
        findings.append("WAIT_HORIZON_EXPIRY_STATE_INVALID")
    allowed_expiry_states = wait.get("allowedStatesIfHorizonExpires")
    if not isinstance(allowed_expiry_states, list) or expiry_state not in allowed_expiry_states:
        findings.append("WAIT_HORIZON_EXPIRY_STATE_NOT_ALLOWLISTED")
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
                "WAIT_REASONING_HANDOFF_MISSING",
            }
        ],
    }


def project_task_blockers(
    active_task: dict[str, Any],
    task_local_state: dict[str, Any],
    repository_global_state: dict[str, Any],
    blockers: Iterable[dict[str, Any]],
    wait: dict[str, Any] | None = None,
    current_owner_source: dict[str, Any] | None = None,
    reasoning_handoff: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a dashboard-safe projection without hiding ignored blockers."""
    blocker_list = list(blockers)
    resolution = resolve_active_task_authority(
        active_task,
        task_local_state,
        repository_global_state,
        blocker_list,
        current_owner_source,
    )
    results = {item["blockerId"]: item for item in resolution["blockerResults"]}
    blocker_by_id = {item["blockerId"]: item for item in blocker_list}
    wait_result = None
    if wait is not None:
        wait_result = validate_wait_admission(
            wait,
            active_task,
            results.get(wait.get("blockingBlockerId")),
            blocker_by_id.get(wait.get("blockingBlockerId")),
            reasoning_handoff,
        )
    active = []
    ignored = []
    for blocker_id in resolution["activeBlockerIds"]:
        blocker = blocker_by_id[blocker_id]
        active.append(
            {
                "blockerId": blocker_id,
                "scope": blocker["scope"],
                "policyClass": blocker["policy"]["class"],
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
    unrelated_work_allowed = resolution["independentFrontiersAllowed"]
    alerts = list(resolution["alerts"])
    if wait_result:
        for alert in wait_result["alerts"]:
            _append_once(alerts, alert)
    return {
        "taskId": active_task["taskId"],
        "activeTaskAuthorityRef": resolution["taskLocalCheckpointRef"],
        "activeTaskCheckpointIdentity": resolution[
            "taskLocalCheckpointIdentity"
        ],
        "activeTaskStateObservedAt": task_local_state["observedAt"],
        "activeTaskExecutionState": resolution["activeTaskExecutionState"],
        "authorityResolutionStatus": resolution["authorityResolutionStatus"],
        "selectedExecutionSource": resolution["selectedExecutionSource"],
        "frontierAuthorization": resolution["frontierAuthorization"],
        "affectedOperation": resolution["affectedOperation"],
        "blockedCapabilityIds": resolution["blockedCapabilityIds"],
        "blockingBlockerIds": resolution["blockingBlockerIds"],
        "independentFrontiersAllowed": resolution[
            "independentFrontiersAllowed"
        ],
        "reasoningReviewRequired": resolution["reasoningReviewRequired"],
        "substantiveExecutionAuthorized": resolution[
            "substantiveExecutionAuthorized"
        ],
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
        fixture.get("currentOwnerSource"),
        fixture.get("reasoningHandoff"),
    )
    resolution = resolve_active_task_authority(
        fixture["activeTask"],
        fixture["taskLocalState"],
        fixture["repositoryGlobalState"],
        fixture["blockers"],
        fixture.get("currentOwnerSource"),
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
