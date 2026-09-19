from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQ = ROOT / "docs" / "requirements" / "2026-09-19-chatgpt-multi-surface-thread-recovery.owner-requirement.json"
PATTERN = ROOT / "patterns" / "chatgpt-client-surface-capability-and-thread-recovery.md"
ROUTING = ROOT / "patterns" / "chat-work-execution-routing-threshold.md"
INDEX = ROOT / "LESSON-INDEX.md"


class ChatGptMultiSurfaceThreadRecoveryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.req = json.loads(REQ.read_text(encoding="utf-8"))
        self.pattern = PATTERN.read_text(encoding="utf-8")
        self.routing = ROUTING.read_text(encoding="utf-8")
        self.index = INDEX.read_text(encoding="utf-8")

    def test_owner_requirement_is_active_and_surface_specific(self) -> None:
        self.assertEqual(self.req["authority"], "owner")
        self.assertEqual(self.req["status"], "ACTIVE")
        ids = [item["id"] for item in self.req["requirements"]]
        self.assertEqual(
            ids,
            [
                "CHATGPT-SURFACE-001",
                "CHATGPT-SURFACE-002",
                "CHATGPT-SURFACE-003",
                "CHATGPT-SURFACE-004",
            ],
        )
        joined = "\n".join(item["text"] for item in self.req["requirements"])
        self.assertIn("Do not assume ChatGPT web, desktop app", joined)
        self.assertIn("search every locally available authorized surface index", joined)
        self.assertIn("metadata-first and privacy-preserving", joined)
        self.assertIn("open the thread in its native client", joined)

    def test_owner_deployment_evidence_is_version_bounded(self) -> None:
        binding = self.req["owner_deployment_binding"]
        self.assertEqual(binding["classification"], "NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT")
        self.assertEqual(binding["tested_versions"]["chatgpt_desktop"], "26.903.61454")
        self.assertEqual(binding["tested_versions"]["brave"], "153.1.95.102")
        limits = "\n".join(binding["current_limits"])
        self.assertIn("ordinary non-Work desktop Chat conversations has not yet been proven", limits)
        self.assertIn("Do not commit owner-specific conversation IDs", limits)

    def test_pattern_requires_all_surface_search_before_missing_claim(self) -> None:
        for phrase in (
            "Model ChatGPT clients as version-sensitive execution/recovery surfaces",
            "search every locally available authorized surface index",
            "Do not declare the thread missing after checking only web search",
            "Preserve and search exact URLs/branch IDs",
            "prefer that index over UI search",
            "Metadata-first privacy boundary",
            "Do not inspect cookies",
            "native thread URI",
            "revalidatable after client or account changes",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.pattern)

    def test_routing_and_index_activate_pattern(self) -> None:
        self.assertIn(
            "docs/requirements/2026-09-19-chatgpt-multi-surface-thread-recovery.owner-requirement.json",
            self.routing,
        )
        self.assertIn(
            "patterns/chatgpt-client-surface-capability-and-thread-recovery.md",
            self.routing,
        )
        self.assertIn("Do not assume capability parity", self.routing)
        self.assertIn(
            "patterns/chatgpt-client-surface-capability-and-thread-recovery.md",
            self.index,
        )


if __name__ == "__main__":
    unittest.main()
