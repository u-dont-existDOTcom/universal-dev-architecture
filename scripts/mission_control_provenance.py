#!/usr/bin/env python3
"""Fail-closed Mission Control authority and UI-observation admission rules.

The module deliberately uses no authority ranking.  Every requested operation is
authorized by exact issuer class, exact scope, current source state, and an
append-only transition when the operation changes a claim's decision use.
Browser observations are evidence receipts, not platform attestations.
"""

from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from typing import Any, Iterable


class ProvenanceValidationError(ValueError):
    """Raised when a record cannot be structurally evaluated."""


CLAIM_KINDS = {
    "FACT",
    "IMPLEMENTATION_DETAIL",
    "SCIENTIFIC_CRITERION",
    "PRODUCT_DECISION",
    "RELEASE_CONDITION",
    "OWNER_ACCEPTANCE_CRITERION",
    "SUPERVISORY_VERDICT",
    "IDENTITY_ASSERTION",
}
AUTHORITY_CLASSES = {
    "OWNER_EXPLICIT",
    "OWNER_CORRECTION",
    "REASONING_DECISION",
    "ARTIFACT_DERIVED_FACT",
    "OBSERVED_PLATFORM_STATE",
    "EXECUTOR_PROPOSAL",
}
AUTHORIZATION_OPERATIONS = {
    "ASSERT_FACT",
    "PROMOTE_TO_POLICY",
    "AUTHOR_SUPERVISORY_VERDICT",
    "AUTHORIZE_EXECUTION",
    "AUTHORIZE_RELEASE",
}
AUTHORIZATION_STATES = {"SATISFIED", "MISSING", "MISMATCH", "STALE", "REVOKED"}
VERIFICATION_STATES = {
    "UNVERIFIED",
    "VERIFIED_FACT_ONLY",
    "AUTHORIZED_POLICY",
    "ADVISORY_ONLY",
    "MISMATCH",
    "STALE",
    "REVOKED",
    "REJECTED",
}
DECISION_USES = {
    "DESCRIPTIVE_ONLY",
    "ADVISORY_ONLY",
    "POLICY_ELIGIBLE",
    "EXECUTION_ELIGIBLE",
    "FORBIDDEN",
}
TRANSITION_TYPES = {"DERIVED", "PROMOTED", "REVOKED", "SUPERSEDED"}
TRANSITION_STATUSES = {"APPLIED", "REJECTED"}
REASONING_OBSERVATION_STATES = {"VERIFIED", "MISSING", "MISMATCH", "UNVERIFIED", "STALE"}
REASONING_AGGREGATE_STATES = {
    "VERIFIED_COMPLETE",
    "PARTIAL",
    "MISMATCH",
    "UNVERIFIED",
    "STALE",
    "REPLAY_REJECTED",
}
LOAD_BEARING_USE_KINDS = {
    "ACCEPTANCE_CRITERION",
    "RELEASE_CONDITION",
    "OWNER_FACING_DEFINITIVE_RENDERING",
    "EXECUTION_AUTHORIZATION",
    "SUPERVISORY_VERDICT",
}
INVALID_REASONING_EVIDENCE_TYPES = {
    "AGENT_NAME",
    "SUBAGENT_NAME",
    "TASK_NAME",
    "ROLE_LABEL",
    "BRANCH_NAME",
    "WORKTREE_PATH",
    "PROCESS_NAME",
    "ENVIRONMENT_VARIABLE",
    "PROMPT_REQUEST",
    "MODEL_SELF_DESCRIPTION",
    "PACKET_AUTHOR_ASSERTION",
    "GITHUB_ASSERTION",
}

