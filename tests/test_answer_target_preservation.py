from __future__ import annotations

import json
import unittest
from pathlib import Path
from scripts import uda_rule_graph_task_time as tt
from tests.root_migration_assertions import assert_routed_rule


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "reasoning-selection.md"
REQUIREMENT = ROOT / "docs" / "requirements" / "2026-10-15-answer-target-preservation.owner-requirement.json"
EVAL = ROOT / "evals" / "answer-target-preservation.json"
AUDIT = ROOT / "audits" / "2026-10-15-romantic-love-answer-target-mismatch.md"
TARGET_SECTION = "## Evidence, specificity, and target discipline"
CATALOG = ROOT / "rules" / "rule-graph" / "task-time-metadata.v1.json"
COVERAGE = ROOT / "rules" / "rule-graph" / "enforcement-coverage.v1.json"
PROFILE = ROOT / "scripts" / "instruction-layering-profile.json"
RULE = "uda.reasoning.answer-first-target"
CORRECTION_RULE = "uda.reasoning.answer-first-target-correction"
OWNER_CORRECTION = ROOT / "examples" / "rule-graph" / "owner-correction.json"
QUESTION_KINDS = ("conceptual_question", "conceptual_explanation", "comparative_question", "empirical_question", "factual_question", "research_question")


def section(text: str, heading: str) -> str:
    return text.split(heading, 1)[1].split("\n## ", 1)[0]


def answer_first_catalog() -> dict:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    catalog["records"] = [record for record in catalog["records"] if record["rule_id"] in {RULE, CORRECTION_RULE}]
    return catalog


def selected(contract: dict) -> list[str]:
    return [rule["rule_id"] for rule in contract["selected_rules"]]


def contract_for(request_kind: str, actor: str = "chat") -> dict:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    catalog["records"] = [record for record in catalog["records"] if record["rule_id"] == RULE]
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    envelope = {
        "schema_version": 1,
        "task_id": f"answer-first:{request_kind}:{actor}",
        "bootstrap": {"state": "LOADED", "source": "current canonical root loaded for this illustrative task"},
        "request": "Answer the user's question.",
        "facts": {
            "role": {"state": "KNOWN", "value": "universal_internal", "provenance": "task authority"},
            "actor": {"state": "KNOWN", "value": actor, "provenance": "candidate author"},
            "request_kind": {"state": "KNOWN", "value": request_kind, "provenance": "literal request"},
        },
    }
    return tt.compile_contract(catalog, profile, envelope, "graph")


