# Current State

Updated: 2026-09-03

## Goal

Complete the owner-authored execution-only closeout queue for the Mission
Control Hostinger bridge and PR #58 in order: preserve the global browser-send
pacing patch, add the settled universal structured-output failure boundary,
expose the disposable capability challenge through a narrow public read-only
endpoint, validate and checkpoint the exact branch, deploy the exact final SHA
only to the Railway hotfix service, install it on Hostinger, and run bounded
doctor, capability, ordinary synthetic, and escalated same-chat acceptance
cycles.

## Authority / baseline

- Branch: `task/mission-control-vps-browser-relay-20260902`.
- Reviewed candidate baseline: `c3994fe5c032a39e08326e951bc7c9b2b898940b`.
- Pacing commit already pushed at recovery: `c0c6d8c65189c555c41cacae6ee1cbe427f98457`.
- Owner requirement:
  `docs/requirements/2026-09-02-global-chatgpt-submission-pacing.owner-requirement.json`.
- Structured-output requirement:
  `docs/requirements/2026-09-03-structured-output-failure-boundary.owner-requirement.json`.
- Model-picker compatibility requirement:
  `docs/requirements/2026-09-03-model-menu-selector-compatibility.owner-requirement.json`.
- Capability-path requirement:
  `docs/requirements/2026-09-03-capability-challenge-public-read.owner-requirement.json`.
- Assurance lane: release-grade branch/hotfix/Hostinger acceptance boundary.
  Production service `e1db3d50-b963-42d2-a21d-b52601fcfb92` is forbidden.
  Do not inspect assistant output or redesign authority semantics.

## Active lesson contract

- Literal owner correction: every actual browser message send shares one
  persisted global cooldown; failure is any bypass or per-route-only pacing.
- Authority preservation: cooldown/no-send status cannot mutate delivery or
  semantic authority; failure is a route-stage transition without a click.
- Browser safety: clicked-but-unverified sends remain ambiguous; failure is an
  automatic replay or a pacing timestamp lost after restart.
- Live boundary: Hostinger normal submission remains disabled; failure is a
  continuous task sender outside the explicitly bounded synthetic acceptance
  routes.
- Structured-output boundary: serialization/interface failure stays distinct
  from semantic/scientific failure; failure is any attempt-ceiling bypass,
  silent repair, lost parser evidence, or dependent scoring without admission.
- Capability disclosure boundary: the public route may project only the eight
  disposable challenge fields; failure is any worker/auth/task/decision/ref
  disclosure, challenge enumeration, stale challenge response, mutation path,
  or browser-prompt copy of the MC nonce value.

All four controls are mechanically enforced by code/tests or live environment
inspection. No semantic design decision is delegated to this execution task.

## Completed locally

- Added `MC_RELAY_MIN_SUBMISSION_INTERVAL_MS` with 60,000 ms default and
  15,000–600,000 ms validation.
- Added one serialized submission gate shared by supervision, capability, and
  stuck-recovery `continue` paths.
- Persisted the last successful CLICKED/generation-start boundary in relay
  state with monotonic preservation across stale state writers and restart.
- Added non-blocking `GLOBAL_SUBMISSION_COOLDOWN` status with `retryAfterMs`,
  `nextSubmissionAt`, and public pacing state.
- Added deterministic cross-route, same-chat, capability, continue, restart,
  config-range, and no-semantic-mutation tests.
- Updated `.env.example` and relay README.
- Relay suite: 42/42 passing; JavaScript syntax checks pass.
- Repository suite: 253/253 passing; deterministic audit: no findings.
- Mission Control application suite: 156/156 passing; TypeScript typecheck and
  production build pass.
- Owner-request integrity validator: 5/5 current records pass.
- Added the settled universal `STRUCTURED_OUTPUT_SYNTAX_FAILURE` guidance,
  machine-readable state template, index/bootstrap routing, and deterministic
  regression tests. AskRigor methodology and repository state were not changed.