CLAIM_FAILURE_CODES = {
    "UNAUTHORIZED_ADDITION",
    "INFERRED_NUMERIC_SCOPE",
    "DERIVATION_UNVERIFIED",
    "DIRECTIVE_SCOPE_EXCEEDED",
    "UNAUTHORIZED_CLAIM_PROMOTION",
    "AUTHORIZATION_REQUIREMENT_UNSATISFIED",
    "SUBJECT_BINDING_STALE",
    "PRODUCTION_REPRODUCTION_MISSING",
    "DEFINITIVE_RENDERING_REJECTED",
}
REASONING_FAILURE_CODES = {
    "SELF_ASSERTED_REASONING_IDENTITY_REJECTED",
    "REASONING_SURFACE_MODE_MISMATCH",
    "REASONING_RECEIPT_SESSION_MISMATCH",
    "REASONING_RECEIPT_REPLAY_REJECTED",
    "REASONING_RECEIPT_PAYLOAD_MISMATCH",
    "REASONING_RECEIPT_INCOMPLETE",
    "VERDICT_RECEIPT_BINDING_MISMATCH",
    "ASSURANCE_CLASS_OVERCLAIM",
}
BROWSER_FAILURE_CODES = {
    "BROWSER_ROUTE_NOT_JUSTIFIED",
    "AGENT_TAB_CAP_EXCEEDED",
    "TAB_OWNERSHIP_UNVERIFIED",
    "TAB_SESSION_MISMATCH",
    "PROTECTED_TAB_MUTATION_ATTEMPT",
    "AGENT_TAB_CLEANUP_INCOMPLETE",
    "UNNECESSARY_OWNER_BROWSER_MUTATION",
}


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ProvenanceValidationError(message)


def _nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _sha256(value: Any, field: str) -> str:
    _require(
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value),
        f"{field} must be 64 lowercase hexadecimal characters",
    )
    return value


def _append_failure(failures: list[str], code: str) -> None:
    if code not in failures:
        failures.append(code)


def _jcs_text(value: Any) -> str:
    """Canonicalize the integer-only JSON subset used by these templates.

    RFC 8785 number rendering is intentionally not reimplemented partially.
    Floats are rejected; records requiring fractional values must use an actual
    RFC 8785 implementation before they can claim this digest class.
    """

    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    if isinstance(value, float):
        raise ProvenanceValidationError(
            "floating-point values require a full RFC8785 implementation"
        )
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(_jcs_text(item) for item in value) + "]"
    if isinstance(value, dict):
        _require(
            all(isinstance(key, str) for key in value),
            "canonical JSON object keys must be strings",
        )
        keys = sorted(value, key=lambda key: key.encode("utf-16-be"))
        return "{" + ",".join(
            f"{_jcs_text(key)}:{_jcs_text(value[key])}" for key in keys
        ) + "}"
    raise ProvenanceValidationError(f"unsupported canonical JSON type: {type(value)}")


def canonical_sha256(value: Any) -> str:
    """Return a lowercase SHA-256 over canonical UTF-8 JSON bytes."""

    return hashlib.sha256(_jcs_text(value).encode("utf-8")).hexdigest()


def claim_semantics(claim: dict[str, Any]) -> dict[str, Any]:
    """Return the digest scope for a versioned claim."""

    return {key: deepcopy(value) for key, value in claim.items() if key != "claimDigest"}


def claim_digest(claim: dict[str, Any]) -> str:
    return canonical_sha256(claim_semantics(claim))


def transition_digest(transition: dict[str, Any]) -> str:
    return canonical_sha256(
        {key: deepcopy(value) for key, value in transition.items() if key != "transitionDigest"}
    )


def _authority_sources(claim: dict[str, Any]) -> dict[str, dict[str, Any]]:
    sources: dict[str, dict[str, Any]] = {}
    for authority in claim.get("currentAuthorities", []):
        ref = authority.get("authoritySourceRef")
        if _nonempty(ref):
            sources[ref] = authority
    return sources


