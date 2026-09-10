import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LABEL = "NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT"
TEXT_SUFFIXES = {".json", ".md", ".mjs", ".js", ".ts", ".tsx", ".py", ".sh", ".example"}
IGNORED_PARTS = {".git", ".next", "node_modules"}
OWNER_INFRASTRUCTURE = re.compile(
    "|".join(
        [
            re.escape("Host" + "inger"),
            re.escape("Net" + "cup"),
            re.escape("/home/" + "joel"),
            r"\bsrv\d{6,}\b",
        ]
    ),
    re.IGNORECASE,
)
IPV4 = re.compile(r"(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)")


def contains_external_ipv4(text):
    for match in IPV4.finditer(text):
        octets = [int(value) for value in match.group(0).split(".")]
        if all(value <= 255 for value in octets) and octets[0] != 127:
            return True
    return False


class OwnerSpecificInfrastructureLabelingTests(unittest.TestCase):
    def test_owner_infrastructure_is_labeled_and_outside_portable_surfaces(self):
        unlabeled = []
        portable_leaks = []

        for path in ROOT.rglob("*"):
            if not path.is_file() or IGNORED_PARTS.intersection(path.parts) or path.suffix not in TEXT_SUFFIXES:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            if not OWNER_INFRASTRUCTURE.search(text) and not contains_external_ipv4(text):
                continue

            relative = path.relative_to(ROOT)
            if relative.parts[0] in {"patterns", "templates", "tools"}:
                portable_leaks.append(str(relative))
            elif LABEL not in text:
                unlabeled.append(str(relative))

        self.assertEqual([], portable_leaks, "owner infrastructure leaked into portable surfaces")
        self.assertEqual([], unlabeled, "owner infrastructure evidence lacks the non-universal label")


if __name__ == "__main__":
    unittest.main()
