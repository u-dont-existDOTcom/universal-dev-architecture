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


RULE_PHRASES = (
    "1. **Write only what the task changes.**",
    "Before a long output that carries material a safety layer may treat as hazardous, such as drug doses, routes and combinations, and again after any cut, check how much of that material the task needs the agent to write.",
    "The measure is what the task needs, not what the safety layer lets through.",
    "2. **Point to text that stays the same.**",
    "3. **Copy the owner's text with a script.**",
    "The agent writes the script and the list of IDs, not the passages.",
    "After an edit, a script check confirms that every protected value still matches the master",
    "4. **Keep sensitive passages out of replies.**",
    "5. **A cut is a boundary.**",
    "Don't retry the output that was cut, and don't recreate it another way, including with a script that copies the same passages into it",
    "they are not a route for an output the safety layer has already cut.",
    "Record the cut in the work record: when, which output, and what was lost.",
    "Check what had already completed before the cut, such as files written and operations run, so nothing is done twice or left half-done.",
    "6. **The owner decides about what was cut.**",
    "Tell him plainly which output was cut and which passages it carried.",
    "Leave the passages exactly as the owner wrote them",
    "He can do that part himself, or change the task so that it no longer needs it.",
    "The rest of the work goes on, with steps 1 to 4.",
)


def missing_rule_phrases(rule):
    return [phrase for phrase in RULE_PHRASES if phrase not in rule]


class SafetyLayerCutsTests(unittest.TestCase):
    def setUp(self):
        self.pattern = read(RELATIVE)

    def test_the_six_steps(self):
        self.assertEqual([], missing_rule_phrases(section(self.pattern, "Rule")))

    def test_deleting_any_required_step_text_is_caught(self):
        rule = section(self.pattern, "Rule")
        for phrase in RULE_PHRASES:
            with self.subTest(phrase=phrase):
                self.assertEqual([phrase], missing_rule_phrases(rule.replace(phrase, "")))

    def test_a_cut_loses_the_output_not_finished_work(self):
        problem = section(self.pattern, "Problem")
        self.assertIn("The output it was writing is lost, while tool calls that had already finished may have taken effect.", problem)
        self.assertNotIn("the turn's work is lost", problem)

    def test_re_routing_is_not_a_fix(self):
        not_a_fix = section(self.pattern, "Not a fix")
        for phrase in (
            "Each of these keeps the content and changes only how it gets out, which routes around the safety layer:",
            "writing the same content with a file-writing or other tool instead of in the reply. A tool call's input is the agent's output too.",
            "it doesn't make a file a way past a safety layer",
            "splitting the same content into smaller outputs so that none is cut;",
            "having a script copy the same passages into the output that was cut, or into a new one that does the same job;",
            "rewording, encoding or masking it so that it passes, including leaving its values as placeholders for a script to fill in;",
            "asking another model, agent or runtime to produce it.",
            "The ways above keep the content and change only its packaging or its route.",
            "After a cut, what can change is whether that output is made at all, and that is the owner's decision.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, not_a_fix)
        # The lane's file-tool route appears only as the quoted origin, never as advice.
        self.assertNotIn("quietly", self.pattern.split("## Origin evidence", 1)[0])

    def test_scripted_copy_never_rebuilds_a_cut_output(self):
        # Codex's third review: step 3's scripted copy must not become a route for an output the layer cut.
        rule = section(self.pattern, "Rule")
        step3 = rule.split("3. **Copy the owner's text with a script.**", 1)[1].split("\n4. ", 1)[0]
        step5 = rule.split("5. **A cut is a boundary.**", 1)[1].split("\n6. ", 1)[0]
        self.assertIn("as they stand", step3)
        self.assertIn("including with a script that copies the same passages into it", step5)
        self.assertIn("steps 2 and 3 keep an output to what the task needs from the start", step5)
        self.assertNotIn("Then apply steps 1 to 4", step5)
        record = json.loads(read(REQUIREMENT))
        self.assertIn("or copied into that output by a script", record["required_behavior"][3])
        self.assertIn("they are not used to rebuild one that was cut", record["disposition"]["adopted"][0])
        self.assertIn("Use those scripts from the start of an output, not to rebuild one that was cut", read(LANE_ITEM))
        row = next(r for r in read("patterns/logic-failure-map.md").splitlines() if r.startswith("| LF-6.9 |"))
        self.assertIn("after a cut, the cut output goes to the owner", row)

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
                       "or before a long output that carries material such a layer may treat as hazardous (for example drug doses, routes and combinations)",
                       "never retry or re-route cut content (another tool, smaller pieces, rewording or masking, a script copying the same passages, another model)",
                       "leave what was cut to the owner"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, line[1])
        docs = read("docs/INDEX.md")
        self.assertIn("When a safety layer cuts or refuses the agent's own output, or before a long output carrying material such a layer may treat as hazardous, load `../patterns/safety-layer-cuts.md`", docs)
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
        # Both activations: after a cut, and before a long output that may be cut.
        self.assertTrue(entry["activation_route"]["detail"].endswith("or before a long output that carries material such a layer may treat as hazardous"))
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
        self.assertTrue(record["required_behavior"][0].startswith("Before a long output that carries material a safety layer may treat as hazardous, and after any cut"))

    def test_originating_lane_is_told(self):
        item = read(LANE_ITEM)
        # The item format requires this line (tests/test_suggested_fix_queue.py, patterns/suggested-fix-queue.md):
        # it names the target repository by its public GitHub path, as every item in suggested-fixes/ does.
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
