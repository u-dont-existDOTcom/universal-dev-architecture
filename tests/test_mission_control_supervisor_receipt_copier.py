from __future__ import annotations

import datetime as dt
import importlib.util
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "tools" / "codex-mission-control" / "owner-runtime" / "supervisor_receipt_copier.py"
spec = importlib.util.spec_from_file_location("mc_receipt_copier", MODULE_PATH)
assert spec and spec.loader
copier = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = copier
spec.loader.exec_module(copier)

NOW = dt.datetime(2026, 9, 21, 14, 0, tzinfo=dt.timezone.utc)


def event(seq: int, data: dict) -> dict:
    return {"sequence": seq, "eventId": f"event:{seq}", "occurredAt": "2026-09-21T13:56:00Z", "data": data}


def route_event(request_id: str = "issue178-v3", expires: str = "2026-09-21T15:00:00Z") -> dict:
    body = copier.V6_ROUTE_PREFIX + json.dumps({
        "schemaVersion": 6,
        "requestId": request_id,
        "worker": "mission-control-development",
        "destinationSupervisorId": "mc-project-manager",
        "nonce": "nonce-v3",
        "reasoningLane": "EXTRA_HIGH_DIRECT",
        "evidenceCapsule": {"id": "capsule:v3", "sha256": "1" * 64},
        "ownerOutcome": {"id": "owner-outcome:issue178", "epoch": 2, "sha256": "2" * 64},
        "githubReceipt": {"repository": "u-dont-existDOTcom/universal-dev-architecture", "issueNumber": 59, "stageIssueNumber": 61},
        "queuedAt": "2026-09-21T13:55:00Z",
        "expiresAt": expires,
        "factualPacket": {"taskId": "task:mission-control-development"},
    }, separators=(",", ":"))
    return event(100, {"type": "worker_message_recorded", "worker": "mission-control-development", "body": body})


def pre_send(request_id: str = "issue178-v3") -> dict:
    return event(101, {
        "type": "evidence_receipt_recorded", "worker": "mission-control-development",
        "summary": copier.IN_BAND_PRE_SEND_SUMMARY,
        "refs": [
            f"request:{request_id}", "supervisor:mc-project-manager",
            "provider_session:provider-session:v3", "in_band_binding_sha256:" + "3" * 64,
            "provider_body_sha256:" + "4" * 64, "submission_admission:send-admission:v3",
        ],
    })


def session_complete(request_id: str = "issue178-v3", conversation_url: str = "https://chatgpt.com/c/provider-thread-v3") -> dict:
    return event(102, {
        "type": "evidence_receipt_recorded", "worker": "mission-control-development",
        "summary": copier.PROVIDER_SESSION_SUMMARY,
        "refs": [
            f"request:{request_id}", "supervisor:mc-project-manager",
            "provider_session:provider-session:v3", "session_role:IN_BAND_REQUEST_DECISION_SESSION",
            "lifecycle_status:COMPLETE", "url_binding_status:EXACT",
            f"conversation_url:{conversation_url}",
        ],
    })

def stage_started(request_id: str = "issue178-v3", conversation_url: str = "https://chatgpt.com/c/provider-thread-v3") -> dict:
    return event(103, {
        "type": "evidence_receipt_recorded", "worker": "mission-control-development",
        "summary": "MISSION_CONTROL_RELAY_STAGE_V1",
        "refs": [
            f"request:{request_id}", "supervisor:mc-project-manager",
            "provider_session:provider-session:v3", "step:IN_BAND_REQUEST_DECISION",
            "generation_state:STARTED", f"conversation_url:{conversation_url}",
        ],
    })


