from __future__ import annotations

import json
import unittest
from copy import deepcopy
from pathlib import Path

from scripts.mission_control_provenance import (
    _jcs_text,
    append_owner_source_correction,
    claim_digest,
    evaluate_browser_operation,
    evaluate_claim_use,
    evaluate_reasoning_surface_receipt,
    evaluate_reproduction,
    evaluate_subject_freshness,
    admit_supervision_verdict,
    transition_digest,
    validate_claim_transition,
    validate_owner_source_append_only,
)
from scripts.validate_mission_control_provenance import validate_repository


ROOT = Path(__file__).resolve().parents[1]
ZERO = "0" * 64
ONE = "1" * 64
TWO = "2" * 64


def load_template(name: str) -> dict:
    return json.loads((ROOT / "templates" / name).read_text(encoding="utf-8"))


def refresh_claim_digest(claim: dict) -> None:
    semantics = {key: value for key, value in claim.items() if key != "claimDigest"}
    claim["claimDigest"]["value"] = claim_digest(claim)
    claim["claimDigest"]["byteLength"] = len(_jcs_text(semantics).encode("utf-8"))


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
        "currentAuthorities": authorities,
        "requiredAuthorizations": [
            {
                "operation": "PROMOTE_TO_POLICY",
                "requiredIssuerClass": "OWNER_EXPLICIT",
                "scopeRef": "completion-policy",
                "authorizationSourceRef": source_ref,
                "status": status,
            }
        ],
        "evidenceRefs": ["artifact-source-v1"],
        "derivation": {"directiveVersion": "1.0.0"},
        "reproductionRequirement": "REQUIRED",
        "reproductionReceiptRefs": [],
        "verificationState": verification_state,
        "decisionUse": decision_use,
        "createdAt": "2026-09-01T00:00:00Z",
        "expiresAt": None,
        "supersedesClaimRef": None,
    }
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
    refresh_claim_digest(result)
    return result


def make_transition(from_claim: dict, to_claim: dict) -> dict:
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
        "transitionDigest": ZERO,
        "status": "APPLIED",
    }
    transition["transitionDigest"] = transition_digest(transition)
    return transition


def make_reproduction(claim: dict, *, synthetic: bool = False) -> dict:
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
        "reproducer": {
            "identityRef": "independent-process",
            "type": "HUMAN_OR_INDEPENDENT_PROCESS",
            "trustDomain": "independent-domain",
        },
        "independenceBasis": "Separate deterministic process",
        "methodRef": "method-v1",
        "methodDigest": ZERO,
        "commandOrProcedure": "count exact production records",
        "resultValue": claim["claimValue"],
        "resultDigest": ONE,
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
        }
    )
    receipt["conversation"]["conversationSessionId"] = "session-1"
    receipt["responsePayloadDigest"].update({"value": ONE, "byteLength": 8})
    receipt["replayProtection"]["admissionNonce"] = "nonce-1"
    values = {
        "surface": "SIGNED_IN_CHATGPT_CHAT",
        "account": receipt["observations"]["account"]["requiredValue"],
        "visibleModePreSubmission": observed_mode,
        "conversationSession": "SAME_TRANSACTION_SESSION",
        "submittedMessage": "EXACT_BOUND_PAYLOAD",
        "completedResponse": ONE,
        "visibleModePostResponse": observed_mode,
    }
    receipt["observations"]["visibleModePreSubmission"]["requiredValue"] = required_mode
    receipt["observations"]["visibleModePostResponse"]["requiredValue"] = required_mode
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


def make_verdict(receipt: dict, *, response_digest: str = ONE) -> dict:
    verdict = load_template("SUPERVISION-VERDICT-ADMISSION.json")
    verdict.update(
        {
            "verdictId": "verdict-1",
            "scopeKey": receipt["scopeKey"],
            "packetId": receipt["packetId"],
            "reviewRole": receipt["requiredReviewerRole"],
            "reasoningSurfaceReceiptRef": receipt["receiptId"],
        }
    )
    verdict["responsePayloadDigest"].update({"value": response_digest, "byteLength": 8})
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
    return receipt


