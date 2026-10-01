"""Source-layout regression for root rules moved into routed patterns; not evidence that agents load them."""
from __future__ import annotations

import json
import re
import unittest
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HEADING = "## Compact rules moved from root `AGENTS.md`"
FIXTURE = ROOT / "tests/fixtures/root-kernel-migration.json"
EXPECTED_COUNTS = {
    "patterns/canonical-design-os-bootstrap.md": 1,
    "patterns/carrying-uda-into-standalone-projects.md": 1,
    "patterns/chat-work-execution-routing-threshold.md": 1,
    "patterns/codex-github-operating-system.md": 3,
    "patterns/human-readable-operational-references.md": 2,
    "patterns/logic-failure-map.md": 3,
    "patterns/outcome-advancement-and-strategy-efficacy.md": 1,
    "patterns/owner-marked-mission-control-failure-capture.md": 1,
    "patterns/parallel-chat-write-isolation.md": 1,
    "patterns/persistent-browser-automation-hygiene.md": 5,
    "patterns/research-before-reinvention.md": 2,
    "patterns/suggested-fix-queue.md": 1,
    "patterns/test-efficiency-and-verification-budget.md": 4,
    "patterns/worker-github-publication-and-recovery.md": 1,
}
ROUTE_ONLY_DESTINATIONS = (
    "patterns/development-assurance-lanes.md",
    "patterns/cross-family-reasoning-check.md",
    "patterns/agent-to-agent-consultation.md",
    "patterns/delegate-easy-work-to-cheaper-models.md",
    "patterns/reasoning-selection.md",
    "patterns/chatgpt-client-surface-capability-and-thread-recovery.md",
    "patterns/web-data-provider-escalation.md",
    "patterns/durable-chat-learning.md",
    "patterns/existing-work-scan-and-scholarly-discovery.md",
    "patterns/owner-questions-page.md",
    "patterns/work-model-and-effort-routing.md",
    "patterns/runtime-chat-work-authority-admission-and-internal-routing.md",
    "patterns/worker-directive-delivery-and-chat-output-budget.md",
)


def section_after(text: str, heading: str) -> str:
    return text.split(heading + "\n", 1)[1].split("\n## ", 1)[0]


def moves() -> dict[str, tuple[str, ...]]:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert fixture["source"] == "AGENTS.md"
    grouped = defaultdict(list)
    for record in fixture["paragraphs"]:
        grouped[record["destination"]].append(record["text"])
    return {path: tuple(paragraphs) for path, paragraphs in grouped.items()}


MOVES = moves()


# Index entries the owner set as owner rules: their trigger wording may change, the label stays.
OWNER_RULE_ENTRIES = (
    "patterns/cross-family-reasoning-check.md",
    "patterns/agent-to-agent-consultation.md",
    "patterns/delegate-easy-work-to-cheaper-models.md",
    "patterns/owner-questions-page.md",
    "patterns/suggested-fix-queue.md",
)
# Root's own wording for when a moved rule applies; its index trigger keeps that scope.
ROOT_SCOPES = {
    "patterns/outcome-advancement-and-strategy-efficacy.md": "For substantive or iterative work",
    "patterns/worker-github-publication-and-recovery.md": "For integration-bound repository workers",
    "patterns/logic-failure-map.md": "instruction-following, reasoning, routing, tool, execution, or delivery failure",
}


