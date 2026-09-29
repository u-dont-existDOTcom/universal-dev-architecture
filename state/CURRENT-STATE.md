# Current State

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT** where this file
records actual accounts, hosts, service IDs, machine paths, private locator
attestations, or live topology. Portable rules remain in `patterns/` and
`templates/`; no owner secret or private locator belongs here.

Updated: 2026-09-29

## Goal

- Owner decision on 2026-09-28: switch UDA's Work Sol ladder to GPT-6 Sol.
- Parent outcome: **SATISFIED in this working tree** for the policy change.
  The socket-opening test and exact full Python gate remain for CI after the
  runner commits and pushes. Runtime activation is a separate follow-up after
  availability checks.

## Authority / baseline

- Canonical repository: `u-dont-existDOTcom/universal-dev-architecture`.
- Branch: `claude/gpt-6-sol-work-default-20260929`.
- Active assurance lane: **release checkpoint** for the owner-declared Python
  test and audit gates; the runner commits and pushes the resulting tree.
- The 2026-09-17 calibration requirement remains historical authority for the
  original GPT-5.6 Sol baseline. The 2026-09-28 owner decision amends its live
  baseline without rewriting that earlier record.

## Review finding disposition

- No external review finding is open for this change. Local diff review found
  only the intended policy, trial, example, test, and generated-lock changes.

## Preserved architecture boundaries

- GPT-6 Astra XHigh remains a matched challenger only after a qualified Sol
  XHigh failure. Earlier GPT-5.6 Sol results retain their exact labels and are
  excluded from comparisons of GPT-6 Sol baseline tasks.
- Runtime code and configuration remain untouched until each target route's
  model and effort availability is verified. Historical evidence and prior
  execution receipts remain unchanged.

## Completed

- Recorded the owner's exact 2026-09-28 wording with digests and separate
  Claude-verified source context in a new requirement amendment.
- Changed the Work ladder, trial baseline, cross-family reviewer, entry-point
  wording, telemetry template, and execution-receipt example to GPT-6 Sol.
- Updated policy tests and replaced state tests that pinned prior round prose.
- Regenerated the rule graph source lock with the repository's generator.

## Current checkpoint

- The GPT-6 Sol policy candidate is verified in the working tree. The runner
  commits and pushes it; this task leaves the tree uncommitted.
- Next action: runner commit and push, then CI completes the exact Python gate.

## Blockers / unresolved

- The sandbox denies even localhost sockets. The existing socket-opening test
  must run in CI; its source is unchanged.

## Evidence / artifacts

- Focused policy, graph, and state tests: **PASS** — 26 tests, 0 failures, 0 errors.
- Focused canonical-boundary tests: **PASS** — 17 tests, 0 failures, 0 errors.
- Socket-free repository discovery: **PASS** — 479 tests, 0 failures, 0 errors;
  1 existing localhost-server test deferred to CI without changing its source.
- `python3 -m unittest discover -s tests -v`: **UNVERIFIED** — counts unavailable
  for the exact command in this socket-denying sandbox; CI pending.
- `python3 scripts/audit_codex_github.py --root . --fail-on error`: **PASS** — 0 errors, 0 warnings, 0 findings.
- `python3 scripts/uda_rule_graph.py validate`: **PASS** — 37 graph nodes,
  9 task-time rules, 0 errors.
- Root `AGENTS.md`: 23,321 bytes, below the 32 KiB discovery budget.
- Test-cost observer at checkpoint: 530.06s elapsed; 9.06s observed test time
  (1.71%); 3 affected, 5 focused, and 2 other runs; 4 failure-discovering
  runs; 0 full-suite or mutation runs; 0 forced redundant green reruns or skips.

## Remaining

- In CI, run the socket-opening test and complete the full Python gate.
- Before switching runtime labels or model mappings, verify GPT-6 Sol at the
  needed efforts in each ChatGPT account's model picker, Codex exec, and the
  Venice catalog. Then separately update `tools/codex-mission-control/**`
  (chat labels, journal runner settings, Work-profile enum, Codex exec mapping),
  `scripts/uda_model_gateway.py`, and `tools/venice-model-gateway/**` as
  supported. These are follow-ups, not prerequisites for the policy edit.

## Next safe action

- Runner commits and pushes this working tree; CI runs the exact full Python
  gate, including the deferred localhost-server test.
