from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]


class BrowserControlSurfacePreflightTests(unittest.TestCase):
    def test_owner_requirement_is_active(self):
        data = json.loads(
            (
                ROOT
                / "docs"
                / "requirements"
                / "2026-09-24-browser-control-surface-preflight.owner-requirement.json"
            ).read_text(encoding="utf-8")
        )
        self.assertEqual(data["status"], "ACTIVE_OWNER_REQUIREMENT")
        self.assertEqual(data["date"], "2026-09-24")
        self.assertIn("discover the current Chat browser/computer-control surfaces", data["normalized_rule"])
        self.assertIn("xdg-open/open/start failure", data["normalized_rule"])
        self.assertIn("irreducible human authentication/consent gesture", data["normalized_rule"])

    def test_root_bootstrap_forbids_shell_browser_false_negative(self):
        text = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        required = (
            "browser-surface preflight",
            "distinguish them from shell/process access",
            "A remote shell is not the user's graphical browser session",
            "Do not treat failure of shell launch helpers",
            "xdg-open",
            "evidence that browser control is unavailable",
            "Never substitute a shell URL-launch attempt",
            "current-turn browser-control discovery",
            "Before asking the owner to open a URL",
            "genuine human-only authentication",
            "pre-position the exact page",
            "resume automatically after the gate clears",
        )
        for fragment in required:
            with self.subTest(fragment=fragment):
                self.assertIn(fragment, text)


if __name__ == "__main__":
    unittest.main()
