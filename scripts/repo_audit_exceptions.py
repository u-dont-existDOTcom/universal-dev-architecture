"""Apply explicit, reasoned, expiring repository-policy exceptions."""
from __future__ import annotations
import datetime as dt
from typing import Any, Iterable
from scripts.repo_audit_types import Finding, finding

POLICY_PATH = ".codex/repository-policy.json"

def _expiry(value: object) -> dt.date | None:
    if not isinstance(value, str):
        return None
    try:
        return dt.date.fromisoformat(value)
    except ValueError:
        return None

def apply_exceptions(findings: Iterable[Finding], policy: dict[str, Any], *, today: dt.date | None = None) -> list[Finding]:
    today = today or dt.date.today()
    exceptions = policy.get("exceptions", {})
    if not isinstance(exceptions, dict):
        return list(findings)
    output: list[Finding] = []
    used: set[str] = set()
    for item in findings:
        exception = exceptions.get(item.code)
        if not isinstance(exception, dict):
            output.append(item)
            continue
        reason, expires = exception.get("reason"), _expiry(exception.get("expires"))
        if not isinstance(reason, str) or not reason.strip() or expires is None:
            output += [item, finding("EXCEPTION_INVALID", f"Exception for {item.code} needs a non-empty reason and ISO date expires value.", POLICY_PATH)]
        elif expires < today:
            output += [item, finding("EXCEPTION_EXPIRED", f"Exception for {item.code} expired on {expires.isoformat()}: {reason}", POLICY_PATH)]
        else:
            used.add(item.code)
            output.append(finding("EXCEPTION_ACTIVE", f"Suppressed {item.code} until {expires.isoformat()}: {reason}", item.path, "warning"))
    for code in sorted(set(exceptions) - used):
        exception = exceptions[code]
        expires = _expiry(exception.get("expires")) if isinstance(exception, dict) else None
        if expires is not None and expires < today:
            output.append(finding("EXCEPTION_EXPIRED", f"Unused exception for {code} expired on {expires.isoformat()}.", POLICY_PATH))
        else:
            output.append(finding("EXCEPTION_UNUSED", f"Exception for {code} no longer matches an active finding; remove it after confirming the underlying fix.", POLICY_PATH, "warning"))
    return output