class AnswerTargetPreservationTests(unittest.TestCase):
    def test_check_states_each_duty(self) -> None:
        body = section(PATTERN.read_text(encoding="utf-8"), TARGET_SECTION)
        for phrase in (
            "**answer-first target check**",
            "compare it with the answer's first substantive claim and with its closing",
            "The first claim must be about the target itself",
            "when there is no direct evidence on the target, that is the answer, and it comes first",
            "labeled as a proxy, with what it cannot show",
            "it does not become the main comparison, table, or verdict",
            "This does not ban proxies",
            "that measure is the target",
            "No closing, open question, or suggested follow-up may present the question the user already asked as new or more interesting",
            "A needed clarifying question or a one-clause scope note may come before it",
            "labeled as indirect and names its link to the target",
            "This settles which question to answer, not any factual claim, which is still checked before conceding",
            "their account of what they asked governs",
            "`audits/2026-10-15-romantic-love-answer-target-mismatch.md`",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, body)

    def test_check_follows_the_exact_target_rule(self) -> None:
        body = section(PATTERN.read_text(encoding="utf-8"), TARGET_SECTION)
        self.assertEqual(body.count("**answer-first target check**"), 1)
        self.assertLess(
            body.index("preserve the exact target variable"),
            body.index("**answer-first target check**"),
        )
        self.assertLess(
            body.index("**answer-first target check**"),
            body.index("**predicate-alignment check**"),
        )

    def test_provenance_records_recurrence_and_activation_honesty(self) -> None:
        provenance = PATTERN.read_text(encoding="utf-8").split("## Provenance", 1)[1]
        self.assertIn("The answer-first target check was added on 2026-10-15", provenance)
        self.assertIn("docs/requirements/2026-10-15-answer-target-preservation.owner-requirement.json", provenance)
        self.assertIn("fourth change for the target-substitution class", provenance)
        self.assertIn("the predicate-alignment check (2026-09-13)", provenance)
        self.assertIn("announce loading it and apply its clock rule", provenance)
        self.assertIn("`uda.reasoning.answer-first-target`", provenance)

    def test_lesson_index_routes_the_check(self) -> None:
        assert_routed_rule(self, "patterns/reasoning-selection.md", (
            "**answer-first target check**", "preserve the exact target variable",
        ))
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        entry = next(line for line in index.splitlines() if "`patterns/reasoning-selection.md` —" in line)
        self.assertIn("preserve the exact target and answer it first", entry)
        self.assertIn("never offering the user's own question back as a new one", entry)

    def test_requirement_records_origin_surfaces_and_limits(self) -> None:
        data = json.loads(REQUIREMENT.read_text(encoding="utf-8"))
        self.assertEqual(data["requirement_id"], "2026-10-15-answer-target-preservation")
        self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
        self.assertIn("Fourth change for the target-substitution class", data["recurring_finding_check"])
        for surface in data["execution_surfaces"]:
            if surface["disposition"] in {"DEFERRED", "NOT_APPLICABLE"}:
                with self.subTest(surface=surface["surface"]):
                    self.assertTrue(surface.get("reason"))
        surfaces = " ".join(surface["surface"] for surface in data["execution_surfaces"])
        for name in ("ChatGPT", "Inner Signal", "AskRigor", "humandesign participant interviewer GPT"):
            with self.subTest(surface=name):
                self.assertIn(name, surfaces)
        self.assertNotIn("LIVE_VERIFIED", data["learning_state_at_merge"])
        self.assertTrue(any("not evidence that the rule changes behavior" in item for item in data["nonclaims"]))
        self.assertTrue(any("ChatGPT" in item and "not been run" in item for item in data["nonclaims"]))
        self.assertIn("Behavioral verification", data["acceptance"])
        self.assertIn("out of scope and stays open", data["acceptance"])

    def test_eval_fixture_has_the_reported_paired_cases(self) -> None:
        data = json.loads(EVAL.read_text(encoding="utf-8"))
        self.assertEqual(data["pattern"], "patterns/reasoning-selection.md")
        self.assertEqual(data["source"], "audits/2026-10-15-romantic-love-answer-target-mismatch.md")
        self.assertEqual(
            [case["check"] for case in data["cases"]],
            [
                "answer-first-target",
                "proxy-is-the-target",
                "same-denominator",
                "proxy-cannot-identify-target",
                "user-owns-their-question",
            ],
        )
        for case in data["cases"]:
            with self.subTest(case=case["id"]):
                self.assertTrue(case["expected"])
                self.assertTrue(case["mustNot"])
        run = data["runs"][0]
        self.assertIn("does not show the rule's effect", run["result"])
        self.assertIn("ChatGPT", run["notRun"])
        self.assertIn("final rule wording", run["notRun"])
        final = data["runs"][1]
        self.assertIn("final answer-first target check", final["conditions"][0])
        self.assertIn("not that it changes behavior", final["result"])
        self.assertIn("ChatGPT", final["notRun"])

    def test_task_time_record_selects_the_check_for_questions(self) -> None:
        for kind in QUESTION_KINDS:
            for actor in ("chat", "work", "codex", "claude"):
                with self.subTest(kind=kind, actor=actor):
                    contract = contract_for(kind, actor)
                    self.assertEqual([rule["rule_id"] for rule in contract["selected_rules"]], [RULE])
                    self.assertEqual(contract["unresolved"], [])

    def test_task_time_record_skips_operational_requests(self) -> None:
        for kind in ("operational_command", "procedure", "practical_method"):
            with self.subTest(kind=kind):
                self.assertEqual(contract_for(kind)["selected_rules"], [])

    def test_task_time_record_binds_the_pattern_and_the_final(self) -> None:
        record = next(r for r in json.loads(CATALOG.read_text(encoding="utf-8"))["records"] if r["rule_id"] == RULE)
        pattern = PATTERN.read_text(encoding="utf-8")
        self.assertEqual(record["source"]["path"], "patterns/reasoning-selection.md")
        for selector in record["source"]["selectors"]:
            with self.subTest(selector=selector["text"][:40]):
                self.assertEqual(pattern.count(selector["text"]), 1)
        self.assertEqual(sorted(record["trigger"]["in"]), sorted(QUESTION_KINDS))
        (obligation,) = record["obligations"]
        self.assertEqual(obligation["due_phase"], "final-delivery")
        self.assertEqual(obligation["destination"], "owner-visible-final")
        self.assertEqual(obligation["enforcement"], "semantic")
        self.assertIn("checking an earlier draft instead of the literal final", obligation["non_substitutes"])

    def test_owner_correction_selects_the_stated_question_duty(self) -> None:
        profile = json.loads(PROFILE.read_text(encoding="utf-8"))
        envelope = json.loads(OWNER_CORRECTION.read_text(encoding="utf-8"))
        self.assertEqual(envelope["facts"]["request_kind"]["state"], "ABSENT")
        contract = tt.compile_contract(answer_first_catalog(), profile, envelope, "graph")
        self.assertEqual(selected(contract), [CORRECTION_RULE])
        self.assertEqual(contract["unresolved"], [])
        envelope["facts"]["owner_correction_present"]["value"] = False
        self.assertEqual(selected(tt.compile_contract(answer_first_catalog(), profile, envelope, "graph")), [])

    def test_correction_record_allows_only_reasoned_inapplicability(self) -> None:
        record = next(r for r in json.loads(CATALOG.read_text(encoding="utf-8"))["records"] if r["rule_id"] == CORRECTION_RULE)
        self.assertEqual(record["trigger"], {"fact": "owner_correction_present", "eq": True})
        (obligation,) = record["obligations"]
        self.assertTrue(obligation["not_applicable_allowed"])
        self.assertIn("marking the obligation not applicable without a reason tied to the correction", obligation["non_substitutes"])
        self.assertIn({"type": "related_to", "rule_id": RULE}, record["relations"])
        for selector in record["source"]["selectors"]:
            self.assertEqual(PATTERN.read_text(encoding="utf-8").count(selector["text"]), 1)

    def test_coverage_maps_the_record(self) -> None:
        entry = next(e for e in json.loads(COVERAGE.read_text(encoding="utf-8"))["entries"] if e["id"] == "patterns/reasoning-selection.md")
        self.assertIn(RULE, entry["task_time_records"])
        self.assertIn(CORRECTION_RULE, entry["task_time_records"])
        self.assertIn({"path": "tests/test_answer_target_preservation.py", "class": "COMPILATION"}, entry["evidence"])

    def test_audit_records_a_disposition(self) -> None:
        text = AUDIT.read_text(encoding="utf-8")
        disposition = section(text, "## Maintainer disposition")
        for phrase in ("ADAPTED", "Failure boundary", "evals/answer-target-preservation.json", "Not done"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, disposition)

    def test_public_artifacts_carry_no_private_chat_locators(self) -> None:
        for path in (PATTERN, REQUIREMENT, EVAL, AUDIT):
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                self.assertNotIn("claude.ai/chat", text)
                self.assertNotIn("chatgpt.com/c/", text)


if __name__ == "__main__":
    unittest.main()
