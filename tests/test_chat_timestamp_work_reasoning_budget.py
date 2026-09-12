from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
AGENTS_PATH = ROOT / "AGENTS.md"
REQUIREMENT_PATH = (
    ROOT
    / "docs"
    / "requirements"
    / "2026-09-12-chat-session-timestamp-work-reasoning-budget.owner-requirement.json"
)
ROUTING_PATH = ROOT / "patterns" / "chat-work-execution-routing-threshold.md"
EVAL_PATH = (
    ROOT
    / "evals"
    / "chat-work"
    / "session-start-work-budget-live-acceptance.json"
)


class ChatTimestampWorkReasoningBudgetTests(unittest.TestCase):
    def setUp(self) -> None:
        self.agents = AGENTS_PATH.read_text(encoding="utf-8")
        self.requirement = json.loads(REQUIREMENT_PATH.read_text(encoding="utf-8"))
        self.routing = ROUTING_PATH.read_text(encoding="utf-8")
        self.live_eval = json.loads(EVAL_PATH.read_text(encoding="utf-8"))

    def test_owner_requirement_is_active_and_contains_all_three_controls(self) -> None:
        self.assertEqual(self.requirement["authority"], "owner")
        self.assertEqual(self.requirement["status"], "ACTIVE")
        requirements = {item["id"]: item for item in self.requirement["requirements"]}
        self.assertEqual(
            set(requirements),
            {
                "CHAT-START-TIME-001",
                "CHAT-BEFORE-WORK-001",
                "WORK-MIN-REASONING-001",
            },
        )

        self.assertIn("date-and-time stamp", requirements["CHAT-START-TIME-001"]["text"])
        self.assertIn("first assistant response", requirements["CHAT-START-TIME-001"]["operationalization"])
        self.assertIn("as much substantive thinking as practical in Chat first", requirements["CHAT-BEFORE-WORK-001"]["text"])
        self.assertIn("Delegate only the residual execution", requirements["CHAT-BEFORE-WORK-001"]["operationalization"])
        self.assertIn("lowest thinking/reasoning level reasonably expected to succeed", requirements["WORK-MIN-REASONING-001"]["text"])
        self.assertIn("residual uncertainty and execution complexity", requirements["WORK-MIN-REASONING-001"]["operationalization"])
        self.assertIn("return to Chat for diagnosis", requirements["WORK-MIN-REASONING-001"]["operationalization"])

    def test_root_agents_makes_timestamp_a_pre_answer_invariant(self) -> None:
        required_phrases = (
            "Session-start bootstrap invariants",
            "first visible assistant response MUST begin",
            "pre-answer invariant",
            "even for trivial arithmetic",
            "must not waive this invariant",
            "Treat failure to emit the timestamp on the first visible response as an instruction-following failure",
        )
        for phrase in required_phrases:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.agents)

        self.assertLess(
            self.agents.index("## Session-start bootstrap invariants"),
            self.agents.index("## Authority"),
        )

    def test_routing_pattern_operationalizes_the_controls_not_just_the_labels(self) -> None:
        required_phrases = (
            "Every new chat must begin its first assistant response",
            "visible date-and-time stamp",
            "Chat reasons first and removes as much semantic/strategic uncertainty as practical",
            "lowest Work/Codex thinking level reasonably expected",
            "Budget against the residue",
            "Do not mirror Chat's level",
            "Spend more only for a concrete reason",
            "Diagnose before escalating",
            "The optimization target is successful execution per credit",
        )
        for phrase in required_phrases:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.routing)

    def test_live_eval_contains_discriminating_positive_negative_and_failure_cases(self) -> None:
        self.assertEqual(self.live_eval["status"], "ACTIVE")
        cases = {case["id"]: case for case in self.live_eval["cases"]}
        required_ids = {
            "LIVE-01-FRESH-CHAT-STAMP",
            "LIVE-02-CHAT-CONTROL-GITHUB",
            "LIVE-03-MIXED-EXECUTION",
            "LIVE-04-HARD-ORIGINAL-SIMPLE-RESIDUE",
            "LIVE-05-FAILURE-DIAGNOSIS",
        }
        self.assertEqual(set(cases), required_ids)

        self.assertEqual(
            cases["LIVE-02-CHAT-CONTROL-GITHUB"]["kind"],
            "negative_control_for_work_routing",
        )
        self.assertEqual(
            cases["LIVE-03-MIXED-EXECUTION"]["kind"],
            "positive_work_case",
        )
        self.assertEqual(
            cases["LIVE-04-HARD-ORIGINAL-SIMPLE-RESIDUE"]["kind"],
            "specificity_control",
        )
        self.assertEqual(
            cases["LIVE-05-FAILURE-DIAGNOSIS"]["kind"],
            "failure_recovery_control",
        )

        for case_id, case in cases.items():
            with self.subTest(case=case_id):
                self.assertTrue(case["prompt"].strip())
                self.assertGreaterEqual(len(case["expected"]), 2)
                self.assertGreaterEqual(len(case["disallowed"]), 1)

    def test_live_eval_explicitly_blocks_superficial_false_passes(self) -> None:
        limitations = "\n".join(self.live_eval["limitations"])
        pass_conditions = "\n".join(self.live_eval["global_pass_conditions"])
        live_02_disallowed = "\n".join(
            next(
                case["disallowed"]
                for case in self.live_eval["cases"]
                if case["id"] == "LIVE-02-CHAT-CONTROL-GITHUB"
            )
        )
        live_04_disallowed = "\n".join(
            next(
                case["disallowed"]
                for case in self.live_eval["cases"]
                if case["id"] == "LIVE-04-HARD-ORIGINAL-SIMPLE-RESIDUE"
            )
        )

        self.assertIn("cannot by themselves prove behavior", limitations)
        self.assertIn("Do not award a pass merely because", limitations)
        self.assertIn("Ordinary reasoning and ordinary supported GitHub operations remain in Chat", pass_conditions)
        self.assertIn("difficult original problem does not by itself cause high Work reasoning", pass_conditions)
        self.assertIn("solely because Work has GitHub access", live_02_disallowed)
        self.assertIn("solely because the original migration was difficult", live_04_disallowed)

    def test_recommended_live_run_requires_every_discriminator(self) -> None:
        run = self.live_eval["recommended_live_run"]
        self.assertEqual(
            set(run["minimum_cases"]),
            {case["id"] for case in self.live_eval["cases"]},
        )
        self.assertIn("All five cases pass", run["pass_rule"])
        self.assertIn("LIVE-02", run["pass_rule"])
        self.assertIn("LIVE-04", run["pass_rule"])
        evidence = set(run["evidence_to_record"])
        self.assertIn("exact first assistant response", evidence)
        self.assertIn("the residual directive", evidence)
        self.assertIn("the selected reasoning level and stated rationale", evidence)


if __name__ == "__main__":
    unittest.main()
