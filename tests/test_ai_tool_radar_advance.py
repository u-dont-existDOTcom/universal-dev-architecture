import importlib.util
from pathlib import Path
import unittest

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "ai_tool_radar_advance.py"
spec = importlib.util.spec_from_file_location("ai_tool_radar_advance", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
MANIFEST = module.load_manifest(Path(__file__).resolve().parents[1] / "roadmaps" / "ai-tool-radar.json")


def completed_issue(n, title, stage):
    return {"number": n, "state": "closed", "state_reason": "completed", "title": title,
            "body": "## Investigation result\nOutcome: PILOT\nEvidence: https://github.com/example/repo/blob/test/result.md\n", "html_url": f"https://github.com/example/repo/issues/{n}"}


class FakeGithub:
    def __init__(self):
        self.issues = {
            475: completed_issue(475, "Pilot OpenViking vs real GitHub+UDA retrieval baseline (zero-spend, shadow-only)", 1),
            477: {"number": 477, "state": "open", "state_reason": None,
                  "title": module.expected_title(MANIFEST["stages"][1], False),
                  "body": "<!-- AI_TOOL_RADAR_STAGE:2 -->"}
        }
        self.comments = {}
        self.actions = []

    def get_issue(self, number):
        self.actions.append(("get", number))
        return dict(self.issues[number])

    def set_title(self, number, title):
        self.actions.append(("title", number, title))
        self.issues[number]["title"] = title

    def list_comments(self, number):
        self.actions.append(("comments", number))
        return list(self.comments.get(number, []))

    def add_comment(self, number, body):
        self.actions.append(("comment", number))
        self.comments.setdefault(number, []).append({"body": body})


class QueueTests(unittest.TestCase):
    def test_manifest_stable_and_complete(self):
        self.assertEqual(len(MANIFEST["stages"]), 16)
        self.assertEqual(MANIFEST["stages"][0]["issue_number"], 475)
        self.assertEqual(MANIFEST["stages"][1]["issue_number"], 477)
        self.assertEqual(MANIFEST["stages"][-1]["issue_number"], 491)

    def test_activate_only_successor(self):
        db = FakeGithub()
        self.assertEqual(module.advance(475, MANIFEST, db), "Activated stage 2: issue #477")
        self.assertEqual(db.issues[477]["title"], module.expected_title(MANIFEST["stages"][1], True))
        self.assertEqual(len(db.comments[477]), 1)
        self.assertTrue(all(x[1] in (475, 477) for x in db.actions))

    def test_replay_is_idempotent(self):
        db = FakeGithub()
        module.advance(475, MANIFEST, db)
        module.advance(475, MANIFEST, db)
        self.assertEqual(len(db.comments[477]), 1)
        self.assertEqual(len([x for x in db.actions if x[0] == "title"]), 1)

    def test_no_evidence_no_advance(self):
        db = FakeGithub()
        db.issues[475]["body"] = "Outcome: PILOT\n"
        self.assertIn("receipt missing", module.advance(475, MANIFEST, db))
        self.assertFalse(any(x[0] == "title" for x in db.actions))

    def test_not_planned_does_not_advance(self):
        db = FakeGithub()
        db.issues[475]["state_reason"] = "not_planned"
        self.assertIn("No transition", module.advance(475, MANIFEST, db))

    def test_nonqueue_issues_have_no_effect(self):
        db = FakeGithub()
        self.assertEqual(module.advance(100, MANIFEST, db), "Ignored unrelated issue")
        self.assertEqual(db.actions, [])

    def test_wrong_issue_title_does_not_advance(self):
        db = FakeGithub()
        db.issues[477]["title"] = "Custom title"
        with self.assertRaises(module.QueueError):
            module.advance(475, MANIFEST, db)

    def test_queued_stage_closed_cannot_skip(self):
        db = FakeGithub()
        db.issues[477] = completed_issue(477, module.expected_title(MANIFEST["stages"][1], False), 2)
        self.assertIn("was not the active stage", module.advance(477, MANIFEST, db))

    def test_missing_marker_blocks(self):
        db = FakeGithub()
        db.issues[477]["body"] = "Body changed"
        with self.assertRaises(module.QueueError):
            module.advance(475, MANIFEST, db)

    def test_closed_successor_blocks(self):
        db = FakeGithub()
        db.issues[477]["state"] = "closed"
        with self.assertRaises(module.QueueError):
            module.advance(475, MANIFEST, db)


if __name__ == "__main__":
    unittest.main()

