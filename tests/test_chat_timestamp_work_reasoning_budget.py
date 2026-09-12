from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS_PATH = ROOT / "AGENTS.md"
REQUIREMENT_PATH = ROOT / "docs" / "requirements" / "2026-09-12-chat-session-timestamp-work-reasoning-budget.owner-requirement.json"
ROUTING_PATH = ROOT / "patterns" / "chat-work-execution-routing-threshold.md"
EVAL_PATH = ROOT / "evals" / "chat-work" / "session-start-work-budget-live-acceptance.json"


class ChatTimestampWorkReasoningBudgetTests(unittest.TestCase):
    def setUp(self) -> None:
        self.agents = AGENTS_PATH.read_text(encoding="utf-8")
        self.requirement = json.loads(REQUIREMENT_PATH.read_text(encoding="utf-8"))
        self.routing = ROUTING_PATH.read_text(encoding="utf-8")
        self.live_eval = json.loads(EVAL_PATH.read_text(encoding="utf-8"))

    def test_owner_requirement_is_active_and_contains_all_three_controls(self) -> None:
        self.assertEqual(self.requirement["authority"], "owner")
        self.assertEqual(self.requirement["status"], "ACTIVE")
        req = {item["id"]: item for item in self.requirement["requirements"]}
        self.assertEqual(set(req), {"CHAT-START-TIME-001", "CHAT-BEFORE-WORK-001", "WORK-MIN-REASONING-001"})
        checks = (
            ("date-and-time stamp", req["CHAT-START-TIME-001"]["text"]),
            ("first line of every final user-visible assistant answer", req["CHAT-START-TIME-001"]["operationalization"]),
            ("as much substantive thinking as practical in Chat first", req["CHAT-BEFORE-WORK-001"]["text"]),
            ("Delegate only the residual execution", req["CHAT-BEFORE-WORK-001"]["operationalization"]),
            ("lowest thinking/reasoning level reasonably expected to succeed", req["WORK-MIN-REASONING-001"]["text"]),
            ("residual uncertainty and execution complexity", req["WORK-MIN-REASONING-001"]["operationalization"]),
            ("return to Chat for diagnosis", req["WORK-MIN-REASONING-001"]["operationalization"]),
        )
        for phrase, text in checks:
            self.assertIn(phrase, text)

    def test_root_agents_makes_timestamp_a_pre_answer_invariant(self) -> None:
        for phrase in (
            "Per-turn bootstrap invariants",
            "every assistant turn",
            "first line of the final user-visible assistant answer MUST be",
            "pre-answer invariant",
            "follow-up acknowledgments",
            "must not waive this invariant",
            "Treat failure to emit the timestamp as the first line of the final user-visible answer on any assistant turn as an instruction-following failure",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.agents)
        self.assertLess(self.agents.index("## Per-turn bootstrap invariants"), self.agents.index("## Authority"))

    def test_root_requires_causal_failure_diagnosis(self) -> None:
        for phrase in (
            "## Causal failure diagnosis",
            "identify the **causal mechanism**",
            "missing/stale instruction activation",
            "trigger misclassification",
            "wrong phase/surface/destination",
            "Do not use agentic shorthand",
            "`I chose wrong`",
            "Repair the generating condition",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.agents)

    def test_routing_pattern_operationalizes_the_controls_not_just_the_labels(self) -> None:
        for phrase in (
            "Every assistant turn must begin its final user-visible answer",
            "visible date-and-time stamp",
            "re-fetch the current default-branch root `AGENTS.md` on every user turn",
            "Chat reasons first and removes as much semantic/strategic uncertainty as practical",
            "lowest Work/Codex thinking level reasonably expected",
            "Budget against the residue",
            "Do not mirror Chat's level",
            "Spend more only for a concrete reason",
            "Diagnose before escalating",
            "The optimization target is successful execution per credit",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.routing)

    def test_live_eval_contains_discriminating_positive_negative_and_failure_cases(self) -> None:
        self.assertEqual(self.live_eval["status"], "ACTIVE")
        cases = {case["id"]: case for case in self.live_eval["cases"]}
        self.assertEqual(set(cases), {"LIVE-01-FRESH-CHAT-STAMP", "LIVE-02-CHAT-CONTROL-GITHUB", "LIVE-03-MIXED-EXECUTION", "LIVE-04-HARD-ORIGINAL-SIMPLE-RESIDUE", "LIVE-05-FAILURE-DIAGNOSIS"})
        self.assertEqual(cases["LIVE-02-CHAT-CONTROL-GITHUB"]["kind"], "negative_control_for_work_routing")
        self.assertEqual(cases["LIVE-03-MIXED-EXECUTION"]["kind"], "positive_work_case")
        self.assertEqual(cases["LIVE-04-HARD-ORIGINAL-SIMPLE-RESIDUE"]["kind"], "specificity_control")
        self.assertEqual(cases["LIVE-05-FAILURE-DIAGNOSIS"]["kind"], "failure_recovery_control")
        for case_id, case in cases.items():
            with self.subTest(case=case_id):
                self.assertTrue(case["prompt"].strip())
                self.assertGreaterEqual(len(case["expected"]), 2)
                self.assertGreaterEqual(len(case["disallowed"]), 1)

    def test_live_eval_explicitly_blocks_superficial_false_passes(self) -> None:
        limitations = "\n".join(self.live_eval["limitations"])
        conditions = "\n".join(self.live_eval["global_pass_conditions"])
        disallowed = {case["id"]: "\n".join(case["disallowed"]) for case in self.live_eval["cases"]}
        self.assertIn("cannot by themselves prove behavior", limitations)
        self.assertIn("Do not award a pass merely because", limitations)
        self.assertIn("Ordinary reasoning and ordinary supported GitHub operations remain in Chat", conditions)
        self.assertIn("difficult original problem does not by itself cause high Work reasoning", conditions)
        self.assertIn("solely because Work has GitHub access", disallowed["LIVE-02-CHAT-CONTROL-GITHUB"])
        self.assertIn("solely because the original migration was difficult", disallowed["LIVE-04-HARD-ORIGINAL-SIMPLE-RESIDUE"])

    def test_recommended_live_run_requires_every_discriminator(self) -> None:
        run = self.live_eval["recommended_live_run"]
        self.assertEqual(set(run["minimum_cases"]), {case["id"] for case in self.live_eval["cases"]})
        self.assertIn("All five cases pass", run["pass_rule"])
        self.assertIn("LIVE-02", run["pass_rule"])
        self.assertIn("LIVE-04", run["pass_rule"])
        evidence = set(run["evidence_to_record"])
        self.assertIn("exact first assistant response", evidence)
        self.assertIn("the residual directive", evidence)
        self.assertIn("the selected reasoning level and stated rationale", evidence)


if __name__ == "__main__":
    unittest.main()
