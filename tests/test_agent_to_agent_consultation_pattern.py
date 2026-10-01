from __future__ import annotations

import unittest
from pathlib import Path
from tests.root_migration_assertions import assert_routed_rule


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "agent-to-agent-consultation.md"


class AgentToAgentConsultationPatternTests(unittest.TestCase):
    def read(self, relative_path: str) -> str:
        return (ROOT / relative_path).read_text(encoding="utf-8")

    def test_root_index_and_docs_route_the_pattern(self) -> None:
        for relative_path in ("LESSON-INDEX.md", "docs/INDEX.md"):
            with self.subTest(path=relative_path):
                self.assertIn("patterns/agent-to-agent-consultation.md", self.read(relative_path))
        assert_routed_rule(self, "patterns/agent-to-agent-consultation.md", ("Scope every claim about another agent", "Talk directly"))

    def test_claims_are_scoped_and_settled_in_their_runtime(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "Scope every claim about another agent",
            "state the exact runtime it holds for",
            "Settle it in that runtime",
            "An agent's report about itself is evidence, not proof",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_agents_consult_directly_and_the_owner_is_not_the_channel(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "Talk directly",
            "The owner never carries messages between agents",
            "at most one reconciliation round",
            "A relayed message means the route was missed",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_the_route_is_read_only_and_bounded(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        self.assertIn('codex exec -s read-only -c web_search="disabled"', text)
        self.assertIn("hosted tools such as web search count as network", text)
        self.assertIn('claude -p', text)
        self.assertIn('--tools ""', text)
        self.assertIn("Never include credentials or secrets", text)
        self.assertIn("A consultation adds no authority", text)

    def test_codex_workspace_reads_require_an_external_boundary(self) -> None:
        route = PATTERN.read_text(encoding="utf-8").split("## Route", 1)[1].split("## Bounds", 1)[0]
        self.assertIn("-C <workspace>", route)
        self.assertIn("does not enforce a filesystem read boundary", route)
        self.assertIn("external filesystem sandbox or container", route)
        self.assertIn("Place `<answer-file>` in that output location", route)
        self.assertIn("unavailable", route)

    def test_claude_consultation_excludes_checkout_memory(self) -> None:
        route = PATTERN.read_text(encoding="utf-8").split("## Route", 1)[1].split("## Bounds", 1)[0]
        claude_command = next(line for line in route.splitlines() if line.startswith("| Codex | Claude |"))
        self.assertIn("(cd <neutral-workspace> && claude -p --safe-mode", claude_command)
        self.assertIn("outside the checkout", route)
        self.assertIn("project memory", route)
        cross_family = self.read("patterns/cross-family-reasoning-check.md")
        self.assertIn("neutral-workspace and `--safe-mode` invocation", cross_family)

    def test_missing_consultation_executor_holds_only_dependent_work(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        route = text.split("## Route", 1)[1].split("## Bounds", 1)[0]
        for phrase in (
            "no separate executor",
            "scoped claim as unresolved",
            "hold only actions that depend on the answer",
            "continue independent work",
            "do not ask the owner to relay",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, route)

    def test_capability_receipts_include_runtime_scope_and_test_evidence(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        receipt = text.split("## Receipt", 1)[1].split("## Requirement-accretion", 1)[0]
        self.assertIn("receipt must also state the exact runtime tuple", receipt)
        for phrase in (
            "invocation or surface",
            "account or route",
            "configuration and sandbox",
            "paired-test evidence",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, receipt)
        self.assertIn("without it, the receipt is incomplete", receipt)

    def test_setter_only_receipt_does_not_claim_effective_model_identity(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        receipt = text.split("## Receipt", 1)[1].split("## Requirement-accretion", 1)[0]
        example = receipt.split("Example: `", 1)[1].split("`.", 1)[0]
        self.assertIn("requested model and effort", receipt)
        self.assertIn("effective model and effort as unknown", receipt)
        for field in (
            "requested model=gpt-5.6-sol",
            "requested effort=xhigh",
            "effective model=unknown",
            "effective effort=unknown",
        ):
            with self.subTest(field=field):
                self.assertIn(field, example)
        self.assertNotIn("Consulted Codex (gpt-5.6-sol, xhigh)", example)

    def test_owner_specific_example_is_labeled_and_keeps_no_host_path(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        self.assertIn("## Example (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)", text)
        example = text.split("## Example (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)", 1)[1]
        self.assertNotIn("~/", example)
        self.assertNotIn("/home/", example)


    def test_long_running_consultation_checks_agent_runtime_before_timeout_inference(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        rule = text.split("## Rule", 1)[1].split("## Route", 1)[0]
        for phrase in (
            "Check the consulted agent's own liveness before declaring it unavailable",
            "persistent/background session",
            "treat \u0060busy/working\u0060 as active regardless of elapsed wall time",
            "A wrapper timeout is not an agent failure",
            "positive failure/loss evidence",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, rule)


if __name__ == "__main__":
    unittest.main()
