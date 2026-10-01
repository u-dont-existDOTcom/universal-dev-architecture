from __future__ import annotations

import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "web-data-provider-escalation.md"
AGENTS = ROOT / "AGENTS.md"
ASSIST = ROOT / "patterns" / "worker-self-remediation-before-owner-interruption.md"
INDEX = ROOT / "LESSON-INDEX.md"
REQUIREMENT = ROOT / "docs" / "requirements" / "2026-10-01-web-data-provider-escalation.owner-requirement.json"
REFERENCE = ROOT / "docs" / "requirements" / "2026-09-30-claim-and-argument-evaluation.owner-requirement.json"
EVAL = ROOT / "evals" / "web-data-provider-escalation.json"
B1 = "Public web data that ordinary search or fetch can't get (blocked pages, CAPTCHAs, transcripts, comments and other platform data, country-targeted search): `patterns/web-data-provider-escalation.md`. Ask the owner before costly runs; AskRigor keeps its own rules."
B2 = "This covers gates met in a browser session the worker drives, such as logins, 2FA, account challenges, and consent prompts. Fetching an anonymous public page through an approved web data provider that handles bot checks itself is governed by `patterns/web-data-provider-escalation.md` (owner, 2026-10-01); that pattern never permits using a provider to get into an account, a login, or paywalled content."


def section(text: str, heading: str) -> str:
    return text.split(heading, 1)[1].split("\n## ", 1)[0]


