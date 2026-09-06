from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class UniversalChatGptTabDisciplineTests(unittest.TestCase):
    def test_universal_guidance_and_worker_templates_inherit_the_same_tab_contract(
        self,
    ) -> None:
        documents = {
            "root agreement": ROOT / "AGENTS.md",
            "browser hygiene": ROOT / "patterns" / "persistent-browser-automation-hygiene.md",
            "supervision routing": ROOT
            / "patterns"
            / "codex-supervision-resource-routing-account-failover-and-browser-hygiene.md",
            "root-agent template": ROOT / "templates" / "AGENTS-CODEX.md",
            "worker bootstrap": ROOT
            / "templates"
            / "CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md",
        }
        required_fragments = (
            "new chat",
            "current verified reusable",
            "one",
            "two",
            "three",
            "fail closed before opening a fourth",
            "replacement",
            "close the superseded",
            "never fan out duplicate",
            "managedchatgpttabcount",
            "clean",
            "bootstrap",
            "history",
        )

        for document_name, path in documents.items():
            with self.subTest(document=document_name):
                text = path.read_text(encoding="utf-8").lower()
                for fragment in required_fragments:
                    with self.subTest(fragment=fragment):
                        self.assertIn(fragment, text)

    def test_runtime_ceiling_cannot_be_configured_above_three(self) -> None:
        config = (
            ROOT
            / "tools"
            / "codex-mission-control"
            / "vps-browser-relay"
            / "src"
            / "config.mjs"
        ).read_text(encoding="utf-8")
        self.assertIn("MC_RELAY_MAX_HOT_TABS", config)
        self.assertIn("maxHotTabs: integer(env.MC_RELAY_MAX_HOT_TABS, 3, 1, 3)", config)


if __name__ == "__main__":
    unittest.main()
