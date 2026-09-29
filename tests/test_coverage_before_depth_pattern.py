from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "coverage-before-depth-in-selection.md"
AUDIT = ROOT / "audits" / "2026-08-21-askrigor-coverage-before-depth-promotion.md"


class CoverageBeforeDepthPatternTests(unittest.TestCase):
    def read(self, relative_path: str) -> str:
        return (ROOT / relative_path).read_text(encoding="utf-8")

    def test_index_and_docs_route_broad_landscape_synthesis(self) -> None:
        for relative_path in ("LESSON-INDEX.md", "docs/INDEX.md"):
            with self.subTest(path=relative_path):
                text = self.read(relative_path)
                self.assertIn("patterns/coverage-before-depth-in-selection.md", text)
                self.assertIn("broad", text.lower())
                self.assertIn("synthesis", text.lower())

        index = self.read("LESSON-INDEX.md")
        self.assertIn(
            "audits/2026-08-21-askrigor-coverage-before-depth-promotion.md",
            index,
        )

    def test_pattern_separates_selection_coverage_from_audit_depth(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        required = (
            "Deep auditing cannot repair a narrow or redundant selection frame",
            "material class inventory",
            "candidate fingerprint",
            "uncovered material classes",
            "Missing fields remain unknown",
            "Breadth and depth are separate gates",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_pattern_requires_a_machine_checkable_synthesis_lock(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        for field in (
            "classes_discovered",
            "candidate_fingerprints",
            "candidates_screened",
            "selected_items",
            "fully_audited_items",
            "independent_source_pools",
            "uncovered_material_classes",
            "unresolved_material_hypotheses_from_all_batches",
            "fingerprints_without_required_follow_up",
            "further_expansion_likely_to_change_conclusion",
            "access_boundaries",
            "selection_coverage_lock",
            "per_item_depth_lock",
            "synthesis_lock",
        ):
            with self.subTest(field=field):
                self.assertIn(f"`{field}`", text)

        required_failures = (
            "a material class remains unsearched",
            "hypothesis from any discovery batch remains unresolved",
            "materially distinct available candidates remain unaudited",
            "the selected set remains concentrated in redundant fingerprints",
            "required outcome directions were not deliberately sought",
            "Do not emit a broad comparison, ranking, or decision synthesis",
        )
        for phrase in required_failures:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_pattern_derives_state_and_keeps_component_locks_separate(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "unique, internally valid linked",
            "structured domain fields",
            "instead of trusting a completeness boolean",
            "derive a stable signature",
            "Caller-chosen fingerprint IDs",
            "stable source identifiers tied to",
            "reciprocally link to its discovery batch",
            "Invalid records must be returned",
            "confidence-changing, ranking-changing",
            "deterministic projections",
            "terminal, nonretryable",
            "accepted input and emitted output together",
            "selection_coverage_lock",
            "per_item_depth_lock",
            "overall `synthesis_lock`",
            "reconcile every material access boundary",
            "test each failure cause in isolation",
            "must compute the same ledger locally",
            "undeclared tool or silently waive the gate",
            "callable production",
            "maximum-sized accepted",
            "Caller assertion alone cannot waive",
            "regardless of a caller's",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_continuation_chain_requires_authenticated_state_and_cumulative_receipts(
        self,
    ) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")
        audit = AUDIT.read_text(encoding="utf-8")
        for phrase in (
            "authenticated opaque continuation cursor",
            "server-held continuation state",
            "caller-editable cursor",
            "a lone continued page",
            "chain started at the first page",
            "contiguous page or offset progression",
            "truthful cumulative receipts",
            "skipped page",
            "forged offset",
            "never combine old and restarted chain counts",
            "Skipped pages or forged offset",
            "Lone continued page presented as complete",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, pattern)

        for phrase in (
            "unsigned or caller-editable continuation state",
            "lone continued page",
            "truthful cumulative chain receipts",
        ):
            with self.subTest(audit_phrase=phrase):
                self.assertIn(phrase, audit)

    def test_caller_scope_labels_cannot_deactivate_structural_coverage(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")
        audit = AUDIT.read_text(encoding="utf-8")
        for phrase in (
            "Caller-supplied corpus-size or scope labels",
            "cannot deactivate hard structural coverage conditions",
            "derive applicability from the valid ledger",
            "apply the invariant unconditionally",
            "twenty or more valid candidates",
            "Small-corpus label contradicts the ledger",
            "Concentrated selection labeled narrow enough",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, pattern)

        for phrase in (
            "caller-supplied size or scope label",
            "twenty or more candidates",
            "concentrated selected set",
        ):
            with self.subTest(audit_phrase=phrase):
                self.assertIn(phrase, audit)

    def test_pattern_rejects_count_quotas_as_coverage_proof(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        self.assertIn("planning heuristics", text)
        self.assertIn("never proof of coverage", text)
        self.assertIn("Selection rank is not credibility", text)
        self.assertIn("does not prove semantic completeness or representativeness", text)

    def test_regressions_cover_redundancy_undercoverage_and_bounded_access(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        for case_name in (
            "Many audited items, one material class",
            "Two items presented as a broad audit",
            "Quota reached with uncovered classes",
            "Unresolved fingerprint from an earlier batch",
            "Renamed fingerprints presented as diversity",
            "Aggregate count without a candidate ledger",
            "Retryable boundary presented as completion",
            "Four sources repeat one fingerprint",
            "Unsupported nondecision waiver",
            "Live cursor labeled terminal",
            "Class follow-up hides a fingerprint gap",
            "Receipt helper absent from production",
            "Maximum accepted request exceeds output transport",
            "Skipped pages or forged offset",
            "Lone continued page presented as complete",
            "Small-corpus label contradicts the ledger",
            "Concentrated selection labeled narrow enough",
            "Genuine access boundary",
            "Diverse bounded selection",
        ):
            with self.subTest(case=case_name):
                self.assertIn(case_name, text)

    def test_promotion_draft_is_fail_closed_until_askrigor_merge_receipts_exist(
        self,
    ) -> None:
        text = AUDIT.read_text(encoding="utf-8")
        self.assertIn("u-dont-existDOTcom/AskRigor", text)
        self.assertIn("raw chat", text)
        self.assertIn("individualized health content", text)
        self.assertIn("Disposition: `compose`", text)
        self.assertIn("does not prove", text)

        status = re.search(r"^Promotion status: `([^`]+)`$", text, re.MULTILINE)
        source_commit = re.search(
            r"^AskRigor source commit: `([^`]+)`$", text, re.MULTILINE
        )
        source_pr = re.search(
            r"^AskRigor pull request: `([^`]+)`$", text, re.MULTILINE
        )
        self.assertIsNotNone(status)
        self.assertIsNotNone(source_commit)
        self.assertIsNotNone(source_pr)

        assert status and source_commit and source_pr
        if source_commit.group(1) == "PENDING_ASKRIGOR_MERGE":
            self.assertIn("PENDING_ASKRIGOR_MERGE", text)
            self.assertEqual("provisional", status.group(1))
            self.assertEqual("PENDING_ASKRIGOR_MERGE", source_pr.group(1))
            self.assertRegex(
                text,
                r"must not be represented as a\s+completed AskRigor promotion",
            )
        else:
            self.assertEqual("promoted", status.group(1))
            self.assertNotIn("PENDING_ASKRIGOR_MERGE", text)
            self.assertRegex(source_commit.group(1), r"^[0-9a-f]{40}$")
            self.assertRegex(
                source_pr.group(1),
                r"^https://github\.com/u-dont-existDOTcom/AskRigor/pull/\d+$",
            )

    def test_promoted_audit_cannot_retain_provisional_routing_or_blocker(self) -> None:
        audit = AUDIT.read_text(encoding="utf-8")
        status = re.search(r"^Promotion status: `([^`]+)`$", audit, re.MULTILINE)
        self.assertIsNotNone(status)
        assert status
        if status.group(1) != "promoted":
            self.skipTest("promotion receipts are not complete yet")

        index = self.read("LESSON-INDEX.md")
        plan_candidates = (
            ROOT / "docs" / "exec-plans" / "active" / "2026-08-21-coverage-before-depth.md",
            ROOT / "docs" / "exec-plans" / "completed" / "2026-08-21-coverage-before-depth.md",
        )
        plans = [path for path in plan_candidates if path.is_file()]
        self.assertEqual(1, len(plans), "expected exactly one active-or-completed plan")
        plan = plans[0].read_text(encoding="utf-8")

        promoted_start = index.index("## Promoted tested implementation lessons")
        promotion_rule_start = index.index("## Promotion rule", promoted_start)
        promoted_section = index[promoted_start:promotion_rule_start]
        self.assertIn(AUDIT.relative_to(ROOT).as_posix(), promoted_section)
        self.assertNotIn("Provisional promotion audits", index)
        self.assertNotIn("remains explicitly provisional", index)
        self.assertNotIn("remaining provenance blocker", plan)

    def test_recovery_state_and_plan_preserve_the_active_completion_gate(self) -> None:
        state = self.read("state/CURRENT-STATE.md")
        for artifact in (
            "patterns/coverage-before-depth-in-selection.md",
            "audits/2026-08-21-askrigor-coverage-before-depth-promotion.md",
            "tests/test_coverage_before_depth_pattern.py",
        ):
            with self.subTest(artifact=artifact):
                self.assertIn(artifact, state)

        plan_candidates = (
            ROOT / "docs" / "exec-plans" / "active" / "2026-08-21-coverage-before-depth.md",
            ROOT / "docs" / "exec-plans" / "completed" / "2026-08-21-coverage-before-depth.md",
        )
        plans = [path for path in plan_candidates if path.is_file()]
        self.assertEqual(1, len(plans), "expected exactly one active-or-completed plan")
        plan = plans[0].read_text(encoding="utf-8")
        for phrase in (
            "Research-before-reinvention gate",
            "Disposition:** `compose`",
            "python3 -m unittest discover -s tests -v",
            "python3 scripts/audit_codex_github.py --root . --fail-on error",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, plan)

        audit = AUDIT.read_text(encoding="utf-8")
        if "Promotion status: `provisional`" in audit:
            self.assertIn("PENDING_ASKRIGOR_MERGE", plan)
            self.assertIn("PENDING_ASKRIGOR_MERGE", state)


if __name__ == "__main__":
    unittest.main()
