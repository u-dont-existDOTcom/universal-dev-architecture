# Current State

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT** where this file
records actual accounts, hosts, service IDs, machine paths, private locator
attestations, or live topology. Portable rules remain in `patterns/` and
`templates/`; no owner secret or private locator belongs here.

Updated: 2026-09-28

## Goal

- Owner instruction (2026-09-28): agents consult each other directly instead of
  assuming things about each other or making the owner carry messages between
  them. Record the rule in this architecture.
- Parent outcome: **OPEN** until the pull request passes review and merges.
  The owner has approved merges when review is clean and no tradeoff needs his
  decision.

## Authority / baseline

- Canonical repository: `u-dont-existDOTcom/universal-dev-architecture`.
- Branch: `claude/agent-to-agent-consultation-20260928`, from `main` at
  `7475dd3`.
- Active assurance lane: **release**, because the change adds a root route and
  goes to a merge.

## Review finding disposition

- Codex review at `5a12bc3`: **ACCEPTED** — capability/configuration receipts
  omitted Rule 1's exact runtime tuple and applicable paired-test evidence.
  The receipt rule and example now require both; a focused regression covers it.
- Codex review at `5a12bc3`: **ACCEPTED** — gate evidence pointed to a pull
  request that the checkpoint said was unopened and omitted status/counts.
  Gate evidence is now durable in this file; a focused regression covers it.

## Preserved architecture boundaries

- Chat → Work requires explicit user acceptance; Work ↔ Work uses native
  Work-internal coordination; Work → the originating Chat is unavailable.
  Mission Control's autonomous control-plane routing of supervision and
  escalation does not create a native return edge or transfer semantic
  reasoning authority.
- Production promotion is not authorized by this change. A consultation adds
  no authority; merge, deployment, spending and access gates stay where they
  are.
- Coverage-before-depth completion references remain active in
  `patterns/coverage-before-depth-in-selection.md`,
  `audits/2026-08-21-askrigor-coverage-before-depth-promotion.md`, and
  `tests/test_coverage_before_depth_pattern.py`.

## Completed

- Added `patterns/agent-to-agent-consultation.md`: scope every claim about
  another agent to its runtime, settle it in that runtime, consult the other
  agent directly with at most one reconciliation round, and treat a relayed
  message as a missed route.
- Routed it from root `AGENTS.md`, `LESSON-INDEX.md` (entry 58) and
  `docs/INDEX.md`.
- Added `tests/test_agent_to_agent_consultation_pattern.py`.
- Used the Claude → Codex route once in the owner's runner (observed): Codex's
  answer on reading back a run's model matched a direct test. The test also
  showed that the read-only sandbox blocks the network of Codex's commands but
  not its hosted web search; the route now adds `-c web_search="disabled"`,
  which a runner test confirmed removes web search.
- Added the review regressions to
  `tests/test_agent_to_agent_consultation_pattern.py` and
  `tests/test_current_state_concision.py`.

## Current checkpoint

- The accepted review fixes are implemented and rebased onto `daadf61`; the
  full suite passes outside the Codex sandbox. Next: Codex re-review.

## Blockers / unresolved

- No implementation or owner-decision blocker.

## Evidence / artifacts

- Reviewed-state focused regressions: **EXPECTED FAIL** — 8 tests run, 5
  failures; each new check failed on the missing receipt scope or gate record.
- Repaired focused regressions: **PASS** — 8 tests run, 0 failures, 0 errors.
- `python3 -m unittest discover -s tests -v`: **PASS** — 475 tests run on the owner's laptop outside the Codex sandbox, 0 failures, 0 errors.
- `python3 scripts/audit_codex_github.py --root . --fail-on error`: **PASS** — 0 errors, 0 warnings, 0 findings.

## Remaining

- Codex re-review and merge.

## Next safe action

- Wait for the Codex re-review of the pushed head.
