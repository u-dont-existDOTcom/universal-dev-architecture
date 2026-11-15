"""Offline privacy and real-fingerprint export checks; never invokes Jev."""
import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "export-jev-independent-cases.py"
spec = importlib.util.spec_from_file_location("jev_independent_case_export", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class JevIndependentExportTest(unittest.TestCase):
    def test_read_only_private_blind_export_and_fingerprint_count(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            database = root / "existing.sqlite"
            blind = root / "blind-private.jsonl"
            reconciliation = root / "comparison-private.jsonl"
            conn = sqlite3.connect(database)
            conn.execute("""CREATE TABLE jev_shadow_observations (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                observed_at TEXT, source TEXT, project_id TEXT,
                deterministic_trigger TEXT, status TEXT, error_code TEXT,
                response_id TEXT, state_fingerprint TEXT, state_json TEXT,
                jev_next_action TEXT, latency_ms REAL, cost_usd REAL, model TEXT
            )""")
            state = {key: "SAFE_VALUE" for key in module.STATE_FIELDS}
            state["chain_valid"] = True
            state["queue_terminal"] = False
            state["private_note"] = "DO_NOT_LEAK"
            for i, response_id, source in [(0, "a", "LIVE"), (1, "a", "LOG_IMPORT"),
                                           (2, "b", "LIVE")]:
                conn.execute("""INSERT INTO jev_shadow_observations (
                    observed_at, source, project_id, deterministic_trigger, status,
                    error_code, response_id, state_fingerprint, state_json,
                    jev_next_action, latency_ms, cost_usd, model)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
                    f"2026-11-15T00:00:0{i}Z", source, "PRIVATE-PROJECT-ID",
                    "OWNER_ACTION_REQUIRED", "OK", None, response_id,
                    "a" * 64, json.dumps(state), "notify_owner", 720.0, .001, "typesafe/jev-1.13"))
            conn.commit()
            conn.close()
            before = (database.stat().st_size, database.stat().st_mtime_ns)
            result = module.export(database, blind, reconciliation)
            self.assertEqual(result["deduplicated_provider_observations"], 2)
            self.assertEqual(result["distinct_real_state_fingerprints"], 1)
            self.assertEqual(result["gold_labels_created"], 0)
            self.assertEqual(result["new_provider_calls"], 0)
            self.assertEqual((database.stat().st_size, database.stat().st_mtime_ns), before)
            self.assertEqual(blind.stat().st_mode & 0o777, 0o600)
            blind_text = blind.read_text()
            self.assertNotIn("DO_NOT_LEAK", blind_text)
            self.assertNotIn("PRIVATE-PROJECT-ID", blind_text)
            self.assertNotIn("OWNER_ACTION_REQUIRED", blind_text)
            self.assertNotIn("notify_owner", blind_text)
            blind_row = json.loads(blind_text.strip())
            self.assertIsNone(blind_row["gold_action"])
            self.assertEqual(blind_row["cohort"], "UNASSIGNED")
            comp = json.loads(reconciliation.read_text())
            self.assertEqual(comp["successful_v1_observations"], 2)
            self.assertIn("OWNER_ACTION_REQUIRED", comp["prior_deterministic_triggers"])
            with self.assertRaises(FileExistsError):
                module.export(database, blind, reconciliation)

    def test_source_db_must_exist_and_exports_must_be_separate(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with self.assertRaises(FileNotFoundError):
                module.export(root / "none.sqlite", root / "out", root / "another")
            f = root / "one.sqlite"
            f.write_text("source")
            with self.assertRaises(ValueError):
                module.export(f, root / "out", root / "out")


if __name__ == "__main__":
    unittest.main()
