from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQ = ROOT / "docs" / "requirements" / "2026-09-18-work-human-gate-assist.owner-requirement.json"
SELF_REMEDIATION = ROOT / "patterns" / "worker-self-remediation-before-owner-interruption.md"
ROUTING = ROOT / "patterns" / "chat-work-execution-routing-threshold.md"
DIRECTIVE = ROOT / "templates" / "CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json"
RECEIPT = ROOT / "templates" / "CODEX-EXECUTION-RECEIPT.json"


class WorkHumanGateAssistTests(unittest.TestCase):
    def setUp(self) -> None:
        self.req = json.loads(REQ.read_text(encoding="utf-8"))
        self.remediation = SELF_REMEDIATION.read_text(encoding="utf-8")
        self.routing = ROUTING.read_text(encoding="utf-8")
        self.directive = json.loads(DIRECTIVE.read_text(encoding="utf-8"))
        self.receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))

    def test_owner_requirement_is_active_and_binds_vnc_only_as_owner_deployment(self) -> None:
        self.assertEqual(self.req["authority"], "owner")
        self.assertEqual(self.req["status"], "ACTIVE")
        binding = self.req["owner_deployment_binding"]
        self.assertEqual(binding["classification"], "NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT")
        self.assertEqual(binding["human_assist_channel"], "VNC")
        self.assertIn("open/focus the VNC viewer", binding["binding"])
        self.assertIn("Do not commit VNC hostnames", binding["private_locator_policy"])

    def test_human_only_gate_is_resumable_not_terminal(self) -> None:
        for phrase in (
            "Human-only browser gates are resumable owner-assist states",
            "does **not** by itself terminate an otherwise-authorized Work run",
            "OWNER_INTERACTION_PENDING",
            "Do not emit a terminal execution receipt merely because a human-only gate was encountered",
            "preserve the exact browser page/window/session at the gate",
            "open or focus the viewer",
            "resume automatically",
            "ask only for a minimal acknowledgement such as `done`",
            "must not solve or bypass CAPTCHAs itself",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.remediation)

    def test_routing_activates_owner_human_gate_requirement(self) -> None:
        self.assertIn(
            "docs/requirements/2026-09-18-work-human-gate-assist.owner-requirement.json",
            self.routing,
        )
        self.assertIn("configured human-assist behavior for irreducible browser/UI gates", self.routing)
        self.assertIn("OWNER_INTERACTION_PENDING", self.routing)

    def test_machine_directive_requires_resumable_human_assist(self) -> None:
        p = self.directive["humanAssistPolicy"]
        self.assertEqual(p["humanOnlyUiGateState"], "OWNER_INTERACTION_PENDING")
        self.assertTrue(p["prepareExactBlockedSession"])
        self.assertTrue(p["openOrFocusViewerWhenAuthorized"])
        self.assertTrue(p["preserveResumableStateWhileWaiting"])
        self.assertTrue(p["resumeAutomaticallyAfterGateClears"])
        self.assertTrue(p["terminalOnlyIfAssistUnavailableTimeoutOrNewAuthorityGate"])
        self.assertTrue(p["mustNotAutomateHumanVerification"])
        self.assertTrue(p["mustNotRequestCredentialsInChat"])

    def test_receipt_distinguishes_terminal_human_assist_failures(self) -> None:
        h = self.receipt["humanAssist"]
        self.assertEqual(h["invocations"], [])
        self.assertFalse(h["ownerInteractionPendingAtFinalReceipt"])
        self.assertFalse(h["assistChannelUnavailable"])
        self.assertFalse(h["securityTimeoutExpired"])
        self.assertFalse(h["newAuthorityGateReached"])


if __name__ == "__main__":
    unittest.main()
