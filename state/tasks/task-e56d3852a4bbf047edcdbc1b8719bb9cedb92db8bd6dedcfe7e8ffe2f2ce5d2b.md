# Current State

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT** where this file
records actual accounts, hosts, service IDs, machine paths, private locator
attestations, or live topology. Portable rules remain in `patterns/` and
`templates/`; no owner secret or private locator belongs here.

Updated: 2026-09-29

## Goal

- Owner decision on 2026-09-28: switch UDA's Work Sol ladder to GPT-6 Sol.
- The GPT-6 Sol policy switch and prior review repairs are committed in the
  squashed PR commit `6079892`. This review remains **OPEN** pending CI, review,
  and merge.
  Runtime activation is a separate follow-up after availability checks.

## Authority / baseline

- Canonical repository: `u-dont-existDOTcom/universal-dev-architecture`.
- Branch: `claude/gpt-6-sol-work-default-20260929`.
- Task ID: `pr-280`.
- Active assurance lane: **release checkpoint** for the owner-declared Python
  test and audit gates; the runner commits and pushes the resulting tree.
- The 2026-09-17 calibration requirement remains historical authority for the
  original GPT-5.6 Sol baseline. The 2026-09-28 owner decision amends its live
  baseline without rewriting that earlier record.

## Review finding disposition

- Review of committed candidate `01c7209eca8e711f28c8c6fa67155ec7cc0c3e81`
  found two valid issues: the checkpoint described an uncommitted tree, and the
  GPT-6 Sol receipt example contradicted its GPT-5.6 Sol directive and current
  runtime contract. This round corrects both; a regression test checks the
  template pair, while checkpoint wording is deliberately not pinned by a test.
- Review of `53219c2` found a valid GPT-5.6 producer mapping gap; the row now
  covers every GPT model, and a regression test fails on the reviewed version.
  The checkpoint's pending-review action was stale and is corrected below.
  The finding's ancestry claim refers to `f03da30`, absent from this checkout;
  actual reviewed commit `53219c2` has parents `1b78d3c` and `8eae0dc`.
  Per owner instruction, no test pins this checkpoint's wording or commit IDs.
- Review of `b765c98` found that the checkpoint still named the earlier local
  history. The squashed PR commit `6079892` has `8eae0dc` as its sole parent;
  neither `a3d3290` nor `53219c2` is in its ancestry.

## Preserved architecture boundaries

- GPT-6 Astra XHigh remains a matched challenger only after a qualified Sol
  XHigh failure. Earlier GPT-5.6 Sol results retain their exact labels and are
  excluded from comparisons of GPT-6 Sol baseline tasks.
- Runtime code and configuration remain untouched until each target route's
  model and effort availability is verified. Historical evidence and prior
  execution receipts remain unchanged.
- Chat → Work requires explicit user acceptance; Work ↔ Work uses native
  Work-internal coordination; Work → the originating Chat is unavailable.
  Mission Control's autonomous control-plane routing of supervision and
  escalation does not create a native return edge or transfer semantic
  reasoning authority.
- Production promotion is not authorized by this change.
- Coverage-before-depth completion references remain active in
  `patterns/coverage-before-depth-in-selection.md`,
  `audits/2026-08-21-askrigor-coverage-before-depth-promotion.md`, and
  `tests/test_coverage_before_depth_pattern.py`.

## Completed

- Recorded the owner's exact 2026-09-28 wording with digests and separate
  Claude-verified source context in a new requirement amendment.
- Changed the Work ladder, trial baseline, cross-family reviewer, entry-point
  wording, and telemetry template to GPT-6 Sol. The execution-receipt example
  remains GPT-5.6 Sol until the directive and runtime contract support GPT-6 Sol.
- Updated policy tests and replaced state tests that pinned prior round prose.
- Regenerated the rule graph source lock with the repository's generator.

## Current checkpoint

- Last durable PR boundary: squashed commit `6079892` (sole parent `8eae0dc`),
  per current review evidence. The object is absent from this local checkout.
- The recovery state keeps the Work topology boundaries, the production-promotion
  boundary and the coverage-before-depth completion references. They are durable
  requirements carried by every checkpoint, not one round's wording.
- Next: runner commits and pushes this checkpoint correction; CI runs the
  socket-dependent test and exact full Python gate, then review and merge.

## Blockers / unresolved

- No implementation or owner-decision blocker.

## Evidence / artifacts

- `python3 -m unittest discover -s tests -v`: **UNVERIFIED** counts unavailable
  for the exact gate in this socket-free sandbox. This round's filtered discovery
  passed 481 non-socket tests; CI must run the localhost HTTP-server test.
- `python3 scripts/audit_codex_github.py --root . --fail-on error`: **PASS** — 0 errors, 0 warnings, 0 findings on this round's working tree.
- `python3 scripts/uda_rule_graph.py validate`: **PASS** — 37 graph nodes,
  9 task-time rules, 0 errors.
- Root `AGENTS.md`: 23,321 bytes, below the 32 KiB discovery budget.
- Prior round: GPT-5.6 reviewer regression failed before the fix and passed
  afterward (6 focused tests). This round's 3 focused checkpoint tests pass.
  Full discovery attempted 482 tests before the checkpoint receipt correction:
  one socket error and one now-fixed receipt failure. No sandbox-driven test-source change.
- This round's test-cost telemetry uses `/tmp`; no redundant green reruns.

## Remaining

- Commit/push this checkpoint correction, run CI, review the result, then merge.
- Before switching runtime labels or model mappings, verify GPT-6 Sol at the
  needed efforts in each ChatGPT account's model picker, Codex exec, and the
  Venice catalog. Then separately update `tools/codex-mission-control/**`
  (chat labels, journal runner settings, Work-profile enum, Codex exec mapping),
  `scripts/uda_model_gateway.py`, and `tools/venice-model-gateway/**` as
  supported. These are follow-ups, not prerequisites for the policy edit.

## Next safe action

- Runner commits and pushes this checkpoint correction; CI and review follow.