class MissionControlReceiptCopierTests(unittest.TestCase):
    def test_thread_selector_requires_explicit_app_readback_observed_at(self) -> None:
        candidate = copier.discover_decision_candidates([route_event(), pre_send(), session_complete(), stage_started()], now=NOW)[0]
        exact = "Create one harmless isolated child branch and return execution facts only."
        payload = {
            "schema_version": 5, "envelope_kind": "MISSION_CONTROL_CANONICAL_DECISION",
            "request_id": "issue178-v3", "supervisor_id": "mc-project-manager",
            "provider_session_id": "provider-session:v3", "nonce": "nonce-v3",
            "in_band_binding_sha256": "3" * 64, "execution_provenance": copier.IN_BAND_PROVENANCE,
            "evidence_capsule": {"id": "capsule:v3", "sha256": "1" * 64},
            "owner_outcome": {"id": "owner-outcome:issue178", "epoch": 2, "sha256": "2" * 64},
            "reasoning_lane": "EXTRA_HIGH_DIRECT",
            "decision_block": {"decision_id": "decision:v3", "exact_text": exact, "sha256": copier.sha256_text(exact)},
            "pro_decision_block": {"used": False, "model_mode": None, "exact_text": None, "sha256": None},
            "writer_contract": {"mode": "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", "reinterpretation_allowed": False},
        }
        block = copier.DECISION_PREFIX + json.dumps(payload, separators=(",", ":"))
        missing_observation = {
            "threadId": "stable-app-thread", "status": "idle", "updatedAt": 1790000001000,
            "finalAgentMessage": "2026-09-23 00:21 UTC\n" + block,
        }
        self.assertIsNone(copier.select_decision_machine_block([missing_observation], candidate))

    def test_timestamp_prefixed_machine_block_is_extracted_without_rewriting(self) -> None:
        payload = {"schema_version": 5, "request_id": "issue178-v3"}
        machine = copier.DECISION_PREFIX + json.dumps(payload, separators=(",", ":"))
        parsed = copier.extract_machine_block("2026-09-21 14:00 UTC\n\n" + machine, copier.DECISION_PREFIX)
        self.assertIsNotNone(parsed)
        assert parsed
        self.assertEqual(parsed[0], machine)
        self.assertEqual(parsed[1], payload)
        with self.assertRaises(copier.CopierError):
            copier.extract_machine_block(machine + "\ntrailing prose", copier.DECISION_PREFIX)

    def test_crossed_provider_response_remains_reconcilable_after_route_expiry_but_unsent_expired_route_does_not(self) -> None:
        events = [route_event(), pre_send(), session_complete(), stage_started()]
        found = copier.discover_decision_candidates(events, min_sequence=90, now=NOW)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].conversation_url, "https://chatgpt.com/c/provider-thread-v3")
        self.assertEqual(found[0].provider_session_id, "provider-session:v3")
        expired_crossed = [route_event("old", "2026-09-21T14:00:00Z"), pre_send("old"), session_complete("old"), stage_started("old")]
        self.assertEqual(len(copier.discover_decision_candidates(expired_crossed, min_sequence=0, now=NOW)), 1)
        expired_unsent = [route_event("old-unsent", "2026-09-21T14:00:00Z"), pre_send("old-unsent"), session_complete("old-unsent")]
        self.assertEqual(copier.discover_decision_candidates(expired_unsent, min_sequence=0, now=NOW), [])

    def test_worker_snapshot_feed_is_bounded_to_exact_configured_worker(self) -> None:
        payload = {"worker": {"id": "mission-control-development", "timeline": [route_event(), {"junk": True}]}}
        events = copier.events_from_worker_snapshot(payload, "mission-control-development")
        self.assertEqual(events, payload["worker"]["timeline"] )
        with self.assertRaisesRegex(copier.CopierError, "identity"):
            copier.events_from_worker_snapshot(payload, "other-worker")
        with self.assertRaisesRegex(copier.CopierError, "response"):
            copier.events_from_worker_snapshot({"worker": {"id": "mission-control-development", "timeline": None}}, "mission-control-development")

    def test_web_prefixed_provider_thread_is_discovered_exactly(self) -> None:
        url = "https://chatgpt.com/c/WEB:06ae4e6c-c87c-4ab9-8478-14449b19ce81"
        events = [route_event(), pre_send(), session_complete(conversation_url=url), stage_started(conversation_url=url)]
        found = copier.discover_decision_candidates(events, min_sequence=90, now=NOW)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].conversation_url, url)

    def test_decision_block_is_bound_to_route_provider_session_and_hash(self) -> None:
        candidate = copier.discover_decision_candidates([route_event(), pre_send(), session_complete(), stage_started()], now=NOW)[0]
        exact = "Create one harmless isolated child branch and return execution facts only."
        payload = {
            "schema_version": 5,
            "envelope_kind": "MISSION_CONTROL_CANONICAL_DECISION",
            "request_id": "issue178-v3",
            "supervisor_id": "mc-project-manager",
            "provider_session_id": "provider-session:v3",
            "nonce": "nonce-v3",
            "in_band_binding_sha256": "3" * 64,
            "execution_provenance": copier.IN_BAND_PROVENANCE,
            "evidence_capsule": {"id": "capsule:v3", "sha256": "1" * 64},
            "owner_outcome": {"id": "owner-outcome:issue178", "epoch": 2, "sha256": "2" * 64},
            "reasoning_lane": "EXTRA_HIGH_DIRECT",
            "decision_block": {"decision_id": "decision:v3", "exact_text": exact, "sha256": copier.sha256_text(exact)},
            "pro_decision_block": {"used": False, "model_mode": None, "exact_text": None, "sha256": None},
            "writer_contract": {"mode": "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", "reinterpretation_allowed": False},
        }
        block = copier.DECISION_PREFIX + json.dumps(payload, separators=(",", ":"))
        copier.validate_decision_block(block, payload, candidate)
        bad = dict(payload, provider_session_id="provider-session:wrong")
        with self.assertRaisesRegex(copier.CopierError, "provider_session_id"):
            copier.validate_decision_block(block, bad, candidate)

    def test_app_thread_resolution_uses_unique_validated_machine_block_not_url_id(self) -> None:
        candidate = copier.discover_decision_candidates([route_event(), pre_send(), session_complete(), stage_started()], now=NOW)[0]
        exact = "Create one harmless isolated child branch and return execution facts only."
        payload = {
            "schema_version": 5, "envelope_kind": "MISSION_CONTROL_CANONICAL_DECISION",
            "request_id": "issue178-v3", "supervisor_id": "mc-project-manager",
            "provider_session_id": "provider-session:v3", "nonce": "nonce-v3",
            "in_band_binding_sha256": "3" * 64, "execution_provenance": copier.IN_BAND_PROVENANCE,
            "evidence_capsule": {"id": "capsule:v3", "sha256": "1" * 64},
            "owner_outcome": {"id": "owner-outcome:issue178", "epoch": 2, "sha256": "2" * 64},
            "reasoning_lane": "EXTRA_HIGH_DIRECT",
            "decision_block": {"decision_id": "decision:v3", "exact_text": exact, "sha256": copier.sha256_text(exact)},
            "pro_decision_block": {"used": False, "model_mode": None, "exact_text": None, "sha256": None},
            "writer_contract": {"mode": "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", "reinterpretation_allowed": False},
        }
        block = copier.DECISION_PREFIX + json.dumps(payload, separators=(",", ":"))
        threads = [
            {"threadId": "unrelated", "status": "idle", "updatedAt": 1790000000000, "finalAgentMessage": "not a receipt"},
            {"threadId": "stable-app-thread", "status": "idle", "updatedAt": 1790000001000, "observedAt": "2026-09-23T00:00:05.000Z", "finalAgentMessage": "2026-09-21 14:00 UTC\n\n" + block},
        ]
        resolved = copier.select_decision_machine_block(threads, candidate)
        self.assertIsNotNone(resolved)
        assert resolved
        self.assertEqual(resolved.thread_id, "stable-app-thread")
        self.assertEqual(resolved.publish_block, block)
        self.assertEqual(resolved.source_block, block)
        self.assertFalse(resolved.transformed)
        with self.assertRaisesRegex(copier.CopierError, "more than one app-owned thread"):
            copier.select_decision_machine_block(threads + [{**threads[1], "threadId": "duplicate"}], candidate)

    def test_digest_only_repair_preserves_exact_decision_text_and_rejects_other_binding_changes(self) -> None:
        candidate = copier.discover_decision_candidates([route_event(), pre_send(), session_complete(), stage_started()], now=NOW)[0]
        exact = "SOURCE_REWORK_REQUIRED. Preserve this exact semantic decision."
        payload = {
            "schema_version": 5, "envelope_kind": "MISSION_CONTROL_CANONICAL_DECISION",
            "request_id": "issue178-v3", "supervisor_id": "mc-project-manager",
            "provider_session_id": "provider-session:v3", "nonce": "nonce-v3",
            "in_band_binding_sha256": "3" * 64, "execution_provenance": copier.IN_BAND_PROVENANCE,
            "evidence_capsule": {"id": "capsule:v3", "sha256": "1" * 64},
            "owner_outcome": {"id": "owner-outcome:issue178", "epoch": 2, "sha256": "2" * 64},
            "reasoning_lane": "EXTRA_HIGH_DIRECT",
            "decision_block": {"decision_id": "decision:repair", "exact_text": exact, "sha256": "5" * 64},
            "pro_decision_block": {"used": False, "model_mode": None, "exact_text": None, "sha256": None},
            "writer_contract": {"mode": "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", "reinterpretation_allowed": False},
        }
        source_block = copier.DECISION_PREFIX + json.dumps(payload, separators=(",", ":"))
        repaired = copier.repair_decision_digest_only(source_block, payload, candidate)
        self.assertIsNotNone(repaired)
        assert repaired
        repaired_block, repaired_payload = repaired
        self.assertEqual(repaired_payload["decision_block"]["exact_text"], exact)
        self.assertEqual(repaired_payload["decision_block"]["sha256"], copier.sha256_text(exact))
        self.assertNotEqual(copier.sha256_text(source_block), copier.sha256_text(repaired_block))
        source_normalized = json.loads(json.dumps(payload))
        source_normalized["decision_block"]["sha256"] = copier.sha256_text(exact)
        self.assertEqual(source_normalized, repaired_payload)
        copier.validate_decision_block(repaired_block, repaired_payload, candidate)

        wrong_session = json.loads(json.dumps(payload))
        wrong_session["provider_session_id"] = "provider-session:wrong"
        wrong_block = copier.DECISION_PREFIX + json.dumps(wrong_session, separators=(",", ":"))
        with self.assertRaisesRegex(copier.CopierError, "provider_session_id"):
            copier.repair_decision_digest_only(wrong_block, wrong_session, candidate)

    def test_thread_selector_recovers_digest_only_machine_block(self) -> None:
        candidate = copier.discover_decision_candidates([route_event(), pre_send(), session_complete(), stage_started()], now=NOW)[0]
        exact = "SOURCE_REWORK_REQUIRED."
        payload = {
            "schema_version": 5, "envelope_kind": "MISSION_CONTROL_CANONICAL_DECISION",
            "request_id": "issue178-v3", "supervisor_id": "mc-project-manager",
            "provider_session_id": "provider-session:v3", "nonce": "nonce-v3",
            "in_band_binding_sha256": "3" * 64, "execution_provenance": copier.IN_BAND_PROVENANCE,
            "evidence_capsule": {"id": "capsule:v3", "sha256": "1" * 64},
            "owner_outcome": {"id": "owner-outcome:issue178", "epoch": 2, "sha256": "2" * 64},
            "reasoning_lane": "EXTRA_HIGH_DIRECT",
            "decision_block": {"decision_id": "decision:repair", "exact_text": exact, "sha256": "0" * 64},
            "pro_decision_block": {"used": False, "model_mode": None, "exact_text": None, "sha256": None},
            "writer_contract": {"mode": "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", "reinterpretation_allowed": False},
        }
        source_block = copier.DECISION_PREFIX + json.dumps(payload, separators=(",", ":"))
        resolved = copier.select_decision_machine_block([{
            "threadId": "source-rework-thread", "status": "idle", "updatedAt": 1790000001000,
            "observedAt": "2026-09-23T00:00:05.000Z",
            "finalAgentMessage": "2026-09-23 00:21 UTC\n" + source_block,
        }], candidate)
        self.assertIsNotNone(resolved)
        assert resolved
        self.assertTrue(resolved.transformed)
        self.assertEqual(resolved.source_block, source_block)
        self.assertEqual(resolved.payload["decision_block"]["exact_text"], exact)
        self.assertEqual(resolved.payload["decision_block"]["sha256"], copier.sha256_text(exact))
        self.assertNotEqual(resolved.source_block, resolved.publish_block)

    def test_bounded_execution_requires_machine_schema_not_human_display_shapes(self) -> None:
        candidate = copier.discover_decision_candidates([route_event(), pre_send(), session_complete(), stage_started()], now=NOW)[0]
        valid = {
            "schema_version": 1, "task_id": "task:mission-control-development", "job_id": "issue178-v4",
            "execution_objective": "Create one harmless deterministic canary artifact.",
            "reasoning_summary": "All semantic choices are frozen by the supervisor.",
            "strategy_id": "strategy:issue178-v4", "strategy_causal_hypothesis": "A bounded Work task proves the execution-return loop.",
            "predicted_outcome_change": "One verified native Work receipt becomes available.",
            "success_threshold": "One isolated child branch, one artifact, and all required checks pass.",
            "failure_threshold": "Any scope, branch, content, or check mismatch.",
            "next_decision_changing_evidence": "The exact privacy-safe Work execution receipt.",
            "reviewed_evidence_boundary": "Issue #178 current canary state through the source-bound V6 request.",
            "inputs": [{"type": "GITHUB_REF", "ref": "main", "sha256": None}],
            "allowed_actions": ["CREATE_CHILD_BRANCH"], "allowed_paths": ["docs/evidence/issue178-canary.txt"],
            "allowed_commands": ["git diff --check"], "forbidden_actions": ["MERGE_MAIN"], "forbidden_paths": [],
            "forbidden_decisions": ["CHANGE_METHODOLOGY"], "required_evidence": ["COMMIT_SHA"],
            "required_tests_or_checks": ["git diff --check"], "stop_and_return_triggers": ["ANY_MISMATCH"],
            "maximum_execution_cycles": 1, "execution_capability": {"type": "LOCAL_FILESYSTEM_COMMAND"},
            "workspace": "/workspace", "output_schema": {"status": "string"},
            "prompt": "Execute only the exact bounded canary residue and return execution facts.",
            "deadline": "2026-09-21T18:30:00Z",
            "work_execution_profile": {"model": "GPT_5_6_SOL", "effort": "MEDIUM", "routingTier": "SOL_MEDIUM", "routingTriggers": [], "fastModeRequest": "DO_NOT_ENABLE_FAST", "assuranceRequirement": "SET_REQUEST_SUFFICIENT", "policyRef": "patterns/work-model-and-effort-routing.md", "routingPolicyBaseCommit": "fc3d0d7592a4fa69e94ff8ae31d9a4e5433b73cb", "contractVersion": "TRUSTED_SETTER_V1"},
            "execution_surface": "CHATGPT_WORK_CLOUD",
        }
        copier.validate_bounded_execution(valid, candidate)
        failures = [
            {**valid, "job_id": "job:invalid-colon"},
            {**valid, "reviewed_evidence_boundary": ["not", "a", "string"]},
            {**valid, "inputs": {"type": "GITHUB_REF", "ref": "main", "sha256": None}},
            {**valid, "workspace": {"path": "/workspace"}},
            {**valid, "work_execution_profile": {**valid["work_execution_profile"], "model": "GPT-5.6 Sol", "effort": "medium"}},
        ]
        for malformed in failures:
            with self.assertRaises(copier.CopierError):
                copier.validate_bounded_execution(malformed, candidate)

    def test_github_comment_parser_supports_installed_and_slurp_page_shapes(self) -> None:
        flat = [{"id": 1, "body": "a"}, {"id": 2, "body": "b"}]
        self.assertEqual(copier.parse_github_comments_json(json.dumps(flat)), flat)
        self.assertEqual(copier.parse_github_comments_json(json.dumps([[flat[0]], [flat[1]]])), flat)
        with self.assertRaisesRegex(copier.CopierError, "mixed page shapes"):
            copier.parse_github_comments_json(json.dumps([flat[0], [flat[1]]]))

    def test_work_receipt_requires_exact_dispatch_binding_and_privacy_safe_fields(self) -> None:
        request = event(200, {
            "type": "chatgpt_work_cloud_dispatch_requested", "worker": "mission-control-development",
            "dispatch_id": "work-cloud:v3", "directive_id": "directive:v3", "directive_revision": 1,
            "task_id": "task:mission-control-development",
        })
        result = event(201, {
            "type": "chatgpt_work_cloud_dispatch_recorded", "worker": "mission-control-development",
            "dispatch_id": "work-cloud:v3", "status": "READY", "surface_verification": "VERIFIED_NATIVE_WORK",
            "work_thread_id": "native-work-v3",
        })
        candidate = copier.discover_work_candidates([request, result], min_sequence=190)[0]
        payload = {
            "schemaVersion": 1, "dispatchId": "work-cloud:v3", "worker": "mission-control-development",
            "taskId": "task:mission-control-development", "directiveId": "directive:v3", "directiveRevision": 1,
            "status": "COMPLETED", "terminalState": "CANARY_COMPLETE", "checksPassed": 2, "checksFailed": 0,
            "checksNotRun": 0, "blockerCodes": [], "artifactSha256s": ["a" * 64],
        }
        block = copier.WORK_RECEIPT_PREFIX + json.dumps(payload, separators=(",", ":"))
        copier.validate_work_receipt(block, payload, candidate)
        bad = dict(payload, terminalState="/home/private/path")
        with self.assertRaisesRegex(copier.CopierError, "terminalState"):
            copier.validate_work_receipt(block, bad, candidate)

    def test_prompts_make_model_read_only_for_control_plane_receipts(self) -> None:
        core = (ROOT / "tools/codex-mission-control/vps-browser-relay/src/core.mjs").read_text(encoding="utf-8")
        work = (ROOT / "tools/codex-mission-control/restored/codex-mission-control/lib/chatgpt-work-cloud-autodispatch.ts").read_text(encoding="utf-8")
        self.assertIn("Do not write, comment, mutate, or otherwise use GitHub", core)
        self.assertIn("deterministic Mission Control copier", core)
        self.assertIn("Do not write the receipt to GitHub yourself", work)
        self.assertIn("deterministic Mission Control copier", work)


if __name__ == "__main__":
    unittest.main()
