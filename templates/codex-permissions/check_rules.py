#!/usr/bin/env python3
"""Run actual Codex prefix matching; never execute the commands under test."""
import argparse
import json
import pathlib
import subprocess

CASES = [
    (["gh", "pr", "view", "1"], "allow"),
    (["gh", "pr", "checks", "1"], "allow"),
    (["gh", "run", "view", "1", "--log"], "allow"),
    (["gh", "issue", "list"], "allow"),
    (["gh", "auth", "status"], "prompt"),
    (["gh", "auth", "status", "--show-token"], "prompt"),
    (["gh", "auth", "status", "-t"], "prompt"),
    (["git", "status", "--short"], None),
    (["git", "diff", "--check"], None),
    (["git", "add", "--", "source.py"], None),
    (["npm", "test"], None),
    (["npm", "ci"], None),
    (["npm", "run", "lint"], None),
    (["pnpm", "run", "typecheck"], None),
    (["npm", "run", "build"], None),
    (["python3", "scripts/verify.py"], None),
    (["python3", "-m", "pytest"], None),
    (["uv", "sync", "--locked"], None),
    (["cargo", "test"], None),
    (["git", "fetch", "origin"], "prompt"),
    (["git", "commit", "-m", "fix"], "prompt"),
    (["git", "commit", "-m", "fix", "--amend"], "prompt"),
    (["git", "push", "origin", "main", "--force-with-lease"], "prompt"),
    (["git", "reset", "--hard"], "prompt"),
    (["/usr/bin/git", "reset", "--hard"], "prompt"),
    (["/bin/rm", "-rf", "/example/data"], "prompt"),
    (["git", "clean", "-fdx"], "prompt"),
    (["git", "branch", "-D", "feature"], "prompt"),
    (["git", "tag", "-d", "v1"], "prompt"),
    (["git", "remote", "remove", "origin"], "prompt"),
    (["git", "-C", "/example/other-repo", "reset", "--hard"], "prompt"),
    (["gh", "api", "--method", "DELETE", "repos/example/project"], "prompt"),
    (["gh", "auth", "token"], "prompt"),
    (["rm", "-rf", "/example/data"], "prompt"),
    (["sudo", "arbitrary-command"], "prompt"),
    (["npm", "publish"], "prompt"),
]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rules", type=pathlib.Path, action="append")
    args = parser.parse_args()
    files = args.rules or [pathlib.Path(__file__).with_name("routine.rules")]
    command = ["codex", "execpolicy", "check"]
    for path in files:
        command.extend(["--rules", str(path)])
    for argv, expected in CASES:
        result = subprocess.run(command + ["--"] + argv, check=True, capture_output=True, text=True)
        actual = json.loads(result.stdout).get("decision")
        # No user rule is intentional: execution stays subject to native sandbox policy.
        if actual != expected:
            raise SystemExit(f"FAIL {argv!r}: expected {expected!r}, got {actual!r}")
    print(f"PASS: {len(CASES)} actual Codex rule decisions; no tested command executed")

if __name__ == "__main__":
    main()
