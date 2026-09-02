from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from types import MappingProxyType
from uuid import uuid4

from scripts.mission_control_provenance import (
    DurableReceiptConsumptionStore,
    ImmutableAuthoritySourceRegistry,
    ImmutableBrowserOwnershipRegistry,
    ImmutableClaimTransitionRegistry,
    ImmutablePayloadTransform,
    ImmutableReproductionIndependenceRegistry,
    _jcs_text,
    append_owner_source_correction,
    authority_source_digest,
    browser_ownership_proof_digest,
    claim_digest,
    evaluate_browser_operation,
    evaluate_claim_use,
    evaluate_reasoning_surface_receipt,
    evaluate_reproduction,
    evaluate_subject_freshness,
    admit_supervision_verdict,
    transition_digest,
    reproduction_independence_admission_digest,
    validate_claim_transition,
    validate_owner_source_append_only,
)
from scripts.validate_mission_control_provenance import (
    SchemaError,
    validate_instance,
    validate_repository,
)


ROOT = Path(__file__).resolve().parents[1]
ZERO = "0" * 64
ONE = "1" * 64
TWO = "2" * 64
INPUT_BYTES = b"exact source packet"
RESPONSE_BYTES = b"exact completed response"
ADMISSION_QUESTION_BYTES = b"accept, revise, or reject this bounded review packet"
ACCOUNT_REF = "signed-in-account-primary"
REVIEW_SUBJECT = "supervision-architecture/a40d413-authority-provenance-v1"
REPOSITORY_HEAD = "u-dont-existDOTcom/universal-dev-architecture@156c42d"
_TEST_LEDGER_DIR = tempfile.TemporaryDirectory()


def load_template(name: str) -> dict:
    return json.loads((ROOT / "templates" / name).read_text(encoding="utf-8"))


def refresh_claim_digest(claim: dict) -> None:
    semantics = {key: value for key, value in claim.items() if key != "claimDigest"}
    claim["claimDigest"]["value"] = claim_digest(claim)
    claim["claimDigest"]["byteLength"] = len(_jcs_text(semantics).encode("utf-8"))


def make_authority_registry_from_claim(claim: dict) -> ImmutableAuthoritySourceRegistry:
    records = []
    for authority in claim["currentAuthorities"]:
        record = deepcopy(authority)
        record["sourceRecordDigest"] = authority_source_digest(record)
        records.append(record)
    return ImmutableAuthoritySourceRegistry.from_records("authority-registry-v1", records)


def bind_claim_registry(claim: dict) -> ImmutableAuthoritySourceRegistry:
    registry = make_authority_registry_from_claim(claim)
    claim["authorityRegistryRef"] = registry.registry_id
    claim["authorityRegistryDigest"] = registry.registry_digest
    return registry


def empty_browser_registry() -> ImmutableBrowserOwnershipRegistry:
    return ImmutableBrowserOwnershipRegistry.from_records(
        "browser-ownership-registry-empty-v1", []
    )


def empty_transition_registry(claim_id: str) -> ImmutableClaimTransitionRegistry:
    return ImmutableClaimTransitionRegistry.from_records(
        f"transition-registry-empty-{claim_id}", claim_id, []
    )


def standard_independence_registry() -> ImmutableReproductionIndependenceRegistry:
    admission = {
        "independenceAdmissionRef": "independence-admission-1",
        "producerEvidenceRef": "producer-evidence",
        "producer": {
            "identityRef": "producer-process",
            "trustDomain": "producer-domain",
        },
        "reproducer": {
            "identityRef": "independent-process",
            "type": "HUMAN_OR_INDEPENDENT_PROCESS",
            "trustDomain": "independent-domain",
        },
        "independenceBasis": "Separate deterministic process",
        "admittedByRef": "relying-party-validator",
        "status": "ADMITTED",
        "admissionDigest": ZERO,
    }
    admission["admissionDigest"] = reproduction_independence_admission_digest(
        admission
    )
    return ImmutableReproductionIndependenceRegistry.from_records(
        "independence-registry-v1", [admission]
    )


def new_consumption_store() -> DurableReceiptConsumptionStore:
    ledger = Path(_TEST_LEDGER_DIR.name) / f"{uuid4().hex}.jsonl"
    return DurableReceiptConsumptionStore(ledger)


def reasoning_kwargs(
    *,
    store: DurableReceiptConsumptionStore | None = None,
    required_role: str = "PRO",
    required_account_ref: str = ACCOUNT_REF,
    required_subject_ref: str = REVIEW_SUBJECT,
    required_repository_head: str = REPOSITORY_HEAD,
    input_bytes: bytes = INPUT_BYTES,
    submitted_bytes: bytes = INPUT_BYTES,
    payload_transform: ImmutablePayloadTransform | None = None,
    admission_question_bytes: bytes = ADMISSION_QUESTION_BYTES,
    response_bytes: bytes = RESPONSE_BYTES,
) -> dict:
    return {
        "required_role": required_role,
        "required_account_ref": required_account_ref,
        "required_subject_ref": required_subject_ref,
        "required_repository_head": required_repository_head,
        "input_payload_bytes": input_bytes,
        "submitted_payload_bytes": submitted_bytes,
        "payload_transform": payload_transform,
        "admission_question_bytes": admission_question_bytes,
        "response_payload_bytes": response_bytes,
        "consumption_store": store or new_consumption_store(),
    }


def evaluate_reasoning(receipt: dict, **overrides: object) -> dict:
    kwargs = reasoning_kwargs()
    kwargs.update(overrides)
    return evaluate_reasoning_surface_receipt(receipt, **kwargs)


def admit_reasoning(verdict: dict, receipt: dict, **overrides: object) -> dict:
    kwargs = reasoning_kwargs()
    kwargs.update(overrides)
    return admit_supervision_verdict(verdict, receipt, **kwargs)


def evaluate_browser(
    receipt: dict,
    registry: ImmutableBrowserOwnershipRegistry | None = None,
) -> dict:
    return evaluate_browser_operation(
        receipt, ownership_registry=registry or empty_browser_registry()
    )


def make_claim(
    value: object = 23,
    *,
    kind: str = "SCIENTIFIC_CRITERION",
    owner_authorized: bool = False,
    decision_use: str = "DESCRIPTIVE_ONLY",
    verification_state: str = "VERIFIED_FACT_ONLY",
    use_sites: list[str] | None = None,
) -> dict:
    authorities = [
        {
            "authorityClass": "ARTIFACT_DERIVED_FACT",
            "authoritySourceRef": "artifact-source-v1",
            "authorityScope": ["ASSERT_FACT"],
            "scopeRefs": ["artifact-fact"],
            "status": "CURRENT",
        }
    ]
    source_ref = None
    status = "MISSING"
    if owner_authorized:
        authorities.append(
            {
                "authorityClass": "OWNER_EXPLICIT",
                "authoritySourceRef": "owner-source-v1",
                "authorityScope": ["PROMOTE_TO_POLICY"],
                "scopeRefs": ["completion-policy"],
                "status": "CURRENT",
            }
        )
        source_ref = "owner-source-v1"
        status = "SATISFIED"
    claim = {
        "schemaVersion": 3,
        "claimId": "claim-completeness",
        "claimVersion": 1,
        "claimDigest": {
            "algorithm": "sha256",
            "canonicalization": "RFC8785_JCS",
            "digestScope": "CLAIM_SEMANTICS",
            "value": ZERO,
            "byteLength": 0,
        },
        "claimText": "The completeness denominator is the recorded value.",
        "claimValue": value,
        "claimKind": kind,
        "useSiteRefs": use_sites or [],
        "loadBearingEvaluation": {
            "rulesetVersion": "authority-provenance-v1",
            "result": bool(use_sites),
            "reasons": [],
        },
        "subjectRef": {
            "subjectType": "GIT_COMMIT",
            "repository": "owner/repository",
            "ref": "commit-a",
            "version": None,
            "digest": {"sha256": None},
        },
        "authorityRegistryRef": "pending",
        "authorityRegistryDigest": ZERO,
        "currentAuthorities": authorities,
        "requiredAuthorizations": [
            {
                "operation": "PROMOTE_TO_POLICY",
                "requiredIssuerClass": "OWNER_EXPLICIT",
                "scopeRef": "completion-policy",
                "authorizationSourceRef": source_ref,
                "status": status,
            }
            ,
            {
                "operation": "ASSERT_FACT",
                "requiredIssuerClass": "ARTIFACT_DERIVED_FACT",
                "scopeRef": "artifact-fact",
                "authorizationSourceRef": "artifact-source-v1",
                "status": "SATISFIED",
            }
        ],
        "evidenceRefs": ["artifact-source-v1"],
        "derivation": {"directiveVersion": "1.0.0"},
        "reproductionRequirement": "REQUIRED",
        "reproductionReceiptRefs": ["reproduction-1"],
        "verificationState": verification_state,
        "decisionUse": decision_use,
        "createdAt": "2026-09-01T00:00:00Z",
        "expiresAt": None,
        "supersedesClaimRef": None,
    }
    bind_claim_registry(claim)
    refresh_claim_digest(claim)
    return claim


