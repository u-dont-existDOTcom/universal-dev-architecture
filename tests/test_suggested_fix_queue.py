from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from tests.root_migration_assertions import assert_routed_rule


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "suggested-fix-queue.md"
LANES = ROOT / "suggested-fixes"
README = LANES / "README.md"
REQUIREMENT = ROOT / "docs" / "requirements" / "2026-09-30-suggested-fix-lanes.owner-requirement.json"
HEADER_FIELDS = ("For", "Filed", "From", "Owner request", "Existing pull request", "Supersedes")
SECTIONS = ("## What to do", "## Why", "## Check first")
ITEM_NAME = re.compile(r"^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$")
BOOTSTRAP_TEMPLATES = (
    "AGENTS-UNIVERSAL-BOOTSTRAP.md",
    "AGENTS-CODEX.md",
    "PROJECT-AGENTS.md",
)


def lane_items() -> list[Path]:
    return sorted(path for path in LANES.glob("*/*.md"))


class SuggestedFixQueueTests(unittest.TestCase):
    def test_every_uda_project_has_a_lane_before_its_first_item(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "Every project that uses this architecture's rules has a lane here",
            "Its folder is created when the first item is filed.",
            "whether or not the folder exists yet",
            "No folder means no items are waiting.",
            "unless its agents load this repository's root `AGENTS.md` every turn",
            "When a project starts using these rules, the agent carrying them in adds the wiring section",
            "one pull request adds only that section to its `AGENTS.md`",
            "because an unwired project cannot read its lane",
            "The exceptions are the one-time wiring pull request in step 7 and the `uda-lane` pull-request route in step 9.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, pattern)

    def test_root_bootstrap_templates_carry_the_complete_readme_wiring(self) -> None:
        readme = README.read_text(encoding="utf-8")
        wiring = re.search(
            r"```markdown\n(## Suggested fixes from other projects\n.*?)\n```",
            readme, re.DOTALL,
        )
        self.assertIsNotNone(wiring, "The README wiring section is missing")
        section = wiring.group(1)
        self.assertIn("`suggested-fixes/<repository>/` on its default branch", section)
        self.assertIn("Check it even if its folder does not exist yet", section)
        for name in BOOTSTRAP_TEMPLATES:
            with self.subTest(template=name):
                text = (ROOT / "templates" / name).read_text(encoding="utf-8")
                self.assertEqual(text.count("## Suggested fixes from other projects"), 1)
                self.assertIn(section + "\n", text)

    def test_carrying_uda_adds_wiring_at_project_adoption(self) -> None:
        text = (ROOT / "patterns" / "carrying-uda-into-standalone-projects.md").read_text(encoding="utf-8")
        for phrase in (
            "When a project starts using these rules, the agent carrying them in adds the suggested-fix wiring section",
            "from `suggested-fixes/README.md` to its `AGENTS.md`",
            "replacing `<repository>` with the project's name",
            "unless its agents load this repository's root `AGENTS.md` every turn",
            "`patterns/suggested-fix-queue.md`, step 7",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_readme_distinguishes_lanes_from_wired_projects(self) -> None:
        text = README.read_text(encoding="utf-8")
        for phrase in (
            "Every project that uses this architecture's rules has a lane here",
            "is created when the first item is filed",
            "whether or not its folder exists yet",
            "The table lists the projects whose agents are wired to check their lanes",
            "When a project starts using these rules, the agent carrying them in adds this section",
            "one pull request there adding only this section",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_universal_lane_requirement_preserves_second_owner_request(self) -> None:
        path = ROOT / "docs" / "requirements" / "2026-10-07-uda-lane-handoff.owner-requirement.json"
        data = json.loads(path.read_text(encoding="utf-8"))["second_owner_request"]
        self.assertEqual(data["date"], "2026-10-07")
        self.assertEqual(data["owner_statement"], "can we universalize this fix so that any project that's using UDA rules has a lane for suggestions from elsewhere that it checks?")
        self.assertEqual(data["origin"]["classification"], "OWNER")
        self.assertTrue(data["required_behavior"])

    def test_pattern_states_filing_checking_deciding_recording_and_wiring(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "`suggested-fixes/<repository>/`",
            "It does not open a pull request in the project or give the owner a file to relay.",
            "**Public by default.**",
            "reads its lane before starting other fixes in that project, once per work session",
            "adopts it, adapts it, declines it with a reason, defers it until a named trigger, or puts a question with the tradeoffs on its owner questions page",
            "Items are advice, and the project's own authority decides.",
            "it asks the owner before declining or deferring it",
            "`docs/suggested-fixes-ledger.md`",
            "`patterns/carrying-uda-into-standalone-projects.md`",
            "**Wiring.**",
            "`suggested-fixes/<repository>/done/`",
            "A lane adds no authority and bypasses no gate.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_routes(self) -> None:
        assert_routed_rule(self, "patterns/suggested-fix-queue.md", (
            "Before other fixes in a project, read its lane in `suggested-fixes/`; file suggestions for other projects there, not as pull requests in them: `patterns/suggested-fix-queue.md`.",
        ), compact=True)
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        self.assertEqual(sum("`patterns/suggested-fix-queue.md` —" in line for line in index.splitlines()), 1)
        self.assertIn("`../patterns/suggested-fix-queue.md`", (ROOT / "docs" / "INDEX.md").read_text(encoding="utf-8"))
        failure_map = (ROOT / "patterns" / "logic-failure-map.md").read_text(encoding="utf-8")
        row = [line for line in failure_map.splitlines() if line.startswith("| LF-10.8 |")]
        self.assertEqual(len(row), 1)
        self.assertIn("`patterns/suggested-fix-queue.md`", row[0])

    def test_repository_changes_have_explicit_maintainer_handoff(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")
        step = next((line for line in pattern.splitlines()
                     if line.startswith("9. **Changes to this repository.**")), "")
        self.assertTrue(step, "The architecture maintainer handoff step is missing")
        for phrase in (
            "opens a pull request here (a draft is fine)",
            "adds the `uda-lane` label",
            "leaves one comment saying what remains",
            "The label hands the pull request to this repository's maintainer lane",
            "lists labeled pull requests at each of its check-ins, then reviews and merges them",
            "After handing over, the filing agent changes the pull request only if the maintainer asks.",
            "Chats, handoff folders and files are not a handoff channel.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, step)
        readme = README.read_text(encoding="utf-8")
        self.assertIn("Suggestions for this repository are pull requests here carrying the `uda-lane` label", readme)
        self.assertIn("[step 9 of the suggested-fix pattern](../patterns/suggested-fix-queue.md#rule)", readme)
        index_entry = next(line for line in (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8").splitlines()
                           if "`patterns/suggested-fix-queue.md` —" in line)
        self.assertIn("Changes to this repository are pull requests here labeled `uda-lane`.", index_entry)

    def test_filing_rule_routes_uda_to_pull_requests_instead_of_directory(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")
        filing = next(line for line in pattern.splitlines()
                      if line.startswith("2. **Filing.**"))
        for phrase in (
            "The exceptions are the one-time wiring pull request in step 7 and the `uda-lane` pull-request route in step 9.",
            "The latter replaces `suggested-fixes/universal-dev-architecture/`; do not file UDA suggestions in that directory.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, filing)
        self.assertNotIn("the only exception", filing)

    def test_maintainer_handoff_requirement_preserves_owner_provenance(self) -> None:
        requirement = ROOT / "docs" / "requirements" / "2026-10-07-uda-lane-handoff.owner-requirement.json"
        data = json.loads(requirement.read_text(encoding="utf-8"))
        self.assertEqual(data["owner_statement"], "you need to make sure that everyone knows how to send you theiir fix proposals because it seems like currently they don't understand.")
        self.assertEqual(data["origin"]["classification"], "OWNER")
        self.assertIn(f"`docs/requirements/{requirement.name}`", PATTERN.read_text(encoding="utf-8"))
        self.assertTrue(data["nonclaims"])

    def test_readme_lists_every_lane_and_carries_the_wiring_section(self) -> None:
        readme = README.read_text(encoding="utf-8")
        lanes = sorted(path.name for path in LANES.iterdir() if path.is_dir())
        self.assertTrue(lanes)
        for lane in lanes:
            with self.subTest(lane=lane):
                self.assertIn(f"| `{lane}/` | `u-dont-existDOTcom/{lane}` |", readme)
        for phrase in (
            "## Suggested fixes from other projects",
            "`suggested-fixes/<repository>/` on its default branch",
            "`docs/suggested-fixes-ledger.md`",
            "an item marked as an owner request goes to the owner before you decline or defer it",
            "`patterns/suggested-fix-queue.md` in that repository",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, readme)

    def test_every_item_follows_the_format(self) -> None:
        items = lane_items()
        self.assertTrue(items)
        for path in items:
            with self.subTest(item=str(path.relative_to(ROOT))):
                self.assertRegex(path.name, ITEM_NAME)
                text = path.read_text(encoding="utf-8")
                self.assertTrue(text.startswith("# "))
                head = text.split("\n## ", 1)[0]
                for field in HEADER_FIELDS:
                    self.assertRegex(head, re.compile(rf"(?m)^- {re.escape(field)}: \S"))
                target = re.search(r"(?m)^- For: `([^`]+)`$", head)
                self.assertIsNotNone(target)
                self.assertEqual(target.group(1), f"u-dont-existDOTcom/{path.parent.name}")
                self.assertRegex(head, re.compile(r"(?m)^- Owner request: (yes|no)\b"))
                positions = [text.find(section + "\n") for section in SECTIONS]
                self.assertNotIn(-1, positions)
                self.assertEqual(positions, sorted(positions))
                self.assertNotIn("claude.ai/chat", text)
                self.assertNotIn("chatgpt.com/c/", text)

    def test_requirement_quotes_the_owner(self) -> None:
        data = json.loads(REQUIREMENT.read_text(encoding="utf-8"))
        self.assertEqual(data["requirement_id"], "2026-09-30-suggested-fix-lanes")
        self.assertIn("suggested fix queue", data["owner_statement"])
        self.assertIn("you don't have to update all the projects you don't work on, just UDA", data["owner_statement"])
        self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
        for surface in data["execution_surfaces"]:
            if surface["disposition"] in {"DEFERRED", "NOT_APPLICABLE", "QUEUED"}:
                with self.subTest(surface=surface["surface"]):
                    self.assertTrue(surface.get("reason"))
        self.assertNotIn("LIVE_VERIFIED", data["learning_state_at_merge"])
        self.assertTrue(data["nonclaims"])


if __name__ == "__main__":
    unittest.main()
