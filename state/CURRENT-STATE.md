# Current State

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT** where this file
records actual accounts, hosts, service IDs, machine paths, private locator
attestations, or live topology. Portable rules remain in `patterns/` and
`templates/`; no owner secret or private locator belongs here.

Updated: 2026-09-29

## Goal

- Owner decision on 2026-09-28: switch UDA's Work Sol ladder to GPT-6 Sol.
- Parent policy outcome: **SATISFIED at the committed checkpoint**. This round
  repairs two review findings in the working tree. The socket-opening test and
  exact full Python gate remain for CI after the runner commits and pushes.
  Runtime activation is a separate follow-up after availability checks.

## Authority / baseline

- Canonical repository: `u-dont-existDOTcom/universal-dev-architecture`.
- Branch: `claude/gpt-6-sol-work-default-20260929`.
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

- The review repair is committed at `1b78d3c`. `main` at `8eae0dc` (the
  journal Claude worker, #277) is merged into the branch. Conflicts were only
  in this file and `tests/test_current_state_concision.py`, which keeps main's
  general checks plus this branch's placeholder check.
- The merge also restores two checks this branch had dropped: the recovery
  state keeps the Work topology boundaries, the production-promotion boundary
  and the coverage-before-depth completion references. They are durable
  requirements carried by every checkpoint, not one round's wording.
- Next: Codex review of the merge head, then merge.

## Blockers / unresolved

- No implementation or owner-decision blocker.

## Evidence / artifacts

- Focused policy, graph, and state tests: **PASS** — 26 tests, 0 failures, 0 errors.
- Focused canonical-boundary tests: **PASS** — 17 tests, 0 failures, 0 errors.
- Socket-free repository discovery: **PASS** — 479 tests, 0 failures, 0 errors;
  1 existing localhost-server test deferred to CI without changing its source.
- `python3 -m unittest discover -s tests -v`: **PASS** — 481 tests run on the merge head outside any sandbox, 0 failures, 0 errors.
- `python3 scripts/audit_codex_github.py --root . --fail-on error`: **PASS** — 0 errors, 0 warnings, 0 findings.
- `python3 scripts/uda_rule_graph.py validate`: **PASS** — 37 graph nodes,
  9 task-time rules, 0 errors.
- Root `AGENTS.md`: 23,321 bytes, below the 32 KiB discovery budget.
- Test-cost observer at checkpoint: 530.06s elapsed; 9.06s observed test time
  (1.71%); 3 affected, 5 focused, and 2 other runs; 4 failure-discovering
  runs; 0 full-suite or mutation runs; 0 forced redundant green reruns or skips.
- This round: the new template-pair regression failed before the receipt fix
  and passed after it; 114 affected Python tests and 30 relay core tests pass.
  The exact repository audit passes with no findings. Relay candidate execution
  tests that spawn a child failed in this sandbox; no test source was changed.
- Test-cost snapshot: 267.44s elapsed, 2.62s tests (0.98%); affected 6 runs /
  2.47s / 2 failure-discovering, focused 3 runs / 0.15s / 1 failure-discovering;
  no full or mutation runs, forced green reruns, or redundant skips (0s avoided).

## Remaining

- Codex review of the merge head, then merge.
- Before switching runtime labels or model mappings, verify GPT-6 Sol at the
  needed efforts in each ChatGPT account's model picker, Codex exec, and the
  Venice catalog. Then separately update `tools/codex-mission-control/**`
  (chat labels, journal runner settings, Work-profile enum, Codex exec mapping),
  `scripts/uda_model_gateway.py`, and `tools/venice-model-gateway/**` as
  supported. These are follow-ups, not prerequisites for the policy edit.

## Next safe action

- Wait for the Codex review of the merge head; the shepherd merges it when the review allows.
