"""The owner's 2026-11-08 rules: both handoff lines end every reply, a new chat's first turn too; and agents
don't check for his merges and answers until he says when. Also the visual-joke rule carried from UDA pull
request 473. Text and routing only (WORKFLOW_ONLY)."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = "patterns/owner-says-when-to-check.md"
JOKES = "patterns/visual-joke-punchline-integrity.md"
GH = "patterns/owner-requested-terminal-github-handoff.md"
ACCOUNTS = "patterns/cross-account-continuity.md"
LINES_RECORD = "docs/requirements/2026-11-08-handoff-lines-in-new-chats.owner-requirement.json"
ONE_LINE_RECORD = "docs/requirements/2026-11-27-one-handoff-line.owner-requirement.json"
ONE_LINE_STATEMENT = "why am i getting two github handoff lines with every turn?"
CHECK_RECORD = "docs/requirements/2026-11-08-owner-says-when-to-check.owner-requirement.json"
LINES_STATEMENT = "new chats are still not giving me the account handoff line at the end for some reason"
CHECK_STATEMENT = ("also i don't understand why claude is always checking to see if i did a merge or if i answered "
                   "something in an artifact, i can just tell it when to check")


def read(relative):
    return (ROOT / relative).read_text(encoding="utf-8")


def index_entry(relative):
    lines = [line for line in read("LESSON-INDEX.md").splitlines() if f"`{relative}` —" in line]
    assert len(lines) == 1, (relative, len(lines))
    return lines[0]


def coverage(relative):
    data = json.loads(read("rules/rule-graph/enforcement-coverage.v1.json"))
    return next(e for e in data["entries"] if e["id"] == relative)


class HandoffLinesInNewChatsTests(unittest.TestCase):
    def test_root_carries_both_last_lines_with_the_other_every_turn_rules(self):
        agents = read("AGENTS.md")
        invariants = agents.split("## Per-turn bootstrap invariants\n", 1)[1].split("\n## ", 1)[0]
        line = ("**Last lines, every turn (owner, 2026-11-08 and 2026-11-27):** in this repository's owner's project work, every "
                "final answer, on a new chat's first turn too, ends with one `GH handoff:` line as the last line, which is also the "
                "resume instruction for his other account; a separate resume line comes just before it only when it points "
                "somewhere else, such as a note on his laptop, never to the same file; a line that can't be saved says so instead "
                "of being left out; a self-contained answer, such as a translation, needs none: "
                "`patterns/cross-account-continuity.md` (rule 5), `patterns/owner-requested-terminal-github-handoff.md`.")
        self.assertEqual(invariants.count(line), 1)
        # The root still sends task rules to patterns; this is a per-turn output rule, like the timestamp.
        self.assertIn("a new task rule adds a pattern and an index entry, never a root line.", agents)

    def test_a_new_chats_first_turn_counts_for_the_gh_line(self):
        pattern = read(GH)
        for phrase in (
            f"and on 2026-11-08 (\"{LINES_STATEMENT}\")",
            "**A new chat's first turn counts.** A chat that changes, saves or plans project work starts work that can go on "
            "in a later turn or in his other account, so its first reply ends with the line too.",
            "(for this owner, the account resume line of `patterns/cross-account-continuity.md`, rule 5)",
            "the line was reachable only through the lesson index, while the timestamp rule a reply opens with sits in root `AGENTS.md`",
        ):
            with self.subTest(phrase=phrase[:60]):
                self.assertIn(phrase, pattern)
        entry = index_entry(GH).split(" — ", 1)[1]
        self.assertIn("a new chat's first turn included (standing since 2026-10-26, confirmed 2026-11-03 and 2026-11-08)", entry)
        self.assertTrue(entry.startswith(coverage(GH)["activation_route"]["detail"]))

    def test_the_resume_line_ends_every_reply(self):
        pattern = read(ACCOUNTS)
        for phrase in (
            "5. **The resume line ends every reply, as one line where one will do (owner rule).**",
            f"(\"{LINES_STATEMENT}\")",
            "every final answer, a new chat's first turn included, ends like this:",
            "When nothing could be saved, the line says what wasn't saved and why.",
            "A self-contained answer, such as a translation or a quick fact, needs no line.",
        ):
            with self.subTest(phrase=phrase[:60]):
                self.assertIn(phrase, pattern)
        self.assertIn("which also ends every final answer in his project work (a new chat's first turn included): as the "
                      "`GH handoff:` line itself when it links the GitHub checkpoint, or just before that line when it points "
                      "somewhere else, never two lines to the same file.", index_entry(ACCOUNTS))
        self.assertIn("ends with one GH handoff line, which is also the account resume line", read("docs/INDEX.md"))


class OneHandoffLineTests(unittest.TestCase):
    """2026-11-27: a resume line and a GH handoff line that link the same file become one line."""

    def test_cross_account_rule_merges_the_lines(self):
        pattern = read(ACCOUNTS)
        for phrase in (
            f"On 2026-11-27 he reported the opposite problem (\"{ONE_LINE_STATEMENT}\")",
            "- **One line when the resume line links the GitHub checkpoint.** Then the resume line is the `GH handoff:` line",
            "`GH handoff: Continue my <work name> work: read <link to the checkpoint> and carry on from its next step.`",
            "Any step the next session takes first, such as applying an attached bundle, goes in the same line.",
            "- **Two lines only when they point to different places.**",
            "- **Never two lines that link the same file.**",
        ):
            with self.subTest(phrase=phrase[:60]):
                self.assertIn(phrase, pattern)
        self.assertNotIn("the line says so and names the Git checkpoint instead", pattern)

    def test_gh_pattern_and_index_merge_the_lines(self):
        pattern = read(GH)
        for phrase in (
            f"**When the resume line itself links this checkpoint, it is this line (owner, 2026-11-27: \"{ONE_LINE_STATEMENT}\").**",
            "Never end with two lines that link the same file.",
            "no line just before it links the same file;",
        ):
            with self.subTest(phrase=phrase[:60]):
                self.assertIn(phrase, pattern)
        self.assertIn("merged into one line when that resume line links the same checkpoint", index_entry(GH))
        self.assertTrue(index_entry(GH).split(" — ", 1)[1].startswith(coverage(GH)["activation_route"]["detail"]))

    def test_record(self):
        data = json.loads(read(ONE_LINE_RECORD))
        self.assertEqual(data["requirement_id"], "2026-11-27-one-handoff-line")
        self.assertEqual(data["owner_statement"], ONE_LINE_STATEMENT)
        self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
        self.assertNotIn("LIVE_VERIFIED", data["learning_state_at_merge"])
        self.assertTrue(data["nonclaims"])
        self.assertIn("`requirements/2026-11-27-one-handoff-line.owner-requirement.json`", read("docs/INDEX.md"))
        text = read(ONE_LINE_RECORD)
        self.assertNotRegex(text, r"(?i)claude\.ai/(?:chat|code)|chatgpt\.com|u-dont-exist|github\.com/|bad.trips")


class OwnerSaysWhenToCheckTests(unittest.TestCase):
    def setUp(self):
        self.pattern = read(CHECK)

    def test_rule(self):
        for phrase in (
            f"\"{CHECK_STATEMENT}\"",
            "1. **Don't check for the owner's own actions.** Unless he says he has done something or asks you to check, don't look "
            "whether he has merged, approved, answered or otherwise done what you asked of him",
            "Don't report that it hasn't happened yet either.",
            "2. **Check when he says.**",
            "check in that turn and act on what you find.",
            "3. **Say once what waits on him.**",
            "Don't ask again or check again each turn.",
            "4. **The mailbox keeps everything else.**",
            "Only the owner's own merges and answers leave it.",
            "An agent also still checks its own work: its own merges, an auto-merge it turned on, its own jobs.",
            "5. **Reading what the work needs is not checking on him.**",
            "It adds no gate and grants no authority.",
        ):
            with self.subTest(phrase=phrase[:60]):
                self.assertIn(phrase, self.pattern)

    def test_routing_and_pointers(self):
        entry = index_entry(CHECK)
        self.assertTrue(entry.startswith("92. `patterns/owner-says-when-to-check.md` — owner rule: When a turn starts"), entry)
        trigger = entry.split(" — ", 1)[1]
        item = coverage(CHECK)
        self.assertEqual("INDEX_TRIGGER", item["activation_route"]["kind"])
        self.assertTrue(trigger.startswith(item["activation_route"]["detail"]))
        self.assertEqual("WORKFLOW_ONLY", item["disposition"])
        self.assertIn("`../patterns/owner-says-when-to-check.md`", read("docs/INDEX.md"))
        pointers = {
            "patterns/suggested-fix-queue.md": "The owner's own merges and answers are not in the mailbox: he says when to check them",
            "patterns/short-lived-pull-requests.md": "A pull request waiting for the owner's merge is listed once as waiting for him",
            "patterns/owner-questions-page.md": "He says when he has answered on the page or in its artifact view; don't re-read them to look for answers",
        }
        for path, phrase in pointers.items():
            with self.subTest(path=path):
                text = read(path)
                self.assertIn(phrase, text)
                self.assertIn("(`patterns/owner-says-when-to-check.md`)", text)


class VisualJokeTests(unittest.TestCase):
    def test_rule_and_routing(self):
        pattern = read(JOKES)
        for phrase in (
            "**Do not overcomplete the joke.**",
            "If the gag still works when an explanatory caption is removed, remove it. Trust the picture.",
            "1. **Cold-view test:**",
            "2. **Caption-necessity test:**",
            "3. **Series distinctness test:**",
            "4. **Owner-brief test:**",
            "5. **Export test:**",
            "If any of tests 1 to 4 fails, revise the concept rather than adding explanation to compensate.",
            "If only test 5 fails, save the concept and its placement in the handoff; the concept stands.",
            "This rule is **not a ban on captions**.",
        ):
            with self.subTest(phrase=phrase[:60]):
                self.assertIn(phrase, pattern)
        entry = index_entry(JOKES)
        self.assertTrue(entry.startswith("91. `patterns/visual-joke-punchline-integrity.md` — When creating or revising memes"), entry)
        item = coverage(JOKES)
        self.assertTrue(entry.split(" — ", 1)[1].startswith(item["activation_route"]["detail"]))
        self.assertEqual("WORKFLOW_ONLY", item["disposition"])
        self.assertIn(f"- `{JOKES}` — specialist craft method", read("patterns/logic-failure-map.md"))


class RecordTests(unittest.TestCase):
    def test_records_quote_the_owner(self):
        for path, rid, statement in ((LINES_RECORD, "2026-11-08-handoff-lines-in-new-chats", LINES_STATEMENT),
                                     (CHECK_RECORD, "2026-11-08-owner-says-when-to-check", CHECK_STATEMENT)):
            with self.subTest(path=path):
                data = json.loads(read(path))
                self.assertEqual(data["requirement_id"], rid)
                self.assertEqual(data["owner_statement"], statement)
                self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
                for surface in data["execution_surfaces"]:
                    if surface["disposition"] == "QUEUED":
                        self.assertTrue(surface.get("reason"))
                self.assertNotIn("LIVE_VERIFIED", data["learning_state_at_merge"])
                self.assertTrue(data["nonclaims"])
                self.assertIn(f"`requirements/{rid}.owner-requirement.json`", read("docs/INDEX.md"))

    def test_no_private_locators(self):
        for path in (CHECK, LINES_RECORD, CHECK_RECORD):
            with self.subTest(path=path):
                text = read(path)
                self.assertNotRegex(text, r"(?i)claude\.ai/(?:chat|code)|chatgpt\.com|u-dont-exist|github\.com/")
                self.assertNotRegex(text, r"(?:^|[\s`(\"])(?:~?/home/|~/|[A-Za-z]:\\)")


if __name__ == "__main__":
    unittest.main()
