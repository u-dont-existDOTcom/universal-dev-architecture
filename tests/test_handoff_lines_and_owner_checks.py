"""The owner's handoff-line rules: a handoff line ends every reply, a new chat's first turn too (2026-11-08),
as one line where the resume line and the GH handoff line would link the same file (2026-11-27); and agents
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
                "handoff for his other account; a separate resume line comes just before it only when it names a local note updated "
                "this turn, such as one on his laptop, never a second GitHub link; a line that can't be saved says so instead of being "
                "left out; a self-contained answer, such as a translation, needs none: `patterns/cross-account-continuity.md` (rule 5), "
                "`patterns/owner-requested-terminal-github-handoff.md`.")
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
            "What the `GH handoff:` line links, and what it says when nothing can be verified, follow that pattern's rules 2 to 5.",
            "A self-contained answer, such as a translation or a quick fact, needs no line.",
        ):
            with self.subTest(phrase=phrase[:60]):
                self.assertIn(phrase, pattern)
        self.assertIn("which also ends every final answer in his project work (a new chat's first turn included): "
                      "as the `GH handoff:` line itself when it links the GitHub checkpoint, or just before that line when it names a local "
                      "note updated that turn, never two GitHub links.", index_entry(ACCOUNTS))
        docs = read("docs/INDEX.md")
        self.assertIn("ends with one GH handoff line, which is also the handoff for his other account (a separate resume line comes "
                      "before it only when it names a local note updated that turn, such as a laptop note, never a second GitHub link)", docs)


class OneHandoffLineTests(unittest.TestCase):
    """2026-11-27: a resume line and a GH handoff line that link the same file become one line."""

    def test_cross_account_rule_merges_the_lines(self):
        pattern = read(ACCOUNTS)
        for phrase in (
            f"On 2026-11-27 he reported the opposite problem (\"{ONE_LINE_STATEMENT}\")",
            "- **One line when the resume line links the GitHub checkpoint.** Then the resume line is the `GH handoff:` line",
            "`GH handoff: Continue my <work name> work: read <link to the checkpoint> — Next: <one specific safe action>` for open work; completed work uses that pattern's `Closed:` form (its rule 3).",
            "- **Two lines only for a local note.**",
            "which links the checkpoint as that pattern's rules 2 and 4 say (the note's GitHub copy when that copy is the checkpoint), naming a failed save in the same line.",
            # The first step goes in Next, and a failed local-note update is disclosed on the line.
            "Any step the next session takes first goes in its `Next`",
            "then the line also says the local note wasn't updated.",
            # An updated local note with no verifiable GitHub checkpoint keeps its line above the link-free GH handoff line.
            "When the note was updated but no GitHub checkpoint can be verified this turn, the resume line still comes first, and the `GH handoff:` line is that pattern's link-free line.",
            "A resume line never carries a second GitHub link.",
            "- **Never two lines that link the same file.**",
        ):
            with self.subTest(phrase=phrase[:60]):
                self.assertIn(phrase, pattern)
        self.assertNotIn("the line says so and names the Git checkpoint instead", pattern)
        # The GitHub-only example is itself the GH handoff line; the old example was a resume line linking the checkpoint.
        self.assertIn('ends with the one combined line: "GH handoff: Continue my <work name> work: read <link to the Git checkpoint> '
                      '— Next: <the checkpoint\'s next action>" while the work is open.', pattern)
        self.assertNotIn('"Continue my <work name> work: read <link to the Git checkpoint> and carry on from its next step', pattern)
        self.assertNotIn("START HERE", pattern)

    def test_gh_pattern_and_index_merge_the_lines(self):
        pattern = read(GH)
        for phrase in (
            f"**When the resume line itself links this checkpoint, it is this line (owner, 2026-11-27: \"{ONE_LINE_STATEMENT}\").**",
            "Write one line, `GH handoff: Continue my <work name> work: read <direct verified GitHub file URL> — Next: <one specific safe action>` ",
            "Never end with two GitHub links: a separate resume line stays only when it names a local note updated this turn, such as one on the owner's computer.",
            "(for a complete workstream, rule 3's `Closed:` form instead)",
            # The final check: a separate resume line only for a local note, and one GitHub link at most, on one line or two.
            "any separate resume line before it names only a local note updated this turn, never a GitHub file; the handoff ending (any resume line and the GH handoff line) carries at most one GitHub link, while citations and links earlier in the reply are unaffected;",
            "Since 2026-11-27 it carries one `GH handoff:` line, with a separate resume line only for a local note updated that turn (rule 2).",
        ):
            with self.subTest(phrase=phrase[:60]):
                self.assertIn(phrase, pattern)
        # Rules 3 to 5 (closing, which checkpoint, the link-free line) are unchanged by the 2026-11-27 change.
        main_rules = (
            "3. For a complete workstream, replace `Next` with a succinct `Closed:` disposition and point to the final verified artifact.",
            "4. The URL must identify the exact latest successfully saved and read-back checkpoint or, if no update succeeded, an existing verified checkpoint.",
            "**still end with a one-line truthful handoff**",
            "its link, if any, resolves to the read-back checkpoint;",
        )
        for phrase in main_rules:
            self.assertIn(phrase, pattern)
        self.assertIn("merged into one line when that resume line links the same checkpoint", index_entry(GH))
        self.assertTrue(index_entry(GH).split(" — ", 1)[1].startswith(coverage(GH)["activation_route"]["detail"]))

    def test_record(self):
        data = json.loads(read(ONE_LINE_RECORD))
        self.assertEqual(data["requirement_id"], "2026-11-27-one-handoff-line")
        self.assertEqual(data["owner_statement"], ONE_LINE_STATEMENT)
        self.assertIn("Completed work keeps rule 3's 'Closed:' form, unchanged.", data["required_behavior"][0])
        self.assertEqual(data["supersedes_in_part"]["requirement_id"], "2026-11-08-handoff-lines-in-new-chats")
        earlier = json.loads(read(LINES_RECORD))
        self.assertEqual(earlier["superseded_in_part_by"]["requirement_id"], "2026-11-27-one-handoff-line")
        scope = ("the two-line ending survives only when the resume line names a local note updated that turn; everywhere else one "
                 "line ends the reply: no two links to the same file and no two distinct GitHub links")
        self.assertIn(scope, data["supersedes_in_part"]["part"])
        self.assertEqual(scope, earlier["superseded_in_part_by"]["part"])
        standing = json.loads(read("docs/requirements/2026-11-03-github-handoff-standing.owner-requirement.json"))
        self.assertEqual(standing["superseded_in_part_by"]["requirement_id"], "2026-11-27-one-handoff-line")
        self.assertIn("not its standing activation", standing["superseded_in_part_by"]["part"])
        queued = [s["reason"] for s in data["execution_surfaces"] if s["disposition"] == "QUEUED"]
        self.assertTrue(queued and "a current owner or project requirement still wins on genuine conflict" in queued[0])
        self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
        self.assertNotIn("LIVE_VERIFIED", data["learning_state_at_merge"])
        self.assertTrue(data["nonclaims"])
        self.assertIn("`requirements/2026-11-27-one-handoff-line.owner-requirement.json`", read("docs/INDEX.md"))
        text = read(ONE_LINE_RECORD)
        self.assertNotRegex(text, r"(?i)claude\.ai/(?:chat|code)|chatgpt\.com|github\.com/")
        self.assertNotRegex(text, r"(?:^|[\s`(\"])(?:~?/home/|~/|[A-Za-z]:\\)")


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
