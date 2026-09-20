from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]
PATTERN = "patterns/functional-neighborhood-discovery-for-monitoring.md"


class FunctionalNeighborhoodDiscoveryTests(unittest.TestCase):
    def read(self, rel):
        return (ROOT / rel).read_text(encoding="utf-8")

    def test_owner_requirement_generalizes_beyond_displacement(self):
        data = json.loads(
            self.read("docs/requirements/2026-09-20-functional-neighborhood-monitoring.owner-requirement.json")
        )
        self.assertEqual(data["status"], "ACTIVE_OWNER_REQUIREMENT")
        self.assertIn("effective, more effective", data["owner_correction"])
        self.assertIn("useful as an adjunct", data["owner_correction"])
        self.assertIn("regardless", data["causal_failure"])

    def test_pattern_monitors_function_not_only_entity(self):
        text = self.read(PATTERN)
        self.assertIn("anchor into a function/outcome space", text)
        self.assertIn("does **not** require a ban", text)
        self.assertIn("Equivalent or superior alternatives", text)
        self.assertIn("Adjuncts and complements", text)
        self.assertIn("Different-mechanism solutions", text)
        self.assertIn("The sixth direction is a subset of the general rule", text)
    def test_pattern_preserves_identity_and_evidence_boundaries(self):
        text = self.read(PATTERN)
        self.assertIn("marketing label", text)
        self.assertIn("identity confidence", text)
        self.assertIn("seller/maintainer claims as discovery leads", text)
        self.assertIn("conclusion-level deduplication", text)
        self.assertIn("This is a recall correction", text)

    def test_pattern_is_routed_from_indexes(self):
        lesson_index = self.read("LESSON-INDEX.md")
        docs_index = self.read("docs/INDEX.md")
        self.assertIn(PATTERN, lesson_index)
        self.assertIn("../" + PATTERN, docs_index)

    def test_old_successor_path_is_only_compatibility_stub(self):
        text = self.read("patterns/dynamic-successor-discovery-for-monitoring.md")
        self.assertIn("Superseded path", text)
        self.assertIn(PATTERN, text)
        self.assertIn("one subset", text)

    def test_origin_records_both_failure_layers(self):
        text = self.read(PATTERN)
        self.assertIn("SR-15099", text)
        self.assertIn("first repair", text)
        self.assertIn("as effective, more effective, or a useful adjunct", text)


if __name__ == "__main__":
    unittest.main()
