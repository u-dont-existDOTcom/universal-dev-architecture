"""Checks for GitHub Actions workflow invariants."""
import re
from pathlib import Path
from scripts.repo_audit_types import Finding, finding

USES = re.compile(r"^\s*-\s+uses:\s*([^\s#]+)")
SHA = re.compile(r"^[0-9a-fA-F]{40}$")

def check_workflows(root: Path, profile: str) -> list[Finding]:
    folder = root / ".github/workflows"
    paths = sorted([*folder.glob("*.yml"), *folder.glob("*.yaml")]) if folder.is_dir() else []
    if profile == "software" and not paths:
        return [finding("CI_MISSING", "Add deterministic pull-request CI.", ".github/workflows")]
    out: list[Finding] = []
    for path in paths:
        rel = str(path.relative_to(root))
        text = path.read_text(encoding="utf-8", errors="replace")
        for code, needle in (
            ("WORKFLOW_PERMISSIONS_MISSING", "permissions:"),
            ("WORKFLOW_TIMEOUT_MISSING", "timeout-minutes:"),
            ("WORKFLOW_CONCURRENCY_MISSING", "concurrency:"),
        ):
            if needle not in text:
                out.append(finding(code, f"Workflow needs {needle}", rel))
        for number, line in enumerate(text.splitlines(), 1):
            match = USES.match(line)
            if not match:
                continue
            ref = match.group(1)
            if ref.startswith(("./", "docker://")):
                continue
            revision = ref.rsplit("@", 1)[1] if "@" in ref else ""
            if not SHA.fullmatch(revision):
                out.append(finding("WORKFLOW_ACTION_UNPINNED", f"Pin action at line {number}: {ref}", rel))
    return out
