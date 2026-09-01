from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ChatLedReasoningCodexExecutionTests(unittest.TestCase):
    def test_pattern_makes_chat_reasoning_controlling(self) -> None:
        pattern = (
            ROOT / "patterns" / "chat-led-reasoning-codex-execution-separation.md"
        ).read_text(encoding="utf-8")
        required = (
            "Chat surfaces own reasoning. Codex owns only bounded execution",
            "Codex does not supervise itself",
            "Extra High by default",
            "Codex may not",
            "Codex-generated progress audit = non-authoritative",
            "SUPERVISION_DIRECTIVE_MISSING",
            "CODEX_AUTHORED_STRATEGY_CHANGE",
            "CODEX_SUBSTANTIVE_PROSE_AUTHORSHIP_UNAUTHORIZED",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, pattern)

    def test_directive_and_receipt_keep_reasoning_out_of_codex(self) -> None:
        directive = json.loads(
            (
                ROOT
                / "templates"
                / "CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json"
            ).read_text(encoding="utf-8")
        )
        receipt = json.loads(
            (ROOT / "templates" / "CODEX-EXECUTION-RECEIPT.json").read_text(
                encoding="utf-8"
            )
        )

        self.assertEqual(directive["schemaVersion"], 2)
        self.assertIn("reasoningSupervisor", directive)
        self.assertIn("strategy", directive)
        self.assertEqual(directive["ownerDecisionAuthority"], "NONE")
        self.assertEqual(directive["proEscalationAuthority"], "NONE")
        self.assertEqual(
            directive["ambiguityBehavior"], "STOP_AND_REPORT_DECISION_REQUIRED"
        )

        self.assertEqual(receipt["schemaVersion"], 2)
        self.assertTrue(receipt["nextReasoningReviewRequired"])
        self.assertIn("handoffPolicy", directive)
        self.assertIn("reasoningHandoff", receipt)
        self.assertFalse(receipt["reasoningHandoff"]["terminal"])
        prohibited = receipt["prohibitedAuthorityFields"]
        self.assertIsNone(prohibited["outcomeAdvancement"])
        self.assertIsNone(prohibited["strategyEfficacy"])
        self.assertIsNone(prohibited["scientificAdequacy"])
        self.assertIsNone(prohibited["ownerOutcomeAchieved"])

    def test_articles_self_supervision_fixture_fails(self) -> None:
        fixture = json.loads(
            (
                ROOT
                / "evals"
                / "mission-control"
                / "codex-self-supervision-articles-failure.json"
            ).read_text(encoding="utf-8")
        )
        self.assertTrue(
            fixture["observed"]["owner_had_to_ask_whether_progress_occurred"]
        )
        self.assertFalse(
            fixture["observed"]["progress_review_initiated_before_owner_prompt"]
        )
        self.assertEqual(
            fixture["expected"]["reasoning_supervision_state"], "FAILED"
        )
        self.assertEqual(fixture["expected"]["codex_strategy_authority"], "NONE")
        self.assertEqual(
            fixture["expected"]["required_next_controller"],
            "CHAT_REASONING_SUPERVISOR",
        )
        self.assertFalse(
            fixture["expected"]["same_strategy_execution_allowed"]
        )

    def test_bootstrap_routes_reasoning_to_chat(self) -> None:
        bootstrap = (
            ROOT / "templates" / "CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md"
        ).read_text(encoding="utf-8")
        required = (
            "Chats perform the reasoning. Codex is used only for execution",
            "Chat-led reasoning; Codex execution only",
            "Codex is an executor, not the project controller",
            "templates/CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json",
            "templates/CODEX-EXECUTION-RECEIPT.json",
            "SUPERVISION_DIRECTIVE_MISSING",
            "Codex does not diagnose or replace the strategy itself",
            "The owner must not have to ask whether substantial work made progress",
            "WAITING_FOR_REASONING_REVIEW",
            "Intermediate polls return only `PENDING` or `READY`",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, bootstrap)

    def test_indexes_route_controlling_pattern_and_templates(self) -> None:
        lesson = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        docs = (ROOT / "docs" / "INDEX.md").read_text(encoding="utf-8")
        templates = (ROOT / "templates" / "README.md").read_text(
            encoding="utf-8"
        )
        for text in (lesson, docs):
            self.assertIn(
                "patterns/chat-led-reasoning-codex-execution-separation.md",
                text,
            )
            self.assertIn("CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json", text)
            self.assertIn("CODEX-EXECUTION-RECEIPT.json", text)
        self.assertIn("CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json", templates)
        self.assertIn("CODEX-EXECUTION-RECEIPT.json", templates)
        self.assertIn("EXECUTOR-REASONING-HANDOFF.json", templates)
        self.assertIn("Chats perform the reasoning", templates)


if __name__ == "__main__":
    unittest.main()
