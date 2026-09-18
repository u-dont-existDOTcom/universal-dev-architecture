#!/usr/bin/env python3
"""Preflight and acceptance checks for the branch-local daemon-repair task."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TASK_PATH = ROOT / "tasks" / "ACTIVE-TASK.json"
RECEIPT_PATH = ROOT / "docs" / "evidence" / "2026-09-18-mc-fresh-worker-daemon-repair-receipt.json"


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def current_branch() -> str:
    return subprocess.check_output(
        ["git", "symbolic-ref", "--quiet", "--short", "HEAD"],
        cwd=ROOT,
        text=True,
    ).strip()


def preflight() -> int:
    task = load(TASK_PATH)
    lease = load(ROOT / task["writerLease"])
    findings: list[str] = []
    branch = current_branch()
    if task.get("status") != "active":
        findings.append("ACTIVE_TASK_NOT_ACTIVE")
    if branch != task.get("requiredBranch"):
        findings.append("ACTIVE_TASK_BRANCH_MISMATCH")
    if lease.get("status") != "active" or lease.get("exclusive_writer") is not True:
        findings.append("WRITER_LEASE_NOT_ACTIVE")
    if branch != lease.get("owned_branch"):
        findings.append("WRITER_LEASE_BRANCH_MISMATCH")
    if findings:
        print("\n".join(findings))
        return 1
    print("ACTIVE_TASK_PREFLIGHT_PASS")
    return 0


def acceptance() -> int:
    if preflight() != 0:
        return 1
    if not RECEIPT_PATH.exists():
        print("FINAL_RECEIPT_MISSING")
        return 1
    receipt = load(RECEIPT_PATH)
    findings: list[str] = []
    if receipt.get("verdict") != "PM_MEDIATED_LIVE_PROOF_PASS":
        findings.append("PM_MEDIATED_LIVE_PROOF_NOT_PASS")
    fixture = receipt.get("existingFixture", {})
    if fixture.get("requestId") != "mc53-epoch4-pm-proof-v2-route-20260917":
        findings.append("SAME_ROUTE_IDENTITY_MISMATCH")
    if fixture.get("reused") is not True or fixture.get("replacementFixtureCreated") is not False:
        findings.append("SAME_FIXTURE_REUSE_NOT_PROVEN")
    soak = receipt.get("noSendSoak", {})
    if soak.get("reconciliationIntervalsObserved", 0) < 2 or soak.get("providerSends") != 0:
        findings.append("NO_SEND_SOAK_INCOMPLETE")
    if receipt.get("paidInference") is not False or receipt.get("productionMutated") is not False:
        findings.append("FORBIDDEN_BOUNDARY_CROSSED")
    if receipt.get("assistantDomOutputInspected") is not False:
        findings.append("ASSISTANT_OUTPUT_BOUNDARY_CROSSED")
    if findings:
        print("\n".join(findings))
        return 1
    print("TASK_ACCEPTANCE_PASS")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in {"preflight", "acceptance"}:
        raise SystemExit("usage: mc_fresh_worker_task.py preflight|acceptance")
    raise SystemExit(preflight() if sys.argv[1] == "preflight" else acceptance())
