from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIREMENT = "docs/requirements/2026-09-27-claim-anchoring-and-review-integrity.owner-requirement.json"


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def section(text: str, heading: str) -> str:
    return text.split(heading, 1)[1].split("\n## ", 1)[0]


class ClaimAnchoringReviewIntegrityTests(unittest.TestCase):
    def assert_fragments(self, text: str, fragments: tuple[str, ...]) -> None:
        for fragment in fragments:
            with self.subTest(fragment=fragment):
                self.assertIn(fragment, text)

    def test_owner_requirement_is_active_and_bounded(self) -> None:
        data = json.loads(read(REQUIREMENT))
        self.assertEqual(data["status"], "ACTIVE_OWNER_REQUIREMENT")
        self.assertEqual(data["date"], "2026-09-27")
        self.assert_fragments(data["normalized_rule"], (
            "at the point of use",
            "quote only exact words",
            "search a whole text before an absence claim",
            "trace figures to their primary source",
            "Check the source before conceding as well as before defending",
            "flag only what survives the strongest reading",
            "never re-raise a rejected flag without new evidence",
            "run an independent claim check with a claim ledger and a budget",
            "record each projection, coverage mapping, and exclusion in the transfer ledger",
        ))
        self.assertIn("non-blocking experiment", data["owner_supplied_source"]["disposition"])
        self.assertIn("natural and not formulaic", data["owner_supplied_source"]["owner_scope"])
        for field in ("causal_mechanism", "transfer_rationale", "limits", "scope"):
            with self.subTest(field=field):
                self.assertTrue(data[field])

    def test_point_of_use_anchoring_lives_in_source_provenance(self) -> None:
        text = section(read("patterns/source-interpretation-provenance.md"), "## Point-of-use anchoring")
        self.assert_fragments(text, (
            "Having read it earlier is not a check.",
            "rests on a passage the writer can point to",
            "An inference is never phrased as the source's content.",
            "Quotation marks enclose only the source's exact words.",
            "search the whole text for counterexamples",
            "always when it moves into text the owner will publish",
        ))

    def test_evidence_checks_live_in_reasoning_selection(self) -> None:
        text = section(read("patterns/reasoning-selection.md"), "## Evidence, specificity, and target discipline")
        self.assert_fragments(text, (
            "perform a **category-claim check**",
            "a claim that contradicts the owner's usage needs a source before it is stated",
            "perform a **figure-provenance check**: open the source the page cites",
            "Two figures that trace to one source are one finding, not corroboration.",
            "State the scope of every verification.",
            "text that was deleted or replaced was not \"fixed.\"",
            "Report a derived quantity at the resolution of its inputs.",
            "perform a **cross-turn consistency check**",
            "The same check applies before conceding.",
            "Agreement is not verification",
        ))

    def test_owner_writing_review_rules_live_in_whole_argument_reconstruction(self) -> None:
        text = section(read("patterns/whole-argument-reconstruction.md"), "## Reviewing the owner's own writing")
        self.assert_fragments(text, (
            "state the strongest reading under which it is not one",
            "When a flag depends on what the owner meant, ask.",
            "cannot both be true under any reasonable reading",
            "Once the owner rejects a flag, drop it.",
            "There is no minimum number of findings",
        ))

    def test_editorial_pattern_rechecks_inserted_facts(self) -> None:
        text = section(read("patterns/editorial-authority-and-lossless-editing.md"), "## Recheck facts added to owner-authored text")
        self.assert_fragments(text, (
            "check it against its source at the point of insertion",
            "must not transfer the owner's own characterization to X",
            "Mark each added factual claim",
        ))

    def test_independent_claim_check_and_bounded_experiment(self) -> None:
        text = read("patterns/independent-evaluation-separation.md")
        claim_check = section(text, "## Claim check before delivery")
        self.assert_fragments(claim_check, (
            "claim ledger",
            "not the drafter's reasoning",
            "A claim about what the owner meant is not checked but asked.",
            "Give the checker a budget",
            "### Experimental: key-condition recoverability",
            "https://aclanthology.org/2024.emnlp-main.714/",
            "averaging 52.3 words",
            "bounded, non-blocking experiment",
            "Do not apply it to conversational or therapeutic replies.",
        ))
        self.assertIn("**Read-as-checked:**", text)

    def test_audit_keeps_private_material_out(self) -> None:
        audit = read("audits/2026-09-27-claim-anchoring-review-integrity.md")
        self.assert_fragments(audit, (
            "The essay, the owner's draft, and the transcript are not committed.",
            "found the other 11",
            "Not established: whether the reasoning-effort setting contributed.",
        ))

    def test_regression_fixture_is_synthetic_and_scored_independently(self) -> None:
        data = json.loads(read("evals/review-integrity/claim-anchoring-review-v1.json"))
        self.assertTrue(data["synthetic"])
        self.assertIn("at least five runs per condition", data["scoring"]["runs"])
        stage_ids = [stage["id"] for stage in data["stages"]]
        self.assertEqual(stage_ids, ["stage-1-review", "stage-2-pushback", "stage-3-rewrite"])
        source_ids = [item["id"] for item in data["materials"]["sourcePacket"]]
        self.assertEqual(len(source_ids), len(set(source_ids)))
        review = data["stages"][0]
        self.assertIn("what 'the 1% monsters' refers to", review["mustAsk"])
        self.assertTrue(any("unwilling" in item for item in review["mustNotAssert"]))
        rewrite = data["stages"][2]
        self.assertTrue(any("threw stones" in item for item in rewrite["mustNotAssert"]))

    def test_lesson_index_routes_to_the_new_rules(self) -> None:
        index = read("LESSON-INDEX.md")
        self.assert_fragments(index, (
            "anchor every claim about a source to a passage at the point of use",
            "flag only what survives its strongest reading",
            "run a budgeted claim check with a claim ledger",
            "check the source before conceding as well as before defending",
            "recheck every fact added to owner-authored text",
            "`portable/TRANSFER-LEDGER.json`",
        ))

    def test_provenance_is_recorded_where_each_rule_lives(self) -> None:
        for rel in (
            "patterns/source-interpretation-provenance.md",
            "patterns/reasoning-selection.md",
            "patterns/whole-argument-reconstruction.md",
            "patterns/editorial-authority-and-lossless-editing.md",
            "patterns/independent-evaluation-separation.md",
        ):
            with self.subTest(pattern=rel):
                self.assertIn(REQUIREMENT, read(rel))


if __name__ == "__main__":
    unittest.main()
