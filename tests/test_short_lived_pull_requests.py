"""Short-lived pull requests: merge when the gates pass, fix conflicts yourself, close leftovers; routed and recorded."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELATIVE = "patterns/short-lived-pull-requests.md"
REQUIREMENT = "docs/requirements/2026-11-06-short-lived-pull-requests.owner-requirement.json"
LANES = ("AskRigor", "innerSignalGraph", "pangram-humanization-lab", "joel-articles", "humandesign")
OWNER_STATEMENT = ("the gut article humanization pr chat just told me that my prs keep conflicting everywhere because i don't have "
                   "a github robot to merge stuff automatically, i can't believe all this time i've never been able to get this "
                   "answer from your or gpt, can we then add that UDA or what")

RULE_PHRASES = (
    "1. **Merge when the gates pass.**",
    "A lane merges its own pull request in the turn its gates pass, under the authority it has for that repository",
    "the lane turns on auto-merge (`gh pr merge <number> --auto --squash`)",
    "That needs the repository to allow auto-merge, and its rules must enforce the gates",
    "When the gate is the owner's yes, the pull request is made ready first, up to date and free of conflicts, and auto-merge goes on right after his yes.",
    "2. **Conflicts are the lane's job.**",
    "the lane updates the branch from main and resolves the conflicts itself, keeping both sides' changes.",
    "It never hands a conflict to the owner.",
    "3. **No pull request sits.**",
    "gives each one an outcome: merge it, fix it or close it.",
    "A draft it won't finish, or one that another change replaced, is closed with one line saying why and what replaced it.",
    "A pull request open for more than a week has its reason and next step in the lane's handoff.",
    "4. **Keep off shared lines.**",
    "Prefer collision-free names, such as a date and a slug, to the next number in a sequence.",
    "Prefer counts computed by a script to counts kept by hand.",
    "When a repository's own rules make every change edit the same lines, the fix is to change the repository.",
    "5. **Start from current main.**",
)


def read(relative):
    return (ROOT / relative).read_text(encoding="utf-8")


def section(text, heading):
    return text.split(f"## {heading}\n", 1)[1].split("\n## ", 1)[0]


def missing_rule_phrases(rule):
    return [phrase for phrase in RULE_PHRASES if phrase not in rule]


def index_line():
    return re.search(r"^90\. `patterns/short-lived-pull-requests\.md` — (.*)$", read("LESSON-INDEX.md"), re.M)


class ShortLivedPullRequestTests(unittest.TestCase):
    def setUp(self):
        self.pattern = read(RELATIVE)

    def test_the_five_steps(self):
        self.assertEqual([], missing_rule_phrases(section(self.pattern, "Rule")))

    def test_deleting_any_required_step_text_is_caught(self):
        rule = section(self.pattern, "Rule")
        for phrase in RULE_PHRASES:
            with self.subTest(phrase=phrase):
                self.assertEqual([phrase], missing_rule_phrases(rule.replace(phrase, "")))

    def test_automation_is_not_sold_as_the_whole_fix(self):
        problem = section(self.pattern, "Problem")
        self.assertIn("There are three causes, and automation fixes one of them:", problem)
        for cause in ("1. **Waiting.**", "2. **Leftovers.**", "3. **Shared lines.**"):
            self.assertIn(cause, problem)
        github = section(self.pattern, "What GitHub offers")
        for phrase in ("available in public repositories on GitHub Free, and in private repositories on paid plans",
                       "GitHub offers it only in repositories owned by an organization",
                       "not in a personal account's repositories",
                       "It removes a pull request that has conflicts and does not resolve them.",
                       "Neither tool resolves a conflict."):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, github)

    def test_it_relies_on_existing_rules(self):
        for relative, phrase in (
            ("patterns/codex-github-operating-system.md", "Auto-merge is acceptable only after required checks and required review conditions are enforced."),
            ("patterns/agent-completable-merge-gates.md", "Hand the owner one pull request to merge, not several"),
            ("patterns/parallel-chat-write-isolation.md", "never let them share a mutable branch"),
        ):
            with self.subTest(relative=relative):
                self.assertIn(relative, self.pattern)
                self.assertIn(phrase, read(relative))

    def test_routes(self):
        line = index_line()
        self.assertIsNotNone(line)
        for phrase in ("When opening, finishing or handing off a pull request",
                       "at each turn's mailbox check of the lane's own open pull requests",
                       "auto-merge when a required check is still running",
                       "give every open pull request an outcome (merge, fix or close)"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, line[1])
        docs = read("docs/INDEX.md")
        self.assertIn("load `../patterns/short-lived-pull-requests.md`", docs)
        self.assertIn("`requirements/2026-11-06-short-lived-pull-requests.owner-requirement.json`", docs)
        row = next(r for r in read("patterns/logic-failure-map.md").splitlines() if r.startswith("| LF-10.9 |"))
        self.assertIn("`patterns/short-lived-pull-requests.md`", row)

    def test_coverage_entry(self):
        entries = json.loads(read("rules/rule-graph/enforcement-coverage.v1.json"))["entries"]
        entry = next(e for e in entries if e["id"] == RELATIVE)
        self.assertEqual("WORKFLOW_ONLY", entry["disposition"])
        self.assertTrue(index_line()[1].startswith(entry["activation_route"]["detail"]))
        self.assertIn({"path": "tests/test_short_lived_pull_requests.py", "class": "TEXT_PRESENCE"}, entry["evidence"])
        self.assertIn(REQUIREMENT, entry["review_notes"])

    def test_requirement_record(self):
        record = json.loads(read(REQUIREMENT))
        self.assertEqual(OWNER_STATEMENT, record["owner_statement"])
        self.assertTrue(record["claim_checked"]["verdict"].startswith("Partly right."))
        self.assertIn("neither auto-merge nor a merge queue resolves a conflict", record["claim_checked"]["verdict"])
        self.assertIn("waits for the owner's own word", record["origin"]["notes"])
        settings = next(s for s in record["execution_surfaces"] if s["surface"] == "The repositories' auto-merge setting")
        self.assertEqual("QUEUED", settings["disposition"])

    def test_each_lane_is_told(self):
        for lane in LANES:
            item = read(f"suggested-fixes/{lane}/2026-11-06-open-pull-request-outcomes.md")
            with self.subTest(lane=lane):
                # The item format requires this line (tests/test_suggested_fix_queue.py): the target's public GitHub path.
                self.assertIn(f"- For: `u-dont-existDOTcom/{lane}`\n", item)
                self.assertIn("- Owner request: yes, 2026-11-06", item)
                self.assertIn("`patterns/short-lived-pull-requests.md`", item)
                self.assertIn("at every turn's mailbox check (step 3)", item)
                self.assertIn("Closing is not deleting", item)

    def test_public_files_carry_no_private_locators(self):
        private = re.compile(r"claude\.ai/|chatgpt\.com/|/home/|atlas-ledger", re.I)
        for relative in (RELATIVE, REQUIREMENT) + tuple(f"suggested-fixes/{l}/2026-11-06-open-pull-request-outcomes.md" for l in LANES):
            with self.subTest(relative=relative):
                self.assertIsNone(private.search(read(relative)))


if __name__ == "__main__":
    unittest.main()
