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
        self.assertIn("actual capabilities of the current Chat surface", data["normalized_rule"])

    def test_routing_uses_actual_chat_capability_before_work(self):
        text = (ROOT / "patterns/chat-work-execution-routing-threshold.md").read_text()
        self.assertIn("Action category alone is never a Work trigger", text)
        self.assertIn("remote-desktop", text)
        self.assertIn("If Chat can perform the action directly and reliably, keep the action in Chat", text)

    def test_root_bootstrap_reminds_direct_execution_preflight(self):
        text = (ROOT / "AGENTS.md").read_text()
        self.assertIn("Before Work, inventory Chat tools", text)
        self.assertIn("terminal/browser/GUI/remote-desktop", text)


if __name__ == "__main__":
    unittest.main()
