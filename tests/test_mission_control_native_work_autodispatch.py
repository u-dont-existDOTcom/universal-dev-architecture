from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQ = ROOT / "docs" / "requirements" / "2026-09-19-mission-control-native-work-autodispatch.owner-requirement.json"
PATTERN = ROOT / "patterns" / "chatgpt-work-cloud-dispatch.md"
ROUTING = ROOT / "patterns" / "chat-work-execution-routing-threshold.md"
LESSON_INDEX = ROOT / "LESSON-INDEX.md"
MC = ROOT / "tools" / "codex-mission-control" / "restored" / "codex-mission-control"
RELAY = ROOT / "tools" / "codex-mission-control" / "vps-browser-relay"


class MissionControlNativeWorkAutoDispatchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.requirement = json.loads(REQ.read_text(encoding="utf-8"))
        self.pattern = PATTERN.read_text(encoding="utf-8")
        self.routing = ROUTING.read_text(encoding="utf-8")
        self.lesson_index = LESSON_INDEX.read_text(encoding="utf-8")

    def test_owner_requirement_forbids_normal_clipboard_handoff(self) -> None:
        self.assertEqual(self.requirement["authority"], "owner")
        self.assertEqual(self.requirement["status"], "ACTIVE")
        ids = {item["id"] for item in self.requirement["requirements"]}
        self.assertEqual(ids, {
            "MC-WORK-AUTO-001", "MC-WORK-APPROVAL-002", "MC-WORK-RETURN-003",
            "MC-WORK-IDEMPOTENCY-004", "MC-WORK-SURFACE-005",
        })
        text = json.dumps(self.requirement)
        for phrase in ("copy and paste", "product-level Work approval", "without requiring the owner",
                       "must not be automatically replayed", "Codex is not a substitute"):
            self.assertIn(phrase, text)

    def test_universal_patterns_require_automatic_mission_control_work_bridge(self) -> None:
        for phrase in (
            "Mission Control automated handoff and return",
            "No clipboard relay",
            "SOURCE_ATTESTED_NATIVE_WORK",
            "No ambiguous replay",
            "Queue fairness",
            "the owner should not serve as a transport bus",
        ):
            self.assertIn(phrase, self.pattern)
        self.assertIn("owner must not be used as a clipboard transport", self.routing)
        self.assertIn("chatgpt-work-cloud-dispatch.md", self.routing)
        self.assertIn("patterns/chatgpt-work-cloud-dispatch.md", self.lesson_index)

    def test_mission_control_contains_source_bound_dispatch_and_return_seams(self) -> None:
        files = {
            "schema": MC / "lib" / "schema.ts",
            "autodispatch": MC / "lib" / "chatgpt-work-cloud-autodispatch.ts",
            "route": MC / "app" / "api" / "worker-channel" / "[worker]" / "work-cloud-dispatch" / "route.ts",
            "github": MC / "lib" / "github-decision-receipts.ts",
            "relay": RELAY / "src" / "relay.mjs",
        }
        contents = {name: path.read_text(encoding="utf-8") for name, path in files.items()}
        self.assertIn('execution_surface: z.enum(["CODEX", "CHATGPT_WORK_CLOUD"])', contents["schema"])
        self.assertIn("MISSION_CONTROL_NATIVE_WORK_HANDOFF_V1", contents["autodispatch"])
        self.assertIn("MISSION_CONTROL_WORK_CLOUD_EXECUTION_RECEIPT_V1", contents["autodispatch"])
        self.assertIn("requestAlreadyExisted", contents["route"])
        self.assertIn("SOURCE_ATTESTED_NATIVE_WORK", contents["github"])
        self.assertIn("WORK_CLOUD_REQUEST_ONLY_RECOVERY_AMBIGUOUS", contents["relay"])
        self.assertIn("automatic replay is prohibited", contents["relay"])

    def test_reference_docs_keep_direct_and_mediated_evidence_distinct(self) -> None:
        doc = (MC / "docs" / "CHATGPT-WORK-CLOUD-DISPATCH.md").read_text(encoding="utf-8")
        self.assertIn("Automated supervisor-mediated mode", doc)
        self.assertIn("SOURCE_ATTESTED_NATIVE_WORK", doc)
        self.assertIn("VERIFIED_NATIVE_WORK", doc)
        self.assertIn("Manual owner copy/paste", doc)


if __name__ == "__main__":
    unittest.main()
