# Mission Control Codex execution authority repair

Status: IMPLEMENTED AND VERIFIED; LIVE BROWSER SMOKE BLOCKED BY THE SEPARATE ACTIVE CONTROLLER FENCE

Assurance lane: Iteration.

Owner requirement:
`docs/requirements/2026-09-17-mission-control-codex-exec-authority-repair.owner-requirement.json`.

## Outcome and boundaries

Repair the reviewed candidate so bounded Codex work can start only after the
existing authenticated Mission Control worker admission and persisted execution
preflight bind the exact Chat source, directive artifact, revision, task,
capability and Work profile. Preserve the real legacy browser route, isolate
reusable authentication from durable evidence, and reject retries that alter
admitted semantics.

The deployed controller, production services and routing, active recovery
branch, leases, and `state/CURRENT-STATE.md` remain untouched. Natural owner
work, release promotion, deployment, merge, and PR creation are outside scope.

## Implemented contract

1. The canonical Mission Control `worker:codex-exec` entrypoint uses the
   authenticated worker admission, preflight, and event-ingestion endpoints.
2. The runner checks exact request, source, directive digest/revision/task,
   profile, model, effort, Fast-mode and trusted-setter bindings before creating
   an unforgeable in-process launch capability.
3. The standalone relay CLI is diagnostic only. A receipt-like string cannot
   reach the Codex process launcher.
4. Preview-disabled and unsupported browser work invokes the existing relay
   `once` path. No synthetic success or delegation marker is returned.
5. Each attempt uses a private `mkdtemp` Codex home in the configured runtime
   area outside durable state. Partial setup and normal completion remove it.
6. Retry identity remains explicit and distinct. The source binding covers the
   prompt, capability, workspace, result schema, source directive, Work profile,
   model, effort, sandbox, approval and network contract.
7. Mission Control records `codex_execution_started` before process launch and
   records a source/profile-bound `execution_receipt_recorded` only after a
   successful structured completion.

## Verification checkpoint

- Focused candidate regressions: 16 passed, 0 failed.
- Authenticated worker HTTP client regressions: 10 passed, 0 failed.
- Existing Mission Control admission/profile invariants: 42 passed, 0 failed.
- Integrated evaluator composition: local and restricted-browser cases passed.
- Relay and worker-entrypoint syntax checks: passed.
- Mission Control TypeScript check: passed.
- Live Smoke A: GPT-5.6 Sol Low passed through authenticated admission,
  persisted preflight, local Codex execution, start event and receipt event.
- Live Smoke B: blocked before model execution because the separate active
  controller-recovery work has deliberately fenced the existing Mission Control
  browser. Releasing or bypassing that fence is outside this branch's authority.

Evidence:
`docs/evidence/2026-09-17-mission-control-codex-exec-authority-repair.json`.

## Remaining stop condition

After the controller-recovery owner legitimately releases its browser fence,
run only the disposable live restricted-browser Smoke B from this exact branch.
Do not modify the repair, repeat raw-CDP qualification, or run natural owner
work before Chat reviews the remote diff.
