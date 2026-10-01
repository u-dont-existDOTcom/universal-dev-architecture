"""Assertions for rules routed out of the root instruction kernel."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPACT = "## Compact rules moved from root `AGENTS.md`"


def assert_routed_rule(case, path: str, phrases, *, compact: bool = False) -> None:
    body = (ROOT / path).read_text(encoding="utf-8")
    if compact:
        case.assertEqual(body.count(COMPACT), 1, path)
        body = body.split(COMPACT + "\n", 1)[1].split("\n## ", 1)[0]
    for phrase in phrases:
        with case.subTest(path=path, phrase=phrase):
            case.assertIn(phrase, body)
    index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
    entries = [line for line in index.splitlines() if f"`{path}` —" in line]
    case.assertEqual(len(entries), 1, path)
    case.assertGreater(len(entries[0].split(" — ", 1)[1].split()), 8, path)
