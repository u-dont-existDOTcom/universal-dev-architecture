"""Safety-layer cuts: write only what the task changes, never re-route cut content; routed, recorded and public-safe."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELATIVE = "patterns/safety-layer-cuts.md"
REQUIREMENT = "docs/requirements/2026-11-05-safety-layer-cuts.owner-requirement.json"
LANE_ITEM = "suggested-fixes/joel-articles/2026-11-05-safety-layer-cuts.md"
OWNER_STATEMENT = "look at the neuro-dearmor article lane's fix for guardrail issues and put that in so we don't have this issue in other lanes"


def read(relative):
    return (ROOT / relative).read_text(encoding="utf-8")


def section(text, heading):
    return text.split(f"## {heading}\n", 1)[1].split("\n## ", 1)[0]


class SafetyLayerCutsTests(unittest.TestCase):
    def setUp(self):
        self.pattern = read(RELATIVE)

    def test_the_six_steps(self):
        rule = section(self.pattern, "Rule")
        for phrase in (
            "1. **Write only what the task changes.**",
            "The measure is what the task needs, not what the safety layer lets through.",
            "2. **Point to text that stays the same.**",
            "3. **Copy the owner's text with a script.**",
            "The agent writes the script and the list of IDs, not the passages.",
            "4. **Keep sensitive passages out of replies.**",
            "5. **A cut is a boundary.**",
            "Don't retry the output that was cut.",
            "6. **What only the agent could write goes to the owner.**",
            "Leave those passages exactly as the owner wrote them",
            "The rest of the work goes on.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, rule)

    def test_re_routing_is_not_a_fix(self):
        not_a_fix = section(self.pattern, "Not a fix")
        for phrase in (
            "Each of these keeps the content and changes only how it gets out, which routes around the safety layer:",
            "writing the same content with a file-writing or other tool instead of in the reply. A tool call's input is the agent's output too.",
            "it doesn't make a file a way past a safety layer",
            "splitting the same content into smaller outputs so that none is cut;",
            "rewording, encoding or masking it so that it passes, including leaving its values as placeholders for a script to fill in;",
            "asking another model, agent or runtime to produce it.",
            "These keep the total and change only its packaging.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, not_a_fix)
        # The lane's file-tool route appears only as the quoted origin, never as advice.
        self.assertNotIn("quietly", self.pattern.split("## Origin evidence", 1)[0])

    def test_boundary_rules_it_relies_on_exist(self):
        for relative, phrase in (
            ("patterns/worker-self-remediation-before-owner-interruption.md", "### 5. Fail closed on genuine boundaries"),
            ("patterns/worker-self-remediation-before-owner-interruption.md", "disguise a denied action through another command or wrapper"),
            ("patterns/agent-completable-merge-gates.md", "**No bypass.**"),
            ("patterns/suggested-fix-queue.md", "do not retry the same content in another form or through another route"),
            ("patterns/editorial-authority-and-lossless-editing.md", "## Make every proposed edit operationally placeable"),
        ):
            with self.subTest(relative=relative, phrase=phrase):
                self.assertIn(relative, self.pattern)
                self.assertIn(phrase, read(relative))

    def test_routes(self):
        index = read("LESSON-INDEX.md")
        line = re.search(r"^89\. `patterns/safety-layer-cuts\.md` — (.*)$", index, re.M)
        self.assertIsNotNone(line)
        for phrase in ("When a safety layer cuts or refuses the agent's own output",
                       "never retry or re-route cut content (another tool, smaller pieces, rewording or masking, another model)",
                       "tell the owner what only the agent could have written"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, line[1])
        docs = read("docs/INDEX.md")
        self.assertIn("load `../patterns/safety-layer-cuts.md`", docs)
        self.assertIn("`requirements/2026-11-05-safety-layer-cuts.owner-requirement.json`", docs)
        failure_map = read("patterns/logic-failure-map.md")
        row = next(r for r in failure_map.splitlines() if r.startswith("| LF-6.9 |"))
        self.assertIn("A safety layer cuts the agent's output", row)
        self.assertIn("`patterns/safety-layer-cuts.md`", row)

    def test_coverage_entry(self):
        entries = json.loads(read("rules/rule-graph/enforcement-coverage.v1.json"))["entries"]
        entry = next(e for e in entries if e["id"] == RELATIVE)
        self.assertEqual("WORKFLOW_ONLY", entry["disposition"])
        self.assertEqual("INDEX_TRIGGER", entry["activation_route"]["kind"])
        line = re.search(r"^89\. `patterns/safety-layer-cuts\.md` — (.*)$", read("LESSON-INDEX.md"), re.M)[1]
        self.assertTrue(line.startswith(entry["activation_route"]["detail"]))
        self.assertIn({"path": "tests/test_safety_layer_cuts.py", "class": "TEXT_PRESENCE"}, entry["evidence"])
        self.assertIn(REQUIREMENT, entry["review_notes"])

    def test_requirement_record(self):
        record = json.loads(read(REQUIREMENT))
        self.assertEqual(OWNER_STATEMENT, record["owner_statement"])
        self.assertEqual("OWNER_REQUIRED", record["origin"]["classification"])
        self.assertEqual(3, len(record["lane_analysis"]["lane_fixes"]))
        not_adopted = " ".join(record["disposition"]["not_adopted"])
        self.assertIn("through the file tool instead of the reply", not_adopted)
        self.assertIn("smaller outputs so that none is cut", not_adopted)
        self.assertIn("routes around the safety layer", record["disposition"]["reason_not_adopted"])
        self.assertIn("named by block ID", " ".join(record["disposition"]["adopted"]))

    def test_originating_lane_is_told(self):
        item = read(LANE_ITEM)
        for phrase in ("- For: `u-dont-existDOTcom/joel-articles`",
                       "- Owner request: yes, 2026-11-05",
                       "Keep the first of your three fixes",
                       "writing verbatim dose passages through the file tool instead of the reply",
                       "splitting the same content into smaller outputs so that none is cut",
                       "`patterns/safety-layer-cuts.md`"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, item)

    def test_public_files_carry_no_amounts_or_private_locators(self):
        amount = re.compile(r"\d\s*(?:mg|mcg|µg|ug|g|kg|ml|mL|IU|drops?|sprays?)\b", re.I)
        private = re.compile(r"claude\.ai/|chatgpt\.com/|substack\.com|/home/|@[a-z0-9-]+\.[a-z]{2,}", re.I)
        for relative in (RELATIVE, REQUIREMENT, LANE_ITEM):
            text = read(relative)
            with self.subTest(relative=relative):
                self.assertIsNone(amount.search(text))
                self.assertIsNone(private.search(text))


if __name__ == "__main__":
    unittest.main()