def promoted_claim(from_claim: dict) -> dict:
    result = deepcopy(from_claim)
    result["claimVersion"] = from_claim["claimVersion"] + 1
    result["claimKind"] = "OWNER_ACCEPTANCE_CRITERION"
    result["currentAuthorities"].append(
        {
            "authorityClass": "OWNER_EXPLICIT",
            "authoritySourceRef": "owner-source-v1",
            "authorityScope": ["PROMOTE_TO_POLICY"],
            "scopeRefs": ["completion-policy"],
            "status": "CURRENT",
        }
    )
    result["requiredAuthorizations"][0].update(
        {"authorizationSourceRef": "owner-source-v1", "status": "SATISFIED"}
    )
    result["verificationState"] = "AUTHORIZED_POLICY"
    result["decisionUse"] = "POLICY_ELIGIBLE"
    result["supersedesClaimRef"] = f"{from_claim['claimId']}@{from_claim['claimVersion']}"
    bind_claim_registry(result)
    refresh_claim_digest(result)
    return result


def make_transition(
    from_claim: dict,
    to_claim: dict,
    transition_registry: ImmutableClaimTransitionRegistry | None = None,
) -> dict:
    registry = transition_registry or empty_transition_registry(from_claim["claimId"])
    transition = {
        "schemaVersion": 1,
        "transitionId": "transition-1",
        "claimId": from_claim["claimId"],
        "fromClaimRef": {
            "claimId": from_claim["claimId"],
            "claimVersion": from_claim["claimVersion"],
            "claimDigest": from_claim["claimDigest"]["value"],
        },
        "toClaimRef": {
            "claimId": to_claim["claimId"],
            "claimVersion": to_claim["claimVersion"],
            "claimDigest": to_claim["claimDigest"]["value"],
        },
        "transitionType": "PROMOTED",
        "requestedByRef": "owner-source-v1",
        "requiredAuthorizationRefs": ["completion-policy"],
        "authoritySourceRefs": ["owner-source-v1"],
        "evidenceRefs": [],
        "reason": "Owner explicitly promoted the criterion.",
        "recordedAt": "2026-09-01T00:00:00Z",
        "previousTransitionDigest": None,
        "transitionRegistryRef": registry.registry_id,
        "transitionRegistryDigest": registry.registry_digest,
        "transitionDigest": ZERO,
        "status": "APPLIED",
    }
    transition["transitionDigest"] = transition_digest(transition)
    return transition


def make_three_version_transition_chain() -> tuple[
    dict,
    dict,
    dict,
    dict,
    ImmutableAuthoritySourceRegistry,
    ImmutableClaimTransitionRegistry,
]:
    version_one = make_claim()
    version_two = deepcopy(version_one)
    version_two["claimVersion"] = 2
    version_two["supersedesClaimRef"] = f"{version_one['claimId']}@1"
    bind_claim_registry(version_two)
    refresh_claim_digest(version_two)
    version_three = promoted_claim(version_two)
    registry = make_authority_registry_from_claim(version_three)
    prior = make_transition(version_one, version_two)
    prior["transitionType"] = "DERIVED"
    prior["transitionDigest"] = transition_digest(prior)
    transition_registry = ImmutableClaimTransitionRegistry.from_records(
        "transition-registry-version-two",
        version_one["claimId"],
        [prior],
    )
    current = make_transition(version_two, version_three, transition_registry)
    current["previousTransitionDigest"] = transition_registry.head_transition_digest
    current["transitionDigest"] = transition_digest(current)
    return (
        version_two,
        version_three,
        prior,
        current,
        registry,
        transition_registry,
    )


def make_reproduction(claim: dict, *, synthetic: bool = False) -> dict:
    method = "count exact production records"
    result_bytes = _jcs_text(claim["claimValue"]).encode("utf-8")
    independence_registry = standard_independence_registry()
    independence_admission = independence_registry.resolve(
        "independence-admission-1"
    )
    assert independence_admission is not None
    return {
        "schemaVersion": 1,
        "reproductionReceiptId": "reproduction-1",
        "claimRef": {
            "claimId": claim["claimId"],
            "claimVersion": claim["claimVersion"],
            "claimDigest": claim["claimDigest"]["value"],
        },
        "subjectRef": deepcopy(claim["subjectRef"]),
        "producerEvidenceRef": "producer-evidence",
        "independenceRegistryRef": independence_registry.registry_id,
        "independenceRegistryDigest": independence_registry.registry_digest,
        "independenceAdmissionRef": "independence-admission-1",
        "independenceAdmissionDigest": independence_admission["admissionDigest"],
        "reproducer": {
            "identityRef": "independent-process",
            "type": "HUMAN_OR_INDEPENDENT_PROCESS",
            "trustDomain": "independent-domain",
        },
        "independenceBasis": "Separate deterministic process",
        "methodRef": "method-v1",
        "methodDigest": hashlib.sha256(method.encode("utf-8")).hexdigest(),
        "methodByteLength": len(method.encode("utf-8")),
        "methodBytesDefinition": "exact method/procedure UTF-8 bytes",
        "commandOrProcedure": method,
        "resultValue": claim["claimValue"],
        "resultDigest": hashlib.sha256(result_bytes).hexdigest(),
        "resultByteLength": len(result_bytes),
        "resultBytesDefinition": "RFC8785_JCS resultValue UTF-8 bytes",
        "matchState": "MATCH",
        "synthetic": synthetic,
        "reproducedAt": "2026-09-01T00:00:00Z",
        "freshnessState": "CURRENT",
        "promotesAuthority": False,
    }


def make_reasoning_receipt(*, required_mode: str = "Pro", observed_mode: str = "Pro") -> dict:
    receipt = load_template("REASONING-SURFACE-OBSERVATION-RECEIPT.json")
    receipt.update(
        {
            "receiptId": "receipt-1",
            "transactionId": "transaction-1",
            "reviewRequirementId": "review-requirement-1",
            "scopeKey": "scope-1",
            "packetId": "packet-1",
            "requiredReviewerRole": "PRO",
            "requiredAccountRef": ACCOUNT_REF,
        }
    )
    receipt["conversation"]["conversationSessionId"] = "session-1"
    input_digest = hashlib.sha256(INPUT_BYTES).hexdigest()
    response_digest = hashlib.sha256(RESPONSE_BYTES).hexdigest()
    receipt["subjectBinding"]["reviewSubjectRef"] = REVIEW_SUBJECT
    receipt["subjectBinding"]["boundRepositoryHeads"] = [REPOSITORY_HEAD]
    for name in ("sourcePacketDigest", "inputPayloadDigest", "submittedVisiblePayloadDigest"):
        receipt["subjectBinding"][name].update(
            {"value": input_digest, "byteLength": len(INPUT_BYTES)}
        )
    receipt["responsePayloadDigest"].update(
        {"value": response_digest, "byteLength": len(RESPONSE_BYTES)}
    )
    receipt["subjectBinding"]["admissionQuestionDigest"].update(
        {
            "value": hashlib.sha256(ADMISSION_QUESTION_BYTES).hexdigest(),
            "byteLength": len(ADMISSION_QUESTION_BYTES),
        }
    )
    receipt["replayProtection"]["admissionNonce"] = "nonce-1"
    values = {
        "surface": "SIGNED_IN_CHATGPT_CHAT",
        "account": ACCOUNT_REF,
        "visibleModePreSubmission": observed_mode,
        "conversationSession": "SAME_TRANSACTION_SESSION",
        "submittedMessage": "EXACT_BOUND_PAYLOAD",
        "completedResponse": response_digest,
        "visibleModePostResponse": observed_mode,
    }
    receipt["observations"]["visibleModePreSubmission"]["requiredValue"] = required_mode
    receipt["observations"]["visibleModePostResponse"]["requiredValue"] = required_mode
    receipt["observations"]["account"]["requiredValue"] = ACCOUNT_REF
    for name, observation in receipt["observations"].items():
        observation.update(
            {
                "observedValue": values[name],
                "status": "VERIFIED",
                "evidenceRef": f"ui-observation-{name}",
                "evidenceSourceType": "BROWSER_UI_OBSERVATION",
                "observedAt": "2026-09-01T00:00:00Z",
                "binding": {
                    "transactionId": "transaction-1",
                    "conversationSessionId": "session-1",
                },
            }
        )
    receipt["aggregateState"] = (
        "VERIFIED_COMPLETE" if required_mode == observed_mode else "MISMATCH"
    )
    return receipt


def make_verdict(receipt: dict, *, response_digest: str | None = None) -> dict:
    verdict = load_template("SUPERVISION-VERDICT-ADMISSION.json")
    verdict.update(
        {
            "verdictId": "verdict-1",
            "scopeKey": receipt["scopeKey"],
            "packetId": receipt["packetId"],
            "reviewRole": receipt["requiredReviewerRole"],
            "requiredAccountRef": ACCOUNT_REF,
            "reasoningSurfaceReceiptRef": receipt["receiptId"],
            "boundSubjectRefs": [REVIEW_SUBJECT],
        }
    )
    verdict["responsePayloadDigest"].update(
        {
            "value": response_digest or hashlib.sha256(RESPONSE_BYTES).hexdigest(),
            "byteLength": len(RESPONSE_BYTES),
        }
    )
    verdict["admissionQuestionDigest"] = deepcopy(
        receipt["subjectBinding"]["admissionQuestionDigest"]
    )
    return verdict


