from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class ShoppingActivationProtocolTests(unittest.TestCase):
    def test_root_routes_shopping_before_substantive_search(self):
        text = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.assertIn("### Shopping task-time activation", text)
        self.assertIn("before the first substantive product search", text)
        self.assertIn("coverage-before-depth-in-selection.md", text)
        self.assertIn("contract **STALE**", text)

    def test_shopping_protocol_prevents_first_candidate_anchoring(self):
        text = (ROOT / "patterns" / "shopping-research.md").read_text(encoding="utf-8")
        self.assertIn("**breadth precedes depth**", text)
        self.assertIn("Do not promote the first easy-to-verify", text)
        self.assertIn("no candidate may be called a benchmark, winner, best value", text)

    def test_us_consumer_goods_default_to_amazon_review_signal_when_available(self):
        shopping = (ROOT / "patterns" / "shopping-research.md").read_text(encoding="utf-8")
        preflight = (ROOT / "patterns" / "recommendation-preflight-integrity.md").read_text(encoding="utf-8")
        self.assertIn("Amazon.com", shopping)
        self.assertIn("default review-evidence source", shopping)
        self.assertIn("Amazon's current product star rating/count", preflight)
        self.assertIn("coverage_breadth          PASS", preflight)

    def test_index_exposes_activation_details(self):
        text = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        self.assertIn("for open-ended/best-value searches enforce breadth-before-depth", text)
        self.assertIn("exact Amazon.com rating/count", text)

if __name__ == "__main__":
    unittest.main()
