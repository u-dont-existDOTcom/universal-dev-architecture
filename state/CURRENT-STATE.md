# Current State

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT** where this file
records actual accounts, hosts, service IDs, machine paths, private locator
attestations, or live topology. Portable rules remain in `patterns/` and
`templates/`; no owner secret or private locator belongs here.

Updated: 2026-09-28

## Goal

- Address the hit-limit Codex finding on the journal Claude worker in
  pull request #277, reviewed at `393db73`, with a regression that fails before
  repair. Leave the result uncommitted and unpushed for the repository runner.
- Local outcome: **SATISFIED for runner handoff**. CI owns the sandbox-incompatible
  full relay and local-socket tests.

## Authority / baseline

- Current owner request: fix the finding, run touched socket-free tests and
  sandbox-compatible repository gates, change no test to bypass the sandbox,
  record this round, and leave the working tree uncommitted/unpushed.
- The live default-branch `AGENTS.md` was fetched through the web surface
  this turn; the shell remains networkless.
- Previous-round record: Last verified durable boundary: `af245cf`, which
  already contains the two earlier review repairs.
- Current baseline: clean task branch
  `claude/mc-journal-claude-worker-20260928` at `393db73`.
- Active assurance lane: **review/handoff candidate**. No deploy, install, push,
  or service mutation is authorized from this workspace.
- Chat → Work requires explicit user acceptance; Work ↔ Work uses native
  Work-internal coordination; Work → the originating Chat is unavailable.
  Mission Control's autonomous control-plane routing of supervision and
  escalation does not create a native return edge.
- Production promotion is not authorized from this workspace.

## Active lesson contract

- **Privacy:** persist only opaque work IDs, attempt numbers, and expiry
  timestamps; never packet, answer, Claude `result`, or `session_id`.
- **Retry/state ownership:** persist the consumed attempt before invoking Claude,
  retain it through failed listings and usage backoff, and exhaust an unanswered
  item after its second invocation. Clear markers on answer, disappearance, or
  expiry; conservatively exhaust legacy markers with no attempt count.
- **Verification:** show the new regression red at the reviewed code and green
  after repair; run the touched Node file, static checks, non-socket Python
  tests, and deterministic audit. Leave local-socket coverage to CI.

## Review finding disposition

- **Hit-limit finding — valid.** The reviewed classifier recognized `usage limit`
  and `limit reached` but missed Claude's `You've hit your limit`. Its reset
  parser also missed `resets 3pm`. The worker retried immediately and exhausted
  the item instead of pausing the queue.
- The new two-item regression was red before repair (`ERROR` instead of
  `LIMITED`). The worker now recognizes `hit your limit`, parses the next local
  am/pm reset time, and retains the ISO and backoff paths. The regression is
  green: one Claude invocation across two passes, pause until local 3pm, one
  limit event, and no private result in persisted state.
- Prior attempt-budget repair at `6af37bb` persisted `{work_id, attempt}` before
  invocation and prevented a transient listing failure from resetting the two
  invocation budget. Its regression remains green.
- Preserve the active completion gate: `patterns/coverage-before-depth-in-selection.md`,
  `audits/2026-08-21-askrigor-coverage-before-depth-promotion.md`, and
  `tests/test_coverage_before_depth_pattern.py`.

## Current checkpoint

1. Reproduce the hit-limit finding at the reviewed code. **Complete.**
2. Recognize the CLI wording and parse its local reset; add regression. **Complete.**
3. Run sandbox-compatible checks and review the diff. **Complete.**
4. Preserve the uncommitted runner handoff. **Complete.**

## Completed

- Added a regression that was red before repair and green afterward. The worker
  test file passes 24/24 using Node's built-in runner with
  `--test-isolation=none` in this sandbox. `npm run check` passes.
- Repository unittests excluding exactly one test that binds `127.0.0.1` pass
  468/468. The exact deterministic repository audit passes without findings.
- Reviewed the source, test, and state diff; no tests were changed to bypass
  the sandbox.

## Remaining

- CI must run the full relay `npm test` gate and the exact unfiltered Python
  unittest gate, including the local-socket case.

## Blockers / unresolved

- No implementation or owner-decision blocker remains. The sandbox prohibits
  local sockets; full socket coverage is a CI-only residual.

## Evidence / artifacts

- Red regression: the reported hit-limit response returned `ERROR`; green
  regression: it returned `LIMITED` and suppressed the next queued item.
- Node worker tests: 24/24 PASS. Relay static check: PASS. Non-socket Python
  tests: 468/468 PASS. Deterministic audit: PASS.
- Test-cost telemetry: `/tmp/pr277-hit-limit-review.jsonl`.

## Next safe action

- The repository runner may commit and push this source, test, and state delta,
  then let CI execute the sandbox-incompatible gates. Do not commit or push
  from this workspace.
