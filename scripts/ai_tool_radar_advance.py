#!/usr/bin/env python3
"""Move a reviewed AI Tool Radar issue queue forward on GitHub issue completion.

This changes *only* a successor issue's title and posts an audit comment. It
never launches agents, spends model credits, or decides scientific adequacy.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import sys
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

REPO = "u-dont-existDOTcom/universal-dev-architecture"
VERDICT = re.compile(r"(?m)^Outcome: (REUSE|PILOT|WATCH|SKIP)\s*$")
EVIDENCE = re.compile(r"(?m)^Evidence: (https://\S+)\s*$")


class QueueError(Exception):
    pass


def load_manifest(path: str | Path) -> dict:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    rows = data.get("stages", [])
    if data.get("schema_version") != 1 or data.get("repository") != REPO or len(rows) < 2:
        raise QueueError("Invalid queue manifest metadata")
    orders = [row.get("order") for row in rows]
    ids = [row.get("issue_number") for row in rows]
    if orders != list(range(1, len(rows) + 1)) or len(set(ids)) != len(ids):
        raise QueueError("Queue stage indices or issue identifiers are invalid")
    if ids[0] != 475 or data.get("initial_active_issue_number") != 475:
        raise QueueError("Unexpected original pilot issue")
    for row in rows:
        if not isinstance(row.get("title"), str) or not row["title"]:
            raise QueueError("Stage missing readable title")
        if not isinstance(row["issue_number"], int) or row["issue_number"] < 1:
            raise QueueError("Invalid issue identifier")
    return data


def expected_title(row: dict, active: bool) -> str:
    prefix = "[ACTIVE]" if active else "[QUEUED]"
    return f"{prefix}[AI Radar {row['order']:02d}] {row['title']}"


def complete(issue: dict) -> bool:
    if issue.get("state") != "closed" or issue.get("state_reason") != "completed":
        return False
    body = issue.get("body") or ""
    return bool(VERDICT.search(body) and EVIDENCE.search(body))


class Github:
    def __init__(self, token: str, repository: str):
        if not token or repository != REPO:
            raise QueueError("GitHub token or target repository missing/mismatched")
        self.token = token
        self.repo = repository

    def request(self, method: str, path: str, payload: dict | None = None):
        url = f"https://api.github.com/repos/{self.repo}/{path}"
        raw = None if payload is None else json.dumps(payload).encode("utf-8")
        req = Request(url, data=raw, method=method, headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {self.token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "uda-ai-tool-radar-handoff/1",
            **({"Content-Type": "application/json"} if raw is not None else {}),
        })
        try:
            with urlopen(req, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            raise QueueError(f"GitHub {method} failed: HTTP {exc.code}") from exc

    def get_issue(self, number: int) -> dict:
        return self.request("GET", f"issues/{number}")

    def set_title(self, number: int, new_title: str) -> None:
        self.request("PATCH", f"issues/{number}", {"title": new_title})

    def list_comments(self, number: int) -> list[dict]:
        return self.request("GET", f"issues/{number}/comments?per_page=100")

    def add_comment(self, number: int, text: str) -> None:
        self.request("POST", f"issues/{number}/comments", {"body": text})


def advance(closed_issue: int, manifest: dict, client) -> str:
    rows = manifest["stages"]
    by_number = {row["issue_number"]: i for i, row in enumerate(rows)}
    if closed_issue not in by_number:
        return "Ignored unrelated issue"
    index = by_number[closed_issue]
    current_row = rows[index]
    current = client.get_issue(closed_issue)
    if not complete(current):
        return "No transition: issue not completed or outcome/evidence receipt missing"
    if index > 0 and current.get("title") != expected_title(current_row, True):
        return "No transition: closing issue was not the active stage"
    # Prevent silently skipping earlier incomplete/reopened stages.
    for prior in rows[:index]:
        issue = client.get_issue(prior["issue_number"])
        if not complete(issue):
            return "No transition: predecessor stage not completed"
    if index == len(rows) - 1:
        return "Terminal research stage complete; queue finished"
    next_row = rows[index + 1]
    number = next_row["issue_number"]
    next_issue = client.get_issue(number)
    if next_issue.get("state") != "open":
        raise QueueError("Next stage issue is not open; refusing to change it")
    if f"<!-- AI_TOOL_RADAR_STAGE:{next_row['order']} -->" not in (next_issue.get("body") or ""):
        raise QueueError("Next stage lacks its exact queue marker")
    queued_title = expected_title(next_row, False)
    active_title = expected_title(next_row, True)
    if next_issue.get("title") == queued_title:
        client.set_title(number, active_title)
    elif next_issue.get("title") != active_title:
        raise QueueError("Next stage title differs from queue contract; refusing mutation")
    # Keep event replay/retries idempotent, including a partial title-only update.
    marker = f"<!-- AI_TOOL_RADAR_ACTIVATED_BY:{closed_issue} -->"
    if not any(marker in (c.get("body") or "") for c in client.list_comments(number)):
        url = current.get("html_url") or f"https://github.com/{REPO}/issues/{closed_issue}"
        client.add_comment(number, f"{marker}\n**ACTIVE:** automatically advanced after [{current_row['title']}]({url}) was closed as completed with an outcome/evidence receipt. This activates the investigation queue only; no coding agent has been launched and no benchmark has been run by this action. Read the current project rules before work.")
    return f"Activated stage {next_row['order']}: issue #{number}"


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("Usage: ai_tool_radar_advance.py <manifest.json> <closed-issue-number>", file=sys.stderr)
        return 2
    manifest = load_manifest(argv[1])
    closed_issue = int(argv[2])
    github = Github(os.environ.get("GH_TOKEN", ""), os.environ.get("GITHUB_REPOSITORY", ""))
    print(advance(closed_issue, manifest, github))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except (QueueError, ValueError) as exc:
        print(f"AI Tool Radar handoff blocked: {exc}", file=sys.stderr)
        sys.exit(1)