def validate_claim_record(claim: dict[str, Any]) -> None:
    _require(claim.get("schemaVersion") == 3, "claim schemaVersion must be 3")
    _require(_nonempty(claim.get("claimId")), "claimId is required")
    _require(
        isinstance(claim.get("claimVersion"), int) and claim["claimVersion"] >= 1,
        "claimVersion must be a positive integer",
    )
    _require(_nonempty(claim.get("claimText")), "claimText is required")
    _require(claim.get("claimKind") in CLAIM_KINDS, "claimKind is invalid")
    _require(claim.get("verificationState") in VERIFICATION_STATES, "verificationState is invalid")
    _require(claim.get("decisionUse") in DECISION_USES, "decisionUse is invalid")
    for forbidden in ("authorityRank", "currentAuthority", "requiredAuthority", "authorityCeiling"):
        _require(forbidden not in claim, f"{forbidden} encodes forbidden scalar authority")

    digest = claim.get("claimDigest", {})
    _require(digest.get("algorithm") == "sha256", "claimDigest.algorithm must be sha256")
    _require(digest.get("canonicalization") == "RFC8785_JCS", "claim digest must declare RFC8785_JCS")
    _require(digest.get("digestScope") == "CLAIM_SEMANTICS", "claim digest scope is invalid")
    _sha256(digest.get("value"), "claimDigest.value")
    _require(isinstance(digest.get("byteLength"), int), "claimDigest.byteLength must be an integer")
    semantic_bytes = _jcs_text(claim_semantics(claim)).encode("utf-8")
    _require(
        digest.get("value") == hashlib.sha256(semantic_bytes).hexdigest(),
        "claimDigest.value does not match the claim semantics",
    )
    _require(
        digest.get("byteLength") == len(semantic_bytes),
        "claimDigest.byteLength does not match the claim semantics",
    )

    subject = claim.get("subjectRef", {})
    _require(_nonempty(subject.get("subjectType")), "subjectRef.subjectType is required")
    _require(_nonempty(subject.get("ref")), "subjectRef.ref is required")
    authorities = claim.get("currentAuthorities")
    _require(isinstance(authorities, list), "currentAuthorities must be a list")
    for authority in authorities:
        _require(authority.get("authorityClass") in AUTHORITY_CLASSES, "authorityClass is invalid")
        _require(_nonempty(authority.get("authoritySourceRef")), "authoritySourceRef is required")
        scopes = authority.get("authorityScope")
        _require(isinstance(scopes, list) and scopes, "authorityScope must be nonempty")
        _require(all(scope in AUTHORIZATION_OPERATIONS for scope in scopes), "authorityScope is invalid")
        scope_refs = authority.get("scopeRefs")
        _require(
            isinstance(scope_refs, list)
            and bool(scope_refs)
            and all(_nonempty(scope_ref) for scope_ref in scope_refs),
            "scopeRefs must contain exact nonempty scope references",
        )
        _require(authority.get("status") in {"CURRENT", "REVOKED", "SUPERSEDED", "STALE"}, "authority status is invalid")

    requirements = claim.get("requiredAuthorizations")
    _require(isinstance(requirements, list), "requiredAuthorizations must be a list")
    for requirement in requirements:
        _require(requirement.get("operation") in AUTHORIZATION_OPERATIONS, "authorization operation is invalid")
        _require(requirement.get("requiredIssuerClass") in AUTHORITY_CLASSES, "requiredIssuerClass is invalid")
        _require(_nonempty(requirement.get("scopeRef")), "authorization scopeRef is required")
        _require(requirement.get("status") in AUTHORIZATION_STATES, "authorization status is invalid")


def is_load_bearing(claim: dict[str, Any], use_site: str | None = None) -> bool:
    refs = claim.get("useSiteRefs", [])
    kinds = {
        item if isinstance(item, str) else item.get("useSiteKind")
        for item in refs
    }
    if use_site:
        kinds.add(use_site)
    return bool(kinds & LOAD_BEARING_USE_KINDS)


def evaluate_subject_freshness(
    claim: dict[str, Any],
    current_subject: dict[str, Any] | None = None,
    current_directive_version: str | None = None,
) -> dict[str, Any]:
    failures: list[str] = []
    if current_subject is not None and claim.get("subjectRef") != current_subject:
        _append_failure(failures, "SUBJECT_BINDING_STALE")
    derivation = claim.get("derivation") or {}
    if current_directive_version is not None and derivation.get("directiveVersion") != current_directive_version:
        _append_failure(failures, "SUBJECT_BINDING_STALE")
    return {"fresh": not failures, "failureCodes": failures}