class ClaimAuthorityProvenanceTests(unittest.TestCase):
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
        result = evaluate_claim_use(claim, "PROMOTE_TO_POLICY", promotion_transition={"transitionType": "PROMOTED"})
        self.assertFalse(result["allowed"])
        self.assertIn("AUTHORIZATION_REQUIREMENT_UNSATISFIED", result["failureCodes"])

        wrong_scope = make_claim(owner_authorized=True, decision_use="POLICY_ELIGIBLE", verification_state="AUTHORIZED_POLICY")
        wrong_scope["currentAuthorities"][-1]["scopeRefs"] = ["different-policy"]
        refresh_claim_digest(wrong_scope)
        wrong_scope_result = evaluate_claim_use(wrong_scope, "PROMOTE_TO_POLICY", promotion_transition={"transitionType": "PROMOTED"})
        self.assertIn("AUTHORIZATION_REQUIREMENT_UNSATISFIED", wrong_scope_result["failureCodes"])

    def test_reasoning_decision_does_not_satisfy_owner_explicit(self) -> None:
        claim = make_claim(decision_use="POLICY_ELIGIBLE", verification_state="AUTHORIZED_POLICY")
        claim["currentAuthorities"].append(
            {"authorityClass": "REASONING_DECISION", "authoritySourceRef": "reasoning-1", "authorityScope": ["PROMOTE_TO_POLICY"], "scopeRefs": ["completion-policy"], "status": "CURRENT"}
        )
        claim["requiredAuthorizations"][0].update({"authorizationSourceRef": "reasoning-1", "status": "SATISFIED"})
        refresh_claim_digest(claim)
        result = evaluate_claim_use(claim, "PROMOTE_TO_POLICY", promotion_transition={"transitionType": "PROMOTED"})
        self.assertIn("AUTHORIZATION_REQUIREMENT_UNSATISFIED", result["failureCodes"])

    def test_owner_explicit_can_authorize_owner_acceptance_criterion(self) -> None:
        fact = make_claim()
        policy = promoted_claim(fact)
        transition = make_transition(fact, policy)
        self.assertTrue(validate_claim_transition(transition, fact, policy)["valid"])

    def test_artifact_23_remains_descriptive_only(self) -> None:
        result = evaluate_claim_use(make_claim(23), "PROMOTE_TO_POLICY")
        self.assertIn("UNAUTHORIZED_CLAIM_PROMOTION", result["failureCodes"])

    def test_artifact_76_remains_descriptive_only(self) -> None:
        result = evaluate_claim_use(make_claim(76), "PROMOTE_TO_POLICY")
        self.assertIn("UNAUTHORIZED_CLAIM_PROMOTION", result["failureCodes"])

    def test_fact_to_policy_copy_requires_promotion_transition(self) -> None:
        policy = promoted_claim(make_claim())
        result = evaluate_claim_use(policy, "PROMOTE_TO_POLICY")
        self.assertIn("UNAUTHORIZED_CLAIM_PROMOTION", result["failureCodes"])

    def test_field_rename_cannot_bypass_fact_to_policy_transition(self) -> None:
        policy = promoted_claim(make_claim())
        policy["claimText"] = "completion_required_question_count is 23"
        refresh_claim_digest(policy)
        result = evaluate_claim_use(policy, "PROMOTE_TO_POLICY")
        self.assertIn("UNAUTHORIZED_CLAIM_PROMOTION", result["failureCodes"])

    def test_promotion_requires_new_authority_source(self) -> None:
        fact = make_claim()
        policy = promoted_claim(fact)
        policy["currentAuthorities"] = deepcopy(fact["currentAuthorities"])
        refresh_claim_digest(policy)
        transition = make_transition(fact, policy)
        self.assertIn("UNAUTHORIZED_CLAIM_PROMOTION", validate_claim_transition(transition, fact, policy)["failureCodes"])

    def test_reproduction_verifies_fact_but_never_promotes_policy(self) -> None:
        claim = make_claim()
        result = evaluate_reproduction(make_reproduction(claim), claim)
        self.assertTrue(result["verifiedFact"])
        self.assertFalse(result["policyPromoted"])

    def test_synthetic_fixture_cannot_satisfy_production_reproduction(self) -> None:
        claim = make_claim()
        result = evaluate_reproduction(make_reproduction(claim, synthetic=True), claim, production_required=True)
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
        result = evaluate_claim_use(claim, "AUTHORIZE_RELEASE")
        self.assertIn("AUTHORIZATION_REQUIREMENT_UNSATISFIED", result["failureCodes"])

    def test_unregistered_load_bearing_owner_rendering_is_rejected(self) -> None:
        claim = make_claim(use_sites=["OWNER_FACING_DEFINITIVE_RENDERING"])
        result = evaluate_claim_use(claim, "ASSERT_FACT", use_site="OWNER_FACING_DEFINITIVE_RENDERING")
        self.assertIn("DEFINITIVE_RENDERING_REJECTED", result["failureCodes"])

    def test_claim_transition_digest_chain_detects_mutation(self) -> None:
        fact = make_claim()
        policy = promoted_claim(fact)
        transition = make_transition(fact, policy)
        transition["reason"] = "mutated after digest"
        self.assertIn("SUBJECT_BINDING_STALE", validate_claim_transition(transition, fact, policy)["failureCodes"])

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
        result = evaluate_claim_use(claim, "ASSERT_FACT", use_site="OWNER_FACING_DEFINITIVE_RENDERING")
        self.assertTrue(result["loadBearing"])
        self.assertIn("DEFINITIVE_RENDERING_REJECTED", result["failureCodes"])


