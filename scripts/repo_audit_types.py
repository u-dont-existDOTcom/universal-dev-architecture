"""Data model and policy loading for repository audits."""
from __future__ import annotations
import dataclasses, json
from pathlib import Path
from typing import Any

AGENTS_MAX_BYTES = 32 * 1024

@dataclasses.dataclass(frozen=True)
class Finding:
    code: str
    severity: str
    message: str
    path: str | None = None

    def as_dict(self) -> dict[str, str]:
        out = {"code": self.code, "severity": self.severity, "message": self.message}
        if self.path is not None:
            out["path"] = self.path
        return out

DEFAULT_POLICY: dict[str, Any] = {
    "profile": "knowledge", "public": False, "long_running": False,
    "require_exec_plans": False, "require_pr_template": None,
    "require_dependabot": None, "require_security_policy": None,
    "exceptions": {},
}

def finding(code: str, message: str, path: str | None = None, severity: str = "error") -> Finding:
    return Finding(code, severity, message, path)

def read_policy(root: Path) -> tuple[dict[str, Any], list[Finding]]:
    policy = dict(DEFAULT_POLICY)
    path = root / ".codex" / "repository-policy.json"
    relative = str(path.relative_to(root))
    if not path.exists():
        return policy, [finding(
            "POLICY_FILE_MISSING",
            "Add .codex/repository-policy.json so the repository profile and intentional exceptions are machine-readable.",
            relative, "warning")]
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        return policy, [finding("POLICY_FILE_INVALID", f"Cannot parse repository policy: {exc}", relative)]
    if not isinstance(loaded, dict):
        return policy, [finding("POLICY_FILE_INVALID", "Repository policy must be a JSON object.", relative)]
    policy.update(loaded)
    findings: list[Finding] = []
    if policy.get("profile") not in {"software", "knowledge", "incubator"}:
        findings.append(finding("POLICY_PROFILE_INVALID", "profile must be one of: software, knowledge, incubator.", relative))
        policy["profile"] = "knowledge"
    if not isinstance(policy.get("exceptions", {}), dict):
        findings.append(finding("POLICY_EXCEPTIONS_INVALID", "exceptions must be a JSON object.", relative))
        policy["exceptions"] = {}
    return policy, findings
