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
    authority = directive.get("authorityContext", {})
    for field in (
        "activeTaskRef",
        "taskLocalCheckpointRef",
        "repositoryGlobalStateRef",
    ):
        _require(bool(authority.get(field)), f"authorityContext.{field} is required")
    _require(
        authority.get("globalStateRelation")
        in {
            "CURRENT_AND_APPLICABLE",
            "CURRENT_BUT_UNRELATED",
            "STALE_BUT_APPLICABLE_REVALIDATION_REQUIRED",
            "STALE_AND_UNRELATED",
            "AMBIGUOUS",
        },
        "authorityContext.globalStateRelation is invalid",
    )
    _require(
        authority.get("authorityResolutionStatus")
        in {"UNRESOLVED", "VALID", "INVALID", "AMBIGUOUS"},
        "authorityContext.authorityResolutionStatus is invalid",
    )
    _require(
        isinstance(authority.get("currentBlockerIds"), list)
        and all(
            isinstance(blocker_id, str) and blocker_id.strip()
            for blocker_id in authority["currentBlockerIds"]
        ),
        "authorityContext.currentBlockerIds must be a string list",
    )
    _require(
        authority.get("waitAdmissionId") is None
        or (
            isinstance(authority.get("waitAdmissionId"), str)
            and authority["waitAdmissionId"].strip()
        ),
        "authorityContext.waitAdmissionId must be null or a nonempty string",
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


def _is_nonnegative_number(value: Any) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and value >= 0


def _resource_error(
    state: dict[str, Any], event: dict[str, Any], at: str, code: str, detail: str
) -> dict[str, Any]:
    accounting = state["resourceAccounting"]
    identity = str(event.get("usageEventId") or event.get("finalizationId") or "unidentified")
    error = {"identity": identity, "code": code, "detail": detail, "recordedAt": at}
    if error not in accounting["accountingErrors"]:
        accounting["accountingErrors"].append(error)
        _append_event(state, "RESOURCE_ACCOUNTING_REJECTED", at)
    return state


def _record_resource_usage(
    state: dict[str, Any], event: dict[str, Any], at: str
) -> dict[str, Any]:
    accounting = state["resourceAccounting"]
    if accounting["finalizationId"] is not None:
        return _resource_error(
            state,
            event,
            at,
            "ACCOUNTING_ALREADY_FINALIZED",
            "resource usage cannot be recorded after accounting finalization",
        )
    usage_id = event.get("usageEventId")
    if not usage_id:
        return _resource_error(state, event, at, "USAGE_EVENT_ID_REQUIRED", "usageEventId is required")
    existing = [item for item in accounting["usageEvents"] if item["usageEventId"] == usage_id]
    if existing:
        incoming = {key: value for key, value in event.items() if key not in {"type", "at"}}
        if existing[0] == incoming:
            return state
        return _resource_error(
            state,
            event,
            at,
            "ACCOUNTING_EVENT_CONFLICT",
            "a different usage event already has this identity",
        )
    if any(
        key in event
        for key in ("estimatedTokens", "estimatedInputTokens", "estimatedOutputTokens")
    ) or event.get("tokenTelemetry") == "ESTIMATED":
        return _resource_error(
            state,
            event,
            at,
            "GUESSED_TOKEN_TELEMETRY_REJECTED",
            "token accounting must come from exact runtime telemetry",
        )
    phase = event.get("phase")
    if phase not in {"WAIT", "EXECUTION"}:
        return _resource_error(state, event, at, "INVALID_PHASE", "phase must be WAIT or EXECUTION")
    for field in ("surface", "meteringDomain", "telemetrySource"):
        if not str(event.get(field) or "").strip():
            return _resource_error(state, event, at, "ATTRIBUTION_REQUIRED", f"{field} is required")
    started = event.get("windowStartedAt")
    ended = event.get("windowEndedAt")
    try:
        start_time = _parse_utc(started)
        end_time = _parse_utc(ended)
    except HandoffValidationError as exc:
        return _resource_error(state, event, at, "INVALID_ACCOUNTING_WINDOW", str(exc))
    if end_time < start_time:
        return _resource_error(
            state, event, at, "INVALID_ACCOUNTING_WINDOW", "window end precedes start"
        )
    token_quality = event.get("tokenTelemetry")
    input_tokens = event.get("inputTokens")
    output_tokens = event.get("outputTokens")
    if token_quality not in {"EXACT", "PARTIAL", "UNAVAILABLE"}:
        return _resource_error(
            state, event, at, "INVALID_TOKEN_TELEMETRY", "tokenTelemetry is invalid"
        )
    token_values = (input_tokens, output_tokens)
    if token_quality == "EXACT" and not all(
        isinstance(value, int) and not isinstance(value, bool) and value >= 0
        for value in token_values
    ):
        return _resource_error(
            state, event, at, "INEXACT_TOKEN_TELEMETRY", "EXACT requires two exact integer counts"
        )
    if token_quality == "UNAVAILABLE" and token_values != (None, None):
        return _resource_error(
            state, event, at, "UNAVAILABLE_TOKEN_TELEMETRY_HAS_VALUES", "unavailable tokens must be null"
        )
    if token_quality == "PARTIAL" and not all(
        value is None
        or (isinstance(value, int) and not isinstance(value, bool) and value >= 0)
        for value in token_values
    ):
        return _resource_error(
            state, event, at, "INVALID_PARTIAL_TOKEN_TELEMETRY", "partial token values are invalid"
        )
    byte_values = (event.get("requestBytes"), event.get("responseBytes"))
    if not (
        byte_values == (None, None)
        or all(isinstance(value, int) and not isinstance(value, bool) and value >= 0 for value in byte_values)
    ):
        return _resource_error(
            state, event, at, "INVALID_BYTE_TELEMETRY", "byte counts must be two exact integers or null"
        )
    if not isinstance(event.get("callCount"), int) or isinstance(event.get("callCount"), bool) or event["callCount"] < 0:
        return _resource_error(state, event, at, "INVALID_CALL_COUNT", "callCount must be nonnegative")
    if not _is_nonnegative_number(event.get("elapsedSeconds")):
        return _resource_error(
            state, event, at, "INVALID_ELAPSED_TIME", "elapsedSeconds must be nonnegative"
        )
    interval_seconds = (end_time - start_time).total_seconds()
    if float(event["elapsedSeconds"]) != interval_seconds:
        return _resource_error(
            state,
            event,
            at,
            "ACCOUNTING_ELAPSED_WINDOW_MISMATCH",
            "elapsedSeconds must equal the exact accounting-window duration",
        )
    occupied = event.get("executorOccupiedSeconds")
    if phase == "WAIT" and not _is_nonnegative_number(occupied):
        return _resource_error(
            state,
            event,
            at,
            "INVALID_EXECUTOR_OCCUPANCY",
            "WAIT requires nonnegative executorOccupiedSeconds",
        )
    if phase == "EXECUTION" and occupied is not None:
        return _resource_error(
            state,
            event,
            at,
            "INVALID_EXECUTOR_OCCUPANCY",
            "EXECUTION occupancy must be null because execution elapsed is already occupied work",
        )
    for existing_record in accounting["usageEvents"]:
        existing_start = _parse_utc(existing_record["windowStartedAt"])
        existing_end = _parse_utc(existing_record["windowEndedAt"])
        if start_time < existing_end and existing_start < end_time:
            same_phase = existing_record["phase"] == phase
            return _resource_error(
                state,
                event,
                at,
                "ACCOUNTING_WINDOW_OVERLAP" if same_phase else "ACCOUNTING_PHASE_OVERLAP",
                (
                    "accounting windows within one phase must not overlap"
                    if same_phase
                    else "WAIT and EXECUTION accounting windows must not overlap"
                ),
            )
    record = {key: value for key, value in event.items() if key not in {"type", "at"}}
    accounting["usageEvents"].append(record)
    _append_event(state, "RECORD_RESOURCE_USAGE", at)
    return state


def _sum_complete(records: list[dict[str, Any]], field: str) -> int | float | None:
    values = [record.get(field) for record in records]
    if not records or any(value is None for value in values):
        return None
    return sum(values)


def _pair_total(values: dict[str, Any], first: str, second: str) -> int | float | None:
    if values[first] is None or values[second] is None:
        return None
    return values[first] + values[second]


def _ratio(numerator: int | float | None, denominator: int | float | None) -> float | None:
    if numerator is None or denominator is None or denominator <= 0:
        return None
    return float(numerator) / float(denominator)


def _finalize_resource_accounting(
    state: dict[str, Any], event: dict[str, Any], at: str
) -> dict[str, Any]:
    accounting = state["resourceAccounting"]
    finalization_id = event.get("finalizationId")
    if not finalization_id:
        return _resource_error(
            state, event, at, "FINALIZATION_ID_REQUIRED", "finalizationId is required"
        )
    if accounting["finalizationId"] is not None:
        if accounting["finalizationId"] == finalization_id:
            return state
        return _resource_error(
            state, event, at, "ACCOUNTING_FINALIZATION_CONFLICT", "accounting is already finalized"
        )
    records = accounting["usageEvents"]
    wait = [record for record in records if record["phase"] == "WAIT"]
    execution = [record for record in records if record["phase"] == "EXECUTION"]
    for phase, selected, prefix in (
        ("WAIT", wait, "wait"),
        ("EXECUTION", execution, "execution"),
    ):
        surfaces = sorted({record["surface"] for record in selected})
        domains = sorted({record["meteringDomain"] for record in selected})
        accounting["attribution"][f"{prefix}Surfaces"] = surfaces
        accounting["attribution"][f"{prefix}MeteringDomains"] = domains
        if selected:
            accounting["window"][f"{prefix}StartedAt"] = min(
                selected, key=lambda record: _parse_utc(record["windowStartedAt"])
            )["windowStartedAt"]
            accounting["window"][f"{prefix}EndedAt"] = max(
                selected, key=lambda record: _parse_utc(record["windowEndedAt"])
            )["windowEndedAt"]
        target = accounting[prefix]
        target["inputTokens"] = _sum_complete(selected, "inputTokens")
        target["outputTokens"] = _sum_complete(selected, "outputTokens")
        target["requestBytes"] = _sum_complete(selected, "requestBytes")
        target["responseBytes"] = _sum_complete(selected, "responseBytes")
        target["callCount"] = int(sum(record["callCount"] for record in selected))
        target["elapsedSeconds"] = _sum_complete(selected, "elapsedSeconds")
        if phase == "WAIT":
            target["executorOccupiedSeconds"] = _sum_complete(
                selected, "executorOccupiedSeconds"
            )

    qualities = {record["tokenTelemetry"] for record in records}
    exact_tokens = bool(wait and execution) and qualities == {"EXACT"}
    any_tokens = any(
        record.get("inputTokens") is not None or record.get("outputTokens") is not None
        for record in records
    )
    exact_bytes = bool(wait and execution) and all(
        record.get("requestBytes") is not None and record.get("responseBytes") is not None
        for record in records
    )
    quality = accounting["telemetryQuality"]
    quality["tokens"] = "EXACT" if exact_tokens else "PARTIAL" if any_tokens else "UNAVAILABLE"
    quality["transportBytes"] = "EXACT" if exact_bytes else "PARTIAL" if any(
        record.get("requestBytes") is not None or record.get("responseBytes") is not None
        for record in records
    ) else "UNAVAILABLE"
    quality["windows"] = "EXACT" if wait and execution else "PARTIAL" if records else "UNAVAILABLE"
    quality["calls"] = "EXACT" if wait and execution else "PARTIAL" if records else "UNAVAILABLE"
    quality["elapsed"] = "EXACT" if wait and execution else "PARTIAL" if records else "UNAVAILABLE"
    wait_domains = accounting["attribution"]["waitMeteringDomains"]
    execution_domains = accounting["attribution"]["executionMeteringDomains"]
    comparable_domain = (
        len(wait_domains) == 1
        and len(execution_domains) == 1
        and wait_domains == execution_domains
    )
    wait_tokens = _pair_total(accounting["wait"], "inputTokens", "outputTokens")
    execution_tokens = _pair_total(
        accounting["execution"], "inputTokens", "outputTokens"
    )
    wait_bytes = _pair_total(accounting["wait"], "requestBytes", "responseBytes")
    execution_bytes = _pair_total(
        accounting["execution"], "requestBytes", "responseBytes"
    )
    ratios = accounting["ratios"]
    statuses = accounting["ratioStatus"]
    if not wait or not execution:
        statuses["tokens"] = "INCOMPLETE_PHASE_COVERAGE"
        statuses["transportBytes"] = "INCOMPLETE_PHASE_COVERAGE"
        statuses["calls"] = "INCOMPLETE_PHASE_COVERAGE"
        statuses["elapsed"] = "INCOMPLETE_PHASE_COVERAGE"
        statuses["executorOccupied"] = "INCOMPLETE_PHASE_COVERAGE"
    elif not comparable_domain:
        statuses["tokens"] = "INCOMPARABLE_METERING_DOMAINS"
        statuses["transportBytes"] = "INCOMPARABLE_METERING_DOMAINS"
        statuses["calls"] = "INCOMPARABLE_METERING_DOMAINS"
    else:
        if not exact_tokens:
            statuses["tokens"] = (
                "PARTIAL_TOKEN_TELEMETRY" if any_tokens else "UNAVAILABLE"
            )
        elif execution_tokens == 0:
            statuses["tokens"] = "ZERO_EXECUTION_TOKEN_DENOMINATOR"
        else:
            statuses["tokens"] = "COMPARABLE_EXACT_TOKENS"
            ratios["waitToExecutionTokens"] = _ratio(wait_tokens, execution_tokens)
        if not exact_bytes:
            statuses["transportBytes"] = (
                "PARTIAL_TRANSPORT_BYTE_TELEMETRY"
                if quality["transportBytes"] == "PARTIAL"
                else "UNAVAILABLE"
            )
        elif execution_bytes == 0:
            statuses["transportBytes"] = "ZERO_EXECUTION_BYTE_DENOMINATOR"
        else:
            statuses["transportBytes"] = "COMPARABLE_EXACT_TRANSPORT_BYTES_FALLBACK"
            ratios["waitToExecutionTransportBytes"] = _ratio(
                wait_bytes, execution_bytes
            )
        if accounting["execution"]["callCount"] == 0:
            statuses["calls"] = "ZERO_EXECUTION_CALL_DENOMINATOR"
        else:
            statuses["calls"] = "COMPARABLE_EXACT_CALL_COUNTS"
            ratios["waitToExecutionCalls"] = _ratio(
                accounting["wait"]["callCount"],
                accounting["execution"]["callCount"],
            )
    execution_elapsed = accounting["execution"]["elapsedSeconds"]
    if wait and execution and execution_elapsed == 0:
        statuses["elapsed"] = "ZERO_EXECUTION_ELAPSED_DENOMINATOR"
        statuses["executorOccupied"] = "ZERO_EXECUTION_ELAPSED_DENOMINATOR"
    elif wait and execution:
        statuses["elapsed"] = "COMPARABLE_EXACT_ELAPSED_SECONDS"
        statuses["executorOccupied"] = "COMPARABLE_EXACT_OCCUPIED_SECONDS"
        ratios["waitToExecutionElapsed"] = _ratio(
            accounting["wait"]["elapsedSeconds"], execution_elapsed
        )
        ratios["executorOccupiedWaitToExecutionElapsed"] = _ratio(
            accounting["wait"]["executorOccupiedSeconds"], execution_elapsed
        )
    accounting["finalizationId"] = finalization_id
    accounting["finalizedAt"] = at
    _append_event(state, "FINALIZE_RESOURCE_ACCOUNTING", at)
    return state


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

    if event_type == "RECORD_RESOURCE_USAGE":
        return _record_resource_usage(state, event, at)
    if event_type == "FINALIZE_RESOURCE_ACCOUNTING":
        return _finalize_resource_accounting(state, event, at)

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
