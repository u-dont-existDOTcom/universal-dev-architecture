from __future__ import annotations

import json
import stat
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQ = ROOT / "docs" / "requirements" / "2026-09-19-chatgpt-multi-surface-thread-recovery.owner-requirement.json"
PATTERN = ROOT / "patterns" / "chatgpt-client-surface-capability-and-thread-recovery.md"
ROUTING = ROOT / "patterns" / "chat-work-execution-routing-threshold.md"
INDEX = ROOT / "LESSON-INDEX.md"
HELPER = ROOT / "tools" / "codex-mission-control" / "restored" / "codex-mission-control" / "scripts" / "chatgpt-thread-find.py"


class ChatGptMultiSurfaceThreadRecoveryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.req = json.loads(REQ.read_text(encoding="utf-8"))
        self.pattern = PATTERN.read_text(encoding="utf-8")
        self.routing = ROUTING.read_text(encoding="utf-8")
        self.index = INDEX.read_text(encoding="utf-8")
        self.helper = HELPER.read_text(encoding="utf-8")

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
                "CHATGPT-SURFACE-005",
                "CHATGPT-SURFACE-006",
            ],
        )
        joined = "\n".join(item["text"] for item in self.req["requirements"])
        self.assertIn("Do not assume ChatGPT web, desktop app", joined)
        self.assertIn("search every locally available authorized surface index", joined)
        self.assertIn("metadata-first and privacy-preserving", joined)
        self.assertIn("open the thread in its native client", joined)
        self.assertIn("Ordinary Chat recovery must be indexed alongside Work recovery", joined)
        self.assertIn("Launcher acceptance is not completion proof", joined)

    def test_owner_deployment_evidence_is_version_bounded(self) -> None:
        binding = self.req["owner_deployment_binding"]
        self.assertEqual(binding["classification"], "NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT")
        self.assertEqual(binding["tested_versions"]["chatgpt_desktop"], "26.903.61454")
        self.assertEqual(binding["tested_versions"]["brave"], "153.1.95.102")
        limits = "\n".join(binding["current_limits"])
        self.assertIn("no proven supported external direct-by-ID ordinary-Chat deep link", limits)
        self.assertIn("exact Chat URL can establish identity without being a valid native desktop navigation mechanism", limits)
        self.assertIn("Do not commit owner-specific conversation IDs", limits)

    def test_pattern_requires_all_surface_search_before_missing_claim(self) -> None:
        for phrase in (
            "Model ChatGPT clients as version-sensitive execution/recovery surfaces",
            "search every locally available authorized surface index",
            "Do not declare the thread missing after checking only web search",
            "Preserve and search exact URLs/branch IDs",
            "prefer that index over UI search",
            "Desktop ordinary Chat recovery",
            "treat that pair as a durable ordinary-Chat locator",
            "identity locator**, not automatically a native-desktop navigation mechanism",
            "embedded browser panel rather than navigating the native Chat surface",
            "multiple conversations share the same logical title",
            "Native-surface completion proof",
            "WRONG_SURFACE_OR_UNVERIFIED",
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

    def test_owner_helper_searches_live_app_metadata_before_stale_fallbacks(self) -> None:
        lines = self.helper.splitlines()
        self.assertEqual(lines[0], "#!/usr/bin/env python3")
        self.assertEqual(lines[1], "# NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT")
        self.assertTrue(HELPER.stat().st_mode & stat.S_IXUSR)
        smoke = subprocess.run([str(HELPER), "--help"], text=True, capture_output=True, check=False)
        self.assertEqual(smoke.returncode, 0, smoke.stderr)
        self.assertIn("Search local ChatGPT thread metadata", smoke.stdout)
        for phrase in (
            "def live_app_threads()",
            '"name": "list_threads"',
            '"limit": 50',
            '"confidence": "live_app_thread_index"',
            "live_app_results(args.query)",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.helper)
        self.assertLess(
            self.helper.index("live_app_results(args.query)"),
            self.helper.index("source_chat_results(args.query)"),
        )
        self.assertIn("never inspect message bodies", self.helper)
        self.assertNotIn("6ab00acf-", self.helper)


if __name__ == "__main__":
    unittest.main()
