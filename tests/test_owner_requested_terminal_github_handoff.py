"""The owner's GitHub handoff line: standing for his multi-turn work, routed from the index, and recorded."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELATIVE = "patterns/owner-requested-terminal-github-handoff.md"
REQUIREMENT = ROOT / "docs/requirements/2026-11-03-github-handoff-standing.owner-requirement.json"


def read(relative):
    return (ROOT / relative).read_text(encoding="utf-8")


class OwnerGitHubHandoffTests(unittest.TestCase):
    def setUp(self):
        self.pattern = read(RELATIVE)

    def test_activation_is_standing_for_this_owner(self):
        for phrase in (
            "**This owner's request is standing (owner rule).**",
            "continue and give me at the end of every turn a one-line github handoff in case chat is overflowed. make that a rule in UDA also",
            "make sure any prompt which is part of multiple turns will give me a one line GH handoff at the end",
            "the rule is active without a new request, in every workstream that loads UDA, for every final answer in work that spans more than one turn",
            "A self-contained one-turn answer, such as a translation or a quick fact, needs no line unless he asks for one.",
            "standing for this owner (see **Activation and authority**), conditional for anyone else",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.pattern)

    def test_the_line_is_last_and_after_any_local_resume_line(self):
        self.assertIn("**exactly one compact GH handoff line as the last nonblank line**", self.pattern)
        self.assertIn("and any local resume line the workstream also requires", self.pattern)
        self.assertIn("`GH handoff: [<plain-English checkpoint label>](<direct verified GitHub file URL>) — Next: <one specific safe action>`", self.pattern)
        self.assertIn("**still end with a one-line truthful handoff**", self.pattern)
        # The required line covers every activated workstream, not only one that already has a GitHub checkpoint.
        self.assertIn("in an activated workstream (for this owner, any work that spans more than one turn, whether or not it already has a GitHub checkpoint)", self.pattern)
        self.assertNotIn("in an activated, ongoing GitHub-backed workstream", self.pattern)
        self.assertIn("including in work that has no GitHub checkpoint yet and no authorized repository to save one in", self.pattern)

    def test_index_entry_is_a_standing_owner_trigger(self):
        entry = [line for line in read("LESSON-INDEX.md").splitlines() if f"`{RELATIVE}` —" in line]
        self.assertEqual(len(entry), 1)
        trigger = entry[0].split(" — ", 1)[1]
        self.assertTrue(trigger.startswith("owner rule: For every final answer in this owner's work that spans more than one turn"), trigger)
        self.assertNotIn("Applies only on owner opt-in", trigger)
        self.assertIn("after any local resume line", trigger)
        coverage = json.loads(read("rules/rule-graph/enforcement-coverage.v1.json"))
        item = next(e for e in coverage["entries"] if e["id"] == RELATIVE)
        self.assertEqual("INDEX_TRIGGER", item["activation_route"]["kind"])
        self.assertTrue(trigger.startswith(item["activation_route"]["detail"]))
        self.assertEqual("WORKFLOW_ONLY", item["disposition"])
        self.assertIn("`../patterns/owner-requested-terminal-github-handoff.md`", read("docs/INDEX.md"))

    def test_requirement_quotes_the_owner(self):
        data = json.loads(REQUIREMENT.read_text(encoding="utf-8"))
        self.assertEqual(data["requirement_id"], "2026-11-03-github-handoff-standing")
        self.assertEqual(data["owner_statement"], "and make sure any prompt which is part of multiple turns will give me a one line GH handoff at the end")
        self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
        self.assertIn("2026-10-26", [s["date"] for s in data["earlier_statements"]])
        for surface in data["execution_surfaces"]:
            if surface["disposition"] == "QUEUED":
                with self.subTest(surface=surface["surface"]):
                    self.assertTrue(surface.get("reason"))
        self.assertNotIn("LIVE_VERIFIED", data["learning_state_at_merge"])
        self.assertTrue(data["nonclaims"])
        self.assertIn("`requirements/2026-11-03-github-handoff-standing.owner-requirement.json`", read("docs/INDEX.md"))

    def test_no_private_locators(self):
        for text in (self.pattern, REQUIREMENT.read_text(encoding="utf-8")):
            self.assertNotRegex(text, r"(?i)claude\.ai/(?:chat|code)|chatgpt\.com|u-dont-exist|github\.com/")
            self.assertNotRegex(text, r"(?:^|[\s`(])(?:~?/home/|[A-Za-z]:\\)")


if __name__ == "__main__":
    unittest.main()
