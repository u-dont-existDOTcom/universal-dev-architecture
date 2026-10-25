"""Behavioral regression for research prep-vs-owner-evidence failure.

The gate is one check in a guidance flow; passing these fixtures is not
proof all deployed agents use it. No personal records or chart data.
"""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from research_progress_admission import assess, SCHEMA  # noqa E402


def record(
    *,
    kind: str = "EMPIRICAL_VALIDATION",
    before: int = 0,
    after: int = 0,
    prep: int = 5,
    cls: str = "SUPPORTING_QUALITY",
    owner_request: bool = False,
    unblock: bool = False,
    blocker: bool = False,
    repeats: bool = True,
    needs_consent: bool = False,
    authorized: bool = False,
    claims_direct: bool = False,
):
    return {
        "schema": SCHEMA,
        "root": {
            "owner_requested_result": (
                "Independently evaluate frozen natal predictions on real unseen people"
                if kind == "EMPIRICAL_VALIDATION" else "Recover 64 specified source pages"
            ),
            "kind": kind,
            "status": "OPEN",
            "direct_observations_before": before,
            "direct_observations_now": after,
            "successive_preparation_only_cycles": prep,
        },
        "proposed": {
            "objective": "Add another synthetic questionnaire, model, and 70 green unit tests",
            "evidence_class": cls,
            "closest_direct_observation_or_human_gate":
                "Use an authorized independently consented cohort, else supply a narrow consent/data gate",
            "explicit_owner_source_request": owner_request,
            "specific_blocker_independently_verified": blocker,
            "material_real_observation_unlocked": unblock,
            "needs_new_third_party_consent_or_access": needs_consent,
            "that_consent_or_access_obtained": authorized,
            "repeats_prior_preparatory_method": repeats,
            "claims_new_real_outcome_evidence": claims_direct,
        },
    }


