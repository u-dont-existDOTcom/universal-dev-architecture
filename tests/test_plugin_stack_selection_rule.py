from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PluginStackSelectionRuleTests(unittest.TestCase):
    def test_authoritative_projections_route_stack_selection_to_empirical_evidence(self) -> None:
        documents = (
            ROOT / "AGENTS.md",
            ROOT / "patterns" / "codex-github-operating-system.md",
            ROOT / "templates" / "AGENTS-CODEX.md",
        )
        required_behavior = (
            "audits/codex-plugin-stack/activation-rules.md",
            "audits/codex-plugin-stack/reports/final-report.md",
            "native Codex plus concise owner/repository instructions and exact repository checks",
            "no optional general workflow plugin",
            "Do not automatically reinstall or reactivate",
        )

        for document in documents:
            text = document.read_text(encoding="utf-8")
            for required in required_behavior:
                with self.subTest(document=document, required=required):
                    self.assertIn(required, text)

    def test_root_coordination_rule_is_proportional(self) -> None:
        agreement = (ROOT / "AGENTS.md").read_text(encoding="utf-8")

        self.assertIn("choose the better-coordinated approach proportionately", agreement)
        self.assertIn("Default small or tightly coupled work to one agent", agreement)
        self.assertIn("only when concrete complexity, concurrency, or recovery risk", agreement)

    def test_portable_bootstrap_routes_optional_components_to_the_audit(self) -> None:
        bootstrap = (ROOT / "templates" / "AGENTS-UNIVERSAL-BOOTSTRAP.md").read_text(
            encoding="utf-8"
        )

        self.assertIn("audits/codex-plugin-stack/activation-rules.md", bootstrap)
        self.assertIn("audits/codex-plugin-stack/reports/final-report.md", bootstrap)
        self.assertIn("do not infer benefit from installation or successful invocation", bootstrap)

    def test_root_and_portable_bootstrap_route_universal_lessons_without_preloading(self) -> None:
        documents = (
            ROOT / "AGENTS.md",
            ROOT / "templates" / "AGENTS-UNIVERSAL-BOOTSTRAP.md",
        )

        for document in documents:
            text = document.read_text(encoding="utf-8")
            normalized = text.lower()
            with self.subTest(document=document):
                self.assertIn("LESSON-INDEX.md", text)
                self.assertIn("router", normalized)
                self.assertIn(
                    "do not preload the complete lesson, audit, pattern, or template corpus",
                    normalized,
                )


if __name__ == "__main__":
    unittest.main()
