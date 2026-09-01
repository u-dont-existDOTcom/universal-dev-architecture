from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "internal-supervisor-routing-and-spend-authority.md"
MISSION_CONTROL_AGENTS = ROOT / "tools" / "codex-mission-control" / "AGENTS.md"
GATE = (
    ROOT
    / "tools"
    / "codex-mission-control"
    / "restored"
    / "codex-mission-control"
    / "lib"
    / "chat-work-authority-gate.ts"
)
GATE_TEST = (
    ROOT
    / "tools"
    / "codex-mission-control"
    / "restored"
    / "codex-mission-control"
    / "tests"
    / "chat-work-authority-gate.test.ts"
)


class InternalSupervisorRoutingAndSpendAuthorityTests(unittest.TestCase):
    def test_pattern_reserves_semantic_authority_to_owner_and_chats(self):
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "proposals, methodology, prioritization, spending design",
            "Project Manager Chat",
            "specialist supervisor chat",
            "Codex and Work may",
            "They may not",
            "The gate applies before proposal formation",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_pattern_makes_internal_routing_automatic_without_owner_relay(self):
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "pre-authorized internal control-plane transport",
            "deliver the packet automatically",
            "ask the owner to paste or relay the packet",
            "ask the owner to say `send it`",
            "generic browser-confirmation rule",
            "external recipient, publication, purchase, account change",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_pattern_preserves_full_outcome_continuation(self):
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "Default behavior is completion of the owner-requested outcome",
            "continuation trigger",
            "the exact owner outcome is live-verified",
            "Every stop must state the unmet owner outcome",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_mission_control_instructions_activate_the_same_boundary(self):
        text = MISSION_CONTROL_AGENTS.read_text(encoding="utf-8")
        for phrase in (
            "Chat reasoning and Work execution authority",
            "Codex and Work are execution-only",
            "Spending boundary",
            "Internal supervisor routing",
            "never ask Joel to say `send it`",
            "Completion and continuation",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_executable_gate_contains_all_required_decisions(self):
        text = GATE.read_text(encoding="utf-8")
        for decision in (
            "REJECT_CODEX_OR_WORK_SEMANTIC_AUTHORSHIP",
            "REJECT_UNVERIFIED_REASONING_SOURCE",
            "REJECT_PAID_MODEL_INFERENCE",
            "REJECT_OWNER_RELAY_FOR_INTERNAL_ROUTE",
            "REJECT_INTERNAL_ROUTE_CONFIRMATION_HANDOFF",
            "ALLOW_AUTOMATIC_INTERNAL_ROUTE",
            "ALLOW_BOUNDED_EXECUTION",
            "REJECT_CHAT_EXECUTABLE_TASK_SUBSTITUTION",
        ):
            with self.subTest(decision=decision):
                self.assertIn(decision, text)

    def test_exact_askrigor_regressions_are_executable(self):
        text = GATE_TEST.read_text(encoding="utf-8")
        for phrase in (
            "Codex-authored $30 paid-API smoke proposal is rejected",
            "approximately $175 pilot ceiling is rejected",
            "false claim that a costed proposal came from ChatGPT fails closed",
            "asking Joel to say send it for an internal supervisor route is rejected",
            "generic browser action-time confirmation cannot override authorized internal routing",
            "Codex may execute only the zero-spend bounded mechanical residue",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)


if __name__ == "__main__":
    unittest.main()
