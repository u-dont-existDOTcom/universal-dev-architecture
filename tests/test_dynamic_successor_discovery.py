from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class DynamicSuccessorDiscoveryTests(unittest.TestCase):
    def read(self, rel):
        return (ROOT / rel).read_text(encoding="utf-8")

    def test_pattern_requires_displacement_trigger_and_query_expansion(self):
        text = self.read("patterns/dynamic-successor-discovery-for-monitoring.md")
        self.assertIn("displacement trigger", text)
        self.assertIn("Replacement language", text)
        self.assertIn("Family/mechanism map", text)
        self.assertIn("Community migration", text)
        self.assertIn("Supply/implementation leads", text)
        self.assertIn("works like <old target>", text)
        self.assertIn("do not satisfy the monitor with exact-name searches", text)

    def test_pattern_preserves_identity_and_evidence_boundaries(self):
        text = self.read("patterns/dynamic-successor-discovery-for-monitoring.md")
        self.assertIn("marketing label", text)
        self.assertIn("identity confidence", text)
        self.assertIn("Never merge evidence across ambiguous identities", text)
        self.assertIn("seller/maintainer claims separate from independent reports", text)
        self.assertIn("conclusion-level deduplication", text)

    def test_pattern_is_routed_from_indexes(self):
        lesson_index = self.read("LESSON-INDEX.md")
        docs_index = self.read("docs/INDEX.md")
        path = "patterns/dynamic-successor-discovery-for-monitoring.md"
        self.assertIn(path, lesson_index)
        self.assertIn("../" + path, docs_index)

    def test_origin_records_the_exact_failure_class(self):
        text = self.read("patterns/dynamic-successor-discovery-for-monitoring.md")
        self.assertIn("SR-15099", text)
        self.assertIn("replacement-language search", text)
        self.assertIn("exact-entity watchlist", text)


if __name__ == "__main__":
    unittest.main()
