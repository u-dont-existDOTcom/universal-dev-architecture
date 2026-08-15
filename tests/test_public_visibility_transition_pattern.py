from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "codex-github-operating-system.md"
AUDIT = ROOT / "audits" / "2026-08-14-inner-signal-publication-transition.md"


class PublicVisibilityTransitionPatternTests(unittest.TestCase):
    def test_pattern_treats_public_visibility_as_an_irreversible_disclosure_boundary(
        self,
    ) -> None:
        """Removing a disclosure gate must fail before a project makes itself public."""
        pattern = PATTERN.read_text(encoding="utf-8")
        match = re.search(
            r"(?ms)^### Public visibility transitions\s*$\n(?P<section>.*?)(?=^###? |\Z)",
            pattern,
        )
        self.assertIsNotNone(match, "missing Public visibility transitions section")

        section = match.group("section") if match else ""
        required = (
            "pre-disclosure audit",
            "all reachable refs and retained hosted surfaces",
            "visibility readback",
            "public copies cannot be retracted",
            "post-transition protected evidence pull request",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, section)

    def test_origin_audit_preserves_exact_transfer_provenance_and_limits(self) -> None:
        """Dropping source identity, tested controls, or limits must break promotion evidence."""
        self.assertTrue(AUDIT.is_file(), "missing Inner Signal publication audit")
        audit = AUDIT.read_text(encoding="utf-8") if AUDIT.is_file() else ""
        required = (
            "u-dont-existDOTcom/innerSignalGraph",
            "docs/PUBLIC-REPOSITORY-TRANSITION-REPORT-2026-08-14.md",
            "5ac4569c06ba2cf9507aada8121076ec0868aa113df600e9ddda8280f83e10fb",
            "855bdfab0b18327d320e703daf82903de65817e3",
            "https://github.com/u-dont-existDOTcom/innerSignalGraph/pull/6",
            "Hosted transition readback: `2026-08-15T03:52:03.707Z`",
            "tests/publication-audit.test.mjs",
            "100/100",
            "Gitleaks `8.29.1`",
            "e4eb209d04e20339d77122a3bdf9cd41351255cfb27ebcb75e85325e04f88924",
            "ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd",
            "Scanners reduce disclosure risk but cannot prove absence",
            "authenticated completeness",
            "Public copies remain outside repository control",
            "extends, and does not replace, the current public/high-risk baseline",
        )
        for item in required:
            with self.subTest(item=item):
                self.assertIn(item, audit)

    def test_origin_audit_does_not_promote_hashes_derived_from_raw_session_logs(
        self,
    ) -> None:
        """Reintroducing a raw-log-derived receipt must breach the promotion boundary."""
        audit = AUDIT.read_text(encoding="utf-8")
        match = re.search(
            r"(?ms)^- Hosted transition readback:.*?(?=\n\n)",
            audit,
        )
        self.assertIsNotNone(match, "missing hosted-transition evidence paragraph")
        paragraph = match.group(0) if match else ""
        self.assertRegex(
            paragraph,
            r"Raw session records and hashes derived from them\s+are excluded",
        )
        self.assertNotRegex(paragraph, r"\b[0-9a-f]{64}\b")

    def test_promotion_artifacts_contain_only_allowlisted_public_digests(self) -> None:
        """An extra 64-hex receipt must not preserve excluded session-derived data."""
        artifacts = "\n".join(
            path.read_text(encoding="utf-8") for path in (AUDIT, Path(__file__))
        )
        observed = set(re.findall(r"\b[0-9a-f]{64}\b", artifacts))
        allowed = {
            "5ac4569c06ba2cf9507aada8121076ec0868aa113df600e9ddda8280f83e10fb",
            "e4eb209d04e20339d77122a3bdf9cd41351255cfb27ebcb75e85325e04f88924",
        }
        self.assertEqual(0, len(allowed - observed), "a public source digest is missing")
        self.assertEqual(
            0,
            len(observed - allowed),
            "promotion artifacts contain an unexpected 64-hex digest",
        )


if __name__ == "__main__":
    unittest.main()
