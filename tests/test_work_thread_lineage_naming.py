from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIREMENT_PATH = ROOT / "docs" / "requirements" / "2026-09-18-work-thread-lineage-naming.owner-requirement.json"
ROUTING_PATH = ROOT / "patterns" / "chat-work-execution-routing-threshold.md"
DIRECTIVE_PATH = ROOT / "templates" / "CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json"
RECEIPT_PATH = ROOT / "templates" / "CODEX-EXECUTION-RECEIPT.json"


class WorkThreadLineageNamingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.requirement = json.loads(REQUIREMENT_PATH.read_text(encoding="utf-8"))
        self.routing = ROUTING_PATH.read_text(encoding="utf-8")
        self.directive = json.loads(DIRECTIVE_PATH.read_text(encoding="utf-8"))
        self.receipt = json.loads(RECEIPT_PATH.read_text(encoding="utf-8"))

    def test_owner_requirement_is_active(self) -> None:
        self.assertEqual(self.requirement["authority"], "owner")
        self.assertEqual(self.requirement["status"], "ACTIVE")
        req = self.requirement["requirements"]
        self.assertEqual([item["id"] for item in req], ["WORK-THREAD-NAME-001", "WORK-THREAD-LOCATOR-001"])
        self.assertIn("Work — ", req[0]["text"])
        self.assertIn("originating Chat title", req[0]["operationalization"])

    def test_routing_pattern_owns_deterministic_title_rule(self) -> None:
        for phrase in (
            "## Work-thread lineage naming",
            "Work — <originating Chat title>",
            "If the handoff surface exposes a title or name field, set that field directly.",
            "put the exact requested title at the start of the runnable Work directive",
            "use the explicit source-chat title already established in the current conversation",
            "do not invent or claim an unseen UI title",
            "for owner traceability only",
            "does not transfer semantic authority",
            "report that title-setting limitation rather than blocking otherwise valid execution",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.routing)

    def test_pattern_binds_owner_requirement(self) -> None:
        self.assertIn(
            "docs/requirements/2026-09-18-work-thread-lineage-naming.owner-requirement.json",
            self.routing,
        )


    def test_created_work_locator_is_durable_and_receipted(self) -> None:
        for phrase in (
            "### Created Work-thread locator capture",
            "codex://threads/<id>",
            "work_thread_locator_status=UNRESOLVED",
            "reuse the stored locator",
            "not be represented as fully discoverable",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.routing)
        self.assertEqual(self.directive["workThread"]["locatorStatus"], "PENDING_CREATION")
        self.assertTrue(self.directive["workThread"]["captureCreatedLocatorRequired"])
        self.assertTrue(self.directive["workThread"]["finalReceiptExactLocatorEchoRequired"])
        self.assertIn("locator", self.receipt["workThread"])
        self.assertEqual(self.receipt["workThread"]["locatorStatus"], "RESOLVED | UNRESOLVED")
        self.assertTrue(self.receipt["workThread"]["exactCreationLocatorEcho"])


if __name__ == "__main__":
    unittest.main()
