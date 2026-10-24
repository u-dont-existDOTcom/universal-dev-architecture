import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class ReviewControlsAssetTest(unittest.TestCase):
    def test_control_palette_is_paired(self):
        css=(ROOT/"templates/review-form-controls.css").read_text()
        for marker in ("textarea,select,option,optgroup", "color-scheme:only light", "color:#1f2937", "background-color:#ffffff", "-webkit-text-fill-color:#1f2937", "caret-color:#1f2937", "input::placeholder", "select option:checked", "forced-color-adjust:auto"):
            self.assertIn(marker,css)
    def test_existing_rule_routes_to_asset(self):
        rule=(ROOT/"patterns/owner-questions-page.md").read_text()
        self.assertIn("templates/review-form-controls.css",rule)
        self.assertIn("native dropdown options",rule.replace("selects/options/optgroups", "native dropdown options"))
if __name__=="__main__":unittest.main()
