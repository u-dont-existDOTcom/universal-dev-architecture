import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "templates" / "PRIOR-WORK-SCAN.md"
FIXTURE = ROOT / "evals" / "method-premise" / "manufactured-prerequisite-pilot.json"
PROPOSAL = ROOT / "proposals" / "2026-09-12-outcome-first-supervision-discussion.md"


class ManufacturedPrerequisitePilotTests(unittest.TestCase):
    def test_template_contains_method_necessity_gate(self) -> None:
        text = TEMPLATE.read_text(encoding="utf-8")
        required = [
            "## Method necessity / manufactured-prerequisite check",
            "What specifically breaks if this method is removed or replaced",
            "Strongest materially simpler alternative",
            "Evidence that rules out the simpler alternative",
            "Necessity state: `ESTABLISHED` / `UNRESOLVED` / `NOT_NECESSARY`",
            "A prior-art scan showing that a method is mature, rigorous, or effective does not establish that the method is necessary",
            "Do not trigger it for routine reversible implementation choices",
        ]
        for needle in required:
            self.assertIn(needle, text)

    def test_fixture_discriminates_manufactured_and_legitimate_prerequisites(self) -> None:
        payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
        cases = {case["case_id"]: case for case in payload["cases"]}
        self.assertEqual(
            cases["MP-001-life-patterns-known-development-incident"]["expected_gate"],
            {
                "triggered": True,
                "necessity_state": "UNRESOLVED",
                "authorized_disposition": "bounded_experiment_only",
                "required_reason": "The hard anti-leakage constraint does not by itself establish that a closed external taxonomy is necessary; a materially simpler shared frozen representation remains live.",
            },
        )
        self.assertEqual(
            cases["MP-002-owner-explicit-standardized-taxonomy"]["expected_gate"]["necessity_state"],
            "ESTABLISHED",
        )
        self.assertFalse(
            cases["MP-003-routine-reversible-implementation-choice"]["expected_gate"]["triggered"]
        )
        self.assertEqual(
            cases["MP-004-hard-external-format-requirement"]["expected_gate"]["necessity_state"],
            "ESTABLISHED",
        )

    def test_known_incident_is_marked_development_not_untouched_validation(self) -> None:
        payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
        cases = {case["case_id"]: case for case in payload["cases"]}
        self.assertTrue(cases["MP-001-life-patterns-known-development-incident"]["development_case"])

    def test_proposal_remains_non_activated(self) -> None:
        text = PROPOSAL.read_text(encoding="utf-8")
        self.assertIn("Status: DISCUSSION / NOT ACTIVATED / NO GLOBAL ROLLOUT", text)
        self.assertIn("No new end-to-end supervision control is claimed active", text)


if __name__ == "__main__":
    unittest.main()