def evaluate_claim_use(
    claim: dict[str, Any],
    operation: str,
    *,
    use_site: str | None = None,
    current_subject: dict[str, Any] | None = None,
    current_directive_version: str | None = None,
    promotion_transition: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Evaluate exact scoped authorizations conjunctively."""

    validate_claim_record(claim)
    _require(operation in AUTHORIZATION_OPERATIONS, "operation is invalid")
    failures: list[str] = []
    freshness = evaluate_subject_freshness(
        claim, current_subject, current_directive_version
    )
    failures.extend(freshness["failureCodes"])

    sources = _authority_sources(claim)
    requirements = [
        requirement
        for requirement in claim["requiredAuthorizations"]
        if requirement["operation"] == operation
    ]
    if operation != "ASSERT_FACT" and not requirements:
        _append_failure(failures, "AUTHORIZATION_REQUIREMENT_UNSATISFIED")
    for requirement in requirements:
        source = sources.get(requirement.get("authorizationSourceRef"))
        satisfied = (
            requirement.get("status") == "SATISFIED"
            and source is not None
            and source.get("authorityClass") == requirement.get("requiredIssuerClass")
            and operation in source.get("authorityScope", [])
            and requirement.get("scopeRef") in source.get("scopeRefs", [])
            and source.get("status") == "CURRENT"
        )
        if not satisfied:
            _append_failure(failures, "AUTHORIZATION_REQUIREMENT_UNSATISFIED")

    if operation == "PROMOTE_TO_POLICY":
        if promotion_transition is None or promotion_transition.get("transitionType") != "PROMOTED":
            _append_failure(failures, "UNAUTHORIZED_CLAIM_PROMOTION")
        if claim.get("decisionUse") != "POLICY_ELIGIBLE":
            _append_failure(failures, "UNAUTHORIZED_CLAIM_PROMOTION")

    revoked = any(
        authority.get("status") in {"REVOKED", "SUPERSEDED", "STALE"}
        for authority in claim["currentAuthorities"]
    )
    if revoked and claim.get("decisionUse") not in {"DESCRIPTIVE_ONLY", "FORBIDDEN"}:
        _append_failure(failures, "AUTHORIZATION_REQUIREMENT_UNSATISFIED")

    if is_load_bearing(claim, use_site) and use_site == "OWNER_FACING_DEFINITIVE_RENDERING":
        if claim.get("decisionUse") not in {"POLICY_ELIGIBLE", "EXECUTION_ELIGIBLE"}:
            _append_failure(failures, "DEFINITIVE_RENDERING_REJECTED")
        if claim.get("verificationState") in {
            "UNVERIFIED",
            "VERIFIED_FACT_ONLY",
            "ADVISORY_ONLY",
            "MISMATCH",
            "STALE",
            "REVOKED",
            "REJECTED",
        }:
            _append_failure(failures, "DEFINITIVE_RENDERING_REJECTED")

    return {
        "allowed": not failures,
        "loadBearing": is_load_bearing(claim, use_site),
        "failureCodes": failures,
    }


def validate_claim_transition(
    transition: dict[str, Any],
    from_claim: dict[str, Any],
    to_claim: dict[str, Any],
    *,
    previous_transition: dict[str, Any] | None = None,
) -> dict[str, Any]:
    validate_claim_record(from_claim)
    validate_claim_record(to_claim)
    failures: list[str] = []
    _require(transition.get("schemaVersion") == 1, "transition schemaVersion must be 1")
    _require(transition.get("transitionType") in TRANSITION_TYPES, "transitionType is invalid")
    _require(transition.get("status") in TRANSITION_STATUSES, "transition status is invalid")
    _sha256(transition.get("transitionDigest"), "transitionDigest")

    from_ref = transition.get("fromClaimRef", {})
    to_ref = transition.get("toClaimRef", {})
    if (
        from_ref.get("claimId") != from_claim.get("claimId")
        or from_ref.get("claimVersion") != from_claim.get("claimVersion")
        or from_ref.get("claimDigest") != from_claim.get("claimDigest", {}).get("value")
    ):
        _append_failure(failures, "SUBJECT_BINDING_STALE")
    if (
        to_ref.get("claimId") != to_claim.get("claimId")
        or to_ref.get("claimVersion") != to_claim.get("claimVersion")
        or to_ref.get("claimDigest") != to_claim.get("claimDigest", {}).get("value")
    ):
        _append_failure(failures, "SUBJECT_BINDING_STALE")

    expected_previous = (
        previous_transition.get("transitionDigest") if previous_transition else None
    )
    if transition.get("previousTransitionDigest") != expected_previous:
        _append_failure(failures, "SUBJECT_BINDING_STALE")
    if transition_digest(transition) != transition.get("transitionDigest"):
        _append_failure(failures, "SUBJECT_BINDING_STALE")

    if transition.get("transitionType") == "PROMOTED":
        if to_claim.get("claimVersion") != from_claim.get("claimVersion") + 1:
            _append_failure(failures, "UNAUTHORIZED_CLAIM_PROMOTION")
        if from_claim.get("decisionUse") != "DESCRIPTIVE_ONLY":
            _append_failure(failures, "UNAUTHORIZED_CLAIM_PROMOTION")
        before_refs = set(_authority_sources(from_claim))
        after_refs = set(_authority_sources(to_claim))
        new_refs = after_refs - before_refs
        transition_source_refs = set(transition.get("authoritySourceRefs", []))
        required_source_refs = {
            requirement.get("authorizationSourceRef")
            for requirement in to_claim.get("requiredAuthorizations", [])
            if requirement.get("operation") == "PROMOTE_TO_POLICY"
            and requirement.get("status") == "SATISFIED"
        }
        if (
            not new_refs
            or not transition_source_refs
            or not transition_source_refs <= new_refs
            or not required_source_refs <= transition_source_refs
        ):
            _append_failure(failures, "UNAUTHORIZED_CLAIM_PROMOTION")
        result = evaluate_claim_use(
            to_claim,
            "PROMOTE_TO_POLICY",
            promotion_transition=transition,
        )
        failures.extend(
            code for code in result["failureCodes"] if code not in failures
        )

    return {"valid": not failures, "failureCodes": failures}


def validate_owner_source_append_only(
    previous_sources: list[dict[str, Any]], current_sources: list[dict[str, Any]]
) -> dict[str, Any]:
    failures: list[str] = []
    if len(current_sources) < len(previous_sources):
        _append_failure(failures, "UNAUTHORIZED_ADDITION")
    elif current_sources[: len(previous_sources)] != previous_sources:
        _append_failure(failures, "UNAUTHORIZED_ADDITION")
    return {"valid": not failures, "failureCodes": failures}


def append_owner_source_correction(
    sources: list[dict[str, Any]], correction: dict[str, Any]
) -> list[dict[str, Any]]:
    _require(_nonempty(correction.get("sourceId")), "correction sourceId is required")
    _require(
        correction.get("sourceId") not in {source.get("sourceId") for source in sources},
        "correction sourceId must be unique",
    )
    result = deepcopy(sources)
    result.append(deepcopy(correction))
    return result


def evaluate_reproduction(
    receipt: dict[str, Any],
    claim: dict[str, Any],
    *,
    current_subject: dict[str, Any] | None = None,
    production_required: bool = False,
) -> dict[str, Any]:
    validate_claim_record(claim)
    failures: list[str] = []
    _require(receipt.get("schemaVersion") == 1, "reproduction schemaVersion must be 1")
    claim_ref = receipt.get("claimRef", {})
    if (
        claim_ref.get("claimId") != claim.get("claimId")
        or claim_ref.get("claimVersion") != claim.get("claimVersion")
        or claim_ref.get("claimDigest") != claim.get("claimDigest", {}).get("value")
    ):
        _append_failure(failures, "SUBJECT_BINDING_STALE")
    if receipt.get("subjectRef") != claim.get("subjectRef"):
        _append_failure(failures, "SUBJECT_BINDING_STALE")
    if current_subject is not None and receipt.get("subjectRef") != current_subject:
        _append_failure(failures, "SUBJECT_BINDING_STALE")
    if receipt.get("promotesAuthority") is not False:
        _append_failure(failures, "UNAUTHORIZED_CLAIM_PROMOTION")
    if production_required and receipt.get("synthetic") is not False:
        _append_failure(failures, "PRODUCTION_REPRODUCTION_MISSING")
    if receipt.get("matchState") != "MATCH" or receipt.get("freshnessState") != "CURRENT":
        _append_failure(failures, "DERIVATION_UNVERIFIED")
    return {
        "valid": not failures,
        "verifiedFact": not failures,
        "policyPromoted": False,
        "failureCodes": failures,
    }


def _observation_bindings_match(
    observation: dict[str, Any], transaction_id: str, session_id: str
) -> bool:
    binding = observation.get("binding", {})
    return (
        binding.get("transactionId") == transaction_id
        and binding.get("conversationSessionId") == session_id
    )


def evaluate_reasoning_surface_receipt(
    receipt: dict[str, Any],
    *,
    prior_receipts: Iterable[dict[str, Any]] = (),
) -> dict[str, Any]:
    failures: list[str] = []
    _require(receipt.get("schemaVersion") == 1, "reasoning receipt schemaVersion must be 1")
    _require(receipt.get("assuranceClass") == "OBSERVED_UI_RECEIPT", "assuranceClass must be OBSERVED_UI_RECEIPT")
    if receipt.get("evidenceSourceType") != "BROWSER_UI_OBSERVATION":
        _append_failure(failures, "SELF_ASSERTED_REASONING_IDENTITY_REJECTED")
    if receipt.get("cryptographicPlatformAttestation") is not False:
        _append_failure(failures, "ASSURANCE_CLASS_OVERCLAIM")
    transaction_id = receipt.get("transactionId")
    session_id = receipt.get("conversation", {}).get("conversationSessionId")
    _require(_nonempty(transaction_id), "transactionId is required")
    _require(_nonempty(session_id), "conversationSessionId is required")
    _require(
        receipt.get("conversation", {}).get("surfaceOrigin") == "https://chatgpt.com",
        "reasoning receipt must bind the ChatGPT surface origin",
    )
    role = receipt.get("requiredReviewerRole")
    _require(role in {"PRO", "EXTRA_HIGH"}, "requiredReviewerRole is invalid")

    replay = receipt.get("replayProtection", {})
    nonce = replay.get("admissionNonce")
    for prior in prior_receipts:
        prior_replay = prior.get("replayProtection", {})
        if (
            prior.get("receiptId") == receipt.get("receiptId")
            or (_nonempty(nonce) and nonce == prior_replay.get("admissionNonce"))
            or prior.get("transactionId") == transaction_id
        ):
            _append_failure(failures, "REASONING_RECEIPT_REPLAY_REJECTED")
            break
    if replay.get("usedByVerdictRef") is not None:
        _append_failure(failures, "REASONING_RECEIPT_REPLAY_REJECTED")

    binding = receipt.get("subjectBinding", {})
    input_digest = binding.get("inputPayloadDigest", {}).get("value")
    submitted_digest = binding.get("submittedVisiblePayloadDigest", {}).get("value")
    if input_digest != submitted_digest:
        transform = binding.get("submissionTransform", {})
        if (
            transform.get("type") == "NONE"
            or not _nonempty(transform.get("description"))
            or not _nonempty(transform.get("transformDigest"))
        ):
            _append_failure(failures, "REASONING_RECEIPT_PAYLOAD_MISMATCH")

    required_names = (
        "surface",
        "account",
        "visibleModePreSubmission",
        "conversationSession",
        "submittedMessage",
        "completedResponse",
        "visibleModePostResponse",
    )
    observations = receipt.get("observations", {})
    canonical_requirements = {
        "surface": "SIGNED_IN_CHATGPT_CHAT",
        "conversationSession": "SAME_TRANSACTION_SESSION",
        "submittedMessage": "EXACT_BOUND_PAYLOAD",
        "completedResponse": "ONE_COMPLETE_ASSISTANT_RESPONSE",
        "visibleModePreSubmission": "Pro" if role == "PRO" else "Extra High",
        "visibleModePostResponse": "Pro" if role == "PRO" else "Extra High",
    }
    missing = False
    mismatch = False
    for name in required_names:
        observation = observations.get(name, {})
        status = observation.get("status")
        _require(status in REASONING_OBSERVATION_STATES, f"{name}.status is invalid")
        evidence_type = observation.get("evidenceSourceType")
        if status == "VERIFIED" and (
            evidence_type in INVALID_REASONING_EVIDENCE_TYPES
            or evidence_type != "BROWSER_UI_OBSERVATION"
        ):
            _append_failure(failures, "SELF_ASSERTED_REASONING_IDENTITY_REJECTED")
        if status != "VERIFIED":
            missing = missing or status in {"MISSING", "UNVERIFIED", "STALE"}
            mismatch = mismatch or status == "MISMATCH"
        if status == "VERIFIED" and not _observation_bindings_match(
            observation, transaction_id, session_id
        ):
            _append_failure(failures, "REASONING_RECEIPT_SESSION_MISMATCH")
        if (
            name in canonical_requirements
            and observation.get("requiredValue") != canonical_requirements[name]
        ):
            _append_failure(failures, "REASONING_RECEIPT_PAYLOAD_MISMATCH")
    if missing:
        _append_failure(failures, "REASONING_RECEIPT_INCOMPLETE")
    if mismatch:
        _append_failure(failures, "REASONING_RECEIPT_SESSION_MISMATCH")

    for exact_name in (
        "surface",
        "account",
        "conversationSession",
        "submittedMessage",
    ):
        observation = observations.get(exact_name, {})
        if (
            observation.get("status") == "VERIFIED"
            and observation.get("observedValue") != observation.get("requiredValue")
        ):
            _append_failure(failures, "REASONING_RECEIPT_PAYLOAD_MISMATCH")

    for mode_name in ("visibleModePreSubmission", "visibleModePostResponse"):
        mode = observations.get(mode_name, {})
        if mode.get("status") == "VERIFIED" and mode.get("observedValue") != mode.get("requiredValue"):
            _append_failure(failures, "REASONING_SURFACE_MODE_MISMATCH")

    completed_value = observations.get("completedResponse", {}).get("observedValue")
    response_value = receipt.get("responsePayloadDigest", {}).get("value")
    if completed_value != response_value:
        _append_failure(failures, "REASONING_RECEIPT_PAYLOAD_MISMATCH")

    if "REASONING_RECEIPT_REPLAY_REJECTED" in failures:
        aggregate = "REPLAY_REJECTED"
    elif any("MISMATCH" in code for code in failures):
        aggregate = "MISMATCH"
    elif failures:
        aggregate = "PARTIAL"
    else:
        aggregate = "VERIFIED_COMPLETE"
    if receipt.get("aggregateState") != aggregate:
        if aggregate == "VERIFIED_COMPLETE":
            _append_failure(failures, "REASONING_RECEIPT_INCOMPLETE")
        elif receipt.get("aggregateState") == "VERIFIED_COMPLETE":
            _append_failure(failures, "REASONING_RECEIPT_INCOMPLETE")

    return {
        "valid": not failures and aggregate == "VERIFIED_COMPLETE",
        "aggregateState": aggregate,
        "failureCodes": failures,
    }


def admit_supervision_verdict(
    verdict: dict[str, Any],
    receipt: dict[str, Any],
    *,
    prior_receipts: Iterable[dict[str, Any]] = (),
) -> dict[str, Any]:
    receipt_result = evaluate_reasoning_surface_receipt(
        receipt, prior_receipts=prior_receipts
    )
    failures = list(receipt_result["failureCodes"])
    verdict_digest = verdict.get("responsePayloadDigest", {})
    receipt_digest = receipt.get("responsePayloadDigest", {})
    if verdict.get("reasoningSurfaceReceiptRef") != receipt.get("receiptId"):
        _append_failure(failures, "VERDICT_RECEIPT_BINDING_MISMATCH")
    if verdict_digest != receipt_digest:
        _append_failure(failures, "VERDICT_RECEIPT_BINDING_MISMATCH")
    if verdict.get("reviewRole") != receipt.get("requiredReviewerRole"):
        _append_failure(failures, "VERDICT_RECEIPT_BINDING_MISMATCH")
    if verdict.get("scopeKey") != receipt.get("scopeKey") or verdict.get("packetId") != receipt.get("packetId"):
        _append_failure(failures, "VERDICT_RECEIPT_BINDING_MISMATCH")
    if verdict.get("admissionState") != "PENDING_RECEIPT" or verdict.get("authoritative") is not False:
        _append_failure(failures, "VERDICT_RECEIPT_BINDING_MISMATCH")
    if failures:
        admission_state = (
            "REJECTED_REPLAY"
            if "REASONING_RECEIPT_REPLAY_REJECTED" in failures
            else "REJECTED_RESPONSE_BINDING"
            if "VERDICT_RECEIPT_BINDING_MISMATCH" in failures
            else "REJECTED_MISMATCH"
        )
        return {
            "admitted": False,
            "authoritative": False,
            "admissionState": admission_state,
            "failureCodes": failures,
        }
    return {
        "admitted": True,
        "authoritative": True,
        "admissionState": "ADMITTED",
        "failureCodes": [],
    }


def evaluate_browser_operation(receipt: dict[str, Any]) -> dict[str, Any]:
    failures: list[str] = []
    _require(receipt.get("schemaVersion") == 1, "browser receipt schemaVersion must be 1")
    transaction_id = receipt.get("transactionId")
    session_ref = receipt.get("browserSessionRef")
    _require(_nonempty(transaction_id), "browser transactionId is required")
    _require(_nonempty(session_ref), "browserSessionRef is required")

    alternatives = receipt.get("nonBrowserAlternatives", [])
    capable_alternative = any(
        alternative.get("availability") == "AVAILABLE"
        and alternative.get("satisfiesCapability") is True
        for alternative in alternatives
    )
    if receipt.get("selectedRoute") == "BROWSER" and capable_alternative:
        _append_failure(failures, "BROWSER_ROUTE_NOT_JUSTIFIED")
    if receipt.get("selectedRoute") == "BROWSER" and receipt.get("browserNecessity") != "REQUIRED":
        _append_failure(failures, "BROWSER_ROUTE_NOT_JUSTIFIED")

    agent_tabs = receipt.get("agentOpenedTabIds", [])
    opened_by_actions = {
        action.get("tabId")
        for action in receipt.get("actions", [])
        if action.get("type") == "OPEN"
    }
    if not opened_by_actions <= set(agent_tabs):
        _append_failure(failures, "TAB_OWNERSHIP_UNVERIFIED")
    max_tabs = receipt.get("maxAgentTransientTabs")
    if (
        isinstance(max_tabs, int)
        and len(agent_tabs) > max_tabs
        and not _nonempty(receipt.get("exceptionRef"))
    ):
        _append_failure(failures, "AGENT_TAB_CAP_EXCEEDED")

    baseline = {
        tab.get("tabId"): tab for tab in receipt.get("baselineTabs", [])
    }
    known_agent_tabs = set(agent_tabs)
    for action in receipt.get("actions", []):
        action_type = action.get("type")
        tab_id = action.get("tabId")
        if action.get("browserSessionRef") != session_ref or action.get("transactionId") != transaction_id:
            _append_failure(failures, "TAB_SESSION_MISMATCH")
        ownership = action.get("ownershipClass")
        protected = action.get("protected") is True or baseline.get(tab_id, {}).get("protected") is True
        if action_type in {"NAVIGATE", "CLOSE"} and protected:
            _append_failure(failures, "PROTECTED_TAB_MUTATION_ATTEMPT")
        if action_type == "CLOSE":
            if ownership != "AGENT_OPENED" or tab_id not in known_agent_tabs:
                _append_failure(failures, "TAB_OWNERSHIP_UNVERIFIED")
        if action_type == "OPEN" and ownership != "AGENT_OPENED":
            _append_failure(failures, "TAB_OWNERSHIP_UNVERIFIED")
        if ownership == "UNKNOWN" and action_type in {"NAVIGATE", "CLOSE"}:
            _append_failure(failures, "TAB_OWNERSHIP_UNVERIFIED")
        if action_type == "OBSERVE_ABSENT" and action.get("closedByActor") not in {None, "UNKNOWN"}:
            _append_failure(failures, "TAB_OWNERSHIP_UNVERIFIED")
        if (
            ownership == "OWNER_EXISTING"
            and action_type in {"OPEN", "NAVIGATE", "CLOSE"}
            and receipt.get("browserNecessity") != "REQUIRED"
        ):
            _append_failure(failures, "UNNECESSARY_OWNER_BROWSER_MUTATION")

    if receipt.get("ownerTabsTouched") is True:
        _append_failure(failures, "UNNECESSARY_OWNER_BROWSER_MUTATION")
    cleanup = receipt.get("cleanup", {})
    _require("attempted" in cleanup, "cleanup.attempted must be recorded")
    _require(isinstance(cleanup.get("results"), list), "cleanup.results must be recorded")
    _require(
        isinstance(cleanup.get("remainingAgentTabIds"), list),
        "cleanup.remainingAgentTabIds must be recorded",
    )
    if cleanup.get("remainingAgentTabIds"):
        _append_failure(failures, "AGENT_TAB_CLEANUP_INCOMPLETE")
    for cleanup_result in cleanup.get("results", []):
        if cleanup_result.get("tabId") not in known_agent_tabs:
            _append_failure(failures, "TAB_OWNERSHIP_UNVERIFIED")

    for recorded in receipt.get("failureCodes", []):
        if recorded in BROWSER_FAILURE_CODES:
            _append_failure(failures, recorded)
    return {"allowed": not failures, "failureCodes": failures}


def parse_all_json(root: Any) -> list[str]:
    """Return invalid JSON paths below a repository root."""

    invalid: list[str] = []
    for path in root.rglob("*.json"):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            invalid.append(str(path))
    return invalid
