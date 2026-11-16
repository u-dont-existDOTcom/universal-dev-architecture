"""Zero-network checks for the runner's key routes, the API's real answer shape and per-run call limits."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "jev-budgeted-evaluator.py"
spec = importlib.util.spec_from_file_location("jev_budgeted_evaluator_routes", SCRIPT)
jev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(jev)

MODELS = [
    {"id": "typesafe/jev-1.14", "sort_key": [1, 14], "price_usd_per_input_token": "0.000000042"},
    {"id": "typesafe/jev-1.13", "sort_key": [1, 13], "price_usd_per_input_token": "0.000000042"},
]


def packet(case_id):
    return {"case_id": case_id, "request": {"state": {"fact": case_id}, "questions": {
        "next_action": {"type": "choice", "instructions": "Which?", "criteria": {"a": "A", "b": "B"}}}}}


# The documented Decisions reply: every answer carries its type; a choice has confidence and probabilities.
API_REPLY = {"id": "gen-dec-1", "model": "typesafe/jev-1.14-20261014", "provider": "TypeSafe",
             "answers": {"next_action": {"type": "choice", "choice": "b", "confidence": 0.75,
                                         "probabilities": {"a": 0.25, "b": 0.75}},
                         "owner": {"type": "noul", "noul": 0.04},
                         "level": {"type": "score", "score": 2}},
             "usage": {"input_tokens": 287, "output_tokens": 20, "cost": 0.000012054}}


class FakeTransport:
    def __init__(self, replies, key=(200, {"data": {"limit_remaining": None}})):
        self.replies = list(replies)
        self.key = key
        self.bodies = []

    def key_status(self):
        return self.key

    def decide(self, body):
        self.bodies.append(json.loads(body))
        reply = self.replies.pop(0)
        return reply if isinstance(reply, tuple) else (200, reply, None)


class RunnerRouteTests(unittest.TestCase):
    def test_documented_answer_shape_is_kept_as_typed_values(self):
        typed = jev.typed_decisions(API_REPLY["answers"])
        self.assertEqual(typed["next_action"], {"choice": "b", "confidence": 0.75,
                                                "probabilities": {"a": 0.25, "b": 0.75}})
        self.assertEqual(typed["owner"], {"noul": 0.04})
        self.assertEqual(typed["level"], {"score": 2})
        # A choice given only as a probability map is reduced to its most probable option.
        self.assertEqual(jev.typed_decisions({"x": {"choice": {"a": 0.2, "b": 0.8}}})["x"]["choice"], "b")
        with self.assertRaises(ValueError):
            jev.typed_decisions({"x": {"choice": "b", "probabilities": {"a": 2}}})
        with self.assertRaises(ValueError):
            jev.typed_decisions({"x": {"choice": "not a key!"}})

    def test_reply_without_provider_cost_settles_at_the_reservation_and_continues(self):
        reply = dict(API_REPLY, usage={"input_tokens": 287})
        transport = FakeTransport([reply, dict(API_REPLY, id="gen-dec-2")])
        with tempfile.TemporaryDirectory() as d:
            ledger = Path(d) / "ledger.json"
            out = jev.run([packet("c1"), packet("c2")], ledger, models=MODELS, transport=transport, max_calls=5)
            self.assertEqual(out["status"], "DONE_BOUNDED")
            self.assertEqual(out["new_provider_calls"], 2)
            with jev.locked_ledger(ledger) as (state, save):
                first, second = state["entries"]
                self.assertEqual(first["cost_source"], "RESERVED_NO_PROVIDER_COST")
                self.assertEqual(first["final_usd"], first["reserved_usd"])
                self.assertEqual(second["cost_source"], "PROVIDER_USAGE_COST")
                self.assertEqual(second["response_model"], "typesafe/jev-1.14-20261014")
                self.assertEqual(second["typed_answers"]["next_action"]["choice"], "b")

    def test_max_calls_allows_a_whole_planned_run_but_still_stops_at_the_first_failure(self):
        with tempfile.TemporaryDirectory() as d:
            ledger = Path(d) / "ledger.json"
            replies = [dict(API_REPLY, id=f"gen-{i}") for i in range(3)] + [(503, None, None), dict(API_REPLY, id="never")]
            transport = FakeTransport(replies)
            out = jev.run([packet(f"c{i}") for i in range(5)], ledger, models=MODELS, transport=transport, max_calls=10)
            self.assertEqual(out["status"], "STOPPED_PROVIDER_FAILURE")
            self.assertEqual(out["new_provider_calls"], 4)
            self.assertEqual(out["results"][-1]["http_status"], 503)
            self.assertEqual(len(transport.bodies), 4)
            for bad in (0, jev.MAX_CALLS_CEILING + 1, "5"):
                with self.assertRaises(jev.Refused):
                    jev.run([packet("z")], ledger, models=MODELS, transport=FakeTransport([]), max_calls=bad)

    def test_discovery_refuses_any_non_input_price(self):
        class Catalog:
            def __init__(self, rows):
                self.rows = rows

            def __call__(self, req, timeout=12):
                data = json.dumps({"data": self.rows}).encode()

                class R:
                    status = 200

                    def __enter__(self):
                        return self

                    def __exit__(self, *a):
                        pass

                    def read(self, n=None):
                        return data
                return R()
        rows = [{"id": "typesafe/jev-1.15", "endpoints": ["/api/alpha/decisions"],
                 "pricing": {"prompt": "0.000000042", "completion": "0.000001"}},
                {"id": "typesafe/jev-1.16", "endpoints": ["/api/alpha/decisions"],
                 "pricing": {"prompt": "0.000000042", "request": "0.01"}},
                {"id": "typesafe/jev-1.14", "endpoints": ["/api/alpha/decisions"],
                 "pricing": {"prompt": "0.000000042", "completion": "0"}}]
        self.assertEqual([m["id"] for m in jev.discover(opener=Catalog(rows))], ["typesafe/jev-1.14"])

    def test_key_file_must_be_owner_only_and_is_never_recorded(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ, {}, clear=True):
            key = Path(d) / "openrouter.key"
            key.write_text("sk-or-v1-FAKEFILEKEY\n")
            key.chmod(0o644)
            with self.assertRaises(jev.Refused):
                jev.load_key(key)
            key.chmod(0o600)
            self.assertEqual(jev.load_key(key), "sk-or-v1-FAKEFILEKEY")
            link = Path(d) / "link.key"
            link.symlink_to(key)
            with self.assertRaises(jev.Refused):
                jev.load_key(link)
            seen = []

            def opener(req, timeout=12):
                seen.append(req.get_header("Authorization"))
                body = {"data": {"limit_remaining": None}} if req.full_url == jev.KEY_STATUS else API_REPLY
                data = json.dumps(body).encode()

                class R:
                    status = 200

                    def __enter__(self):
                        return self

                    def __exit__(self, *a):
                        pass

                    def read(self, n=None):
                        return data
                return R()
            ledger = Path(d) / "ledger.json"
            out = jev.run([packet("k1")], ledger, models=MODELS, opener=opener, key_file=key)
            self.assertEqual(out["status"], "DONE_BOUNDED")
            self.assertEqual(seen, ["Bearer sk-or-v1-FAKEFILEKEY"] * 2)
            self.assertNotIn("FAKEFILEKEY", ledger.read_text() + json.dumps(out))

    def test_mission_control_route_forwards_bodies_and_treats_a_cut_connection_as_billable(self):
        calls = []

        def runner(command, input, capture_output, timeout):
            calls.append((command, input))
            if command[-1].endswith("--key-status"):
                out = {"http_status": 200, "body": {"data": {"limit_remaining": 3.8}}}
            elif len(calls) == 2:
                out = {"http_status": 200, "body": API_REPLY}
            else:
                raise subprocess.TimeoutExpired(command, timeout)
            return subprocess.CompletedProcess(command, 0, (json.dumps(out) + "\n").encode(), b"")
        transport = jev.MissionControlTransport("mission-control-primary:mission-control-issue90-live", runner=runner)
        self.assertEqual(calls, [])
        with tempfile.TemporaryDirectory() as d:
            ledger = Path(d) / "ledger.json"
            out = jev.run([packet("m1"), packet("m2")], ledger, models=MODELS, transport=transport, max_calls=5)
            self.assertEqual(out["status"], "STOPPED_PROVIDER_FAILURE")
            self.assertEqual([r["status"] for r in out["results"]], ["OK", "NETWORK_OR_PROVIDER_ERROR"])
            command = calls[1][0]
            self.assertEqual(command[:7], ["ssh", "-o", "ClearAllForwardings=yes", "-o", "BatchMode=yes", "-o",
                                           "ConnectTimeout=30"])
            self.assertEqual(command[7:], ["mission-control-primary", "sudo -n docker exec -i mission-control-issue90-live "
                                           "node /app/scripts/jev-decisions-forward.mjs"])
            self.assertEqual(json.loads(calls[1][1])["model"], "typesafe/jev-1.14")
            with jev.locked_ledger(ledger) as (state, save):
                cut = state["entries"][1]
                self.assertIsNone(cut["final_usd"])
                self.assertGreater(jev.Decimal(cut["reserved_usd"]), 0)
        for bad in ("no-colon", "host:con tainer", "host;rm:x", ":x", "-oProxyCommand=x:c"):
            with self.assertRaises(jev.Refused):
                jev.MissionControlTransport(bad, runner=runner)


if __name__ == "__main__":
    unittest.main()
