from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "reasoning-selection.md"
PROVENANCE_PATTERN = ROOT / "patterns" / "source-interpretation-provenance.md"
REQUIREMENT = ROOT / "docs" / "requirements" / "2026-09-30-claim-and-argument-evaluation.owner-requirement.json"
EVAL = ROOT / "evals" / "claim-and-argument-evaluation.json"
SECTION_HEADING = "## Claim and argument evaluation"


def section(text: str, heading: str) -> str:
    return text.split(heading, 1)[1].split("\n## ", 1)[0]


class ClaimAndArgumentEvaluationTests(unittest.TestCase):
    def test_section_states_trigger_and_each_check(self) -> None:
        body = section(PATTERN.read_text(encoding="utf-8"), SECTION_HEADING)
        for phrase in (
            'including a casual "what do you think of this"',
            "Report only the findings that change the verdict",
            "**Hidden-slot and sense check.**",
            "check whether it splits into kinds that get different verdicts",
            "**Presupposition check.**",
            "Evaluate the branch where it is false before concluding",
            "it does not license inventing facts about real people or discounting the owner's firsthand account of specific people",
            "**Same relation to the end.**",
            'including any replacement test, criterion, or "better question" the answer proposes',
            "**Contested-authority check.**",
            "say whether the view is contested and state the strongest rival position with its source",
            "**Counterexample triage.**",
            "is a reason to recheck against sources, not a reason to agree",
            "the concession rule above applies to each item",
            "What people do is evidence about beliefs and norms in use, not by itself evidence about what is justified",
            "**Scoped verdict.**",
            "state the conditions under which it holds and those under which it fails or reverses",
            "**Quotes from tool summaries.**",
            "is paraphrase until checked against the page text",
            "`patterns/source-interpretation-provenance.md` → **Point-of-use anchoring**",
            "Regression:",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, body)

    def test_section_sits_between_evidence_and_retrieval_sections(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        self.assertEqual(text.count(SECTION_HEADING), 1)
        evidence = text.index("## Evidence, specificity, and target discipline")
        concession = text.index("The same check applies before conceding.")
        claim = text.index(SECTION_HEADING)
        retrieval = text.index("## Evidence-first retrieval and recommendation discipline")
        self.assertLess(evidence, concession)
        self.assertLess(concession, claim)
        self.assertLess(claim, retrieval)

    def test_summary_quote_rule_lives_with_the_quotation_rules(self) -> None:
        anchoring = section(PROVENANCE_PATTERN.read_text(encoding="utf-8"), "## Point-of-use anchoring")
        self.assertIn(
            "6. A quotation that appears only in a tool's model-generated summary of a page is paraphrase until checked against the page text.",
            anchoring,
        )
        self.assertIn("present it as paraphrase without quotation marks", anchoring)

    def test_provenance_records_addition_and_activation_honesty(self) -> None:
        provenance = PATTERN.read_text(encoding="utf-8").split("## Provenance", 1)[1]
        self.assertIn("claim-and-argument evaluation checks were added on 2026-09-30", provenance)
        self.assertIn("did not load this architecture", provenance)
        self.assertIn("docs/requirements/2026-09-30-claim-and-argument-evaluation.owner-requirement.json", provenance)
        self.assertIn("https://plato.stanford.edu/entries/respect/", provenance)

    def test_root_agents_routes_claim_evaluation(self) -> None:
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.assertIn(
            '`patterns/reasoning-selection.md` → **Claim and argument evaluation**',
            agents,
        )

    def test_lesson_index_entry_names_the_trigger(self) -> None:
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        entries = [line for line in index.splitlines() if "`patterns/reasoning-selection.md` —" in line]
        self.assertEqual(len(entries), 1)
        self.assertIn("claim-and-argument evaluation checks", entries[0])
        self.assertIn("what do you think of this", entries[0])

    def test_requirement_records_origin_surfaces_and_limits(self) -> None:
        data = json.loads(REQUIREMENT.read_text(encoding="utf-8"))
        self.assertEqual(data["requirement_id"], "2026-09-30-claim-and-argument-evaluation")
        self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
        dispositions = {surface["disposition"] for surface in data["execution_surfaces"]}
        self.assertTrue({"PROJECTED", "DEFERRED"} <= dispositions)
        for surface in data["execution_surfaces"]:
            if surface["disposition"] in {"DEFERRED", "NOT_APPLICABLE"}:
                with self.subTest(surface=surface["surface"]):
                    self.assertTrue(surface.get("reason"))
        self.assertNotIn("LIVE_VERIFIED", data["learning_state_at_merge"])
        self.assertTrue(data["nonclaims"])

    def test_requirement_covers_every_declared_public_app(self) -> None:
        data = json.loads(REQUIREMENT.read_text(encoding="utf-8"))
        surfaces = " ".join(surface["surface"] for surface in data["execution_surfaces"])
        for app in ("Inner Signal", "AskRigor", "humandesign participant interviewer GPT"):
            with self.subTest(app=app):
                self.assertIn(app, surfaces)

    def test_clock_finding_points_to_its_requirement(self) -> None:
        data = json.loads(REQUIREMENT.read_text(encoding="utf-8"))
        findings = data["related_findings"]
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["disposition"], "PROMOTED")
        promoted_by = ROOT / findings[0]["promoted_by"]
        self.assertTrue(promoted_by.is_file())

    def test_eval_fixture_covers_every_check(self) -> None:
        data = json.loads(EVAL.read_text(encoding="utf-8"))
        self.assertEqual(data["pattern"], "patterns/reasoning-selection.md")
        checks = {case["check"] for case in data["cases"]}
        self.assertEqual(
            checks,
            {
                "hidden-slot-and-sense",
                "presupposition",
                "same-relation",
                "contested-authority",
                "counterexample-triage",
                "scoped-verdict",
                "summary-sourced-quote",
            },
        )
        for case in data["cases"]:
            with self.subTest(case=case["id"]):
                self.assertTrue(case["expected"])
                self.assertTrue(case["mustNot"])

    def test_public_artifacts_carry_no_private_chat_locators(self) -> None:
        for path in (PATTERN, REQUIREMENT, EVAL):
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                self.assertNotIn("claude.ai/chat", text)
                self.assertNotIn("chatgpt.com/c/", text)


if __name__ == "__main__":
    unittest.main()
