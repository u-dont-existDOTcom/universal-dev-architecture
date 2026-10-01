from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class ShoppingActivationProtocolTests(unittest.TestCase):
    def test_root_routes_shopping_to_live_index(self):
        text = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.assertIn("shopping routes through `LESSON-INDEX.md`", text)

    def test_shopping_protocol_activates_before_research_and_reactivates_after_correction(self):
        text = (ROOT / "patterns" / "shopping-research.md").read_text(encoding="utf-8")
        self.assertIn("### 0. Task-time activation and open-selection enforcement", text)
        self.assertIn("Before the first substantive product search", text)
        self.assertIn("shopping contract STALE", text)
        self.assertIn("coverage-before-depth-in-selection.md", text)

    def test_shopping_protocol_prevents_first_candidate_anchoring(self):
        text = (ROOT / "patterns" / "shopping-research.md").read_text(encoding="utf-8")
        self.assertIn("Breadth precedes depth", text)
        self.assertIn("Do not promote the first easy-to-verify", text)
        self.assertIn("benchmark, finalist, value leader, winner, or top pick", text)

    def test_us_consumer_goods_default_to_amazon_review_signal_when_available(self):
        shopping = (ROOT / "patterns" / "shopping-research.md").read_text(encoding="utf-8")
        preflight = (ROOT / "patterns" / "recommendation-preflight-integrity.md").read_text(encoding="utf-8")
        self.assertIn("Amazon.com", shopping)
        self.assertIn("default review-evidence source", shopping)
        self.assertIn("Amazon's current product star rating/count", preflight)
        self.assertIn("coverage_breadth          PASS", preflight)

    def test_every_recommended_offer_is_rechecked_at_exact_live_link(self):
        shopping = (ROOT / "patterns" / "shopping-research.md").read_text(encoding="utf-8")
        preflight = (ROOT / "patterns" / "recommendation-preflight-integrity.md").read_text(encoding="utf-8")
        self.assertIn("Immediately before recommending any owner-facing buy option", shopping)
        self.assertIn("open the exact offer URL", shopping)
        self.assertIn('"no longer available" pages', shopping)
        self.assertIn("exact_offer_live          PASS", preflight)

    def test_dead_top_offer_forces_alternate_seller_then_alternate_brand_search(self):
        shopping = (ROOT / "patterns" / "shopping-research.md").read_text(encoding="utf-8")
        preflight = (ROOT / "patterns" / "recommendation-preflight-integrity.md").read_text(encoding="utf-8")
        self.assertIn("continue the same shopping task automatically", shopping)
        self.assertIn("First search other legitimate sellers/channels for the same materially identical product", shopping)
        self.assertIn("broaden to materially equivalent brands/products", shopping)
        self.assertIn("continuation is mandatory within the authorized shopping scope", preflight)
        self.assertIn("it cannot remain a buy option or value winner", preflight)

    def test_search_result_or_manufacturer_page_cannot_substitute_for_orderability(self):
        preflight = (ROOT / "patterns" / "recommendation-preflight-integrity.md").read_text(encoding="utf-8")
        self.assertIn("Search snippets, cached cards, manufacturer/catalog pages without a purchase path", preflight)
        self.assertIn('sold-out or "no longer available" listings', preflight)

    def test_index_exposes_activation_details(self):
        text = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        self.assertIn("for open-ended/best-value searches enforce breadth-before-depth", text)
        self.assertIn("exact Amazon.com rating/count", text)

if __name__ == "__main__":
    unittest.main()
