import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "score_method_premise_eval.py"
KEY_PATH = ROOT / "evals" / "method-premise" / "blind-supervision-answer-key-v1.json"

spec = importlib.util.spec_from_file_location("score_method_premise_eval", SCRIPT)
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
score_predictions = module.score_predictions


def perfect_predictions(answer_key: dict) -> dict:
    return {
        "schema_version": 1,
        "candidate_head": "deadbeef",
        "method_cases": {
            case_id: {
                "gate_triggered": expected["triggered"],
                "necessity_state": expected["necessity_state"],
                "disposition": expected["disposition"],
                "owner_action": expected["owner_action"],
                "critical_reason": "frozen prediction rationale",
            }
            for case_id, expected in answer_key["method_cases"].items()
        },
        "activation_cases": {
            case_id: {
                "activation_status": expected["activation_status"],
                "critical_reason": "frozen prediction rationale",
            }
            for case_id, expected in answer_key["activation_cases"].items()
        },
    }


class MethodPremiseEvalScorerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.answer_key = json.loads(KEY_PATH.read_text(encoding="utf-8"))

    def test_perfect_prediction_strict_passes(self) -> None:
        result = score_predictions(perfect_predictions(self.answer_key), self.answer_key)
        self.assertTrue(result["strict_structured_pass"])
        self.assertEqual(result["method"]["exact"], result["method"]["total"])
        self.assertEqual(result["activation"]["exact"], result["activation"]["total"])
        self.assertEqual(result["owner_supervision"]["false_owner_interruptions"], 0)
        self.assertEqual(result["owner_supervision"]["missed_owner_decisions"], 0)
        self.assertTrue(result["semantic_rationale_review_required"])

    def test_unnecessary_owner_interruption_is_detected(self) -> None:
        predictions = perfect_predictions(self.answer_key)
        predictions["method_cases"]["CASE-A"]["owner_action"] = "DECISION_REQUIRED"
        result = score_predictions(predictions, self.answer_key)
        self.assertFalse(result["strict_structured_pass"])
        self.assertEqual(result["owner_supervision"]["false_owner_interruptions"], 1)

    def test_missed_real_owner_tradeoff_is_detected(self) -> None:
        predictions = perfect_predictions(self.answer_key)
        predictions["method_cases"]["CASE-G"]["owner_action"] = "NONE"
        result = score_predictions(predictions, self.answer_key)
        self.assertFalse(result["strict_structured_pass"])
        self.assertEqual(result["owner_supervision"]["missed_owner_decisions"], 1)

    def test_case_set_mismatch_fails_closed(self) -> None:
        predictions = perfect_predictions(self.answer_key)
        predictions["method_cases"].pop("CASE-A")
        with self.assertRaisesRegex(ValueError, "method case IDs"):
            score_predictions(predictions, self.answer_key)


if __name__ == "__main__":
    unittest.main()
