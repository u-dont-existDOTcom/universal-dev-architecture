import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class LongRangeResearchSurvivorTests(unittest.TestCase):
    def test_pattern_is_current_and_uses_live_routing_indirection(self):
        text=(ROOT/'patterns/long-range-research-mission-supervision.md').read_text()
        self.assertIn('current reusable extension', text)
        self.assertIn('patterns/reasoning-selection.md', text)
        self.assertIn('patterns/chat-work-execution-routing-threshold.md', text)
        self.assertIn('patterns/work-model-and-effort-routing.md', text)
        for stale in ['Pro and Extra High routing','Use Pro for','Use Extra High for','Codex tasks']:
            self.assertNotIn(stale, text)

    def test_research_mission_template_has_no_stale_model_default(self):
        data=json.loads((ROOT/'templates/RESEARCH-MISSION.json').read_text())
        for package in data.get('workPackages', []):
            self.assertNotEqual(package.get('workerClass'),'EXTRA_HIGH')
            self.assertNotEqual(package.get('reasoningTier'),'EXTRA_HIGH')
        self.assertTrue(data.get('completionClaimRule'))

    def test_addendum_preserves_parent_open_and_current_routing(self):
        text=(ROOT/'templates/CURRENT-CODEX-WORKER-SUPERVISION-RESEARCH-ADDENDUM.md').read_text()
        self.assertIn('SUBTASK_COMPLETE_PARENT_OPEN', text)
        self.assertIn('chat-work-execution-routing-threshold.md', text)
        self.assertIn('work-model-and-effort-routing.md', text)
        self.assertNotIn('owner or Pro decision needed', text)

    def test_indexes_and_interview_provenance_are_reachable(self):
        lesson=(ROOT/'LESSON-INDEX.md').read_text()
        docs=(ROOT/'docs/INDEX.md').read_text()
        templates=(ROOT/'templates/README.md').read_text()
        reasoning=(ROOT/'patterns/reasoning-selection.md').read_text()
        self.assertIn('patterns/human-readable-operational-references.md', lesson)
        self.assertIn('patterns/long-range-research-mission-supervision.md', lesson)
        self.assertIn('long-range-research-mission-supervision.md', docs)
        self.assertIn('RESEARCH-MISSION.json', templates)
        self.assertIn('2026-09-08-interview-evidence-information-gain.owner-requirement.json', reasoning)
        json.loads((ROOT/'docs/requirements/2026-09-08-interview-evidence-information-gain.owner-requirement.json').read_text())

if __name__ == '__main__':
    unittest.main()