class ResearchProgressStoplossTests(unittest.TestCase):
    def test_gene_keys_g35_g39_another_mock_study_fails(self):
        x = assess(record())
        self.assertEqual(x["decision"], "REJECT_PROXY_LOOP")
        self.assertEqual(x["direct_evidence_status"], "NOT_YET_MEASURED")
        self.assertFalse(x["allowed_under_this_stoploss"])
        self.assertEqual(x["new_direct_observations"], 0)
        self.assertTrue(x["never_authorizes_third_party_consent_or_data_use"])

    def test_mock_study_cannot_claim_real_human_outcome(self):
        r = record(claims_direct=True, prep=0)
        out = assess(r)
        self.assertEqual(out["decision"], "REJECT_UNSUPPORTED_DIRECT_CLAIM")

    def test_owner_explicitly_requested_full_source_corpus_allowed(self):
        r = record(kind="SOURCE_ACQUISITION", cls="SOURCE_EVIDENCE", prep=15)
        out = assess(r)
        self.assertEqual(out["decision"], "ADMIT_OWNER_SOURCE_TASK")
        self.assertTrue(out["allowed_under_this_stoploss"])
        self.assertNotEqual(out["direct_evidence_status"], "ADVANCING")

    def test_explicit_owner_requested_source_task_embedded_in_empirical_project(self):
        r = record(cls="SOURCE_EVIDENCE", owner_request=True)
        self.assertEqual(assess(r)["decision"], "ADMIT_OWNER_SOURCE_TASK")

    def test_first_bounded_exploration_can_proceed_without_science_success(self):
        r = record(prep=0, repeats=False)
        out = assess(r)
        self.assertEqual(out["decision"], "ADMIT_SINGLE_BOUNDED_EXPLORATION")
        self.assertTrue(out["allowed_under_this_stoploss"])
        self.assertEqual(out["new_direct_observations"], 0)

    def test_specific_unblocking_one_time_repair_is_not_blocked_by_cycle_count(self):
        r = record(cls="NECESSARY_ENABLEMENT", unblock=True,
                   blocker=True, repeats=False, prep=9)
        self.assertEqual(assess(r)["decision"], "ADMIT_ONE_BOUNDED_REPAIR")

    def test_unverified_new_infrastructure_not_automatically_necessary(self):
        r = record(cls="NECESSARY_ENABLEMENT", unblock=False,
                   blocker=True, repeats=False, prep=0)
        self.assertEqual(assess(r)["decision"], "REJECT_UNNECESSARY_ENABLEMENT")

    def test_repeated_claim_of_same_repair_not_reenabled_by_new_tests(self):
        r = record(cls="NECESSARY_ENABLEMENT", unblock=True,
                   blocker=True, repeats=True, prep=5)
        self.assertEqual(assess(r)["decision"], "REJECT_PROXY_LOOP")

    def test_no_consent_is_real_human_gate_even_for_direct_experiment(self):
        r = record(cls="DIRECT_OUTCOME_EVIDENCE", prep=0, repeats=False,
                   needs_consent=True, authorized=False)
        out = assess(r)
        self.assertEqual(out["decision"], "EXTERNAL_EVIDENCE_GATE")
        self.assertFalse(out["allowed_under_this_stoploss"])

    def test_consent_ready_prospective_trial_is_admitted_not_stopped_by_preparation_count(self):
        r = record(cls="DIRECT_OUTCOME_EVIDENCE", prep=10,
                   needs_consent=True, authorized=True)
        out = assess(r)
        self.assertEqual(out["decision"], "ADMIT_DIRECT_TEST")
        self.assertTrue(out["allowed_under_this_stoploss"])
        self.assertTrue(out["never_authorizes_third_party_consent_or_data_use"])

    def test_real_nonsupportive_outcome_counts_as_progress(self):
        r = record(cls="DIRECT_OUTCOME_EVIDENCE", before=0, after=10, prep=5)
        result = assess(r)
        self.assertEqual(result["direct_evidence_status"], "ADVANCING")
        self.assertEqual(result["new_direct_observations"], 10)

    def test_pending_consent_must_not_generate_fictional_people(self):
        r = record(cls="ACCESS_OR_CONSENT_GATE", needs_consent=True)
        self.assertEqual(assess(r)["decision"], "EXTERNAL_EVIDENCE_GATE")

    def test_supporting_source_work_cannot_drift_when_owner_requested_human_evidence(self):
        r = record(cls="SOURCE_EVIDENCE", prep=0)
        self.assertEqual(assess(r)["decision"], "REJECT_UNLINKED_SOURCE_EXPANSION")

    def test_reject_unexpected_schema_and_bool_vs_int_injection(self):
        r = record()
        r["root"]["successive_preparation_only_cycles"] = True
        with self.assertRaises(ValueError):
            assess(r)
        r = record()
        r["schema"] = "UNKNOWN"
        with self.assertRaises(ValueError):
            assess(r)
        r = record()
        r["proposed"]["material_real_observation_unlocked"] = "true"
        with self.assertRaises(ValueError):
            assess(r)

    def test_satisfied_goal_has_no_automatically_invented_extra_work(self):
        r = record()
        r["root"]["status"] = "SATISFIED"
        self.assertEqual(assess(r)["decision"], "STOP_OWNER_ROOT_COMPLETE")

    def test_exact_cli_exit_status_for_proxy_loop_and_legitimate_source_work(self):
        path = ROOT / "scripts" / "research_progress_admission.py"
        with tempfile.TemporaryDirectory() as tmp:
            inp = Path(tmp) / "proposed.json"
            for obj, expected_code, expected_decision in (
                (record(), 3, "REJECT_PROXY_LOOP"),
                (record(kind="SOURCE_ACQUISITION", cls="SOURCE_EVIDENCE"),
                 0, "ADMIT_OWNER_SOURCE_TASK"),
            ):
                inp.write_text(json.dumps(obj), encoding="utf8")
                p = subprocess.run(
                    [sys.executable, str(path), "--input", str(inp)],
                    capture_output=True, text=True, check=False,
                )
                self.assertEqual(p.returncode, expected_code, p.stderr)
                self.assertEqual(json.loads(p.stdout)["decision"],
                                 expected_decision)

    def test_wired_into_current_task_time_and_research_guidance(self):
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf8")
        codex = (ROOT / "patterns/codex-github-operating-system.md").read_text(encoding="utf8")
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf8")
        outcome = (ROOT / "patterns/outcome-advancement-and-strategy-efficacy.md").read_text(encoding="utf8")
        template = (ROOT / "templates/CODEX-TASK.md").read_text(encoding="utf8")
        rule = "patterns/research-outcome-proximity-and-proxy-stoploss.md"
        for source in (index, codex, agents, outcome, template):
            self.assertIn(rule, source)
        self.assertIn("REJECT_PROXY_LOOP", (ROOT / rule).read_text())

    def test_not_a_governance_replacement_for_consent_or_source_specificity(self):
        s = (ROOT / "patterns/research-outcome-proximity-and-proxy-stoploss.md").read_text()
        self.assertIn("consent", s.lower())
        self.assertIn("source", s.lower())
        self.assertIn("no universal prevention claim", s.lower())


if __name__ == "__main__":
    unittest.main()
