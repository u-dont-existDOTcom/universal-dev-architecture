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
    return {"sequence": seq, "eventId": f"event:{seq}", "data": data}


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


class MissionControlReceiptCopierTests(unittest.TestCase):
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

    def test_current_v6_route_discovers_exact_completed_provider_thread_and_expired_route_does_not(self) -> None:
        events = [route_event(), pre_send(), session_complete()]
        found = copier.discover_decision_candidates(events, min_sequence=90, now=NOW)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].thread_id, "provider-thread-v3")
        self.assertEqual(found[0].provider_session_id, "provider-session:v3")
        expired = [route_event("old", "2026-09-21T13:00:00Z"), pre_send("old"), session_complete("old")]
        self.assertEqual(copier.discover_decision_candidates(expired, min_sequence=0, now=NOW), [])

    def test_web_prefixed_provider_thread_is_discovered_exactly(self) -> None:
        url = "https://chatgpt.com/c/WEB:06ae4e6c-c87c-4ab9-8478-14449b19ce81"
        events = [route_event(), pre_send(), session_complete(conversation_url=url)]
        found = copier.discover_decision_candidates(events, min_sequence=90, now=NOW)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].thread_id, "WEB:06ae4e6c-c87c-4ab9-8478-14449b19ce81")

    def test_decision_block_is_bound_to_route_provider_session_and_hash(self) -> None:
        candidate = copier.discover_decision_candidates([route_event(), pre_send(), session_complete()], now=NOW)[0]
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
