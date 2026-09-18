from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQ = ROOT / "docs" / "requirements" / "2026-09-18-work-receipt-origin-chat-backlink.owner-requirement.json"
ROUTING = ROOT / "patterns" / "chat-work-execution-routing-threshold.md"
DELIVERY = ROOT / "patterns" / "worker-directive-delivery-and-chat-output-budget.md"
DIRECTIVE = ROOT / "templates" / "CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json"
RECEIPT = ROOT / "templates" / "CODEX-EXECUTION-RECEIPT.json"


class WorkOriginChatBacklinkTests(unittest.TestCase):
    def setUp(self) -> None:
        self.requirement = json.loads(REQ.read_text(encoding="utf-8"))
        self.routing = ROUTING.read_text(encoding="utf-8")
        self.delivery = DELIVERY.read_text(encoding="utf-8")
        self.directive = json.loads(DIRECTIVE.read_text(encoding="utf-8"))
        self.receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))

    def test_owner_requirement_is_active_and_covers_directive_and_receipt(self) -> None:
        self.assertEqual(self.requirement["authority"], "owner")
        self.assertEqual(self.requirement["status"], "ACTIVE")
        ids = [item["id"] for item in self.requirement["requirements"]]
        self.assertEqual(
            ids,
            [
                "WORK-ORIGIN-CHAT-001",
                "WORK-ORIGIN-CHAT-002",
                "WORK-ORIGIN-CHAT-003",
            ],
        )
        joined = "\n".join(item["text"] for item in self.requirement["requirements"])
        self.assertIn("Every Work directive", joined)
        self.assertIn("Every owner-facing Work receipt", joined)
        self.assertIn("clickable link back to the originating Chat", joined)

    def test_routing_pattern_requires_exact_backlink_for_every_receipt_state(self) -> None:
        for phrase in (
            "docs/requirements/2026-09-18-work-receipt-origin-chat-backlink.owner-requirement.json",
            "## Originating Chat backlink",
            "Originating Chat title: <exact source Chat title>",
            "Originating Chat URL: <exact source conversation URL>",
            "Receipt backlink: REQUIRED",
            "completed, partial, blocked, failed, and not-attempted",
            "Work must not rediscover or replace it",
            "HANDOFF_BLOCKED_SOURCE_CHAT_URL",
            "does not create a native Work -> originating Chat messaging edge",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.routing)

    def test_delivery_pattern_makes_backlink_part_of_runnable_directive(self) -> None:
        for phrase in (
            "originating Chat title and exact source conversation URL",
            "final Work receipt echo them as an owner-clickable backlink",
            "launching a ChatGPT Work handoff without the resolvable originating Chat URL",
            "did the directive contain the exact originating Chat title + URL",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.delivery)

    def test_machine_directive_carries_source_chat_and_requires_echo(self) -> None:
        source = self.directive["sourceChat"]
        self.assertEqual(source["urlStatus"], "RESOLVED")
        self.assertTrue(source["receiptBacklinkRequired"])
        self.assertIn("originating-chat-title", source["title"])
        self.assertIn("originating-chat-conversation-url", source["url"])
        handling = self.directive["handoffPolicy"]["responseHandling"]
        self.assertTrue(handling["requiredSourceChatTitleEcho"])
        self.assertTrue(handling["requiredSourceChatUrlEcho"])
        self.assertTrue(handling["requiredOwnerClickableSourceChatBacklink"])

    def test_machine_receipt_echoes_exact_source_chat_as_clickable_link(self) -> None:
        source = self.receipt["sourceChat"]
        self.assertEqual(source["urlStatus"], "RESOLVED")
        self.assertTrue(source["exactDirectiveEcho"])
        self.assertIn("echo-exact-source-chat-title-from-directive", source["title"])
        self.assertIn("echo-exact-source-chat-url-from-directive", source["url"])
        self.assertIn("Originating Chat:", source["ownerFacingBacklinkMarkdown"])
        self.assertIn("](<exact source conversation URL>)", source["ownerFacingBacklinkMarkdown"])


if __name__ == "__main__":
    unittest.main()
