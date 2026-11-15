"""Zero-network/zero-spend checks for owner-authorized $1 Jev evaluation."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "jev-budgeted-evaluator.py"
spec = importlib.util.spec_from_file_location("jev_budgeted_evaluator", SCRIPT)
jev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(jev)


class Response:
    status = 200

    def __init__(self, data):
        self.data = json.dumps(data).encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def read(self, count=None):
        return self.data if count is None else self.data[:count]


CATALOG = [
    {"id": "typesafe/jev-1.13",
     "endpoints": ["/api/alpha/decisions"],
     "pricing": {"prompt": "0.000000042"}},
    {"id": "typesafe/jev-1.14",
     "endpoints": ["/api/alpha/decisions"],
     "pricing": {"prompt": "0.000000042"}},
    {"id": "typesafe/jev-router",
     "endpoints": ["/api/v1/chat/completions"],
     "pricing": {"prompt": "0.1"}},
]
PACKET = {"case_id": "dmso-test", "request": {
    "model": "DONT_TRUST_PACKET_MODEL",
    "state": "A deidentified clinical evidence scenario.",
    "questions": {"claim_supported": {
        "type": "noul", "instructions": "Is there an unsupported claim?"
    }},
}}
MODELS = [
    {"id": "typesafe/jev-1.14", "sort_key": [1, 14], "price_usd_per_input_token": "0.000000042"},
    {"id": "typesafe/jev-1.13", "sort_key": [1, 13], "price_usd_per_input_token": "0.000000042"},
]


class Meter:
    def __init__(self, fail=False, key_remain=3.80):
        self.calls = []
        self.fail = fail
        self.key_remain = key_remain

    def __call__(self, req, timeout=12):
        self.calls.append((req.full_url, req.get_method()))
        if req.full_url == jev.CATALOG:
            return Response({"data": CATALOG})
        if req.full_url == jev.KEY_STATUS:
            return Response({"data": {"limit_remaining": self.key_remain}})
        if req.full_url == jev.DECISIONS:
            if self.fail:
                from urllib.error import HTTPError
                import io
                raise HTTPError(req.full_url, 402, "payment required", {},
                                io.BytesIO(b'{"error":{"metadata":{"limit_source":"openrouter_key_limit"}}}'))
            reqbody = json.loads(req.data)
            assert reqbody["model"] in ("typesafe/jev-1.13","typesafe/jev-1.14")
            assert reqbody["provider"] == {"allow_fallbacks": False}
            return Response({"id": "decision-0001-" + reqbody["model"],
                             "answers": {"claim_supported": {"noul": 0.92}},
                             "usage": {"cost": 0.000016}})
        raise AssertionError("Unexpected URL " + req.full_url)


class JevBudgetedEvaluatorTests(unittest.TestCase):
    def test_catalog_filter_finds_real_jev_versions_and_price(self):
        meter = Meter()
        models = jev.discover(opener=meter)
        self.assertEqual([r["id"] for r in models],
                         ["typesafe/jev-1.14", "typesafe/jev-1.13"])
        self.assertEqual(jev.latest_eligible(models)["id"], "typesafe/jev-1.14")
        self.assertEqual(meter.calls, [(jev.CATALOG, "GET")])

    def test_premium_new_version_does_not_auto_run(self):
        models = [dict(MODELS[0], price_usd_per_input_token="0.0000005")]
        with self.assertRaises(jev.Refused):
            jev.latest_eligible(models)

    def test_evaluation_without_key_never_calls_provider(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ, {}, clear=True):
            meter = Meter()
            result = jev.run([PACKET],Path(d)/"ledger.json",
                             models=MODELS,compare_legacy=True,opener=meter)
        self.assertEqual(result["status"],"BLOCKED_CREDENTIAL_UNAVAILABLE")
        self.assertEqual(result["new_provider_calls"],0)
        self.assertEqual(meter.calls, [])

    def test_live_shape_calls_new_version_first_and_caps_total(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(
                os.environ, {"OPENROUTER_API_KEY":"FAKE_TEST_KEY"}, clear=True):
            ledger_file = Path(d)/"ledger.json"
            meter = Meter()
            result = jev.run([PACKET],ledger_file,models=MODELS,
                             compare_legacy=True,opener=meter)
            self.assertEqual(result["status"], "DONE_BOUNDED")
            self.assertEqual(result["new_provider_calls"], 2)
            self.assertEqual([x["model"] for x in result["results"]],
                             ["typesafe/jev-1.14","typesafe/jev-1.13"])
            self.assertEqual(result["results"][0]["typed_answers"],
                             {"claim_supported":{"noul":.92}})
            self.assertEqual(meter.calls.count((jev.DECISIONS,"POST")),2)
            with jev.locked_ledger(ledger_file) as (state,save):
                self.assertEqual(state["cap_usd"],"1.00")
                self.assertEqual(len(state["entries"]),2)
                self.assertLessEqual(jev.committed_plus_reserved(state),jev.MAX_ADDITIONAL_USD)
                self.assertEqual(jev.committed_plus_reserved(state),jev.Decimal("0.000032"))
            # Repeating the same run is deduped; no new provider spending.
            count=len(meter.calls)
            again=jev.run([PACKET],ledger_file,models=MODELS,
                          compare_legacy=True,opener=meter)
            self.assertEqual(again["new_provider_calls"],0)
            self.assertEqual(len(meter.calls)-count,1)  # key metadata only

    def test_repeated_run_advances_to_new_cases_not_stuck_on_skipped_first_two(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(
                os.environ, {"OPENROUTER_API_KEY":"FAKE_TEST_KEY"}, clear=True):
            ledger_file=Path(d)/"ledger.json"
            meter=Meter()
            packets=[dict(PACKET, case_id=f"case-{i}") for i in range(4)]
            first=jev.run(packets,ledger_file,models=MODELS,opener=meter)
            self.assertEqual(first["new_provider_calls"],2)
            second=jev.run(packets,ledger_file,models=MODELS,opener=meter)
            self.assertEqual(second["new_provider_calls"],2)
            self.assertEqual(sum(x[1]=="POST" for x in meter.calls),4)
            with jev.locked_ledger(ledger_file) as (state, save):
                self.assertEqual(len(state["entries"]),4)

    def test_private_versioned_export_does_not_call_provider(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(
                os.environ, {"OPENROUTER_API_KEY":"FAKE_TEST_KEY"}, clear=True):
            ledger_path=Path(d)/"ledger.json"
            meter=Meter()
            run=jev.run([PACKET],ledger_path,models=MODELS,compare_legacy=True,opener=meter)
            self.assertEqual(run["new_provider_calls"],2)
            before=len(meter.calls)
            output=Path(d)/"jev-export.jsonl"
            result=jev.export_askrigor(ledger_path,output)
            self.assertEqual(result["provider_calls"],0)
            self.assertEqual(len(meter.calls),before)
            self.assertEqual(output.stat().st_mode & 0o777,0o600)
            entries=[json.loads(x) for x in output.read_text().splitlines()]
            self.assertEqual(len(entries),2)
            self.assertEqual({x["model_version"] for x in entries},
                             {"typesafe/jev-1.13","typesafe/jev-1.14"})
            self.assertEqual(entries[0]["flags"],["claim_supported"])
            self.assertNotIn("FAKE_TEST_KEY",output.read_text())
            with self.assertRaises(jev.Refused):
                jev.export_askrigor(ledger_path,output)

    def test_account_key_budget_blocked_before_paid_call(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(
                os.environ, {"OPENROUTER_API_KEY":"FAKE_TEST_KEY"},clear=True):
            meter = Meter(key_remain=0)
            with self.assertRaises(jev.Refused):
                jev.run([PACKET],Path(d)/"ledger.json",
                        models=MODELS,opener=meter)
            self.assertNotIn((jev.DECISIONS,"POST"),meter.calls)

    def test_http_402_stops_immediately_preserves_reserved_liability(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(
                os.environ, {"OPENROUTER_API_KEY":"FAKE_TEST_KEY"},clear=True):
            meter=Meter(fail=True)
            ledger_file=Path(d)/"ledger.json"
            result=jev.run([PACKET],ledger_file,
                           models=MODELS,compare_legacy=True,opener=meter)
            self.assertEqual(result["status"],"STOPPED_PROVIDER_FAILURE")
            self.assertEqual(result["new_provider_calls"],1)
            self.assertEqual(result["results"][0]["http_status"],402)
            self.assertEqual(meter.calls.count((jev.DECISIONS,"POST")),1)
            with jev.locked_ledger(ledger_file) as (state,save):
                self.assertEqual(state["entries"][0]["status"],"HTTP_ERROR")
                self.assertEqual(state["entries"][0]["limit_source"],"openrouter_key_limit")
                self.assertGreater(jev.committed_plus_reserved(state),0)
                self.assertNotIn("FAKE_TEST_KEY",json.dumps(state))

    def test_cli_refuses_to_allocate_separate_paid_ledger(self):
        import subprocess
        import sys
        with tempfile.TemporaryDirectory() as d:
            fake_ledger=Path(d)/"other.json"
            result=subprocess.run(
                [sys.executable,str(SCRIPT),"run","--ledger",str(fake_ledger),
                 "--packets",str(Path(d)/"none.jsonl")],
                text=True,capture_output=True,timeout=5)
            self.assertEqual(result.returncode,2)
            self.assertIn("single canonical",result.stderr)
            self.assertFalse(fake_ledger.exists())

    def test_user_cap_cannot_be_raised_by_corrupt_or_edited_ledger(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"ledger.json"
            p.write_text(json.dumps({**jev._ledger_template(),"cap_usd":"5.00"}))
            with self.assertRaises(jev.Refused):
                with jev.locked_ledger(p):
                    pass

    def test_checking_private_packet_rejects_sensitive_and_bad_ids(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"cases.jsonl"
            p.write_text(json.dumps({"case_id":"x","jev_request":{
                "state":"please use sk-or-v1-SECRET","questions":{"a":{"type":"noul","instructions":"Yes?"}}}})+"\n")
            with self.assertRaises(jev.Refused):
                jev.load_packets(p)
            p.write_text(json.dumps({"case_id":"x y","jev_request":{
                "state":"safe","questions":{"a":{"type":"noul","instructions":"Yes?"}}}})+"\n")
            with self.assertRaises(jev.Refused):
                jev.load_packets(p)

    def test_budget_cap_rejects_new_calls_at_ceiling(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(
                os.environ, {"OPENROUTER_API_KEY":"FAKE_TEST_KEY"},clear=True):
            ledger_file=Path(d)/"ledger.json"
            with jev.locked_ledger(ledger_file) as (state,save):
                state["entries"].append({"reserved_usd":"1.00","final_usd":None,
                                          "call_identity":"historical"})
                save()
            meter=Meter()
            out=jev.run([PACKET],ledger_file,models=MODELS,opener=meter)
            self.assertEqual(out["status"],"STOPPED_BUDGET_CAP")
            self.assertNotIn((jev.DECISIONS,"POST"),meter.calls)


if __name__=="__main__":
    unittest.main()
