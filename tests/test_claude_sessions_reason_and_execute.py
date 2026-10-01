from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ClaudeSessionsReasonAndExecuteTests(unittest.TestCase):
    def test_owner_requirement_is_active(self):
        data = json.loads(
            (ROOT / "docs/requirements/2026-10-01-claude-sessions-reason-and-execute.owner-requirement.json").read_text()
        )
        self.assertEqual(data["status"], "ACTIVE_OWNER_REQUIREMENT")
        self.assertIn("doesn't apply to claude", data["owner_correction"])
        self.assertIn("both reasons and executes", data["normalized_rule"])
        self.assertIn("binds a Claude session's scope", data["normalized_rule"])

    def test_routing_pattern_scopes_the_split_to_openai_surfaces(self):
        text = (ROOT / "patterns/chat-work-execution-routing-threshold.md").read_text()
        self.assertIn("### Claude sessions reason and execute", text)
        self.assertIn("The Chat/Work split in this pattern is for OpenAI surfaces", text)
        self.assertIn("does not hand that reasoning to a separate reasoning chat or a Project Manager chat", text)
        self.assertIn("binds a Claude session's scope, data handling, spending caps and safety limits, not its reasoning", text)
        self.assertIn("Owner-only decisions stay with the owner", text)

    def test_runtime_admission_is_scoped_to_openai_workers(self):
        text = (ROOT / "patterns/runtime-chat-work-authority-admission-and-internal-routing.md").read_text()
        self.assertIn("This control supervises OpenAI Chat/Work execution", text)
        self.assertIn("it is not an execution-only worker under this admission control", text)

    def test_separation_pattern_is_scoped_to_openai_surfaces(self):
        text = (ROOT / "patterns/chat-led-reasoning-codex-execution-separation.md").read_text()
        self.assertIn("this separation governs OpenAI surfaces", text)
        self.assertIn("It does not apply to Claude", text)

    def test_root_routes_claude_sessions(self):
        text = (ROOT / "AGENTS.md").read_text()
        self.assertIn("a Claude session does both", text)


if __name__ == "__main__":
    unittest.main()
