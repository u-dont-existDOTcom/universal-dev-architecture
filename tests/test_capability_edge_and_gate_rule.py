from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CapabilityEdgeAndGateRuleTests(unittest.TestCase):
    def read(self, relative: str) -> str:
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_universal_rule_is_identical_in_pattern_and_saved_instruction_source(
        self,
    ) -> None:
        required_rule = (
            "Treat every capability as an exact directional source → destination edge "
            "together with every required gate. Evidence for A → B does not establish "
            "A → C, B → A, autonomous initiation, or availability through another "
            "interface. Before relying on a capability, verify the exact source endpoint, "
            "destination endpoint, interface, and every user, UI, permission, and "
            "authorization gate. A required user click or approval is an automation "
            "blocker until satisfied, not an implementation detail."
        )
        for relative in (
            "patterns/reasoning-selection.md",
            "docs/exec-plans/2026-09-07-selective-reasoning-instructions.md",
        ):
            with self.subTest(path=relative):
                self.assertIn(required_rule, self.read(relative))

    def test_current_topology_is_mirrored_in_reasoning_pattern_and_source(self) -> None:
        required_topology = (
            "For the currently established Chat/Work boundary in this architecture: "
            "Chat → Work requires explicit user acceptance; native Work ↔ Work "
            "coordination exists within Work; Work → the originating Chat is unavailable."
        )
        required_consequence = (
            "autonomous control-plane routing of supervision and escalation plus durable "
            "control across the Chat/Work boundary"
        )
        for relative in (
            "patterns/reasoning-selection.md",
            "docs/exec-plans/2026-09-07-selective-reasoning-instructions.md",
        ):
            with self.subTest(path=relative):
                text = self.read(relative)
                self.assertIn(required_topology, text)
                self.assertIn(required_consequence, text)
                self.assertIn("not claims about other interfaces or future versions", text)

    def test_architecture_and_current_state_preserve_bounded_topology(self) -> None:
        documents = (
            "patterns/codex-pro-supervision-mission-control.md",
            "docs/architecture/2026-09-01-direct-project-manager-supervision-control-plane.md",
            "state/CURRENT-STATE.md",
        )
        required = (
            "Chat → Work",
            "requires explicit user acceptance",
            "Work ↔ Work",
            "native Work-internal coordination",
            "Work → the originating Chat",
            "unavailable",
            "autonomous control-plane routing of supervision and escalation",
        )

        for relative in documents:
            text = " ".join(self.read(relative).split())
            with self.subTest(path=relative):
                for fragment in required:
                    with self.subTest(fragment=fragment):
                        self.assertIn(fragment, text)

    def test_mediated_control_is_not_misrepresented_as_a_native_return_edge(self) -> None:
        routing = self.read("patterns/chat-work-execution-routing-threshold.md")
        mission_control_agents = self.read("tools/codex-mission-control/AGENTS.md")
        bootstrap = self.read("templates/MISSION-CONTROL-GLOBAL-PM-BOOTSTRAP.md")

        self.assertNotIn("coordinate repeated Chat <-> Work cycles", routing)
        self.assertIn("requires explicit user acceptance", routing)
        self.assertIn("Work → the originating Chat", routing)
        self.assertIn("only through a verified Mission Control/controller route", routing)
        self.assertNotIn(
            "Every execution result returns automatically to the source reasoning chat",
            mission_control_agents,
        )
        self.assertIn(
            "do not infer a native Work → originating Chat return edge",
            mission_control_agents,
        )
        self.assertIn("requires explicit user acceptance", bootstrap)
        self.assertIn("Work → the originating Chat is unavailable", bootstrap)
        self.assertIn(
            "does not transfer semantic reasoning authority to Mission Control",
            bootstrap,
        )

    def test_router_and_pm_bootstrap_activate_the_canonical_rule(self) -> None:
        index = self.read("LESSON-INDEX.md")
        pattern = self.read("patterns/reasoning-selection.md")
        bootstrap = self.read("templates/MISSION-CONTROL-GLOBAL-PM-BOOTSTRAP.md")

        self.assertIn("exact directional endpoint-specific edges", index)
        self.assertIn("user/UI/permission/authorization gate", index)
        self.assertIn(
            "docs/requirements/2026-09-08-capability-edge-and-gate.owner-requirement.json",
            pattern,
        )
        self.assertIn("patterns/reasoning-selection.md", bootstrap)
        self.assertIn("not an implementation detail", bootstrap)

    def test_owner_requirement_and_existing_boundaries_remain_fail_closed(self) -> None:
        relative = (
            "docs/requirements/2026-09-08-capability-edge-and-gate.owner-requirement.json"
        )
        requirement = json.loads(self.read(relative))
        verbatim = requirement["owner_source"]["verbatim"]

        self.assertEqual(
            requirement["owner_source"]["sha256"],
            hashlib.sha256(verbatim.encode("utf-8")).hexdigest(),
        )
        self.assertFalse(requirement["completion_allowed"])
        self.assertEqual(requirement["status"], "IMPLEMENTED_NOT_LIVE_VERIFIED")
        outcomes = {item["id"]: item for item in requirement["required_outcomes"]}
        for outcome_id in ("RO-CAP-001", "RO-CAP-002", "RO-CAP-003"):
            self.assertEqual(outcomes[outcome_id]["status"], "VERIFIED")
            self.assertTrue(outcomes[outcome_id]["evidence_refs"])
        self.assertFalse(outcomes["RO-CAP-004"]["terminal_required"])
        self.assertEqual(outcomes["RO-CAP-004"]["status"], "UNMET")
        self.assertEqual(outcomes["RO-CAP-004"]["evidence_refs"], [])

        state = self.read("state/CURRENT-STATE.md")
        architecture = self.read("patterns/codex-pro-supervision-mission-control.md")
        self.assertIn("Production promotion is not authorized", state)
        self.assertIn("does not transfer semantic reasoning authority", architecture)
        self.assertIn("does not authorize production", architecture)


if __name__ == "__main__":
    unittest.main()
