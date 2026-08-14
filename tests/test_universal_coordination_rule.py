from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class UniversalCoordinationRuleTests(unittest.TestCase):
    def test_universal_guidance_selects_safe_coordinated_execution_without_owner_mode_choice(
        self,
    ) -> None:
        """Removing the coordination contract must fail before it reaches project bootstraps."""
        documents = {
            "root agreement": ROOT / "AGENTS.md",
            "operational pattern": ROOT / "patterns" / "codex-github-operating-system.md",
            "root-agent template": ROOT / "templates" / "AGENTS-CODEX.md",
            "provenance audit": ROOT / "audits" / "2026-08-14-universal-coordination-rule.md",
        }
        required_behavior = (
            "without asking the owner to select an execution mode",
            "isolated workspaces",
            "durable plan and recovery ledger",
            "delegation plus independent review when safely separable",
            "serialize shared mutable state",
            "does not broaden task authority",
            "does not replace substantive owner decisions",
        )

        for document_name, path in documents.items():
            with self.subTest(document=document_name):
                text = path.read_text(encoding="utf-8")
                for behavior in required_behavior:
                    with self.subTest(behavior=behavior):
                        self.assertIn(behavior, text)

    def test_delegation_permission_keeps_independent_review_paired(self) -> None:
        """A broad delegation grant would bypass the owner's coordination limit."""
        paired_permission = (
            "only as paired delegation plus independent review when safely separable"
        )
        for path in (
            ROOT / "patterns" / "codex-github-operating-system.md",
            ROOT / "audits" / "2026-08-14-universal-coordination-rule.md",
        ):
            with self.subTest(path=path):
                self.assertIn(paired_permission, path.read_text(encoding="utf-8"))

    def test_authoritative_detailed_projections_keep_the_positive_standing_grant(
        self,
    ) -> None:
        """Negating the grant or dropping its coordination conditions is a regression."""
        standing_grant = (
            "Standing grant: delegation, subagents, and parallel investigation are "
            "permitted when they improve coordination without conflicting writes, and "
            "only as paired delegation plus independent review when safely separable."
        )
        for path in (
            ROOT / "patterns" / "codex-github-operating-system.md",
            ROOT / "audits" / "2026-08-14-universal-coordination-rule.md",
        ):
            with self.subTest(path=path):
                text = path.read_text(encoding="utf-8")
                self.assertIn(standing_grant, text)
                self.assertIn("Shared mutable writes are serialized.", text)


if __name__ == "__main__":
    unittest.main()
