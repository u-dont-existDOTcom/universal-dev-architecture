"""Text-presence regression for Mission Control's lease auto-renewal rule (owner, 2026-10-31).

The behavior itself is tested in the Mission Control app's tests/submission-authority-runtime.test.ts."""
from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "mission-control-multi-host-submission-scheduling.md"
RECORD = ROOT / "docs" / "requirements" / "2026-10-31-mission-control-lease-auto-renewal.owner-requirement.json"
RUNTIME = ROOT / "tools" / "codex-mission-control" / "restored" / "codex-mission-control" / "lib" / "submission-authority-runtime.ts"


class LeaseAutoRenewalTests(unittest.TestCase):
    def test_pattern_keeps_takeover_safe(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "**Lease renewal (owner, 2026-10-31).**",
            "It never revives an expired\nlease, and a configured successor lease stops renewal of the old one.",
            "`MISSION_CONTROL_SUBMISSION_LEASE_AUTO_RENEW=off`",
            f"`docs/requirements/{RECORD.name}`",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_record_quotes_the_owner_and_marks_the_choice(self) -> None:
        data = json.loads(RECORD.read_text(encoding="utf-8"))
        self.assertEqual(data["owner_statement"], "6 why don' we unlimit it, i don't see why sending permissions hould end")
        self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
        self.assertIn("assistant's choice", data["origin"]["notes"])
        self.assertTrue(data["nonclaims"])

    def test_runtime_never_revives_an_expired_lease(self) -> None:
        text = RUNTIME.read_text(encoding="utf-8")
        self.assertIn("async renewLeaseIfDue()", text)
        self.assertIn('"LEASE_NOT_CURRENTLY_VALID"', text)
        self.assertIn('"NOT_THE_CONFIGURED_LEASE"', text)


if __name__ == "__main__":
    unittest.main()
