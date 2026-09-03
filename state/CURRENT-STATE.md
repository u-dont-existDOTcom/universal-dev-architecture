# Current State

Updated: 2026-09-03

## Goal

Complete the owner-authored execution-only closeout queue for the Mission
Control Hostinger bridge and PR #58 in order: preserve the global browser-send
pacing patch, add the settled universal structured-output failure boundary,
validate and checkpoint the exact branch, deploy the exact final SHA only to
the Railway hotfix service, install it on Hostinger, and run bounded doctor,
capability, ordinary synthetic, and escalated same-chat acceptance cycles.

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

Accepted head `5c35dd4273db8f58559c25b664491e848a63a129` passed its hosted checkpoint,
hotfix deployment, Hostinger installation, and doctor. Live capability stopped
fail-closed before submission because the current ChatGPT picker exposes power
levels through a composer-scoped Radix menu and ARIA slider instead of flat
`menuitem`/`option` entries.

The narrow compatibility candidate now scopes the trigger to the actual
composer, binds the open menu to that trigger, retains exact direct-option
support, and discovers slider values only by stepping the semantic Power
control and observing exact displayed labels. It does not encode ordinal-to-
model mappings. The candidate has already exercised the authenticated live
browser without sending a message and returned exact `Extra High -> Pro ->
Extra High`; installation of a committed/pushed SHA and the capability challenge
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

- Local selector implementation has no known blocker.
- Commit/push, one hosted CI checkpoint, exact-SHA Hostinger installation,
  doctor, and the harmless capability receipt remain pending.
- Interactive ChatGPT login is an explicit stop boundary if encountered.

## Remaining

1. Finish focused relay validation and exact diff review, commit/push, and obtain
   one normal hosted CI checkpoint.
2. Install the exact commit on Hostinger without touching Railway production;
   update the isolated hotfix backend only if exact-SHA coupling is mechanically
   required.
3. Keep normal submission disabled, rerun doctor and the visible mode round trip,
   then run only the harmless capability challenge if the preflight passes.
4. Reconcile the capability receipt and stop unless the already-authorized queue
   can continue without a new policy choice.

## Next safe action

Commit and push the selector compatibility candidate, then wait for its single
hosted CI checkpoint before exact-SHA Hostinger installation.

## Recovery rule

Resume from the current branch/worktree. Do not repeat completed pacing design,
broaden AskRigor methodology, regenerate unrelated Mission Control artifacts,
touch Railway production, enable continuous sending, merge before every live
criterion passes, or inspect assistant output.
