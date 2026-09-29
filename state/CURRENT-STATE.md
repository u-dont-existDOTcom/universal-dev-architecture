# Current State

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT** where this file
records actual accounts, hosts, service IDs, machine paths, private locator
attestations, or live topology. Portable rules remain in `patterns/` and
`templates/`; no owner secret or private locator belongs here.

Updated: 2026-09-29

## Goal

- Merge pull request #277 (the journal Claude worker and usage meter). Its
  review rounds are complete: eight fix rounds, with one minor finding deferred
  in a pull-request comment. The branch conflicted with `main` after the
  agent-to-agent consultation rule (#279) merged; this checkpoint records the
  merge of `main` into the branch.
- Parent outcome: **OPEN** until the pull request merges.

## Authority / baseline

- Branch `claude/mc-journal-claude-worker-20260928`, head `8b7c9fb` before
  the merge of `main` (`e1ba407`).
- Active assurance lane: **release**: the owner approved merging when review
  allows. Deployment stays owner-gated.
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

- `main` at `e1ba407` is merged into the branch head `8b7c9fb`. Conflicts were
  only in this file and `tests/test_current_state_concision.py`. That test file
  keeps its general checks (concision, gate evidence with status and counts)
  and drops three tests that pinned one task's checkpoint wording and commit
  IDs; every later task rewrites this file, so those tests could never hold.
- Next: Codex review of the merge head, then merge.

## Completed

- Hit-limit repair and the earlier attempt-budget repair, with regressions
  that were red before repair and green after (see the disposition above).
- Merged `main` and resolved the two conflicts described in the checkpoint.

## Remaining

- Codex review of the merge head, then merge.

## Blockers / unresolved

- No implementation or owner-decision blocker.

## Evidence / artifacts

- `python3 -m unittest discover -s tests -v`: **PASS** — 478 tests run on the merge head outside any sandbox, 0 failures, 0 errors.
- `python3 scripts/audit_codex_github.py --root . --fail-on error`: **PASS** — 0 errors, 0 warnings, 0 findings.
- Relay `npm test` in `tools/codex-mission-control/vps-browser-relay`: **PASS** — 443 tests, 0 failures.

## Next safe action

- Wait for the Codex review of the merge head; the shepherd merges it when the review allows.
