from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ClaimAuthorityLaunderingTests(unittest.TestCase):
    def test_objective_reconciliation_registers_claim_authority(self) -> None:
        template = json.loads(
            (ROOT / "templates" / "OBJECTIVE-RECONCILIATION.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(template["schemaVersion"], 3)
        policy = template["claimAuthorityPolicy"]
        self.assertEqual(
            policy["authorityClasses"],
            [
                "OWNER_EXPLICIT",
                "OWNER_CORRECTION",
                "REASONING_DECISION",
                "ARTIFACT_DERIVED_FACT",
                "OBSERVED_PLATFORM_STATE",
                "EXECUTOR_PROPOSAL",
            ],
        )
        self.assertFalse(policy["authorityOrdinalAllowed"])
        self.assertTrue(policy["requiredAuthorizationsConjunctive"])
        self.assertTrue(policy["promotionRequiresAppendOnlyTransition"])
        self.assertFalse(policy["reproductionMayPromotePolicy"])
        self.assertFalse(policy["artifactFactMaySelectScientificCriterion"])
        self.assertFalse(policy["unregisteredDefinitiveRenderingAllowed"])
        self.assertEqual(
            set(policy["reconciliationFailureStates"]),
            {
                "UNAUTHORIZED_ADDITION",
                "INFERRED_NUMERIC_SCOPE",
                "DERIVATION_UNVERIFIED",
                "DIRECTIVE_SCOPE_EXCEEDED",
                "UNAUTHORIZED_CLAIM_PROMOTION",
                "AUTHORIZATION_REQUIREMENT_UNSATISFIED",
                "SUBJECT_BINDING_STALE",
                "PRODUCTION_REPRODUCTION_MISSING",
                "DEFINITIVE_RENDERING_REJECTED",
                "AUTHORITY_REGISTRY_MISSING",
                "AUTHORITY_SOURCE_UNREGISTERED",
                "TRANSITION_VALIDATION_REQUIRED",
                "TRANSITION_CHAIN_INVALID",
                "REPRODUCTION_BYTES_MISMATCH",
                "REPRODUCTION_RECEIPT_UNBOUND",
                "REPRODUCTION_INDEPENDENCE_UNVERIFIED",
            },
        )

        claim = template["claimRegistry"][0]
        required_fields = {
            "claimId",
            "claimVersion",
            "claimDigest",
            "claimText",
            "claimValue",
            "claimKind",
            "useSiteRefs",
            "loadBearingEvaluation",
            "subjectRef",
            "authorityRegistryRef",
            "authorityRegistryDigest",
            "currentAuthorities",
            "requiredAuthorizations",
            "reproductionRequirement",
            "verificationState",
            "decisionUse",
        }
        self.assertTrue(required_fields.issubset(claim))

    def test_directive_denies_unlisted_scientific_scope_changes(self) -> None:
        directive = json.loads(
            (
                ROOT / "templates" / "CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json"
            ).read_text(encoding="utf-8")
        )
        criteria = directive["authorizedCriteria"]
        self.assertFalse(criteria["executorMayAddOrChange"])
        self.assertEqual(criteria["onUnlistedChange"], "DIRECTIVE_SCOPE_EXCEEDED")
        self.assertEqual(
            set(criteria["restrictedDimensions"]),
            {
                "denominators",
                "thresholds",
                "sample sizes",
                "validation phases",
                "evidence sufficiency",
            },
        )

    def test_exact_hostile_fixture_preserves_fact_decision_boundary(self) -> None:
        fixture = json.loads(
            (
                ROOT
                / "evals"
                / "mission-control"
                / "executor-inferred-scientific-scope-authority-laundering.json"
            ).read_text(encoding="utf-8")
        )
        self.assertEqual(fixture["observedFacts"]["questionBankNonValidation"], 76)
        self.assertEqual(fixture["observedFacts"]["uniqueMappedQuestionIds"], 23)
        self.assertEqual(
            fixture["scientificCompletenessCriterion"]["status"],
            "SCIENTIFIC_SCOPE_UNRESOLVED",
        )
        self.assertIsNone(
            fixture["scientificCompletenessCriterion"]["authorizedValue"]
        )
        expected = {
            scenario["id"]: scenario["expected"]
            for scenario in fixture["scenarios"]
        }
        self.assertEqual(len(expected), 10)
        self.assertEqual(
            expected["owner-complete-profile-executor-infers-76"],
            "SCIENTIFIC_SCOPE_UNAUTHORIZED",
        )
        self.assertEqual(
            expected["contract-76-production-23"], "CONTRACT_ARTIFACT_MISMATCH"
        )
        self.assertEqual(
            expected["extra-high-versioned-directive-authorizes-76"],
            "AUTHORIZATION_REQUIREMENT_UNSATISFIED",
        )
        self.assertEqual(
            expected["fake-backend-proves-filtering-only"], "RELEASE_BLOCKED"
        )
        self.assertEqual(expected["green-worker-unauthorized-criterion"], "ROOT_RED")
        self.assertEqual(expected["reviewer-repeats-unreproduced-count"], "UNKNOWN")

    def test_feedback_packet_preserves_history_and_records_admitted_pro_revision(self) -> None:
        feedback = json.loads(
            (
                ROOT
                / "feedback"
                / "mission-control"
                / "SDF-HUMANDESIGN-76-SCOPE-AUTHORITY-001.json"
            ).read_text(encoding="utf-8")
        )
        self.assertEqual(
            feedback["feedbackId"], "SDF-HUMANDESIGN-76-SCOPE-AUTHORITY-001"
        )
        self.assertFalse(feedback["routing"]["extraHighPacketPrepared"])
        self.assertTrue(feedback["routing"]["proMetaReviewRequired"])
        self.assertEqual(feedback["routing"]["reviewPriority"], "IMMEDIATE")
        self.assertTrue(
            feedback["routing"]["sharedProScopeKey"].startswith(
                "supervision-architecture/"
            )
        )
        self.assertEqual(
            feedback["historicalStatusAtCommit6ec7380"],
            "PENDING_VERIFIED_EXTRA_HIGH_REVIEW",
        )
        self.assertEqual(
            feedback["status"], "PRO_REVISE_IMPLEMENTED_DRAFT_TESTS_PASS"
        )
        self.assertEqual(feedback["proMetaReview"]["verdict"], "REVISE")
        self.assertEqual(
            feedback["proMetaReview"]["completenessDenominatorSelection"],
            "FORBIDDEN_WITHOUT_OWNER_EXPLICIT",
        )
        self.assertGreaterEqual(len(feedback["evidenceRefs"]), 4)

    def test_unverified_subagent_name_cannot_claim_extra_high_authority(self) -> None:
        fixture = json.loads(
            (
                ROOT
                / "evals"
                / "mission-control"
                / "unverified-reasoning-surface-identity.json"
            ).read_text(encoding="utf-8")
        )
        self.assertEqual(fixture["given"]["browserState"], "UNAVAILABLE")
        self.assertEqual(fixture["given"]["browserInstances"], 0)
        self.assertFalse(fixture["given"]["modelOrModeVerified"])
        self.assertIsNone(fixture["given"]["signedInChatReceipt"])
        self.assertEqual(
            fixture["expected"]["reasoningSurface"],
            "UNVERIFIED_COLLABORATION_SUBAGENT",
        )
        self.assertFalse(fixture["expected"]["extraHighPacketPrepared"])
        self.assertFalse(fixture["expected"]["reasoningDecisionAuthoritative"])
        self.assertFalse(fixture["expected"]["mergeAllowed"])
        self.assertFalse(fixture["expected"]["proMetaReviewSubmissionAllowed"])

        feedback = json.loads(
            (
                ROOT
                / "feedback"
                / "mission-control"
                / "SDF-20260901-REASONING-SURFACE-IDENTITY-LAUNDERING-001.json"
            ).read_text(encoding="utf-8")
        )
        self.assertFalse(feedback["routing"]["extraHighPacketPrepared"])
        self.assertEqual(
            feedback["status"], "PRO_REVISE_IMPLEMENTED_DRAFT_TESTS_PASS"
        )
        self.assertEqual(
            feedback["historicalStatusAtCommit6ec7380"],
            "PENDING_VERIFIED_EXTRA_HIGH_DIAGNOSIS",
        )
        self.assertIsNone(feedback["proposedChange"])
        self.assertEqual(feedback["proMetaReview"]["verdict"], "REVISE")

    def test_current_bootstrap_and_pattern_fail_closed(self) -> None:
        bootstrap = (
            ROOT / "templates" / "CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md"
        ).read_text(encoding="utf-8")
        pattern = (
            ROOT / "patterns" / "supervision-assurance-planes-and-pro-meta-review.md"
        ).read_text(encoding="utf-8")
        required = (
            "UNAUTHORIZED_ADDITION",
            "INFERRED_NUMERIC_SCOPE",
            "DERIVATION_UNVERIFIED",
            "DIRECTIVE_SCOPE_EXCEEDED",
            "ARTIFACT_DERIVED_FACT",
            "EXECUTOR_PROPOSAL",
            "production-artifact cardinality",
            "independent reviewer",
            "OWNER_EXPLICIT",
            "UNAUTHORIZED_CLAIM_PROMOTION",
            "REASONING-SURFACE-OBSERVATION-RECEIPT",
        )
        for text in (bootstrap, pattern):
            for phrase in required:
                with self.subTest(document=text[:80], phrase=phrase):
                    self.assertIn(phrase, text)


if __name__ == "__main__":
    unittest.main()