- The first hotfix doctor reached authenticated Mission Control and exposed a
  live response-shape mismatch: the daemon wraps a worker snapshot as
  `{ worker, generatedAt }`, while the relay accepted only a bare snapshot.
  The client now accepts the canonical wrapper and legacy bare shape while
  still rejecting a mismatched scoped worker ID; focused and full relay tests
  pass after the compatibility repair.

## Current checkpoint

Accepted head `10a00f9e72000f09bbbaf25013df69d16bf754e6` is pushed, hosted-green,
installed on Hostinger, and live-verified for exact visible `Extra High -> Pro
-> Extra High`. One paced harmless capability prompt completed without a #60
receipt because the supervisor had no sanctioned direct URL for the live
Mission Control nonce.

The local capability-path candidate now adds exact-ID
`GET /api/capability-challenges/<challenge-id>` directly over central policy.
It returns only `schema_version`, `challenge_id`, `chat_id`, `mc_nonce`,
`github_nonce_sha256`, `github_nonce_source`, `receipt_target`, and `expires_at`;
unknown/expired challenges return 404, duplicate configured challenge IDs fail
closed, and no mutation method is exported. The existing worker route remains
owner-authenticated. The relay prompt now embeds only the derived public
challenge URL, requires the exact GitHub nonce hash and expiry checks, and never
embeds either nonce value. Focused backend/verifier tests pass 17/17, focused
relay tests pass 26/26, TypeScript typecheck passes,
and changed relay syntax passes. Commit/push and the single hosted checkpoint
remain pending.

## Preserved repository-wide completion gate

This relay correction does not supersede the repository-wide coverage-before-
depth requirement or its promotion evidence:

- `patterns/coverage-before-depth-in-selection.md`
- `audits/2026-08-21-askrigor-coverage-before-depth-promotion.md`
- `tests/test_coverage_before_depth_pattern.py`

## Live constraints

- Set `MC_RELAY_POLL_INTERVAL_MS=90000` on Hostinger.
- Keep `MC_RELAY_SUBMIT_ENABLED=0`.
- Enable `MC_RELAY_CAPABILITY_TEST_ENABLED` only for the harmless challenge.
- Use the existing hotfix-only COLLECTOR credential and
  `https://mission-control-hotfix-production.up.railway.app`.
- Stop with `INTERACTIVE_CHATGPT_LOGIN_REQUIRED` if the dedicated browser
  profile is not already authenticated.

## Evidence / artifacts

- Relay implementation and tests:
  `tools/codex-mission-control/vps-browser-relay/`.
- Exact owner requirement:
  `docs/requirements/2026-09-02-global-chatgpt-submission-pacing.owner-requirement.json`.
- Test-efficiency telemetry task:
  `mission-control-pr58-model-menu-selector-20260903`.

## Blockers / unresolved

- Local capability-path implementation has no known blocker.
- Commit/push, one hosted CI checkpoint, exact-SHA hotfix/Hostinger deployment,
  a fresh challenge rotation, doctor/mode proof, and live acceptance remain
  pending.
- Interactive ChatGPT login is an explicit stop boundary if encountered.

## Remaining

1. Commit/push the exact reviewed candidate and obtain one normal hosted CI and
   CodeQL checkpoint without a redundant local full-suite run.
2. Rotate the disposable challenge and GitHub raw nonce consistently, deploy
   only the isolated Railway hotfix from the exact SHA, and verify the public
   route response and exact build/daemon/health evidence.
3. Install the same exact SHA on Hostinger, keep normal submission disabled,
   rerun doctor and the visible mode round trip, then send one fresh harmless
   capability challenge under the existing pacing gate.
4. If capability passes, continue automatically through the one ordinary and
   one escalated harmless acceptance cycles and collect reconciliation,
   pacing, memory, and truthful provider-timestamp evidence.

## Next safe action

Commit and push the capability-path candidate, then wait for its single hosted
CI/CodeQL checkpoint before rotating live challenge data or deploying.

## Recovery rule

Resume from the current branch/worktree. Do not repeat completed pacing design,
broaden AskRigor methodology, regenerate unrelated Mission Control artifacts,
touch Railway production, enable continuous sending, merge before every live
criterion passes, or inspect assistant output.
