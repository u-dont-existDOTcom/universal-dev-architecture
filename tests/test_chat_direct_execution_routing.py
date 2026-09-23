from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ChatDirectExecutionRoutingTests(unittest.TestCase):
    def test_owner_requirement_is_active(self):
        data = json.loads(
            (ROOT / "docs/requirements/2026-09-19-chat-direct-execution-capability-preflight.owner-requirement.json").read_text()
        )
        self.assertEqual(data["status"], "ACTIVE_OWNER_REQUIREMENT")
        self.assertEqual(data["date"], "2026-09-20")
        self.assertIn("actual capability of the current Chat surface", data["normalized_rule"])
        self.assertIn("current-turn capability discovery", data["normalized_rule"])
        self.assertIn("can SSH to the ultimate target", " ".join(data["enforcement"]))

    def test_routing_uses_actual_chat_capability_before_work(self):
        text = (ROOT / "patterns/chat-work-execution-routing-threshold.md").read_text()
        self.assertIn("Action category alone is never a Work trigger", text)
        self.assertIn("current-turn direct-capability discovery", text)
        self.assertIn("not present in the initially expanded tool", text)
        self.assertIn("Remote Desktop Commander", text)
        self.assertIn("Docker/Coolify", text)
        self.assertIn("CHAT_DIRECT_EXECUTION_PREFLIGHT", text)
        self.assertIn("If Chat can perform the action directly and reliably, keep the action in Chat", text)

    def test_provider_native_cli_precedes_metered_api_when_capability_equivalent(self):
        text = (ROOT / "patterns/chat-work-execution-routing-threshold.md").read_text()
        self.assertIn("Provider-native subscription CLI before metered model API/gateway", text)
        self.assertIn("already-authenticated provider-native local subscription CLI", text)
        self.assertIn("prefer that CLI before spending metered API/gateway credits", text)
        self.assertIn("Claude Code CLI", text)
        self.assertIn("Codex CLI", text)
        self.assertIn("new non-resumed session", text)
        self.assertIn("neutral workspace", text)
        self.assertIn("unavailable or unauthenticated", text)
        self.assertIn("experiment specifically measures provider/API behavior", text)

    def test_credential_residence_does_not_rewrite_provider_route(self):
        text = (ROOT / "patterns/chat-work-execution-routing-threshold.md").read_text()
        self.assertIn("Provider route is independent of credential residence", text)
        self.assertIn("Credential or secret storage is an implementation detail", text)
        self.assertIn("do not insert Railway", text)
        self.assertIn("secret manager/environment store may supply credentials", text)

    def test_root_bootstrap_reminds_direct_execution_preflight(self):
        text = (ROOT / "AGENTS.md").read_text()
        self.assertIn("Before Work, discover deferred Chat tools too", text)
        self.assertIn("Chat/RDC", text)
        self.assertIn("SSH/VPS/deployment", text)
        self.assertIn("keep it in Chat", text)


if __name__ == "__main__":
    unittest.main()
