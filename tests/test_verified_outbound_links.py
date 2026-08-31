from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class VerifiedOutboundLinkRuleTests(unittest.TestCase):
    def test_every_universal_instruction_projection_requires_live_link_verification(
        self,
    ) -> None:
        """A stale or broken recommendation must fail before reaching an owner."""
        documents = {
            "root agreement": ROOT / "AGENTS.md",
            "owner-facing output pattern": (
                ROOT / "patterns" / "human-readable-operational-references.md"
            ),
            "root-agent template": ROOT / "templates" / "AGENTS-CODEX.md",
            "project bootstrap template": (
                ROOT / "templates" / "AGENTS-UNIVERSAL-BOOTSTRAP.md"
            ),
        }
        required_behavior = (
            "Immediately before surfacing any outbound link to the owner",
            "open the exact destination",
            "follow redirects",
            "resolves successfully to the intended current content",
            "error, 404, dead, parked, or stale page",
            "Search snippets, cached previews, remembered URLs, and earlier checks do not count",
            "If the exact link cannot be verified in the current turn, do not surface it",
            "Never present a broken or unverified link as a recommendation",
        )

        for document_name, path in documents.items():
            with self.subTest(document=document_name):
                text = path.read_text(encoding="utf-8")
                for behavior in required_behavior:
                    with self.subTest(behavior=behavior):
                        self.assertIn(behavior, text)


if __name__ == "__main__":
    unittest.main()