def make_browser_receipt() -> dict:
    receipt = load_template("BROWSER-OPERATION-RECEIPT.json")
    receipt.update(
        {
            "browserOperationId": "browser-operation-1",
            "transactionId": "transaction-1",
            "taskId": "task-1",
            "packetId": "packet-1",
            "browserSessionRef": "browser-session-1",
        }
    )
    registry = empty_browser_registry()
    receipt["priorOwnershipRegistryRef"] = registry.registry_id
    receipt["priorOwnershipRegistryDigest"] = registry.registry_digest
    return receipt


class ClaimAuthorityProvenanceTests(unittest.TestCase):
    def test_validated_transition_and_external_registry_authorize_promotion(self) -> None:
        fact = make_claim()
        policy = promoted_claim(fact)
        registry = make_authority_registry_from_claim(policy)
        transition = make_transition(fact, policy)
        result = evaluate_claim_use(
            policy,
            "PROMOTE_TO_POLICY",
            authority_registry=registry,
            promotion_transition=transition,
            transition_from_claim=fact,
            transition_registry=empty_transition_registry(fact["claimId"]),
        )
        self.assertTrue(result["allowed"])

    def test_required_authorizations_are_conjunctive_not_ranked(self) -> None:
        claim = make_claim(owner_authorized=True, decision_use="POLICY_ELIGIBLE", verification_state="AUTHORIZED_POLICY")
        claim["requiredAuthorizations"].append(
            {
                "operation": "PROMOTE_TO_POLICY",
                "requiredIssuerClass": "REASONING_DECISION",
                "scopeRef": "reasoning-review",
                "authorizationSourceRef": None,
                "status": "MISSING",
            }
        )
        refresh_claim_digest(claim)
        result = evaluate_claim_use(claim, "PROMOTE_TO_POLICY", authority_registry=make_authority_registry_from_claim(claim), promotion_transition={"transitionType": "PROMOTED"})
        self.assertFalse(result["allowed"])
        self.assertIn("AUTHORIZATION_REQUIREMENT_UNSATISFIED", result["failureCodes"])

        wrong_scope = make_claim(owner_authorized=True, decision_use="POLICY_ELIGIBLE", verification_state="AUTHORIZED_POLICY")
        wrong_scope["currentAuthorities"][-1]["scopeRefs"] = ["different-policy"]
        refresh_claim_digest(wrong_scope)
        wrong_scope_result = evaluate_claim_use(wrong_scope, "PROMOTE_TO_POLICY", authority_registry=make_authority_registry_from_claim(claim), promotion_transition={"transitionType": "PROMOTED"})
        self.assertIn("AUTHORIZATION_REQUIREMENT_UNSATISFIED", wrong_scope_result["failureCodes"])

    def test_reasoning_decision_does_not_satisfy_owner_explicit(self) -> None:
        claim = make_claim(decision_use="POLICY_ELIGIBLE", verification_state="AUTHORIZED_POLICY")
        claim["currentAuthorities"].append(
            {"authorityClass": "REASONING_DECISION", "authoritySourceRef": "reasoning-1", "authorityScope": ["PROMOTE_TO_POLICY"], "scopeRefs": ["completion-policy"], "status": "CURRENT"}
        )
        claim["requiredAuthorizations"][0].update({"authorizationSourceRef": "reasoning-1", "status": "SATISFIED"})
        refresh_claim_digest(claim)
        result = evaluate_claim_use(claim, "PROMOTE_TO_POLICY", authority_registry=make_authority_registry_from_claim(claim), promotion_transition={"transitionType": "PROMOTED"})
        self.assertIn("AUTHORIZATION_REQUIREMENT_UNSATISFIED", result["failureCodes"])

    def test_owner_explicit_can_authorize_owner_acceptance_criterion(self) -> None:
        fact = make_claim()
        policy = promoted_claim(fact)
        transition = make_transition(fact, policy)
        self.assertTrue(validate_claim_transition(transition, fact, policy, authority_registry=make_authority_registry_from_claim(policy), transition_registry=empty_transition_registry(fact["claimId"]))["valid"])

    def test_artifact_23_remains_descriptive_only(self) -> None:
        claim = make_claim(23)
        result = evaluate_claim_use(claim, "PROMOTE_TO_POLICY", authority_registry=make_authority_registry_from_claim(claim))
        self.assertIn("UNAUTHORIZED_CLAIM_PROMOTION", result["failureCodes"])

    def test_artifact_76_remains_descriptive_only(self) -> None:
        claim = make_claim(76)
        result = evaluate_claim_use(claim, "PROMOTE_TO_POLICY", authority_registry=make_authority_registry_from_claim(claim))
        self.assertIn("UNAUTHORIZED_CLAIM_PROMOTION", result["failureCodes"])

    def test_fact_to_policy_copy_requires_promotion_transition(self) -> None:
        policy = promoted_claim(make_claim())
        result = evaluate_claim_use(policy, "PROMOTE_TO_POLICY", authority_registry=make_authority_registry_from_claim(policy))
        self.assertIn("UNAUTHORIZED_CLAIM_PROMOTION", result["failureCodes"])

    def test_field_rename_cannot_bypass_fact_to_policy_transition(self) -> None:
        policy = promoted_claim(make_claim())
        policy["claimText"] = "completion_required_question_count is 23"
        refresh_claim_digest(policy)
        result = evaluate_claim_use(policy, "PROMOTE_TO_POLICY", authority_registry=make_authority_registry_from_claim(policy))
        self.assertIn("UNAUTHORIZED_CLAIM_PROMOTION", result["failureCodes"])

    def test_promotion_requires_new_authority_source(self) -> None:
        fact = make_claim()
        policy = promoted_claim(fact)
        policy["currentAuthorities"] = deepcopy(fact["currentAuthorities"])
        refresh_claim_digest(policy)
        transition = make_transition(fact, policy)
        self.assertIn("UNAUTHORIZED_CLAIM_PROMOTION", validate_claim_transition(transition, fact, policy, authority_registry=make_authority_registry_from_claim(policy), transition_registry=empty_transition_registry(fact["claimId"]))["failureCodes"])

    def test_reproduction_verifies_fact_but_never_promotes_policy(self) -> None:
        claim = make_claim()
        result = evaluate_reproduction(make_reproduction(claim), claim, current_subject=deepcopy(claim["subjectRef"]), actual_method_bytes=b"count exact production records", actual_result_bytes=_jcs_text(claim["claimValue"]).encode("utf-8"), independence_registry=standard_independence_registry())
        self.assertTrue(result["verifiedFact"])
        self.assertFalse(result["policyPromoted"])

    def test_synthetic_fixture_cannot_satisfy_production_reproduction(self) -> None:
        claim = make_claim()
        result = evaluate_reproduction(make_reproduction(claim, synthetic=True), claim, current_subject=deepcopy(claim["subjectRef"]), actual_method_bytes=b"count exact production records", actual_result_bytes=_jcs_text(claim["claimValue"]).encode("utf-8"), independence_registry=standard_independence_registry())
        self.assertIn("PRODUCTION_REPRODUCTION_MISSING", result["failureCodes"])

    def test_subject_commit_change_marks_claim_stale(self) -> None:
        claim = make_claim()
        current = deepcopy(claim["subjectRef"])
        current["ref"] = "commit-b"
        self.assertIn("SUBJECT_BINDING_STALE", evaluate_subject_freshness(claim, current)["failureCodes"])

    def test_directive_version_change_marks_claim_stale(self) -> None:
        claim = make_claim()
        self.assertIn("SUBJECT_BINDING_STALE", evaluate_subject_freshness(claim, current_directive_version="2.0.0")["failureCodes"])

    def test_revoked_or_superseded_source_invalidates_decision_use(self) -> None:
        claim = promoted_claim(make_claim())
        claim["currentAuthorities"][-1]["status"] = "REVOKED"
        refresh_claim_digest(claim)
        result = evaluate_claim_use(claim, "AUTHORIZE_RELEASE", authority_registry=make_authority_registry_from_claim(claim))
        self.assertIn("AUTHORIZATION_REQUIREMENT_UNSATISFIED", result["failureCodes"])

    def test_unregistered_load_bearing_owner_rendering_is_rejected(self) -> None:
        claim = make_claim(use_sites=["OWNER_FACING_DEFINITIVE_RENDERING"])
        result = evaluate_claim_use(claim, "ASSERT_FACT", authority_registry=make_authority_registry_from_claim(claim), use_site="OWNER_FACING_DEFINITIVE_RENDERING")
        self.assertIn("DEFINITIVE_RENDERING_REJECTED", result["failureCodes"])

    def test_claim_transition_digest_chain_detects_mutation(self) -> None:
        fact = make_claim()
        policy = promoted_claim(fact)
        transition = make_transition(fact, policy)
        transition["reason"] = "mutated after digest"
        self.assertIn("SUBJECT_BINDING_STALE", validate_claim_transition(transition, fact, policy, authority_registry=make_authority_registry_from_claim(policy), transition_registry=empty_transition_registry(fact["claimId"]))["failureCodes"])

    def test_transition_chain_requires_valid_prior_record_and_exact_claim_link(self) -> None:
        version_one = make_claim()
        version_two = deepcopy(version_one)
        version_two["claimVersion"] = 2
        version_two["supersedesClaimRef"] = f"{version_one['claimId']}@1"
        bind_claim_registry(version_two)
        refresh_claim_digest(version_two)
        version_three = promoted_claim(version_two)
        registry = make_authority_registry_from_claim(version_three)

        prior = make_transition(version_one, version_two)
        prior["transitionType"] = "DERIVED"
        prior["transitionDigest"] = transition_digest(prior)
        current = make_transition(version_two, version_three)

        empty_registry = empty_transition_registry(version_two["claimId"])
        missing = validate_claim_transition(
            current,
            version_two,
            version_three,
            authority_registry=registry,
            transition_registry=empty_registry,
        )
        self.assertIn("TRANSITION_CHAIN_INVALID", missing["failureCodes"])

        trusted_registry = ImmutableClaimTransitionRegistry.from_records(
            "transition-registry-version-two", version_two["claimId"], [prior]
        )
        unbound_registry = validate_claim_transition(
            current,
            version_two,
            version_three,
            authority_registry=registry,
            transition_registry=trusted_registry,
        )
        self.assertIn("TRANSITION_REGISTRY_MISSING", unbound_registry["failureCodes"])

        current = make_transition(version_two, version_three, trusted_registry)
        current["previousTransitionDigest"] = trusted_registry.head_transition_digest
        current["transitionDigest"] = transition_digest(current)
        self.assertTrue(
            validate_claim_transition(
                current,
                version_two,
                version_three,
                authority_registry=registry,
                transition_registry=trusted_registry,
            )["valid"]
        )

    def test_owner_source_correction_is_append_only(self) -> None:
        original = [{"sourceId": "owner-1", "exactText": "original"}]
        current = append_owner_source_correction(original, {"sourceId": "owner-2", "exactText": "correction"})
        self.assertTrue(validate_owner_source_append_only(original, current)["valid"])
        current[0]["exactText"] = "rewritten"
        self.assertFalse(validate_owner_source_append_only(original, current)["valid"])

    def test_load_bearing_use_site_overrides_worker_false_flag(self) -> None:
        claim = make_claim()
        claim["loadBearingEvaluation"]["result"] = False
        refresh_claim_digest(claim)
        result = evaluate_claim_use(claim, "ASSERT_FACT", authority_registry=make_authority_registry_from_claim(claim), use_site="OWNER_FACING_DEFINITIVE_RENDERING")
        self.assertTrue(result["loadBearing"])
        self.assertIn("DEFINITIVE_RENDERING_REJECTED", result["failureCodes"])

    def test_load_bearing_assert_with_zero_authorizations_fails_closed(self) -> None:
        claim = make_claim(use_sites=["ACCEPTANCE_CRITERION"])
        claim["requiredAuthorizations"] = [
            requirement
            for requirement in claim["requiredAuthorizations"]
            if requirement["operation"] != "ASSERT_FACT"
        ]
        refresh_claim_digest(claim)
        result = evaluate_claim_use(
            claim,
            "ASSERT_FACT",
            authority_registry=make_authority_registry_from_claim(claim),
            use_site="ACCEPTANCE_CRITERION",
        )
        self.assertIn("AUTHORIZATION_REQUIREMENT_UNSATISFIED", result["failureCodes"])

    def test_reproduction_binds_method_result_and_claim_receipt_ref(self) -> None:
        claim = make_claim()
        receipt = make_reproduction(claim)
        wrong_method = evaluate_reproduction(
            receipt,
            claim,
            current_subject=deepcopy(claim["subjectRef"]),
            actual_method_bytes=b"different method",
            actual_result_bytes=_jcs_text(claim["claimValue"]).encode("utf-8"),
            independence_registry=standard_independence_registry(),
        )
        self.assertIn("REPRODUCTION_BYTES_MISMATCH", wrong_method["failureCodes"])
        claim["reproductionReceiptRefs"] = []
        refresh_claim_digest(claim)
        receipt = make_reproduction(claim)
        unbound = evaluate_reproduction(
            receipt,
            claim,
            current_subject=deepcopy(claim["subjectRef"]),
            actual_method_bytes=b"count exact production records",
            actual_result_bytes=_jcs_text(claim["claimValue"]).encode("utf-8"),
            independence_registry=standard_independence_registry(),
        )
        self.assertIn("REPRODUCTION_RECEIPT_UNBOUND", unbound["failureCodes"])

    def test_reproduction_requires_substantive_independence_evidence_fields(self) -> None:
        claim = make_claim()
        mutations = (
            ("producerEvidenceRef", None),
            ("independenceBasis", ""),
            ("methodRef", None),
            ("reproducedAt", "not-a-timestamp"),
        )
        for field, value in mutations:
            with self.subTest(field=field):
                receipt = make_reproduction(claim)
                receipt[field] = value
                result = evaluate_reproduction(
                    receipt,
                    claim,
                    current_subject=deepcopy(claim["subjectRef"]),
                    actual_method_bytes=b"count exact production records",
                    actual_result_bytes=_jcs_text(claim["claimValue"]).encode("utf-8"),
                    independence_registry=standard_independence_registry(),
                )
                self.assertIn(
                    "REPRODUCTION_INDEPENDENCE_UNVERIFIED",
                    result["failureCodes"],
                )
        for field in ("identityRef", "trustDomain"):
            with self.subTest(reproducer_field=field):
                receipt = make_reproduction(claim)
                receipt["reproducer"][field] = ""
                result = evaluate_reproduction(
                    receipt,
                    claim,
                    current_subject=deepcopy(claim["subjectRef"]),
                    actual_method_bytes=b"count exact production records",
                    actual_result_bytes=_jcs_text(claim["claimValue"]).encode("utf-8"),
                    independence_registry=standard_independence_registry(),
                )
                self.assertIn(
                    "REPRODUCTION_INDEPENDENCE_UNVERIFIED",
                    result["failureCodes"],
                )