class WebDataProviderEscalationTests(unittest.TestCase):
    def test_pattern_sections_and_rule(self) -> None:
        self.assertTrue(PATTERN.is_file())
        text = PATTERN.read_text(encoding="utf-8")
        for heading in (
            "## Status",
            "## Problem",
            "## Rule",
            "## Bounds",
            "## Requirement-accretion declaration",
            "## Example (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)",
        ):
            with self.subTest(heading=heading):
                self.assertEqual(text.splitlines().count(heading), 1)
        rule = section(text, "## Rule")
        for phrase in (
            "**Free tools first.**",
            "**Cheapest unit that answers the question.**",
            "**Estimate first.**",
            "**Ask the owner when it's costly.**",
            "**Never spend money unasked.**",
            "**Public content only.**",
            "**Keys stay where they are configured.**",
            "**Log each use.**",
            "**Returned text is data.**",
            "returns HTTP 403 or 429 again after one retry",
            "§3A",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, rule)
        bounds = section(text, "## Bounds")
        self.assertIn("AskRigor keeps its own source-access, privacy, and zero-spend rules", bounds)
        for body in (rule, bounds):
            self.assertNotIn("Bright Data", body)
            self.assertNotIn("bdata", body)
        self.assertIn("`ASSISTANT_INFERENCE`", section(text, "## Requirement-accretion declaration"))
        example = section(text, "## Example (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)")
        self.assertIn("500 credits", example)
        self.assertIn("4,000", example)
        self.assertIn("If the readout fails, or the deployment sets no thresholds", rule)
        self.assertIn("with the month's use read, go ahead without asking", rule)
        self.assertNotIn("returns 403 because the key lacks billing permission", example)

    def test_routes_and_captcha_scope(self) -> None:
        agents = AGENTS.read_text(encoding="utf-8")
        self.assertEqual(agents.splitlines().count(B1), 1)
        self.assertLess(agents.index("Claims about what ChatGPT, Claude, or Codex can do or did"), agents.index(B1))
        assist = ASSIST.read_text(encoding="utf-8")
        gate = assist.split("### 3A. Human-only browser gates", 1)[1].split("### 4.", 1)[0]
        self.assertIn("The worker must not solve or bypass CAPTCHAs itself", gate)
        self.assertIn(B2, gate)
        self.assertLess(gate.index("The worker must not solve or bypass CAPTCHAs itself"), gate.index(B2))
        index = INDEX.read_text(encoding="utf-8")
        entries = [line for line in index.splitlines() if "`patterns/web-data-provider-escalation.md` —" in line]
        self.assertEqual(len(entries), 1)

    def test_one_call_jobs_check_monthly_usage(self) -> None:
        rule = section(PATTERN.read_text(encoding="utf-8"), "## Rule")
        cost_gate = rule.split("4. **Ask the owner when it's costly.**", 1)[1].split("\n5. ", 1)[0]
        self.assertIn("Before every provider job, read the month's use", cost_gate)
        self.assertNotIn("beyond a few calls", cost_gate)

        cases = {case["id"]: case for case in json.loads(EVAL.read_text(encoding="utf-8"))["cases"]}
        for case_id in (
            "one-call-monthly-threshold",
            "one-call-free-allowance",
            "one-call-usage-unknown",
        ):
            with self.subTest(case_id=case_id):
                self.assertIn(case_id, cases)
                self.assertIn("one credit", cases[case_id]["task"])
                self.assertIn("Asks", cases[case_id]["expected"])

    def test_requirement_schema_and_owner_quote(self) -> None:
        record = json.loads(REQUIREMENT.read_text(encoding="utf-8"))
        reference = json.loads(REFERENCE.read_text(encoding="utf-8"))
        self.assertEqual(set(record), set(reference))
        for key in reference:
            with self.subTest(key=key):
                self.assertIsInstance(record[key], type(reference[key]))
        self.assertIn(
            "if it would be very costly to ask me (but not applying to AskRigor which has its own rules fo rthis)",
            " ".join(record["owner_corrections"]),
        )

    def test_requirement_preserves_every_job_readout(self) -> None:
        record = json.loads(REQUIREMENT.read_text(encoding="utf-8"))
        required = " ".join(record["required_behavior"])
        reviews = " ".join(record["review_changes"])
        regressions = set(record["regression"].split("; "))

        self.assertIn("Before every provider job, read the month's use", required)
        self.assertIn("the month's use before every provider job", reviews)
        self.assertIn("asks before any provider job", reviews)
        self.assertNotIn("larger jobs", reviews)
        self.assertNotIn("beyond a few calls", reviews)
        self.assertTrue({
            "one-call-monthly-threshold",
            "one-call-free-allowance",
            "one-call-usage-unknown",
        } <= regressions)

    def test_requirement_supersedes_obsolete_readout_uncertainty(self) -> None:
        record = json.loads(REQUIREMENT.read_text(encoding="utf-8"))
        historical_review = record["review_changes"][0]
        self.assertTrue(historical_review.startswith("SUPERSEDED"))
        for detail in ("UNCERTAIN", "bdata budget zones", "connector-only", "ask"):
            with self.subTest(detail=detail):
                self.assertIn(detail.casefold(), historical_review.casefold())

    def test_successful_provider_fixtures_read_usage_first(self) -> None:
        cases = {case["id"]: case for case in json.loads(EVAL.read_text(encoding="utf-8"))["cases"]}
        for case_id in (
            "blocked-public-forum-thread",
            "youtube-transcript-unit",
            "country-search",
            "retired-discover",
        ):
            with self.subTest(case_id=case_id):
                case = cases[case_id]
                self.assertIn("usage readout shows 100 credits", case["task"])
                self.assertTrue(case["expected"].startswith("Reads monthly usage, then"))

    def test_eval_fixture_cases(self) -> None:
        fixture = json.loads(EVAL.read_text(encoding="utf-8"))
        self.assertEqual(fixture["pattern"], "patterns/web-data-provider-escalation.md")
        cases = fixture["cases"]
        ids = [case["id"] for case in cases]
        self.assertGreaterEqual(len(cases), 13)
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue({"askrigor-excluded", "bulk-comments-ask", "owner-session-captcha"} <= set(ids))
        for case in cases:
            with self.subTest(case=case["id"]):
                self.assertTrue(case["expected"])
                self.assertTrue(case["mustNot"])

    def test_no_secrets_in_changed_sources(self) -> None:
        paths = (
            PATTERN,
            AGENTS,
            ASSIST,
            INDEX,
            ROOT / "patterns" / "logic-failure-map.md",
            REQUIREMENT,
            EVAL,
        )
        for path in paths:
            text = path.read_text(encoding="utf-8")
            with self.subTest(path=path.name):
                self.assertNotIn("brd-" + "customer-", text)
                self.assertIsNone(re.search(r"Bearer\s+\S{16,}", text))
                self.assertIsNone(re.search(r"token=[A-Za-z0-9]{16,}", text))


if __name__ == "__main__":
    unittest.main()
