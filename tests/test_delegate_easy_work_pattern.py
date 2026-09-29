from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "delegate-easy-work-to-cheaper-models.md"
ROUTE = "patterns/delegate-easy-work-to-cheaper-models.md"


class DelegateEasyWorkPatternTests(unittest.TestCase):
    def read(self, relative_path: str) -> str:
        return (ROOT / relative_path).read_text(encoding="utf-8")

    def test_root_index_docs_and_work_patterns_route_the_pattern(self) -> None:
        for relative_path in ("AGENTS.md", "LESSON-INDEX.md"):
            with self.subTest(path=relative_path):
                self.assertIn(ROUTE, self.read(relative_path))
        self.assertIn("../" + ROUTE, self.read("docs/INDEX.md"))
        for relative_path in (
            "patterns/chat-work-execution-routing-threshold.md",
            "patterns/work-model-and-effort-routing.md",
        ):
            with self.subTest(path=relative_path):
                self.assertIn("delegate-easy-work-to-cheaper-models.md", self.read(relative_path))

        root_lines = self.read("AGENTS.md").splitlines()
        consultation = next(i for i, line in enumerate(root_lines) if "Claims about another agent" in line)
        self.assertIn(ROUTE, root_lines[consultation + 1])

        index_lines = self.read("LESSON-INDEX.md").splitlines()
        entry_58 = next(i for i, line in enumerate(index_lines) if line.startswith("58. "))
        self.assertTrue(index_lines[entry_58 + 1].startswith("59. "))
        self.assertIn(ROUTE, index_lines[entry_58 + 1])

        docs_lines = self.read("docs/INDEX.md").splitlines()
        consultation = next(i for i, line in enumerate(docs_lines) if "../patterns/agent-to-agent-consultation.md" in line)
        self.assertIn("../" + ROUTE, docs_lines[consultation + 2])

    def test_claude_code_startup_imports_the_canonical_rule(self) -> None:
        startup = self.read("CLAUDE.md")
        self.assertIn("@AGENTS.md", startup.splitlines())
        self.assertIn("@" + ROUTE, startup.splitlines())

    def test_hard_codex_delegation_keeps_the_sol_xhigh_baseline(self) -> None:
        rule = PATTERN.read_text(encoding="utf-8")
        rule = rule.split("4. **Pick the cheapest sufficient delegate.**", 1)[1]
        rule = rule.split("5. **Own the result.**", 1)[0]
        self.assertIn("GENUINELY_DIFFICULT", rule)
        self.assertIn("Sol XHigh first", rule)
        self.assertIn("Sol High only", rule)
        self.assertIn("patterns/work-model-and-effort-routing.md", rule)

    def test_rule_preserves_the_owner_decision_and_accountability(self) -> None:
        text = PATTERN.read_text(encoding="utf-8").lower()
        for phrase in (
            "split before doing",
            "delegate a piece when it pays",
            "keep it when continuing is cheaper",
            "own the result",
            "delegation adds no authority",
            "record it",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_astra_is_excluded_as_a_delegate(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        self.assertIn("Don't delegate to GPT-6 Astra", text)

    def test_chat_to_codex_delegation_requires_direct_capability_admission(self) -> None:
        rule = PATTERN.read_text(encoding="utf-8").split("## Rule", 1)[1].split("## Bounds", 1)[0]
        self.assertIn("Before Chat delegates any piece to Work/Codex", rule)
        self.assertIn("current-turn direct-capability preflight", rule)
        self.assertIn("patterns/chat-work-execution-routing-threshold.md", rule)
        self.assertIn("keep it in Chat even when delegation would save allowance", rule)

    def test_matched_sol_astra_attempts_cannot_use_cross_model_delegation(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        self.assertIn("controlled matched Sol/Astra trial attempt", text)
        self.assertIn("no cross-model delegation", text)
        self.assertIn("mixed-model", text)
        self.assertIn("exclude it from matched Sol-versus-Astra results", text)

    def test_allowance_guidance_matches_each_runtime(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "non-ephemeral Codex run",
            "session `rate_limits`",
            "percent used, window and reset time",
            "Claude Code 2.1.285 has no plan-usage command",
            "owner report or a usage-limit error (reset time)",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_owner_specific_example_is_labeled_and_has_no_host_path(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        marker = "## Example (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)"
        self.assertIn(marker, text)
        example = text.split(marker, 1)[1]
        for path_prefix in ("~/", "/home/", "/Users/", "C:\\Users\\"):
            with self.subTest(path_prefix=path_prefix):
                self.assertNotIn(path_prefix, example)


if __name__ == "__main__":
    unittest.main()