class ReasoningSurfaceReceiptTests(unittest.TestCase):
    def _self_asserted(self, evidence_type: str) -> dict:
        receipt = make_reasoning_receipt()
        receipt["observations"]["visibleModePreSubmission"]["evidenceSourceType"] = evidence_type
        return evaluate_reasoning_surface_receipt(receipt)

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
        self.assertIn("REASONING_RECEIPT_INCOMPLETE", evaluate_reasoning_surface_receipt(receipt)["failureCodes"])

    def test_pro_requirement_rejects_extra_high_observed_mode(self) -> None:
        result = evaluate_reasoning_surface_receipt(make_reasoning_receipt(observed_mode="Extra High"))
        self.assertIn("REASONING_SURFACE_MODE_MISMATCH", result["failureCodes"])

    def test_valid_pre_mode_without_completed_response_is_partial(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["observations"]["completedResponse"]["status"] = "MISSING"
        receipt["aggregateState"] = "PARTIAL"
        self.assertEqual(evaluate_reasoning_surface_receipt(receipt)["aggregateState"], "PARTIAL")

    def test_missing_post_response_mode_is_partial(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["observations"]["visibleModePostResponse"]["status"] = "MISSING"
        receipt["aggregateState"] = "PARTIAL"
        self.assertEqual(evaluate_reasoning_surface_receipt(receipt)["aggregateState"], "PARTIAL")

    def test_post_response_mode_mismatch_rejects_review(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["observations"]["visibleModePostResponse"]["observedValue"] = "Extra High"
        receipt["aggregateState"] = "MISMATCH"
        self.assertIn("REASONING_SURFACE_MODE_MISMATCH", evaluate_reasoning_surface_receipt(receipt)["failureCodes"])

    def test_surface_account_session_submission_and_response_are_independent(self) -> None:
        receipt = make_reasoning_receipt()
        for name in ("conversationSession", "submittedMessage", "completedResponse"):
            receipt["observations"][name]["status"] = "MISSING"
        receipt["aggregateState"] = "PARTIAL"
        result = evaluate_reasoning_surface_receipt(receipt)
        self.assertFalse(result["valid"])
        self.assertIn("REASONING_RECEIPT_INCOMPLETE", result["failureCodes"])

    def test_session_mismatch_rejects_transplanted_receipt(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["observations"]["completedResponse"]["binding"]["conversationSessionId"] = "other-session"
        receipt["aggregateState"] = "MISMATCH"
        self.assertIn("REASONING_RECEIPT_SESSION_MISMATCH", evaluate_reasoning_surface_receipt(receipt)["failureCodes"])

    def test_prior_receipt_replay_rejected_for_same_payload(self) -> None:
        receipt = make_reasoning_receipt()
        result = evaluate_reasoning_surface_receipt(receipt, prior_receipts=[deepcopy(receipt)])
        self.assertIn("REASONING_RECEIPT_REPLAY_REJECTED", result["failureCodes"])

    def test_receipt_replay_rejected_for_different_payload(self) -> None:
        prior = make_reasoning_receipt()
        receipt = make_reasoning_receipt()
        receipt["subjectBinding"]["inputPayloadDigest"]["value"] = TWO
        receipt["subjectBinding"]["submittedVisiblePayloadDigest"]["value"] = TWO
        result = evaluate_reasoning_surface_receipt(receipt, prior_receipts=[prior])
        self.assertIn("REASONING_RECEIPT_REPLAY_REJECTED", result["failureCodes"])

    def test_unexplained_input_to_submitted_digest_change_is_rejected(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["subjectBinding"]["submittedVisiblePayloadDigest"]["value"] = TWO
        receipt["aggregateState"] = "MISMATCH"
        self.assertIn("REASONING_RECEIPT_PAYLOAD_MISMATCH", evaluate_reasoning_surface_receipt(receipt)["failureCodes"])

    def test_response_digest_mismatch_rejects_verdict_admission(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["observations"]["completedResponse"]["observedValue"] = TWO
        receipt["aggregateState"] = "MISMATCH"
        self.assertFalse(admit_supervision_verdict(make_verdict(receipt), receipt)["admitted"])

    def test_valid_ui_receipt_cannot_claim_platform_attestation(self) -> None:
        receipt = make_reasoning_receipt()
        receipt["cryptographicPlatformAttestation"] = True
        receipt["aggregateState"] = "PARTIAL"
        self.assertIn("ASSURANCE_CLASS_OVERCLAIM", evaluate_reasoning_surface_receipt(receipt)["failureCodes"])

    def test_mismatch_incident_can_never_be_authoritative(self) -> None:
        receipt = make_reasoning_receipt(observed_mode="Extra High")
        result = admit_supervision_verdict(make_verdict(receipt), receipt)
        self.assertFalse(result["authoritative"])

    def test_corrected_transaction_preserves_prior_mismatch_incident(self) -> None:
        prior = make_reasoning_receipt(observed_mode="Extra High")
        corrected = make_reasoning_receipt()
        corrected.update({"receiptId": "receipt-2", "transactionId": "transaction-2", "supersedesReceiptRef": prior["receiptId"], "incidentRefs": ["MC-PRO-MODE-RECEIPT-MISMATCH-20260901-001"]})
        corrected["replayProtection"]["admissionNonce"] = "nonce-2"
        for observation in corrected["observations"].values():
            observation["binding"]["transactionId"] = "transaction-2"
        result = evaluate_reasoning_surface_receipt(corrected, prior_receipts=[prior])
        self.assertTrue(result["valid"])
        self.assertEqual(corrected["supersedesReceiptRef"], prior["receiptId"])

    def test_valid_receipt_cannot_be_paired_with_another_response(self) -> None:
        receipt = make_reasoning_receipt()
        result = admit_supervision_verdict(make_verdict(receipt, response_digest=TWO), receipt)
        self.assertIn("VERDICT_RECEIPT_BINDING_MISMATCH", result["failureCodes"])


class BrowserOperationReceiptTests(unittest.TestCase):
    def test_repository_retrieval_uses_cli_when_available(self) -> None:
        receipt = make_browser_receipt()
        receipt.update({"purposeClass": "REPOSITORY_RETRIEVAL", "browserNecessity": "NOT_REQUIRED"})
        receipt["nonBrowserAlternatives"][0]["satisfiesCapability"] = True
        self.assertIn("BROWSER_ROUTE_NOT_JUSTIFIED", evaluate_browser_operation(receipt)["failureCodes"])

    def test_browser_allowed_for_signed_in_reasoning_surface_observation(self) -> None:
        self.assertTrue(evaluate_browser_operation(make_browser_receipt())["allowed"])

    def test_second_transient_tab_requires_recorded_exception(self) -> None:
        receipt = make_browser_receipt()
        receipt["agentOpenedTabIds"] = ["agent-1", "agent-2"]
        self.assertIn("AGENT_TAB_CAP_EXCEEDED", evaluate_browser_operation(receipt)["failureCodes"])

    def test_only_same_transaction_agent_tabs_may_be_closed(self) -> None:
        receipt = make_browser_receipt()
        receipt["agentOpenedTabIds"] = ["agent-1"]
        receipt["actions"] = [{"type": "CLOSE", "tabId": "agent-1", "ownershipClass": "AGENT_OPENED", "protected": False, "browserSessionRef": "browser-session-1", "transactionId": "other-transaction", "result": "SUCCEEDED", "closedByActor": "routing-executor"}]
        self.assertIn("TAB_SESSION_MISMATCH", evaluate_browser_operation(receipt)["failureCodes"])

    def test_unknown_stale_tab_ownership_fails_closed(self) -> None:
        receipt = make_browser_receipt()
        receipt["actions"] = [{"type": "CLOSE", "tabId": "stale-1", "ownershipClass": "UNKNOWN", "protected": False, "browserSessionRef": "browser-session-1", "transactionId": "transaction-1", "result": "FAILED", "closedByActor": None}]
        self.assertIn("TAB_OWNERSHIP_UNVERIFIED", evaluate_browser_operation(receipt)["failureCodes"])

    def test_owner_existing_tabs_are_preserved(self) -> None:
        receipt = make_browser_receipt()
        self.assertTrue(receipt["baselineTabs"][0]["protected"])
        self.assertTrue(evaluate_browser_operation(receipt)["allowed"])

    def test_reasoning_conversation_tabs_are_protected(self) -> None:
        receipt = make_browser_receipt()
        tab = receipt["baselineTabs"][0]
        receipt["actions"] = [{"type": "CLOSE", "tabId": tab["tabId"], "ownershipClass": "OWNER_EXISTING", "protected": True, "browserSessionRef": "browser-session-1", "transactionId": "transaction-1", "result": "FAILED", "closedByActor": None}]
        self.assertIn("PROTECTED_TAB_MUTATION_ATTEMPT", evaluate_browser_operation(receipt)["failureCodes"])

    def test_tab_id_from_another_browser_session_is_rejected(self) -> None:
        receipt = make_browser_receipt()
        receipt["agentOpenedTabIds"] = ["agent-1"]
        receipt["actions"] = [{"type": "CLOSE", "tabId": "agent-1", "ownershipClass": "AGENT_OPENED", "protected": False, "browserSessionRef": "other-session", "transactionId": "transaction-1", "result": "FAILED", "closedByActor": None}]
        self.assertIn("TAB_SESSION_MISMATCH", evaluate_browser_operation(receipt)["failureCodes"])

    def test_cleanup_failure_is_reported_without_guessing_other_tabs(self) -> None:
        receipt = make_browser_receipt()
        receipt["agentOpenedTabIds"] = ["agent-1"]
        receipt["cleanup"].update({"attempted": True, "remainingAgentTabIds": ["agent-1"], "results": [{"tabId": "agent-1", "result": "FAILED"}]})
        result = evaluate_browser_operation(receipt)
        self.assertIn("AGENT_TAB_CLEANUP_INCOMPLETE", result["failureCodes"])
        self.assertNotIn(receipt["baselineTabs"][0]["tabId"], receipt["cleanup"]["remainingAgentTabIds"])

    def test_baseline_and_cleanup_states_are_both_recorded(self) -> None:
        receipt = make_browser_receipt()
        result = evaluate_browser_operation(receipt)
        self.assertTrue(receipt["baselineTabs"])
        self.assertIn("attempted", receipt["cleanup"])
        self.assertTrue(result["allowed"])

    def test_observed_tab_absence_does_not_attribute_closing_actor(self) -> None:
        receipt = make_browser_receipt()
        receipt["actions"] = [{"type": "OBSERVE_ABSENT", "tabId": "stale-1", "ownershipClass": "UNKNOWN", "protected": False, "browserSessionRef": "browser-session-1", "transactionId": "transaction-1", "result": "OBSERVED", "closedByActor": "UNKNOWN"}]
        self.assertTrue(evaluate_browser_operation(receipt)["allowed"])


class ProvenanceSchemaAndFixtureTests(unittest.TestCase):
    def test_all_schemas_templates_incidents_and_hostile_fixtures_validate(self) -> None:
        findings = validate_repository(ROOT)
        self.assertGreaterEqual(len(findings), 13)


if __name__ == "__main__":
    unittest.main()
