from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VALIDATOR_PATH = ROOT / "scripts" / "validate_owner_request_integrity.py"
TIMESTAMP_REQUIREMENT = ROOT / "docs" / "requirements" / "2026-09-01-visible-chat-message-time.owner-requirement.json"
FUTURE_REQUIREMENT = ROOT / "docs" / "requirements" / "2026-09-01-future-owner-improvement-integrity.owner-requirement.json"
MISSION_CONTROL_AGENTS = ROOT / "tools" / "codex-mission-control" / "AGENTS.md"
ACTIVE_CONTRACT = ROOT / "docs" / "exec-plans" / "active" / "2026-09-01-mission-control-owner-request-integrity-active-contract.md"

spec = importlib.util.spec_from_file_location("owner_request_integrity", VALIDATOR_PATH)
assert spec and spec.loader
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class MissionControlOwnerRequestIntegrityTests(unittest.TestCase):
    def load(self, path: Path) -> dict:
        return json.loads(path.read_text(encoding="utf-8"))

    def test_exact_owner_wording_and_hashes_are_preserved(self) -> None:
        for path in (TIMESTAMP_REQUIREMENT, FUTURE_REQUIREMENT):
            with self.subTest(path=path.name):
                record = self.load(path)
                verbatim = record["owner_source"]["verbatim"]
                expected = hashlib.sha256(verbatim.encode("utf-8")).hexdigest()
                self.assertEqual(record["owner_source"]["sha256"], expected)
                self.assertEqual(validator.validate_record(record, path), [])

    def test_timestamp_requirement_cannot_close_on_internal_code_and_tests(self) -> None:
        record = self.load(TIMESTAMP_REQUIREMENT)
        self.assertFalse(record["completion_allowed"])
        outcomes = {item["id"]: item for item in record["required_outcomes"]}
        self.assertEqual(outcomes["RO-TIME-004"]["status"], "UNMET")
        self.assertEqual(outcomes["RO-TIME-004"]["evidence_refs"], [])
        proxies = "\n".join(record["non_satisfying_proxies"]).lower()
        self.assertIn("unit tests pass without a live provider-bound transcript", proxies)
        self.assertIn("capture time presented as source sent time", proxies)

    def test_future_improvement_gate_is_active_but_not_overclaimed_as_universal(self) -> None:
        record = self.load(FUTURE_REQUIREMENT)
        self.assertFalse(record["completion_allowed"])
        self.assertIn("NOT_UNIVERSALLY_LIVE_VERIFIED", record["status"])
        self.assertTrue(any(item["status"] == "UNMET" for item in record["required_outcomes"]))

        agents = MISSION_CONTROL_AGENTS.read_text(encoding="utf-8")
        contract = ACTIVE_CONTRACT.read_text(encoding="utf-8")
        for phrase in (
            "A direct owner request or correction",
            "non-satisfying proxies",
            "IMPLEMENTED_NOT_LIVE_VERIFIED",
            "Do not say `fixed`",
            "Current wall-clock time is obtainable",
            "The model can accurately state the defect and still reproduce it",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, agents)
        self.assertIn("The generic owner-improvement integrity rule is now active", contract)
        self.assertIn("not yet proven across all projects", contract)

    def test_validator_rejects_proxy_completion_and_source_rewriting(self) -> None:
        source = self.load(FUTURE_REQUIREMENT)

        rewritten = copy.deepcopy(source)
        rewritten["owner_source"]["verbatim"] += " softened"
        errors = validator.validate_record(rewritten, FUTURE_REQUIREMENT)
        self.assertTrue(any("does not match exact UTF-8 owner wording" in error for error in errors))

        false_close = copy.deepcopy(source)
        false_close["status"] = "LIVE_VERIFIED"
        false_close["completion_allowed"] = True
        errors = validator.validate_record(false_close, FUTURE_REQUIREMENT)
        self.assertTrue(any("terminal outcome is not verified" in error for error in errors))
        self.assertTrue(any("terminal verification requires direct evidence refs" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
