"""Checks for the root Codex instruction map."""
from pathlib import Path
from scripts.repo_audit_types import AGENTS_MAX_BYTES, Finding, finding

def check_agents(root: Path, profile: str) -> list[Finding]:
    path = root / "AGENTS.md"
    if not path.is_file():
        return [finding("AGENTS_MISSING", "Add a concise root AGENTS.md.", "AGENTS.md")]
    out: list[Finding] = []
    if path.stat().st_size > AGENTS_MAX_BYTES:
        out.append(finding("AGENTS_TOO_LARGE", "Keep the discovered instruction chain within 32 KiB.", "AGENTS.md"))
    text = path.read_text(encoding="utf-8", errors="replace").lower()
    signals = {
        "AGENTS_AUTHORITY_MISSING": "authority",
        "AGENTS_WORKFLOW_MISSING": "workflow",
    }
    if profile != "incubator":
        signals |= {
            "AGENTS_VALIDATION_MISSING": "validation",
            "AGENTS_REVIEW_RULES_MISSING": "code review rules",
        }
    for code, needle in signals.items():
        if needle not in text:
            out.append(finding(code, f"AGENTS.md needs a {needle} section.", "AGENTS.md"))
    if "docs/" not in text and "readme" not in text:
        out.append(finding("AGENTS_MAP_MISSING", "Point AGENTS.md to deeper repository sources.", "AGENTS.md"))
    return out
