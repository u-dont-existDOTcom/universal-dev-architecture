"""Source-layout regression for root rules moved into routed patterns; not evidence that agents load them."""
from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HEADING = "## Compact rules moved from root `AGENTS.md`"
SECTION_REF = "→ **Compact rules moved from root `AGENTS.md`**"

# pattern -> (root section that routes to it, fragments of the rules moved out of that root section)
MOVES = {
    "patterns/development-assurance-lanes.md": (
        "## Development assurance lanes",
        (
            "Default to the **Iteration lane** unless the owner or current project requirements actually establish a stronger boundary.",
            "- **Iteration:** smallest reversible candidate, focused/affected tests, a few representative product cases, and early owner/product evaluation.",
            "- **Decision:** use a bounded direct comparison only when a material architecture/product choice genuinely remains unresolved.",
            "- **Release:** run the full applicable repository, CI, security/privacy, independent-review, rollback, publication, installation, and release gates",
            "High-risk invariants can require targeted hard gates in Iteration/Decision",
            "**what current decision can this result change?** If none, defer it as later assurance debt.",
            "Never bypass a hard gate or substitute an unauthorized model merely to avoid a limit.",
            "Do not create an assurance ratchet where one difficult task permanently makes every later change release-grade.",
            "update/supersede that task state rather than continuing the obsolete campaign.",
        ),
    ),
    "patterns/research-before-reinvention.md": (
        "## Research before reinvention",
        (
            "Preserve an independent conception snapshot before outside exposure when prior examples could constrain genuinely creative ideation.",
            "benchmark bespoke work against the strongest relevant established baseline.",
            "the orchestration pattern routes to `patterns/existing-work-scan-and-scholarly-discovery.md` as the specialist discovery layer.",
            "Prefer a scholarly semantic discovery system such as SciSpace when available",
        ),
    ),
}


def section_after(text: str, heading: str) -> str:
    return text.split(heading + "\n", 1)[1].split("\n## ", 1)[0]


class RootInstructionNestingTests(unittest.TestCase):
    def test_root_sections_point_to_the_moved_rules(self) -> None:
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        for pattern, (root_heading, _) in MOVES.items():
            with self.subTest(pattern=pattern):
                self.assertIn(f"`{pattern}` {SECTION_REF}", section_after(agents, root_heading))

    def test_moved_rules_live_in_the_named_pattern_section(self) -> None:
        for pattern, (_, fragments) in MOVES.items():
            text = (ROOT / pattern).read_text(encoding="utf-8")
            self.assertEqual(text.count(HEADING), 1, pattern)
            section = section_after(text, HEADING)
            for fragment in fragments:
                with self.subTest(pattern=pattern, fragment=fragment[:60]):
                    self.assertIn(fragment, section)


if __name__ == "__main__":
    unittest.main()
