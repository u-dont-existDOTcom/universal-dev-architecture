from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import portable_checks  # noqa: E402

PACK = ROOT / "portable" / "claim-integrity" / "CHECKS.md"


class PortableChecksTests(unittest.TestCase):
    def test_ledger_matches_the_packs(self) -> None:
        ledger = portable_checks.load_ledger()
        self.assertEqual(ledger["status"], "DEVELOPMENT_SIDE_TRANSFER_LEDGER_NOT_RUNTIME_DEPENDENCY")
        self.assertEqual(portable_checks.validate(ledger), [])

    def test_pack_ids_and_applicability(self) -> None:
        checks = portable_checks.parse_checks(PACK)
        self.assertEqual(
            list(checks),
            ["CI-01", "CI-02", "CI-03", "CI-04", "CI-05", "CI-06", "CI-07", "CI-08", "CI-09", "CI-10", "CI-X1"],
        )
        self.assertIn("research verdicts only", checks["CI-X1"]["applies_to"])
        self.assertIn("Never to conversational, companion, or therapeutic replies", checks["CI-X1"]["applies_to"])
        for check_id, check in checks.items():
            with self.subTest(check=check_id):
                self.assertTrue(check["applies_to"])

    def test_pack_is_portable_and_self_contained(self) -> None:
        text = PACK.read_text(encoding="utf-8")
        self.assertIn("Nothing here requires reading this repository at runtime.", text)
        self.assertIn("never blocks delivery", text)
        for pattern in (r"/home/", r"[\w.+-]+@[\w-]+\.[\w.]+", r"\bJoel\b", r"u-dont-exist"):
            with self.subTest(pattern=pattern):
                self.assertIsNone(re.search(pattern, text))

    def test_validate_rejects_a_stale_digest_and_a_missing_disposition(self) -> None:
        ledger = json.loads(json.dumps(portable_checks.load_ledger()))
        ledger["packs"]["claim-integrity"]["sha256"] = "0" * 64
        ledger["projects"].append({
            "repository": "example/product",
            "visibility": "public",
            "product_types": ["research"],
            "pack": "claim-integrity",
            "pack_version": 1,
            "state": "PROPOSED",
            "evidence": "test",
            "checks": {"CI-01": {"disposition": "ADDED", "file": "RULES.md", "anchor": "rests on a passage"}},
        })
        errors = portable_checks.validate(ledger)
        self.assertTrue(any("sha256 does not match" in error for error in errors))
        self.assertTrue(any("no disposition for" in error for error in errors))

    def test_verify_project_finds_recorded_anchors(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "RULES.md").write_text("Every claim rests on a passage\nyou can point to.", encoding="utf-8")
            ledger = {"projects": [{
                "repository": "example/product",
                "checks": {
                    "CI-01": {"disposition": "ADDED", "file": "RULES.md", "anchor": "rests on a passage you can point to"},
                    "CI-02": {"disposition": "COVERED_BY_EXISTING", "file": "RULES.md", "anchor": "exact words only"},
                    "CI-X1": {"disposition": "NOT_APPLICABLE", "reason": "no verdicts"},
                },
            }]}
            problems = portable_checks.verify_project(ledger, "example/product", root)
        self.assertEqual(problems, ["example/product: CI-02 anchor not found in RULES.md"])

    def test_cli_validate_passes(self) -> None:
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "portable_checks.py"), "validate"],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["ok"], True)


if __name__ == "__main__":
    unittest.main()
