from __future__ import annotations

import contextlib
import io
import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "turn_stamp.py"
REQUIREMENT = ROOT / "docs" / "requirements" / "2026-10-11-one-command-turn-stamp.owner-requirement.json"

sys.path.insert(0, str(ROOT / "scripts"))
import turn_stamp  # noqa: E402


def run(*args: str) -> tuple[int, str]:
    out = io.StringIO()
    err = io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = turn_stamp.main(list(args))
    return code, out.getvalue().strip() or err.getvalue().strip()


class TurnStampTests(unittest.TestCase):
    def test_minute_resolution_start_prints_a_range(self) -> None:
        code, line = run("--start", "2026-10-10 22:12", "--tz", "Africa/Dakar", "--now", "2026-10-10T22:20:03Z")
        self.assertEqual(code, 0)
        self.assertEqual(line, "Sat 10 Oct 2026, 22:20:03 (UTC+00:00, Africa/Dakar) · total turn time 7m04s–8m03s (from 22:12)")

    def test_same_minute_range_never_goes_negative(self) -> None:
        code, line = run("--start", "2026-10-10 23:44", "--now", "2026-10-10T23:44:53Z")
        self.assertEqual(code, 0)
        self.assertIn("total turn time 0s–53s", line)
        self.assertNotIn("-", line.split("total turn time", 1)[1].split("(")[0].replace("–", ""))

    def test_second_resolution_start_prints_one_value(self) -> None:
        code, line = run("--start", "2026-10-10T22:12:30Z", "--now", "2026-10-10T23:30:03Z")
        self.assertEqual(code, 0)
        self.assertTrue(line.endswith("total turn time 1h17m33s (from 22:12:30)"))

    def test_local_timezone_offset_is_shown(self) -> None:
        code, line = run("--start", "2026-10-11 09:00", "--tz", "Europe/Paris", "--now", "2026-10-11T07:05:00Z")
        self.assertEqual(code, 0)
        self.assertTrue(line.startswith("Sun 11 Oct 2026, 09:05:00 (UTC+02:00, Europe/Paris)"))
        self.assertIn("4m01s–5m00s (from 09:00)", line)

    def test_clock_earlier_than_first_reading_fails_with_status_3(self) -> None:
        code, message = run("--start", "2026-10-11 00:40", "--now", "2026-10-11T00:39:00Z")
        self.assertEqual(code, 3)
        self.assertIn("earlier than the first reading", message)

    def test_first_line_matches_the_literal_timestamp_form(self) -> None:
        _, line = run("--start", "2026-10-11 00:36", "--now", "2026-10-11T00:41:12Z")
        self.assertRegex(line, r"^\w{3} \d{2} \w{3} \d{4}, \d{2}:\d{2}:\d{2} \(UTC[+-]\d{2}:\d{2}")

    def test_script_runs_as_a_command_with_the_real_clock(self) -> None:
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--start", "2000-01-01 00:00"],
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("total turn time", result.stdout)


class TurnStampRuleTests(unittest.TestCase):
    def setUp(self) -> None:
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.per_turn = agents.split("## Per-turn bootstrap invariants", 1)[1].split("\n## ", 1)[0]

    def test_rule_names_the_one_command_method(self) -> None:
        for phrase in (
            "Get the second reading and the elapsed time from one command that prints the finished first line, not from reasoning:",
            "`python3 scripts/turn_stamp.py --start '<first reading>' --tz <zone>` where this repository is checked out (owner, 2026-10-11).",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.per_turn)

    def test_requirement_records_owner_request_and_redesign(self) -> None:
        data = json.loads(REQUIREMENT.read_text(encoding="utf-8"))
        self.assertEqual(data["requirement_id"], "2026-10-11-one-command-turn-stamp")
        self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
        self.assertIn("fix that timestamp rule", data["owner_statement"])
        self.assertIn("2026-09-30-hardcoded-clock-order", data["recurring_finding"]["prior_fixes"])
        self.assertIn("scripts/turn_stamp.py", data["recurring_finding"]["redesign"])
        for surface in data["execution_surfaces"]:
            if surface["disposition"] in {"DEFERRED", "NOT_APPLICABLE"}:
                with self.subTest(surface=surface["surface"]):
                    self.assertTrue(surface.get("reason"))
        self.assertNotIn("LIVE_VERIFIED", data["learning_state_at_merge"])
        self.assertTrue(data["nonclaims"])


if __name__ == "__main__":
    unittest.main()
