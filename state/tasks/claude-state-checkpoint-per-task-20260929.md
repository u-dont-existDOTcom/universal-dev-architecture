# Relay CI repair record

## Goal

- Restore the failing VPS browser relay CI check on pull request #281.

## Authority / baseline

- Owner request: repair the failed check on commit `e0ea960`, record the fix here, leave changes in the working tree, and do not install packages or run socket tests locally.
- The canonical recovery checkpoint for the pull request remains `task-1398bb14c136e94f6a4caaaaaf3740171b71767fbbf65da1203dc712e01e85a6.md`.

## Completed

- CI showed one failure among 443 relay tests: the SIGTERM shutdown assertion read `/proc/<pid>/status` and got `ESRCH`.
- Cause: the assertion accepted `ENOENT` for a disappeared process, but procfs can return `ESRCH` when it exits between opening and reading `status`.
- Both process-group assertions now accept `ENOENT` and `ESRCH` as disappearance. A readable live process still fails the test. No test was changed to work around the sandbox.

## Current checkpoint

- The scoped fix is in the working tree. The runner owns commit and push.

## Remaining

- CI reruns the complete relay suite and full Python gate after the runner pushes.

## Blockers / unresolved

- Localhost sockets are unavailable in this sandbox; the single Python socket test stays with CI.

## Evidence / artifacts

- `node tools/codex-mission-control/vps-browser-relay/test/journal-claude-worker.test.mjs`: **PASS** — 24 tests, including all three shutdown signals; Node's built-in test runner executed them directly.
- Relay JavaScript syntax: **PASS** — `npm run check` and the changed test file's `node --check`.
- `python3 -m unittest discover -s tests -v`: **UNVERIFIED** counts unavailable for the exact gate here; the socket-free run passed 495 tests after the checkpoint format repair.
- `python3 scripts/audit_codex_github.py --root . --fail-on error`: **PASS** — 0 errors, 0 warnings after the checkpoint format repair.

## Next safe action

- The runner commits and pushes this working tree. CI then runs the complete relay suite and exact full Python gate.
