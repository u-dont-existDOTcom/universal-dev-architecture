from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQ = ROOT / "docs" / "requirements" / "2026-09-21-mission-control-native-work-autodispatch-current-main.owner-requirement.json"
PATTERN = ROOT / "patterns" / "chatgpt-work-cloud-dispatch.md"
ROUTING = ROOT / "patterns" / "chat-work-execution-routing-threshold.md"
MC = ROOT / "tools" / "codex-mission-control" / "restored" / "codex-mission-control"
RELAY = ROOT / "tools" / "codex-mission-control" / "vps-browser-relay"


class MissionControlNativeWorkAutodispatchCurrentMainTests(unittest.TestCase):
    def test_owner_requirement_removes_clipboard_transport_and_preserves_direct_verification(self) -> None:
        req = json.loads(REQ.read_text(encoding="utf-8"))
        self.assertEqual(req["authority"], "owner")
        self.assertEqual(req["status"], "ACTIVE")
        ids = {item["id"] for item in req["requirements"]}
        self.assertEqual(ids, {
            "MC-WORK-SURFACE-001", "MC-WORK-AUTO-LAUNCH-002", "MC-WORK-LINEAGE-003",
            "MC-WORK-IDEMPOTENCY-004", "MC-WORK-FAIRNESS-005", "MC-WORK-RETURN-006",
            "MC-WORK-PRIVACY-007", "MC-WORK-AUTHORITY-008", "MC-WORK-EVIDENCE-009",
        })
        text = json.dumps(req)
        self.assertIn("owner must not create a request JSON or paste the directive", text)
        self.assertIn("exactly one fresh source-bound V6 reasoning-review route", text)
        self.assertIn("Do not downgrade direct verification", text)

    def test_patterns_require_automatic_direct_controller_and_reasoning_return(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")
        routing = ROUTING.read_text(encoding="utf-8")
        for phrase in (
            "No clipboard relay",
            "execution_surface: CHATGPT_WORK_CLOUD",
            "proven unsent",
            "automatic replay is prohibited",
            "Automatic Work completion -> reasoning return",
            "current V6 in-band request-binding protocol",
        ):
            self.assertIn(phrase, pattern)
        self.assertIn("owner must not serve as a clipboard transport", routing)
        self.assertIn("exactly one fresh source-bound reasoning review", routing)

    def test_current_main_uses_direct_controller_not_stale_supervisor_mediated_work_creation(self) -> None:
        autodispatch = (MC / "lib" / "chatgpt-work-cloud-autodispatch.ts").read_text(encoding="utf-8")
        watcher = (MC / "scripts" / "run-chatgpt-work-cloud-autodispatcher.ts").read_text(encoding="utf-8")
        receipts = (MC / "lib" / "github-decision-receipts.ts").read_text(encoding="utf-8")
        codex = (RELAY / "src" / "codex-exec-candidate.mjs").read_text(encoding="utf-8")
        self.assertIn("discoverDirectWorkCloudDispatches", autodispatch)
        self.assertIn("scripts/dispatch-chatgpt-work-cloud.ts", watcher)
        self.assertIn("WORK_CLOUD_EXECUTION_RECEIPT_PREFIX", receipts)
        self.assertIn('persisted.execution_surface === \'CHATGPT_WORK_CLOUD\'', codex)
        self.assertNotIn("MISSION_CONTROL_NATIVE_WORK_HANDOFF_V1", autodispatch)
        self.assertNotIn("SOURCE_ATTESTED_NATIVE_WORK", autodispatch)
        self.assertNotIn("SOURCE_ATTESTED_NATIVE_WORK", receipts)

    def test_replay_boundary_and_privacy_are_first_class_events(self) -> None:
        schema = (MC / "lib" / "schema.ts").read_text(encoding="utf-8")
        dispatch = (MC / "lib" / "chatgpt-work-cloud-dispatch.ts").read_text(encoding="utf-8")
        post = (MC / "lib" / "post-work-reasoning-route.ts").read_text(encoding="utf-8")
        self.assertIn("chatgpt_work_cloud_handoff_intent_recorded", schema)
        self.assertIn("chatgpt_work_cloud_execution_receipt_recorded", schema)
        self.assertIn("automatic replay is prohibited", dispatch)
        self.assertIn("inBandRequestRoutePrefix", post)
        self.assertIn("schemaVersion: 6", post)
        self.assertIn("semantic_authority: false", post)


if __name__ == "__main__":
    unittest.main()
