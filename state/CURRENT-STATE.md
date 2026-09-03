# Current State

Updated: 2026-09-03

## Goal

Complete the owner-authored execution-only closeout queue for the Mission
Control Hostinger bridge and PR #58 by adding the settled anonymous read-only
Streamable HTTP MCP control-plane endpoint, validating and checkpointing the
exact branch, deploying the exact final SHA only to the Railway hotfix service,
connecting a private ChatGPT Pro developer-mode app on Hostinger, and running
the bounded MCP preflight, capability, ordinary synthetic, and escalated
same-chat acceptance cycles.

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
- Public MCP/live-acceptance requirement:
  `docs/requirements/2026-09-03-mission-control-public-mcp-live-acceptance.owner-requirement.json`.
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
- Public MCP boundary: `/mcp` may advertise only the three exact-bound read-only
  control-plane tools; failure is any list/search/write tool, private
  fleet/worker/evidence/assistant-content disclosure, stale or mismatched
  binding response, missing noauth/read-only metadata, or browser-prompt copy of
  the request nonce.

All five controls are mechanically enforced by code/tests or live environment
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
- Added `/mcp` using `@modelcontextprotocol/sdk` 1.30.0 and the SDK's Web
  Standard Streamable HTTP transport, distinct from the existing private
  authenticated `/api/mcp` fleet/worker surface.
- Added exactly `get_capability_challenge`,
  `get_supervisory_request_binding`, and `get_stage_liveness_state`, with
  read-only/non-destructive annotations, noauth metadata, exact-ID/chat lookup,
  current owner-outcome/expiry checks, per-stage liveness counts, and no
  enumeration or mutation path.
- Updated capability, direct, reader, Pro reasoner, liveness checker, and writer
  prompts to require the exact `Mission Control` app tools while keeping
  substantive evidence and writes in GitHub and omitting both MC/request nonce
  values from browser prompts.
- Focused MCP security tests pass 5/5; focused relay prompt/state tests pass
  17/17; TypeScript typecheck passes. A standards-compatible official SDK
  client also proved initialize, tool discovery, and one safe challenge call
  against a live local Next.js `/mcp` route, with external telemetry containing
  only tool/challenge/chat/status/time.

## Current checkpoint

Accepted head `10a00f9e72000f09bbbaf25013df69d16bf754e6` is pushed, hosted-green,
installed on Hostinger, and live-verified for exact visible `Extra High -> Pro
-> Extra High`. One paced harmless capability prompt completed without a #60
receipt because the supervisor had no sanctioned direct URL for the live
Mission Control nonce.

The public MCP candidate is locally protocol- and security-verified. The
existing diagnostic `GET /api/capability-challenges/<challenge-id>` route and
the authenticated `/api/mcp` and worker APIs remain unchanged. Commit/push and
the single hosted CI/CodeQL checkpoint remain pending; no live configuration,
Railway service, Hostinger browser, or GitHub receipt has yet been changed in
this continuation.

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
  `mission-control-pr58-remote-mcp-20260903`.

## Blockers / unresolved

- Local public MCP implementation has no known blocker.
- Commit/push, one hosted CI/CodeQL checkpoint, exact-SHA hotfix deployment,
  direct live MCP scan, Hostinger private app registration, a fresh challenge,
  MCP preflight, doctor/mode proof, and live acceptance remain pending.
- Interactive ChatGPT login is an explicit stop boundary if encountered.

## Remaining

1. Commit/push the exact reviewed candidate and obtain one normal hosted CI and
   CodeQL checkpoint without a redundant local full-suite run.
2. Rotate the disposable challenge and GitHub raw nonce consistently, deploy
   only the isolated Railway hotfix from the exact SHA, and verify the public
   route response and exact build/daemon/health evidence.
3. Prove the deployed `/mcp` endpoint with the official SDK client, then use the
   existing authenticated Hostinger browser profile to register a private
   developer-mode app named exactly `Mission Control`, accepting it only if the
   scan shows the intended three read-only tools.
4. Install the same exact SHA on Hostinger, keep normal submission disabled,
   rerun doctor/mode proof, then run one harmless MCP-read preflight and the
   fresh #60 capability challenge under the existing pacing gate.
5. If capability passes, continue automatically through the one ordinary and
   one escalated harmless acceptance cycles and collect reconciliation,
   pacing, memory, and truthful provider-timestamp evidence.

## Next safe action

Commit and push the public MCP candidate, then wait for its single hosted
CI/CodeQL checkpoint before rotating live challenge data or deploying.

## Recovery rule

Resume from the current branch/worktree. Do not repeat completed pacing design,
broaden AskRigor methodology, regenerate unrelated Mission Control artifacts,
touch Railway production, enable continuous sending, merge before every live
criterion passes, or inspect assistant output.
