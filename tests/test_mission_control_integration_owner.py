from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / "state" / "MISSION-CONTROL-INTEGRATION-OWNER.json"


def looks_like_mission_control_lease(path: Path, lease: dict) -> bool:
    branch = str(lease.get("owned_branch", "")).lower()
    scope = str(lease.get("scope", "")).lower()
    domain = str(lease.get("domain", "")).upper()
    return (
        domain == "MISSION_CONTROL"
        or branch.startswith("chat/mc")
        or branch.startswith("codex/mc")
        or "mission-control" in branch
        or "mission control" in scope
    )


class MissionControlIntegrationOwnerTests(unittest.TestCase):
    def test_active_lock_serializes_shared_integration_and_runtime(self) -> None:
        lock = json.loads(LOCK.read_text(encoding="utf-8"))
        self.assertIn(lock["status"], {"ACTIVE", "RELEASED"})
        self.assertEqual(lock["domain"], "MISSION_CONTROL")
        self.assertEqual(lock["child_lane_policy"], "ISOLATED_CHILD_HANDOFF_ONLY")
        self.assertFalse(lock["direct_main_write_by_children"])
        self.assertFalse(lock["shared_runtime_write_by_children"])
        integrator = lock["integrator_branch"]

        paths = [
            *(ROOT / "docs" / "exec-plans" / "active").glob("*writer-lease.json"),
            *(ROOT / "tasks" / "writer-leases").glob("*.json"),
        ]
        active_mc = []
        for path in paths:
            lease = json.loads(path.read_text(encoding="utf-8"))
            if lease.get("status") != "active" or not looks_like_mission_control_lease(path, lease):
                continue
            active_mc.append((path, lease))

        if lock["status"] == "RELEASED":
            self.assertFalse(lock["shared_runtime_owner"])
            self.assertFalse(lock["issue_178_owned_here"])
            self.assertFalse(lock["native_work_autodispatch_owned_here"])
            self.assertIn("released_at", lock)
            self.assertFalse(
                any(lease.get("owned_branch") == integrator for _, lease in active_mc),
                "A released integration owner cannot retain an active writer lease.",
            )
            return

        self.assertTrue(lock["shared_runtime_owner"])
        for path, lease in active_mc:
            if lease.get("owned_branch") == integrator:
                self.assertTrue(lease.get("shared_runtime_mutation_owner"))
                continue
            self.assertEqual(lease.get("parent_integrator"), integrator, path.as_posix())
            self.assertFalse(lease.get("shared_runtime_mutation_owner", False), path.as_posix())
        self.assertTrue(any(lease.get("owned_branch") == integrator for _, lease in active_mc))

    def test_parallel_writer_pattern_requires_child_handoff_to_integrator(self) -> None:
        pattern = (ROOT / "patterns" / "parallel-chat-write-isolation.md").read_text(encoding="utf-8")
        self.assertIn("MISSION-CONTROL-INTEGRATION-OWNER.json", pattern)
        self.assertIn("parent_integrator", pattern)
        self.assertIn("hand useful deltas to the integrator", pattern)


if __name__ == "__main__":
    unittest.main()
