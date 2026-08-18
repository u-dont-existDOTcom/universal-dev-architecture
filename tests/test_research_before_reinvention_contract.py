import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ResearchBeforeReinventionContractTests(unittest.TestCase):
    def read(self, rel):
        return (ROOT / rel).read_text(encoding="utf-8")

    def test_pattern_exists_and_has_core_dispositions(self):
        text = self.read("patterns/research-before-reinvention.md")
        for token in ("reuse", "adapt", "compose", "invent", "experiment"):
            self.assertIn(f"`{token}`", text)
        self.assertIn("independent conception snapshot", text.lower())
        self.assertIn("underlying problem", text.lower())
        self.assertIn("external baseline", text.lower())
        self.assertIn("research debt", text.lower())
        self.assertIn("durable prior-work ledger", text.lower())

    def test_scholarly_discovery_remains_specialist_layer(self):
        orchestration = self.read("patterns/research-before-reinvention.md")
        scholarly = self.read("patterns/existing-work-scan-and-scholarly-discovery.md")
        self.assertIn("patterns/existing-work-scan-and-scholarly-discovery.md", orchestration)
        self.assertIn("SciSpace", orchestration)
        self.assertIn("scholarly semantic", scholarly.lower())
        self.assertIn("primary", scholarly.lower())
        self.assertIn("authorial-flow", scholarly.lower())

    def test_agents_routes_triggered_work_to_pattern(self):
        text = self.read("AGENTS.md")
        self.assertIn("patterns/research-before-reinvention.md", text)
        self.assertIn("patterns/existing-work-scan-and-scholarly-discovery.md", text)
        self.assertIn("Before substantial investment", text)

    def test_exec_plan_has_gate_fields(self):
        text = self.read("templates/EXEC-PLAN.md")
        for field in (
            "Research-before-reinvention gate",
            "Applicability",
            "Independent conception snapshot",
            "Existing-work scan",
            "Disposition",
            "Novel remainder",
            "External baseline",
            "Research debt",
        ):
            self.assertIn(field, text)

    def test_codex_task_has_gate_fields(self):
        text = self.read("templates/CODEX-TASK.md")
        for field in (
            "Research-before-reinvention gate",
            "Applicability",
            "Independent conception snapshot",
            "Underlying-problem search formulations",
            "Existing-work map",
            "Disposition",
            "Novel remainder",
            "Strongest external baseline",
            "Research debt",
        ):
            self.assertIn(field, text)

    def test_lesson_index_docs_and_template_are_routed(self):
        index = self.read("LESSON-INDEX.md")
        docs = self.read("docs/INDEX.md")
        self.assertIn("patterns/research-before-reinvention.md", index)
        self.assertIn("patterns/existing-work-scan-and-scholarly-discovery.md", index)
        self.assertIn("templates/PRIOR-WORK-SCAN.md", index)
        self.assertIn("patterns/research-before-reinvention.md", docs)
        self.assertIn("templates/PRIOR-WORK-SCAN.md", docs)
        self.assertTrue((ROOT / "templates/PRIOR-WORK-SCAN.md").is_file())


if __name__ == "__main__":
    unittest.main()