class RootInstructionNestingTests(unittest.TestCase):
    def test_root_instructions_fit_the_new_kernel_cap(self) -> None:
        self.assertLessEqual((ROOT / "AGENTS.md").stat().st_size, 16 * 1024)

    def test_kernel_requires_task_time_index_loading(self) -> None:
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        composition = section_after(agents, "## Instruction composition")
        self.assertIn(
            "Before substantive task work, open `LESSON-INDEX.md`, select the entries triggered by the task, and read their current patterns.",
            composition,
        )

    def test_fixture_covers_each_moved_destination(self) -> None:
        self.assertEqual({path: len(paragraphs) for path, paragraphs in MOVES.items()}, EXPECTED_COUNTS)

    def test_destinations_have_exactly_one_triggered_index_entry(self) -> None:
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        for path in (*MOVES, *ROUTE_ONLY_DESTINATIONS):
            with self.subTest(path=path):
                lines = [line for line in index.splitlines() if f"`{path}` —" in line]
                self.assertEqual(len(lines), 1)
                trigger = lines[0].split(" — ", 1)[1]
                self.assertRegex(trigger, r"^(?:owner rule: )?(?:When|Before|For|when|before|for)\b")
                self.assertGreater(len(trigger.split()), 8)

    def test_fixture_paragraphs_are_exactly_once_in_destination_section_and_absent_from_root(self) -> None:
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        for path, paragraphs in MOVES.items():
            body = (ROOT / path).read_text(encoding="utf-8")
            self.assertEqual(body.count(HEADING), 1, path)
            section = section_after(body, HEADING)
            for paragraph in paragraphs:
                with self.subTest(path=path, paragraph=paragraph[:60]):
                    self.assertEqual(section.count(paragraph), 1)
                    self.assertNotIn(paragraph, agents)

    def test_kernel_keeps_continuation_and_explicit_commitment_rules(self) -> None:
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        for phrase in (
            "## Per-turn bootstrap invariants",
            "## Pre-final continuation invariant",
            "When you explicitly commit to a substantive operation",
            "Adjacent analysis, planning, preparation, or a different method does not count as completion.",
            "a new task rule adds a pattern and an index entry, never a root line.",
        ):
            self.assertIn(phrase, agents)
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        self.assertRegex(index, re.compile(r"(?m)^- `AGENTS\.md` → \*\*Workflow\*\* — When closing a substantive pass"))
    def test_owner_rule_labels_survive_the_trigger_rewrite(self) -> None:
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        for path in OWNER_RULE_ENTRIES:
            with self.subTest(path=path):
                lines = [line for line in index.splitlines() if f"`{path}` —" in line]
                self.assertEqual(len(lines), 1)
                self.assertIn(f"`{path}` — owner rule: ", lines[0])

    def test_index_triggers_keep_the_root_activation_scope(self) -> None:
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        for path, scope in ROOT_SCOPES.items():
            with self.subTest(path=path):
                lines = [line for line in index.splitlines() if f"`{path}` —" in line]
                self.assertEqual(len(lines), 1)
                self.assertIn(scope, lines[0])

    def test_failure_map_route_covers_diagnosis_and_repair_without_explanation(self) -> None:
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        route = next(
            line.split(" — ", 1)[1]
            for line in index.splitlines()
            if "`patterns/logic-failure-map.md` —" in line
        )
        self.assertRegex(route, r"^When diagnosing, repairing, or explaining an instruction-following")

    def test_supervisor_grant_route_covers_non_gui_creation(self) -> None:
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        route = next(
            line.split(" — ", 1)[1]
            for line in index.splitlines()
            if "`patterns/persistent-browser-automation-hygiene.md` —" in line
        )
        self.assertIn(
            "When creating or privately registering a missing MC-only supervisor conversation through any surface, including MCP/API",
            route,
        )
        self.assertIn(
            "Standing authority includes creating and privately registering missing MC-only supervisor conversations without repeat approval",
            (ROOT / "patterns/persistent-browser-automation-hygiene.md").read_text(encoding="utf-8"),
        )

    def test_repository_governance_route_is_not_limited_to_complex_work(self) -> None:
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        route = next(
            line.split(" — ", 1)[1]
            for line in index.splitlines()
            if "`patterns/codex-github-operating-system.md` —" in line
        )
        graph = json.loads((ROOT / "rules/UDA-RULE-GRAPH.json").read_text(encoding="utf-8"))
        graph_trigger = next(
            node["trigger"] for node in graph["nodes"]
            if node["rule_id"] == "codex-github-operating-system"
        )
        for scope in ("repository-governed development", "GitHub mutation"):
            with self.subTest(scope=scope):
                self.assertIn(scope.casefold(), graph_trigger.casefold())
                self.assertIn(scope.casefold(), route.casefold())
        self.assertRegex(route, r"(?i)\b(?:for|when) (?:starting or resuming )?complex (?:repository )?work\b[^;]*\bstable task ID and durable checkpoint\b")



if __name__ == "__main__":
    unittest.main()
