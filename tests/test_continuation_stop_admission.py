"""Normative regression coverage, not a claim of model behavioral compliance."""
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[1]

class ContinuationStopAdmissionTests(unittest.TestCase):
    def test_root_binds_the_actual_final_boundary(self):
        root = (ROOT / "AGENTS.md").read_text()
        for phrase in ("## Pre-final continuation invariant", "actual final output", "safe authorized executable next action", "cannot cancel parent implementation authority"):
            self.assertIn(phrase, root)

    def test_canonical_rule_closes_scope_laundering_without_waiving_limits(self):
        rule = (ROOT / "patterns/codex-github-operating-system.md").read_text()
        block = rule.split("### Continuation and stop admission", 1)[1].split("### Owner-interruption", 1)[0]
        for phrase in ("does not silently change the task to diagnosis-only", "perform it in the current turn", "unchanged known failure", "finish independent authorized work", "Respect explicit stop, pause, diagnostic-only", "SATISFIED, SUPERSEDED, or CANCELED", "exhausted platform limit", "do not prove universal compliance"):
            self.assertIn(phrase, block)

    def test_existing_contract_carries_the_stop_decision(self):
        template = (ROOT / "templates/ACTIVE-LESSON-CONTRACT.md").read_text()
        for phrase in ("Continuation / stop admission", "Parent outcome", "responsible actor", "exact blocker evidence", "Action actually executed", "Independent authorized work"):
            self.assertIn(phrase, template)
