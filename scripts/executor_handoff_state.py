#!/usr/bin/env python3
"""Deterministic reducer for closed-loop executor-to-reasoning handoffs."""

from __future__ import annotations

import copy
from datetime import datetime
from typing import Any


class HandoffValidationError(ValueError):
    """Raised when a directive, response, identity, or transition is invalid."""


RESPONSE_IDENTITY_FIELDS = (
    "requestIdEcho",
    "taskIdEcho",
    "ownerOutcomeEpochEcho",
    "chatEpochEcho",
    "reviewedEvidenceBoundaryEcho",
    "nextDirectiveSchemaVersion",
)


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise HandoffValidationError(message)


def _parse_utc(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError) as exc:
        raise HandoffValidationError(f"invalid UTC timestamp: {value!r}") from exc


def validate_directive(directive: dict[str, Any]) -> bool:
    """Validate the v2 handoff contract and its reasoning-authority boundary."""
    _require(directive.get("schemaVersion") == 2, "directive schemaVersion must be 2")
    _require(bool(directive.get("directiveId")), "directiveId is required")
    _require(bool(directive.get("taskId")), "taskId is required")
    _require(
        isinstance(directive.get("ownerOutcome", {}).get("epoch"), int),
        "ownerOutcome.epoch must be an integer",
    )
    supervisor = directive.get("reasoningSupervisor", {})
    _require(
        supervisor.get("surface") in {"EXTRA_HIGH", "PRO"},
        "reasoning supervisor must be Extra High or Pro, never Codex",
    )
    for field in ("chatEpoch", "reviewedEvidenceBoundary"):
        _require(bool(supervisor.get(field)), f"reasoningSupervisor.{field} is required")

    policy = directive.get("handoffPolicy", {})
    handling = policy.get("responseHandling", {})
    for field in (
        "requiredRequestIdEcho",
        "requiredTaskIdEcho",
        "requiredOwnerOutcomeEpochEcho",
        "requiredChatEpochEcho",
        "requiredReviewedEvidenceBoundaryEcho",
        "requiredResponseKind",
    ):
        _require(handling.get(field) is True, f"{field} must be true")
    _require(
        handling.get("requiredNextDirectiveSchemaVersion") == 2,
        "requiredNextDirectiveSchemaVersion must be 2",
    )
    _require(
        handling.get("processingSemantics")
        == "EXACTLY_ONCE_IMPORT_AND_DIRECTIVE_APPLICATION",
        "exactly-once processing semantics are required",
    )
    _require(
        handling.get("transportSemantics")
        == "IDEMPOTENT_REFETCH_ALLOWED_BEFORE_PERSISTENCE",
        "idempotent pre-persistence refetch is required",
    )
    _require(
        policy.get("requestIdempotency")
        == "ONE_LOGICAL_REQUEST_PER_RECEIPT_AND_REVIEW_BOUNDARY",
        "one logical review request is required",
    )
    _require(policy.get("ownerMayBeUsedAsMessageBus") is False, "owner relay is forbidden")
    review_ref = str(policy.get("reviewRequestTemplateRef", "")).upper()
    _require("CHAT-AUTHORED" in review_ref, "review request must be chat-authored")
    _require("CODEX-AUTHORED" not in review_ref, "Codex-authored review question forbidden")
    strategy = directive.get("strategy", {})
    _require(
        str(strategy.get("authoredBy", "REASONING_CHAT")).upper() != "CODEX",
        "Codex-authored strategy forbidden",
    )
    return True


def validate_response_identity(
    directive: dict[str, Any],
    handoff: dict[str, Any],
    response: dict[str, Any],
) -> bool:
    """Require exact request/task/authority/evidence/schema binding."""
    validate_directive(directive)
    expected = {
        "requestIdEcho": handoff["reviewRequest"]["requestId"],
        "taskIdEcho": directive["taskId"],
        "ownerOutcomeEpochEcho": directive["ownerOutcome"]["epoch"],
        "chatEpochEcho": directive["reasoningSupervisor"]["chatEpoch"],
        "reviewedEvidenceBoundaryEcho": directive["reasoningSupervisor"][
            "reviewedEvidenceBoundary"
        ],
        "nextDirectiveSchemaVersion": directive["handoffPolicy"][
            "responseHandling"
        ]["requiredNextDirectiveSchemaVersion"],
    }
    _require(handoff.get("taskId") == directive["taskId"], "handoff task mismatch")
    for field, value in expected.items():
        _require(response.get(field) == value, f"response identity mismatch: {field}")
    _require(
        response.get("responseKind")
        in directive["handoffPolicy"]["acceptedResponseKinds"],
        "response kind is not accepted",
    )
    _require(bool(response.get("responseId")), "responseId is required")
    return True


