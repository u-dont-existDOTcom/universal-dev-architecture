# Mission Control Codex exec integration candidate

Status: COMPLETED — READY FOR OWNER/CHAT REVIEW

Assurance lane: Iteration.

Owner requirement:
`docs/requirements/2026-09-17-mission-control-codex-exec-integration-candidate.owner-requirement.json`.

## Owner outcome and boundaries

Build the smallest reversible integration candidate that consumes only an
already-admitted bounded directive and explicitly routes it to local Codex,
Codex with the qualified restricted Chromium adapter, or the existing legacy
browser handler. Preserve full attempt evidence and prove the composition with
one local and one restricted-browser smoke through the candidate seam.

The controller-recovery branch/checkpoint, deployed release, production
services, leases, live routing, `state/CURRENT-STATE.md`, and browser controller
remain untouched. No PR, merge, deploy, migration, or capability expansion is
authorized.

## Active contract

- The preview flag defaults off; off and unsupported-browser paths call the
  supplied legacy handler directly.
- Routing consumes a closed typed capability field. Prompt interpretation never
  selects an execution backend.
- Codex jobs require a Mission Control admission receipt, exact directive
  digest, model/effort, deadline, workspace, output schema, and distinct attempt
  identity.
- Codex runs with ChatGPT subscription authentication, no API-key variables,
  `workspace-write`, approvals `never`, and workspace network disabled.
- The browser route digest-binds the already-qualified adapter and exposes only
  its fixed MCP surface; no CDP address or broad browser tool enters job config.
- `RUNNING`, `COMPLETED`, `FAILED`, `TIMED_OUT`, and `PROTOCOL_ERROR` remain
  distinct. Completion requires process success, valid JSONL terminal state,
  and the expected structured result.
- Timeout terminates only the attempt process group. Partial evidence remains.
- Retry is explicit and receives a new attempt ID. A completed attempt cannot be
  silently repeated.

## Work and verification

1. Add the candidate router/runner beside the existing VPS relay, using its env
   flag conventions and no new scheduler.
2. Add a narrow CLI seam and focused deterministic regressions for every owner
   required route and lifecycle failure.
3. Run focused and affected relay checks through the test-efficiency observer.
4. Copy only the candidate worktree to an isolated VPS test directory and run:
   - Smoke A: harmless disposable local filesystem/command job;
   - Smoke B: qualified adapter example.com create/read/close lifecycle.
5. Record exact smoke evidence, update the owner requirement, review the diff,
   and commit the isolated branch.

## Completed checkpoint

- Focused candidate regressions: 10 passed, 0 failed.
- Affected relay syntax check: passed.
- Smoke A: `CODEX_LOCAL`, structured `COMPLETED`, exact disposable file,
  subscription authentication, no MCP servers, and unchanged managed browser.
- Smoke B: `CODEX_BROWSER_RESTRICTED`, structured `COMPLETED`, exactly one
  completed qualified MCP call, no shell or approval events, one independently
  observed disposable target, and a restored browser baseline.
- The final candidate uses an ephemeral per-attempt Codex home, so project trust
  and the transient subscription credential copy do not remain in global config
  or durable job evidence.
- Production/deployed files, services, route hashes, leases, controller state,
  the active recovery checkpoint, and `state/CURRENT-STATE.md` were unchanged.
- Evidence: `docs/evidence/2026-09-17-mission-control-codex-exec-integration-candidate.json`.

## Stop conditions

- Do not modify production or controller-recovery state.
- Do not weaken sandbox or approval policy.
- Do not expose broad browser, raw CDP, storage, messaging, upload/download,
  account, purchase, click, type, form, or arbitrary JavaScript capabilities.
- Do not infer semantic or owner authority in the runner.
- Stop after the isolated candidate commit and review receipt.
