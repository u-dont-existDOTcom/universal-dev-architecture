"""Text-presence regression for Mission Control's lease auto-renewal rule (owner, 2026-10-31).

The behavior itself is tested in the Mission Control app's tests/submission-authority-runtime.test.ts."""
from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "mission-control-multi-host-submission-scheduling.md"
RECORD = ROOT / "docs" / "requirements" / "2026-10-31-mission-control-lease-auto-renewal.owner-requirement.json"
APP = ROOT / "tools" / "codex-mission-control" / "restored" / "codex-mission-control"
RUNTIME = APP / "lib" / "submission-authority-runtime.ts"
SCHEDULER = APP / "lib" / "provider-submission-authority.mjs"


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

    def test_scheduler_renews_inside_its_transaction_and_never_revives_an_expired_lease(self) -> None:
        runtime = RUNTIME.read_text(encoding="utf-8")
        self.assertIn("async renewLeaseIfDue()", runtime)
        self.assertIn("return scheduler.renewLeaseIfDue(", runtime)
        scheduler = SCHEDULER.read_text(encoding="utf-8")
        method = scheduler.split("  async renewLeaseIfDue({ expected, windowMs }) {", 1)[1].split("\n  async ", 1)[0]
        self.assertIn("return this.#serialized(async () => {", method)
        for code in ("'LEASE_NOT_CURRENTLY_VALID'", "'NOT_THE_CONFIGURED_LEASE'", "'SAFETY_HALT'", "'NOT_DUE'"):
            with self.subTest(code=code):
                self.assertIn(code, method)


if __name__ == "__main__":
    unittest.main()