def _append_event(state: dict[str, Any], event_type: str, at: str) -> None:
    state.setdefault("events", []).append(
        {"sequence": len(state.get("events", [])) + 1, "type": event_type, "at": at}
    )


def _same_fields(existing: dict[str, Any], incoming: dict[str, Any], fields: tuple[str, ...]) -> bool:
    return all(existing.get(field) == incoming.get(field) for field in fields)


def apply_handoff_event(
    handoff: dict[str, Any], event: dict[str, Any]
) -> dict[str, Any]:
    """Apply one event; duplicates are rejected or idempotent by event semantics."""
    state = copy.deepcopy(handoff)
    event_type = event.get("type")
    at = event.get("at")
    _require(bool(event_type), "event type is required")
    _parse_utc(at)
    current = state.get("state")

    if event_type == "SUBMIT_REVIEW_REQUEST":
        _require(
            current == "RECEIPT_PERSISTED",
            "DUPLICATE_REASONING_REQUEST: duplicate or out-of-order review request",
        )
        _require(
            event.get("requestId") == state["reviewRequest"]["requestId"],
            "review request id mismatch",
        )
        state["reviewRequest"]["submittedAt"] = at
        state["state"] = "REVIEW_REQUEST_SUBMITTED"

    elif event_type == "CONFIRM_REVIEW_DELIVERY":
        _require(current == "REVIEW_REQUEST_SUBMITTED", "delivery confirmation out of order")
        state["reviewRequest"]["deliveryConfirmedAt"] = at
        state["state"] = "REVIEW_REQUEST_DELIVERED"

    elif event_type == "BEGIN_REASONING_WAIT":
        if current == "WAITING_FOR_REASONING_REVIEW":
            return state
        _require(current == "REVIEW_REQUEST_DELIVERED", "reasoning wait out of order")
        state["state"] = "WAITING_FOR_REASONING_REVIEW"

    elif event_type == "POLL_PENDING":
        _require(current == "WAITING_FOR_REASONING_REVIEW", "pending poll outside wait")
        polling = state["polling"]
        polling["lastPollAt"] = at
        polling["lastCompactState"] = "PENDING"
        polling["nextPollAt"] = event.get("nextPollAt")
        polling["pollCount"] += 1
        return state

    elif event_type == "POLL_READY":
        response = event.get("response", {})
        if current in {
            "REASONING_RESPONSE_READY",
            "REASONING_RESPONSE_PERSISTED",
            "REASONING_RESPONSE_IMPORTED",
            "NEXT_DIRECTIVE_VALIDATED",
            "EXECUTION_RESUMED",
        }:
            _require(
                state["response"].get("responseId") == response.get("responseId"),
                "conflicting READY response identity",
            )
            return state
        _require(current == "WAITING_FOR_REASONING_REVIEW", "READY outside wait")
        for field in ("responseId", "responseKind", *RESPONSE_IDENTITY_FIELDS):
            _require(field in response, f"READY response missing {field}")
            state["response"][field] = response[field]
        state["response"]["readyObservedAt"] = at
        state["polling"]["lastPollAt"] = at
        state["polling"]["lastCompactState"] = "READY"
        state["polling"]["pollCount"] += 1
        state["state"] = "REASONING_RESPONSE_READY"

    elif event_type == "PERSIST_RESPONSE":
        fields = ("responseId", "responseRef", "sha256", "sizeBytes")
        incoming = {field: event.get(field) for field in fields}
        if current in {
            "REASONING_RESPONSE_PERSISTED",
            "REASONING_RESPONSE_IMPORTED",
            "NEXT_DIRECTIVE_VALIDATED",
            "EXECUTION_RESUMED",
        }:
            _require(
                _same_fields(state["response"], incoming, fields),
                "conflicting persisted response",
            )
            return state
        _require(current == "REASONING_RESPONSE_READY", "response persistence out of order")
        for field, value in incoming.items():
            _require(value not in (None, ""), f"{field} is required for persistence")
            state["response"][field] = value
        state["response"]["persistedAt"] = at
        state["polling"]["fullConversationPayloadsRetrieved"] += 1
        state["state"] = "REASONING_RESPONSE_PERSISTED"

    elif event_type == "IMPORT_RESPONSE":
        key = event.get("importIdempotencyKey")
        if current in {
            "REASONING_RESPONSE_IMPORTED",
            "NEXT_DIRECTIVE_VALIDATED",
            "EXECUTION_RESUMED",
        }:
            _require(
                state["response"].get("importIdempotencyKey") == key,
                "conflicting response import",
            )
            return state
        _require(current == "REASONING_RESPONSE_PERSISTED", "response import out of order")
        _require(bool(key), "import idempotency key is required")
        state["response"]["importIdempotencyKey"] = key
        state["response"]["importedAt"] = at
        state["state"] = "REASONING_RESPONSE_IMPORTED"

    elif event_type == "VALIDATE_NEXT_DIRECTIVE":
        identity = (
            event.get("nextDirectiveId"),
            event.get("nextDirectiveRevision"),
        )
        if current in {"NEXT_DIRECTIVE_VALIDATED", "EXECUTION_RESUMED"}:
            _require(
                identity
                == (
                    state["continuation"].get("nextDirectiveId"),
                    state["continuation"].get("nextDirectiveRevision"),
                ),
                "conflicting next directive application",
            )
            return state
        _require(current == "REASONING_RESPONSE_IMPORTED", "directive validation out of order")
        _require(
            state["response"].get("responseKind") == "NEXT_EXECUTION_DIRECTIVE",
            "response kind does not carry a next execution directive",
        )
        _require(identity[0] and isinstance(identity[1], int), "next directive identity required")
        state["continuation"]["nextDirectiveId"] = identity[0]
        state["continuation"]["nextDirectiveRevision"] = identity[1]
        state["continuation"]["validatedAt"] = at
        state["response"]["appliedAt"] = at
        state["state"] = "NEXT_DIRECTIVE_VALIDATED"

    elif event_type == "RESUME_EXECUTION":
        if current == "EXECUTION_RESUMED":
            return state
        _require(current == "NEXT_DIRECTIVE_VALIDATED", "execution resume out of order")
        state["continuation"]["executionResumedAt"] = at
        state["state"] = "EXECUTION_RESUMED"

    elif event_type == "TRANSFER_HANDOFF_LEASE":
        _require(current == "WAITING_FOR_REASONING_REVIEW", "lease transfer outside wait")
        target = event.get("transferredTo")
        accepted_at = event.get("transferAcceptedAt")
        _require(bool(target) and target != state["lease"].get("owner"), "new lease owner required")
        _parse_utc(accepted_at)
        state["lease"]["transferredTo"] = target
        state["lease"]["transferAcceptedAt"] = accepted_at

    elif event_type == "WAIT_HORIZON_EXCEEDED":
        _require(current == "WAITING_FOR_REASONING_REVIEW", "wait horizon outside wait")
        _require(
            state["lease"].get("transferredTo")
            and state["lease"].get("transferAcceptedAt"),
            "EXECUTOR_HANDOFF_DROPPED: cannot park without an accepted durable lease transfer",
        )
        _require(
            _parse_utc(at) >= _parse_utc(state["lease"]["expiresAt"]),
            "wait horizon has not expired",
        )
        state["blocker"] = {
            "code": "HANDOFF_WAIT_HORIZON_EXCEEDED",
            "recordedAt": at,
            "taskTerminal": False,
        }
        state["taskTerminal"] = False
        state["state"] = "HANDOFF_BLOCKED"

    else:
        raise HandoffValidationError(f"unknown handoff event: {event_type}")

    _append_event(state, event_type, at)
    return state


def compact_poll_projection(handoff: dict[str, Any]) -> dict[str, Any]:
    """Return a constant-shape envelope containing identifiers and PENDING/READY only."""
    ready_states = {
        "REASONING_RESPONSE_READY",
        "REASONING_RESPONSE_PERSISTED",
        "REASONING_RESPONSE_IMPORTED",
        "NEXT_DIRECTIVE_VALIDATED",
        "EXECUTION_RESUMED",
    }
    return {
        "handoffId": handoff["handoffId"],
        "requestId": handoff["reviewRequest"]["requestId"],
        "taskId": handoff["taskId"],
        "state": "READY" if handoff.get("state") in ready_states else "PENDING",
    }
