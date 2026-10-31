"""Text-presence regression for the manifest-first reading receipt in the whole-argument pattern.

It keeps the section's rules from being dropped or renamed; it does not test that a reader follows them, and the
mechanical checks it names cannot certify semantic adequacy."""
from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "whole-argument-reconstruction.md"
LANE = ROOT / "suggested-fixes" / "AskRigor"
ITEM_NAME = "2026-10-29-manifest-first-cross-section-reading.md"
HEADING = "## Manifest-first, concept-wide reading receipts"


def section() -> str:
    text = PATTERN.read_text(encoding="utf-8")
    return text.split(HEADING + "\n", 1)[1].split("\n## ", 1)[0]


class ReadingReceiptTests(unittest.TestCase):
    def test_section_keeps_each_rule(self) -> None:
        self.assertEqual(PATTERN.read_text(encoding="utf-8").count(HEADING), 1)
        body = section()
        for phrase in (
            "**evidence-topology read receipt**",
            "1. **Resolve the authoritative version before reading.**",
            "2. **Disclose the actual read mode.**",
            "Full retrieval is not proof of complete semantic review.",
            "3. **Build a concept-to-passage ledger, not just a table of contents.**",
            "A concept can live in several sections and can be expressed without its conventional term.",
            "4. **Separate evidence binding from understanding.**",
            "A meaning-capable reviewer must judge those claims and disclose uncertainty.",
            "5. **Gate absence, novelty and proposed fixes.**",
            "*genuinely missing after an adequate review*",
            "If the objection disappears, withdraw it; do not manufacture a replacement.",
            "6. **Use discriminating countercase tests.**",
            "Scale it to the task",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, body)

    def test_index_routes_the_reading_receipt(self) -> None:
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        entries = [line for line in index.splitlines() if "`patterns/whole-argument-reconstruction.md` —" in line]
        self.assertEqual(len(entries), 1)
        for phrase in (
            "resolve its active manifest/version and report the actual read mode",
            "concept-to-passage evidence ledger",
            "before claiming omission or novelty",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, entries[0])

    def test_askrigor_item_keeps_the_negative_control_and_the_mechanical_limit(self) -> None:
        # The receiving lane may move a handled item to done/ (patterns/suggested-fix-queue.md, step 8).
        found = [path for path in (LANE / ITEM_NAME, LANE / "done" / ITEM_NAME) if path.exists()]
        self.assertEqual(len(found), 1)
        text = found[0].read_text(encoding="utf-8")
        for phrase in (
            "/AskRigor`",
            "Include a negative control where the document really does omit a concept",
            "Do not turn a regex list into a 'meaning' detector.",
            "AskRigor's own receiving lane decides which layer should implement it",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)


    def test_claim_map_extends_the_receipt(self) -> None:
        body = section()
        self.assertEqual(body.count("### Claim map for long or high-stakes texts"), 1)
        claim_map = body.split("### Claim map for long or high-stakes texts", 1)[1]
        for phrase in (
            "1. **Pin each claim to its passage.**",
            "A point that matches no pinned claim is the reviewer's own reading and is labeled that way",
            "2. **Type the links between claims.**",
            "list the claims that depend on it",
            "3. **Count what was read.**",
            "Mark each paragraph read or not, and give the count in the read receipt",
            "A partial read says which parts were left.",
            "4. **Make an absence claim a search with a control.**",
            '"Not found" names the paragraphs searched.',
            "a negative control",
            "5. **Split the work by kind.**",
            "A meaning-capable reviewer judges them",
            "A script checks that each quote matches the source at its recorded hash and that both ends of every link exist.",
            "6. **Use it only where the claim structure decides the outcome:**",
            "`suggested-fixes/AskRigor/2026-10-31-study-map-for-decision-claims.md`",
            "`docs/requirements/2026-10-31-claim-map-and-study-map.owner-requirement.json`",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, claim_map)
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        entry = next(line for line in index.splitlines() if "`patterns/whole-argument-reconstruction.md` —" in line)
        self.assertIn("a claim map pins each claim to its passage with typed links and a count of paragraphs read", entry)

    def test_study_map_item_and_owner_record(self) -> None:
        import json
        data = json.loads((ROOT / "docs" / "requirements" / "2026-10-31-claim-map-and-study-map.owner-requirement.json").read_text(encoding="utf-8"))
        self.assertEqual(data["owner_statement"], "5c")
        self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
        for surface in data["execution_surfaces"]:
            if surface["disposition"] in {"DEFERRED", "NOT_APPLICABLE", "QUEUED"}:
                self.assertTrue(surface.get("reason"))
        name = "2026-10-31-study-map-for-decision-claims.md"
        found = [path for path in (LANE / name, LANE / "done" / name) if path.exists()]
        self.assertEqual(len(found), 1)
        text = found[0].read_text(encoding="utf-8")
        for phrase in (
            "/AskRigor`",
            "- Owner request: yes",
            "Count underlying people or datasets, not documents",
            "compare against the version registered before the trial started",
            "flag registered outcomes the paper leaves out",
            "A review restating a study is not a second source.",
            "a negative control in which no overlap exists",
            "a paywalled original stays unread and is named as a gap",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)


if __name__ == "__main__":
    unittest.main()