class ReasoningSurfaceReceiptTests(unittest.TestCase):
    def _self_asserted(self, evidence_type: str) -> dict:
        receipt = make_reasoning_receipt()
        receipt["observations"]["visibleModePreSubmission"]["evidenceSourceType"] = evidence_type
        return evaluate_reasoning(receipt)

    def test_agent_name_extra_high_has_zero_receipt_weight(self) -> None:
        self.assertIn("SELF_ASSERTED_REASONING_IDENTITY_REJECTED", self._self_asserted("AGENT_NAME")["failureCodes"])

    def test_model_self_description_has_zero_receipt_weight(self) -> None:
        self.assertIn("SELF_ASSERTED_REASONING_IDENTITY_REJECTED", self._self_asserted("MODEL_SELF_DESCRIPTION")["failureCodes"])

    def test_prompt_requested_mode_has_zero_receipt_weight(self) -> None:
        self.assertIn("SELF_ASSERTED_REASONING_IDENTITY_REJECTED", self._self_asserted("PROMPT_REQUEST")["failureCodes"])

    def test_pro_plan_account_does_not_prove_pro_mode(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["observations"]["visibleModePreSubmission"]["status"] = "MISSING"
        receipt["aggregateState"] = "PARTIAL"
        self.assertIn("REASONING_RECEIPT_INCOMPLETE", evaluate_reasoning(receipt)["failureCodes"])

    def test_pro_requirement_rejects_extra_high_observed_mode(self) -> None:
        result = evaluate_reasoning(make_reasoning_receipt(observed_mode="Extra High"))
        self.assertIn("REASONING_SURFACE_MODE_MISMATCH", result["failureCodes"])

    def test_valid_pre_mode_without_completed_response_is_partial(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["observations"]["completedResponse"]["status"] = "MISSING"
        receipt["aggregateState"] = "PARTIAL"
        self.assertEqual(evaluate_reasoning(receipt)["aggregateState"], "PARTIAL")

    def test_missing_post_response_mode_is_partial(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["observations"]["visibleModePostResponse"]["status"] = "MISSING"
        receipt["aggregateState"] = "PARTIAL"
        self.assertEqual(evaluate_reasoning(receipt)["aggregateState"], "PARTIAL")

    def test_post_response_mode_mismatch_rejects_review(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["observations"]["visibleModePostResponse"]["observedValue"] = "Extra High"
        receipt["aggregateState"] = "MISMATCH"
        self.assertIn("REASONING_SURFACE_MODE_MISMATCH", evaluate_reasoning(receipt)["failureCodes"])

    def test_surface_account_session_submission_and_response_are_independent(self) -> None:
        receipt = make_reasoning_receipt()
        for name in ("conversationSession", "submittedMessage", "completedResponse"):
            receipt["observations"][name]["status"] = "MISSING"
        receipt["aggregateState"] = "PARTIAL"
        result = evaluate_reasoning(receipt)
        self.assertFalse(result["valid"])
        self.assertIn("REASONING_RECEIPT_INCOMPLETE", result["failureCodes"])

    def test_session_mismatch_rejects_transplanted_receipt(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["observations"]["completedResponse"]["binding"]["conversationSessionId"] = "other-session"
        receipt["aggregateState"] = "MISMATCH"
        self.assertIn("REASONING_RECEIPT_SESSION_MISMATCH", evaluate_reasoning(receipt)["failureCodes"])

    def test_prior_receipt_replay_rejected_for_same_payload(self) -> None:
        receipt = make_reasoning_receipt()
        store = new_consumption_store()
        self.assertTrue(admit_reasoning(make_verdict(receipt), receipt, consumption_store=store)["admitted"])
        result = evaluate_reasoning(receipt, consumption_store=store)
        self.assertIn("REASONING_RECEIPT_REPLAY_REJECTED", result["failureCodes"])

    def test_receipt_replay_rejected_for_different_payload(self) -> None:
        prior = make_reasoning_receipt()
        store = new_consumption_store()
        self.assertTrue(admit_reasoning(make_verdict(prior), prior, consumption_store=store)["admitted"])
        receipt = make_reasoning_receipt()
        receipt["subjectBinding"]["inputPayloadDigest"]["value"] = TWO
        receipt["subjectBinding"]["submittedVisiblePayloadDigest"]["value"] = TWO
        result = evaluate_reasoning(receipt, consumption_store=store)
        self.assertIn("REASONING_RECEIPT_REPLAY_REJECTED", result["failureCodes"])

    def test_unexplained_input_to_submitted_digest_change_is_rejected(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["subjectBinding"]["submittedVisiblePayloadDigest"]["value"] = TWO
        receipt["aggregateState"] = "MISMATCH"
        self.assertIn("REASONING_RECEIPT_PAYLOAD_MISMATCH", evaluate_reasoning(receipt)["failureCodes"])

    def test_declared_transform_must_execute_to_exact_submitted_bytes(self) -> None:
        submitted = b"magic"
        receipt = make_reasoning_receipt()
        receipt["subjectBinding"]["submittedVisiblePayloadDigest"].update(
            {
                "value": hashlib.sha256(submitted).hexdigest(),
                "byteLength": len(submitted),
            }
        )
        receipt["subjectBinding"]["submissionTransform"] = {
            "type": "DECLARED_REPRODUCIBLE_TRANSFORM",
            "transformRef": "magic-transform",
            "description": "magic",
            "transformDigest": hashlib.sha256(submitted).hexdigest(),
            "transformSpecByteLength": len(submitted),
            "transformSpecBytesDefinition": "untrusted ad hoc bytes",
        }
        result = evaluate_reasoning(receipt, submitted_payload_bytes=submitted)
        self.assertIn("REASONING_RECEIPT_PAYLOAD_MISMATCH", result["failureCodes"])

    def test_external_transform_is_executed_and_bound(self) -> None:
        transform = ImmutablePayloadTransform(
            "append-review-question-v1",
            _jcs_text(
                {"type": "UTF8_APPEND_LITERAL_V1", "suffixUtf8": "\nreview"}
            ).encode("utf-8"),
        )
        submitted = transform.apply(INPUT_BYTES)
        receipt = make_reasoning_receipt()
        receipt["subjectBinding"]["submittedVisiblePayloadDigest"].update(
            {
                "value": hashlib.sha256(submitted).hexdigest(),
                "byteLength": len(submitted),
            }
        )
        receipt["subjectBinding"]["submissionTransform"] = {
            "type": "DECLARED_REPRODUCIBLE_TRANSFORM",
            "transformRef": transform.transform_ref,
            "description": transform.description,
            "transformDigest": transform.transform_digest,
            "transformSpecByteLength": transform.spec_byte_length,
            "transformSpecBytesDefinition": transform.spec_bytes_definition,
        }
        self.assertTrue(
            evaluate_reasoning(
                receipt,
                submitted_payload_bytes=submitted,
                payload_transform=transform,
            )["valid"]
        )

    def test_response_digest_mismatch_rejects_verdict_admission(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["observations"]["completedResponse"]["observedValue"] = TWO
        receipt["aggregateState"] = "MISMATCH"
        self.assertFalse(admit_reasoning(make_verdict(receipt), receipt)["admitted"])

    def test_valid_ui_receipt_cannot_claim_platform_attestation(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["cryptographicPlatformAttestation"] = True
        receipt["aggregateState"] = "PARTIAL"
        self.assertIn("ASSURANCE_CLASS_OVERCLAIM", evaluate_reasoning(receipt)["failureCodes"])

    def test_verified_observation_requires_evidence_ref_and_valid_timestamp(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["observations"]["account"]["evidenceRef"] = ""
        self.assertIn(
            "REASONING_OBSERVATION_EVIDENCE_INVALID",
            evaluate_reasoning(receipt)["failureCodes"],
        )
        receipt = make_reasoning_receipt()
        receipt["observations"]["completedResponse"]["observedAt"] = "not-a-time"
        self.assertIn(
            "REASONING_OBSERVATION_EVIDENCE_INVALID",
            evaluate_reasoning(receipt)["failureCodes"],
        )

    def test_mismatch_incident_can_never_be_authoritative(self) -> None:
        receipt = make_reasoning_receipt(observed_mode="Extra High")
        result = admit_reasoning(make_verdict(receipt), receipt)
        self.assertFalse(result["authoritative"])

    def test_corrected_transaction_preserves_prior_mismatch_incident(self) -> None:
        prior = make_reasoning_receipt(observed_mode="Extra High")
        corrected = make_reasoning_receipt()
        corrected.update({"receiptId": "receipt-2", "transactionId": "transaction-2", "supersedesReceiptRef": prior["receiptId"], "incidentRefs": ["MC-PRO-MODE-RECEIPT-MISMATCH-20260901-001"]})
        corrected["replayProtection"]["admissionNonce"] = "nonce-2"
        for observation in corrected["observations"].values():
            observation["binding"]["transactionId"] = "transaction-2"
        result = evaluate_reasoning(corrected)
        self.assertTrue(result["valid"])
        self.assertEqual(corrected["supersedesReceiptRef"], prior["receiptId"])

    def test_valid_receipt_cannot_be_paired_with_another_response(self) -> None:
        receipt = make_reasoning_receipt()
        result = admit_reasoning(make_verdict(receipt, response_digest=TWO), receipt)
        self.assertIn("VERDICT_RECEIPT_BINDING_MISMATCH", result["failureCodes"])

    def test_verdict_cannot_change_bound_admission_question(self) -> None:
        receipt = make_reasoning_receipt()
        verdict = make_verdict(receipt)
        verdict["admissionQuestionDigest"].update(
            {"value": "f" * 64, "byteLength": 999999}
        )
        result = admit_reasoning(verdict, receipt)
        self.assertFalse(result["admitted"])
        self.assertIn("ADMISSION_QUESTION_BINDING_MISMATCH", result["failureCodes"])

    def test_external_subject_and_repository_head_override_receipt_self_selection(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["subjectBinding"]["reviewSubjectRef"] = "self-selected-subject"
        self.assertIn(
            "REASONING_REQUIREMENT_BINDING_MISMATCH",
            evaluate_reasoning(receipt)["failureCodes"],
        )
        receipt = make_reasoning_receipt()
        receipt["subjectBinding"]["boundRepositoryHeads"] = ["owner/repository@self-selected"]
        self.assertIn(
            "REASONING_REQUIREMENT_BINDING_MISMATCH",
            evaluate_reasoning(receipt)["failureCodes"],
        )

    def test_external_input_and_response_bytes_override_receipt_digests(self) -> None:
        receipt = make_reasoning_receipt()
        self.assertIn(
            "REASONING_RECEIPT_PAYLOAD_MISMATCH",
            evaluate_reasoning(receipt, input_payload_bytes=b"different input")["failureCodes"],
        )
        self.assertIn(
            "REASONING_RECEIPT_PAYLOAD_MISMATCH",
            evaluate_reasoning(receipt, response_payload_bytes=b"different response")["failureCodes"],
        )

    def test_single_use_consumption_survives_store_reinstantiation(self) -> None:
        receipt = make_reasoning_receipt()
        ledger_path = Path(_TEST_LEDGER_DIR.name) / f"{uuid4().hex}.jsonl"
        first_store = DurableReceiptConsumptionStore(ledger_path)
        self.assertTrue(
            admit_reasoning(
                make_verdict(receipt), receipt, consumption_store=first_store
            )["admitted"]
        )
        restarted_store = DurableReceiptConsumptionStore(ledger_path)
        result = evaluate_reasoning(receipt, consumption_store=restarted_store)
        self.assertIn("REASONING_RECEIPT_REPLAY_REJECTED", result["failureCodes"])


class BrowserOperationReceiptTests(unittest.TestCase):
    def test_repository_retrieval_uses_cli_when_available(self) -> None:
        receipt = make_browser_receipt()
        receipt.update({"purposeClass": "REPOSITORY_RETRIEVAL", "browserNecessity": "NOT_REQUIRED"})
        receipt["nonBrowserAlternatives"][0]["satisfiesCapability"] = True
        self.assertIn("BROWSER_ROUTE_NOT_JUSTIFIED", evaluate_browser(receipt)["failureCodes"])

    def test_browser_allowed_for_signed_in_reasoning_surface_observation(self) -> None:
        self.assertTrue(evaluate_browser(make_browser_receipt())["allowed"])

    def test_second_transient_tab_requires_recorded_exception(self) -> None:
        receipt = make_browser_receipt()
        receipt["agentOpenedTabIds"] = ["agent-1", "agent-2"]
        self.assertIn("AGENT_TAB_CAP_EXCEEDED", evaluate_browser(receipt)["failureCodes"])

    def test_only_same_transaction_agent_tabs_may_be_closed(self) -> None:
        receipt = make_browser_receipt()
        receipt["agentOpenedTabIds"] = ["agent-1"]
        receipt["actions"] = [{"type": "CLOSE", "tabId": "agent-1", "ownershipClass": "AGENT_OPENED", "protected": False, "browserSessionRef": "browser-session-1", "transactionId": "other-transaction", "result": "SUCCEEDED", "closedByActor": "routing-executor"}]
        self.assertIn("TAB_SESSION_MISMATCH", evaluate_browser(receipt)["failureCodes"])

    def test_unknown_stale_tab_ownership_fails_closed(self) -> None:
        receipt = make_browser_receipt()
        receipt["actions"] = [{"type": "CLOSE", "tabId": "stale-1", "ownershipClass": "UNKNOWN", "protected": False, "browserSessionRef": "browser-session-1", "transactionId": "transaction-1", "result": "FAILED", "closedByActor": None}]
        self.assertIn("TAB_OWNERSHIP_UNVERIFIED", evaluate_browser(receipt)["failureCodes"])

    def test_owner_existing_tabs_are_preserved(self) -> None:
        receipt = make_browser_receipt()
        self.assertTrue(receipt["baselineTabs"][0]["protected"])
        self.assertTrue(evaluate_browser(receipt)["allowed"])

    def test_reasoning_conversation_tabs_are_protected(self) -> None:
        receipt = make_browser_receipt()
        tab = receipt["baselineTabs"][0]
        receipt["actions"] = [{"type": "CLOSE", "tabId": tab["tabId"], "ownershipClass": "OWNER_EXISTING", "protected": True, "browserSessionRef": "browser-session-1", "transactionId": "transaction-1", "result": "FAILED", "closedByActor": None}]
        self.assertIn("PROTECTED_TAB_MUTATION_ATTEMPT", evaluate_browser(receipt)["failureCodes"])

    def test_tab_id_from_another_browser_session_is_rejected(self) -> None:
        receipt = make_browser_receipt()
        receipt["agentOpenedTabIds"] = ["agent-1"]
        receipt["actions"] = [{"type": "CLOSE", "tabId": "agent-1", "ownershipClass": "AGENT_OPENED", "protected": False, "browserSessionRef": "other-session", "transactionId": "transaction-1", "result": "FAILED", "closedByActor": None}]
        self.assertIn("TAB_SESSION_MISMATCH", evaluate_browser(receipt)["failureCodes"])

    def test_cleanup_failure_is_reported_without_guessing_other_tabs(self) -> None:
        receipt = make_browser_receipt()
        receipt["agentOpenedTabIds"] = ["agent-1"]
        receipt["actions"] = [
            {"type": "OPEN", "tabId": "agent-1", "ownershipClass": "AGENT_OPENED", "protected": False, "browserSessionRef": "browser-session-1", "transactionId": "transaction-1", "result": "SUCCEEDED", "closedByActor": None},
            {"type": "CLOSE", "tabId": "agent-1", "ownershipClass": "AGENT_OPENED", "protected": False, "browserSessionRef": "browser-session-1", "transactionId": "transaction-1", "result": "FAILED", "closedByActor": "routing-executor"},
        ]
        receipt["cleanup"].update({"attempted": True, "remainingAgentTabIds": ["agent-1"], "results": [{"tabId": "agent-1", "result": "FAILED"}]})
        result = evaluate_browser(receipt)
        self.assertIn("AGENT_TAB_CLEANUP_INCOMPLETE", result["failureCodes"])
        self.assertNotIn(receipt["baselineTabs"][0]["tabId"], receipt["cleanup"]["remainingAgentTabIds"])

    def test_baseline_and_cleanup_states_are_both_recorded(self) -> None:
        receipt = make_browser_receipt()
        result = evaluate_browser(receipt)
        self.assertTrue(receipt["baselineTabs"])
        self.assertIn("attempted", receipt["cleanup"])
        self.assertTrue(result["allowed"])

    def test_observed_tab_absence_does_not_attribute_closing_actor(self) -> None:
        receipt = make_browser_receipt()
        receipt["actions"] = [{"type": "OBSERVE_ABSENT", "tabId": "stale-1", "ownershipClass": "UNKNOWN", "protected": False, "browserSessionRef": "browser-session-1", "transactionId": "transaction-1", "result": "OBSERVED", "closedByActor": "UNKNOWN"}]
        self.assertTrue(evaluate_browser(receipt)["allowed"])

    def test_open_close_and_cleanup_states_reconcile_exactly(self) -> None:
        receipt = make_browser_receipt()
        receipt["agentOpenedTabIds"] = ["agent-1"]
        receipt["actions"] = [
            {"type": "OPEN", "tabId": "agent-1", "ownershipClass": "AGENT_OPENED", "protected": False, "browserSessionRef": "browser-session-1", "transactionId": "transaction-1", "result": "SUCCEEDED", "closedByActor": None},
            {"type": "CLOSE", "tabId": "agent-1", "ownershipClass": "AGENT_OPENED", "protected": False, "browserSessionRef": "browser-session-1", "transactionId": "transaction-1", "result": "SUCCEEDED", "closedByActor": "routing-executor"},
        ]
        receipt["cleanup"].update(
            {
                "attempted": True,
                "results": [{"tabId": "agent-1", "result": "SUCCEEDED"}],
                "remainingAgentTabIds": [],
            }
        )
        self.assertTrue(evaluate_browser(receipt)["allowed"])

    def test_navigate_before_same_transaction_open_is_rejected(self) -> None:
        receipt = make_browser_receipt()
        receipt["agentOpenedTabIds"] = ["agent-1"]
        receipt["actions"] = [
            {"type": "NAVIGATE", "tabId": "agent-1", "ownershipClass": "AGENT_OPENED", "protected": False, "browserSessionRef": "browser-session-1", "transactionId": "transaction-1", "result": "SUCCEEDED", "closedByActor": None},
            {"type": "OPEN", "tabId": "agent-1", "ownershipClass": "AGENT_OPENED", "protected": False, "browserSessionRef": "browser-session-1", "transactionId": "transaction-1", "result": "SUCCEEDED", "closedByActor": None},
            {"type": "CLOSE", "tabId": "agent-1", "ownershipClass": "AGENT_OPENED", "protected": False, "browserSessionRef": "browser-session-1", "transactionId": "transaction-1", "result": "SUCCEEDED", "closedByActor": "routing-executor"},
        ]
        receipt["cleanup"].update(
            {
                "attempted": True,
                "results": [{"tabId": "agent-1", "result": "SUCCEEDED"}],
                "remainingAgentTabIds": [],
            }
        )
        result = evaluate_browser(receipt)
        self.assertIn("BROWSER_ACTION_SEQUENCE_INVALID", result["failureCodes"])

    def test_immutable_prior_open_proof_can_authorize_same_transaction_cleanup(self) -> None:
        proof = {
            "tabId": "agent-1",
            "browserSessionRef": "browser-session-1",
            "transactionId": "transaction-1",
            "sourceReceiptRef": "prior-browser-receipt",
            "sourceReceiptDigest": "a" * 64,
            "sourceReceiptValidationState": "VALIDATED",
            "proofDigest": ZERO,
        }
        proof["proofDigest"] = browser_ownership_proof_digest(proof)
        registry = ImmutableBrowserOwnershipRegistry.from_records(
            "prior-browser-registry", [proof]
        )
        receipt = make_browser_receipt()
        receipt["priorOwnershipRegistryRef"] = registry.registry_id
        receipt["priorOwnershipRegistryDigest"] = registry.registry_digest
        receipt["agentOpenedTabIds"] = ["agent-1"]
        receipt["actions"] = [
            {"type": "CLOSE", "tabId": "agent-1", "ownershipClass": "AGENT_OPENED", "protected": False, "browserSessionRef": "browser-session-1", "transactionId": "transaction-1", "result": "SUCCEEDED", "closedByActor": "routing-executor"}
        ]
        receipt["cleanup"].update(
            {
                "attempted": True,
                "results": [{"tabId": "agent-1", "result": "SUCCEEDED"}],
                "remainingAgentTabIds": [],
            }
        )
        self.assertTrue(evaluate_browser(receipt, registry)["allowed"])


class ProvenanceSchemaAndFixtureTests(unittest.TestCase):
    def test_all_schemas_templates_incidents_and_hostile_fixtures_validate(self) -> None:
        findings = validate_repository(ROOT)
        self.assertGreaterEqual(len(findings), 17)
        self.assertTrue(any("claim-authority-provenance-hostile.json:21-executed" in finding for finding in findings))
        self.assertTrue(any("reasoning-surface-receipt-hostile.json:27-executed" in finding for finding in findings))
        self.assertTrue(any("browser-operation-hostile.json:10-executed" in finding for finding in findings))


class IndependentReviewBlockerRegressionTests(unittest.TestCase):
    def test_all_immutable_registry_public_constructors_and_subclasses_are_sealed(
        self,
    ) -> None:
        constructor_calls = (
            lambda: ImmutableAuthoritySourceRegistry("forged", ZERO, {}),
            lambda: ImmutableBrowserOwnershipRegistry("forged", ZERO, {}),
            lambda: ImmutableReproductionIndependenceRegistry("forged", ZERO, {}),
            lambda: ImmutableClaimTransitionRegistry(
                "forged", ZERO, "claim", None, {}
            ),
        )
        registry_types = (
            ImmutableAuthoritySourceRegistry,
            ImmutableBrowserOwnershipRegistry,
            ImmutableReproductionIndependenceRegistry,
            ImmutableClaimTransitionRegistry,
        )
        for call in constructor_calls:
            with self.subTest(constructor=call):
                with self.assertRaises(ValueError):
                    call()
        for registry_type in registry_types:
            with self.subTest(subclass=registry_type.__name__):
                with self.assertRaises(TypeError):
                    type(f"Forged{registry_type.__name__}", (registry_type,), {})

    def test_unsealed_transition_registry_object_has_no_trust_weight(self) -> None:
        from_claim, to_claim, _, current, authority_registry, _ = (
            make_three_version_transition_chain()
        )
        forged_digest = "a" * 64
        forged = object.__new__(ImmutableClaimTransitionRegistry)
        object.__setattr__(forged, "registry_id", "forged-transition-registry")
        object.__setattr__(forged, "registry_digest", "b" * 64)
        object.__setattr__(forged, "claim_id", from_claim["claimId"])
        object.__setattr__(forged, "head_transition_digest", forged_digest)
        object.__setattr__(
            forged,
            "_records",
            MappingProxyType(
                {
                    forged_digest: _jcs_text(
                        {"toClaimRef": deepcopy(current["fromClaimRef"])}
                    )
                }
            ),
        )
        current["transitionRegistryRef"] = forged.registry_id
        current["transitionRegistryDigest"] = forged.registry_digest
        current["previousTransitionDigest"] = forged.head_transition_digest
        current["transitionDigest"] = transition_digest(current)
        result = validate_claim_transition(
            current,
            from_claim,
            to_claim,
            authority_registry=authority_registry,
            transition_registry=forged,
        )
        self.assertFalse(result["valid"])
        self.assertIn("TRANSITION_REGISTRY_MISSING", result["failureCodes"])

    def test_payload_transform_type_is_sealed_against_override(self) -> None:
        with self.assertRaises(TypeError):
            type(
                "ForgedPayloadTransform",
                (ImmutablePayloadTransform,),
                {"apply": lambda self, value: b"unrelated-submitted-bytes"},
            )

    def test_schema_validator_rejects_invalid_calendar_dates_in_all_three_receipts(
        self,
    ) -> None:
        cases = (
            (
                "claim-transition.schema.json",
                "CLAIM-TRANSITION.json",
                ("recordedAt",),
            ),
            (
                "claim-reproduction-receipt.schema.json",
                "CLAIM-REPRODUCTION-RECEIPT.json",
                ("reproducedAt",),
            ),
            (
                "reasoning-surface-observation-receipt.schema.json",
                "REASONING-SURFACE-OBSERVATION-RECEIPT.json",
                ("observations", "surface", "observedAt"),
            ),
        )
        for schema_name, template_name, path in cases:
            with self.subTest(schema=schema_name):
                schema = json.loads(
                    (ROOT / "schemas" / schema_name).read_text(encoding="utf-8")
                )
                instance = load_template(template_name)
                target = instance
                for key in path[:-1]:
                    target = target[key]
                target[path[-1]] = "2026-02-30T00:00:00Z"
                if path[0] == "observations":
                    instance["observations"]["surface"].update(
                        {
                            "status": "VERIFIED",
                            "evidenceRef": "ui-evidence",
                            "evidenceSourceType": "BROWSER_UI_OBSERVATION",
                        }
                    )
                with self.assertRaises(SchemaError):
                    validate_instance(instance, schema, root_schema=schema)

    def test_same_process_reproduction_cannot_self_assert_independence(self) -> None:
        claim = make_claim()
        receipt = make_reproduction(claim)
        receipt["producerEvidenceRef"] = "same-process"
        receipt["reproducer"].update(
            {"identityRef": "same-process", "trustDomain": "same-process"}
        )
        receipt["independenceBasis"] = "not independent; same producer and process"
        result = evaluate_reproduction(
            receipt,
            claim,
            current_subject=deepcopy(claim["subjectRef"]),
            actual_method_bytes=b"count exact production records",
            actual_result_bytes=_jcs_text(claim["claimValue"]).encode("utf-8"),
            independence_registry=standard_independence_registry(),
        )
        self.assertFalse(result["valid"])

    def test_stateful_ad_hoc_payload_transform_is_rejected(self) -> None:
        class StatefulTransform:
            def __init__(self) -> None:
                self.calls = 0

            def __call__(self, value: bytes) -> bytes:
                self.calls += 1
                return value + b"\nreview" if self.calls == 1 else b"different"

        with self.assertRaises(TypeError):
            ImmutablePayloadTransform(
                "stateful-transform", "stateful ad hoc callable", StatefulTransform()
            )

    def test_anonymous_account_cannot_self_select_signed_in_requirement(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["requiredAccountRef"] = "ANONYMOUS_OR_UNKNOWN"
        receipt["observations"]["account"].update(
            {
                "requiredValue": "ANONYMOUS_OR_UNKNOWN",
                "observedValue": "ANONYMOUS_OR_UNKNOWN",
            }
        )
        result = evaluate_reasoning(receipt)
        self.assertFalse(result["valid"])
        self.assertIn("REASONING_ACCOUNT_BINDING_MISMATCH", result["failureCodes"])
        with self.assertRaises(ValueError):
            evaluate_reasoning(
                make_reasoning_receipt(),
                required_account_ref="ANONYMOUS_OR_UNKNOWN",
            )

    def test_verdict_cannot_change_external_signed_in_account(self) -> None:
        receipt = make_reasoning_receipt()
        verdict = make_verdict(receipt)
        verdict["requiredAccountRef"] = "different-signed-in-account"
        result = admit_reasoning(verdict, receipt)
        self.assertFalse(result["admitted"])
        self.assertIn("REASONING_ACCOUNT_BINDING_MISMATCH", result["failureCodes"])

    def test_reproduction_receipt_binds_external_admission_digest(self) -> None:
        claim = make_claim()
        receipt = make_reproduction(claim)
        receipt["independenceAdmissionDigest"] = "f" * 64
        result = evaluate_reproduction(
            receipt,
            claim,
            current_subject=deepcopy(claim["subjectRef"]),
            actual_method_bytes=b"count exact production records",
            actual_result_bytes=_jcs_text(claim["claimValue"]).encode("utf-8"),
            independence_registry=standard_independence_registry(),
        )
        self.assertFalse(result["valid"])
        self.assertIn(
            "REPRODUCTION_INDEPENDENCE_UNVERIFIED", result["failureCodes"]
        )

    def test_independence_registry_rejects_same_actor_domain_or_process_basis(self) -> None:
        registry = standard_independence_registry()
        admitted = registry.resolve("independence-admission-1")
        self.assertIsNotNone(admitted)
        mutations = (
            ("same-identity", lambda value: value["reproducer"].update(
                {"identityRef": value["producer"]["identityRef"]}
            )),
            ("same-domain", lambda value: value["reproducer"].update(
                {"trustDomain": value["producer"]["trustDomain"]}
            )),
            ("same-process-basis", lambda value: value.update(
                {"independenceBasis": "not independent; same producer and process"}
            )),
        )
        for label, mutate in mutations:
            with self.subTest(label=label):
                candidate = deepcopy(admitted)
                mutate(candidate)
                candidate["admissionDigest"] = (
                    reproduction_independence_admission_digest(candidate)
                )
                with self.assertRaises(ValueError):
                    ImmutableReproductionIndependenceRegistry.from_records(
                        f"invalid-{label}", [candidate]
                    )

    def test_complete_caller_fabricated_predecessor_is_not_trusted_history(self) -> None:
        from_claim, to_claim, prior, current, authority_registry, transition_registry = (
            make_three_version_transition_chain()
        )
        fabricated = deepcopy(prior)
        fabricated["transitionId"] = "fabricated-transition"
        fabricated["reason"] = "caller-manufactured history"
        fabricated["transitionDigest"] = transition_digest(fabricated)
        current["previousTransitionDigest"] = fabricated["transitionDigest"]
        current["transitionDigest"] = transition_digest(current)
        result = validate_claim_transition(
            current,
            from_claim,
            to_claim,
            authority_registry=authority_registry,
            transition_registry=transition_registry,
        )
        self.assertFalse(result["valid"])

    def test_transition_registry_validates_each_prior_snapshot_digest(self) -> None:
        _, _, prior, _, _, _ = make_three_version_transition_chain()
        fabricated = deepcopy(prior)
        fabricated["transitionRegistryDigest"] = "f" * 64
        fabricated["transitionDigest"] = transition_digest(fabricated)
        with self.assertRaises(ValueError):
            ImmutableClaimTransitionRegistry.from_records(
                "registry-with-fabricated-prior-snapshot",
                fabricated["claimId"],
                [fabricated],
            )

    def test_claim_use_rejects_caller_fabricated_transition_history(self) -> None:
        from_claim, to_claim, prior, current, authority_registry, transition_registry = (
            make_three_version_transition_chain()
        )
        fabricated = deepcopy(prior)
        fabricated["transitionId"] = "fabricated-transition"
        fabricated["reason"] = "caller-manufactured history"
        fabricated["transitionDigest"] = transition_digest(fabricated)
        current["previousTransitionDigest"] = fabricated["transitionDigest"]
        current["transitionDigest"] = transition_digest(current)
        result = evaluate_claim_use(
            to_claim,
            "PROMOTE_TO_POLICY",
            authority_registry=authority_registry,
            promotion_transition=current,
            transition_from_claim=from_claim,
            transition_registry=transition_registry,
        )
        self.assertFalse(result["allowed"])

    def test_non_rfc3339_observation_timestamp_variants_fail_closed(self) -> None:
        invalid_timestamps = (
            "2026-W36-2T00:00:00+00:00",
            "2026-244T00:00:00+00:00",
            "2026-09-01 00:00:00+00:00",
            "2026-09-01T00:00:00",
        )
        for timestamp in invalid_timestamps:
            with self.subTest(timestamp=timestamp):
                receipt = make_reasoning_receipt()
                receipt["observations"]["account"]["observedAt"] = timestamp
                result = evaluate_reasoning(receipt)
                self.assertFalse(result["valid"])
                self.assertIn(
                    "REASONING_OBSERVATION_EVIDENCE_INVALID",
                    result["failureCodes"],
                )
        for timestamp in (
            "2026-09-01T00:00:00Z",
            "2026-09-01T01:02:03.456+01:00",
        ):
            with self.subTest(valid_timestamp=timestamp):
                receipt = make_reasoning_receipt()
                receipt["observations"]["account"]["observedAt"] = timestamp
                self.assertTrue(evaluate_reasoning(receipt)["valid"])

    def test_transition_and_reproduction_reject_iso_week_dates(self) -> None:
        from_claim, to_claim, _, current, authority_registry, transition_registry = (
            make_three_version_transition_chain()
        )
        current["recordedAt"] = "2026-W36-2T00:00:00+00:00"
        current["transitionDigest"] = transition_digest(current)
        with self.assertRaises(ValueError):
            validate_claim_transition(
                current,
                from_claim,
                to_claim,
                authority_registry=authority_registry,
                transition_registry=transition_registry,
            )

        claim = make_claim()
        reproduction = make_reproduction(claim)
        reproduction["reproducedAt"] = "2026-W36-2T00:00:00+00:00"
        result = evaluate_reproduction(
            reproduction,
            claim,
            current_subject=deepcopy(claim["subjectRef"]),
            actual_method_bytes=b"count exact production records",
            actual_result_bytes=_jcs_text(claim["claimValue"]).encode("utf-8"),
            independence_registry=standard_independence_registry(),
        )
        self.assertIn(
            "REPRODUCTION_INDEPENDENCE_UNVERIFIED", result["failureCodes"]
        )

    def test_sanitized_response_digest_binds_exact_external_artifact_slice(self) -> None:
        receipt = json.loads(
            (
                ROOT
                / "feedback"
                / "mission-control"
                / "PRO-META-A40D413-SANITIZED-EVIDENCE-RECEIPT-20260901.json"
            ).read_text(encoding="utf-8")
        )
        response = receipt["completedResponseDigest"]
        self.assertEqual(
            response["value"],
            "73abbb661ad2e6acf0caf13c4c425a33f283bf13d2c1dd3c404e97d48e9d6a2e",
        )
        self.assertEqual(response["byteLength"], 33847)
        self.assertEqual(
            response["extraction"],
            {
                "algorithm": "UNIQUE_UTF8_MARKER_SUFFIX_V1",
                "marker": "## Complete response\n\n",
                "requiredMarkerOccurrences": 1,
                "startBoundary": "EXCLUSIVE_END_OF_MARKER",
                "endBoundary": "END_OF_ARTIFACT",
                "normalization": "NONE",
            },
        )

    def test_admission_question_digest_cannot_be_self_selected(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["subjectBinding"]["admissionQuestionDigest"].update(
            {"value": "f" * 64, "byteLength": 999999}
        )
        self.assertFalse(evaluate_reasoning(receipt)["valid"])

    def test_close_before_same_transaction_open_is_rejected(self) -> None:
        receipt = make_browser_receipt()
        receipt["agentOpenedTabIds"] = ["agent-1"]
        receipt["actions"] = [
            {
                "type": "CLOSE",
                "tabId": "agent-1",
                "ownershipClass": "AGENT_OPENED",
                "protected": False,
                "browserSessionRef": "browser-session-1",
                "transactionId": "transaction-1",
                "result": "SUCCEEDED",
                "closedByActor": "routing-executor",
            },
            {
                "type": "OPEN",
                "tabId": "agent-1",
                "ownershipClass": "AGENT_OPENED",
                "protected": False,
                "browserSessionRef": "browser-session-1",
                "transactionId": "transaction-1",
                "result": "SUCCEEDED",
                "closedByActor": None,
            },
        ]
        receipt["cleanup"].update(
            {
                "attempted": True,
                "results": [{"tabId": "agent-1", "result": "SUCCEEDED"}],
                "remainingAgentTabIds": [],
            }
        )
        self.assertFalse(evaluate_browser(receipt)["allowed"])

    def test_external_evidence_ref_is_bound_to_existing_humandesign_commit(self) -> None:
        state = (ROOT / "state" / "MISSION-CONTROL-AUTHORITY-PROVENANCE-2026-09-01.md").read_text(encoding="utf-8")
        feedback = (ROOT / "feedback" / "mission-control" / "SDF-HUMANDESIGN-76-SCOPE-AUTHORITY-001.json").read_text(encoding="utf-8")
        self.assertNotIn("4ccd140b33f8473fa79e91ff6161caaaaa69323e", state + feedback)
        self.assertIn("bf8fa12", state + feedback)

    def test_embedded_authority_and_fake_transition_are_not_authorization(self) -> None:
        relying_party_registry = make_authority_registry_from_claim(make_claim())
        claim = make_claim(
            owner_authorized=True,
            decision_use="POLICY_ELIGIBLE",
            verification_state="AUTHORIZED_POLICY",
        )
        result = evaluate_claim_use(
            claim,
            "PROMOTE_TO_POLICY",
            authority_registry=relying_party_registry,
            promotion_transition={"transitionType": "PROMOTED"},
        )
        self.assertFalse(result["allowed"])

    def test_reproduction_rejects_unbound_result_digest_and_synthetic_required_receipt(self) -> None:
        claim = make_claim()
        receipt = make_reproduction(claim, synthetic=True)
        receipt["resultDigest"] = TWO
        result = evaluate_reproduction(
            receipt,
            claim,
            current_subject=deepcopy(claim["subjectRef"]),
            actual_method_bytes=b"count exact production records",
            actual_result_bytes=_jcs_text(claim["claimValue"]).encode("utf-8"),
            independence_registry=standard_independence_registry(),
        )
        self.assertFalse(result["valid"])
        self.assertIn("PRODUCTION_REPRODUCTION_MISSING", result["failureCodes"])

    def test_receipt_cannot_self_select_external_required_role(self) -> None:
        receipt = make_reasoning_receipt(required_mode="Extra High", observed_mode="Extra High")
        receipt["requiredReviewerRole"] = "EXTRA_HIGH"
        self.assertFalse(evaluate_reasoning(receipt)["valid"])

    def test_verdict_receipt_is_durably_single_use(self) -> None:
        receipt = make_reasoning_receipt()
        verdict = make_verdict(receipt)
        store = new_consumption_store()
        self.assertTrue(admit_reasoning(verdict, receipt, consumption_store=store)["admitted"])
        self.assertFalse(admit_reasoning(verdict, receipt, consumption_store=store)["admitted"])

    def test_claimed_agent_tab_without_open_or_prior_proof_is_rejected(self) -> None:
        receipt = make_browser_receipt()
        receipt["agentOpenedTabIds"] = ["ghost-tab"]
        self.assertFalse(evaluate_browser(receipt)["allowed"])

    def test_cleanup_must_reconcile_opened_closed_and_remaining_tabs(self) -> None:
        receipt = make_browser_receipt()
        receipt["agentOpenedTabIds"] = ["agent-1"]
        receipt["actions"] = [{
            "type": "OPEN",
            "tabId": "agent-1",
            "ownershipClass": "AGENT_OPENED",
            "protected": False,
            "browserSessionRef": "browser-session-1",
            "transactionId": "transaction-1",
            "result": "SUCCEEDED",
            "closedByActor": None,
        }]
        self.assertFalse(evaluate_browser(receipt)["allowed"])


if __name__ == "__main__":
    unittest.main()
