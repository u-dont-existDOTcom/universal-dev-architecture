# Mission Control Jev shadow integration — 2026-09-21

## Owner outcome

Implement Jev so Mission Control can cheaply classify repetitive control-plane situations without transferring authority away from deterministic UDA rules or the reasoning supervisor.

## Assurance / authority

- Lane: **Iteration**.
- This branch is isolated from the owner’s dirty main checkout and all historical Mission Control lanes.
- No live deployment, shared-runtime mutation, paid inference, provider credential creation, or authority change is part of this iteration.
- Jev is shadow-only and disabled by default. Failure or absence of Jev must never block Mission Control.

## Prior-work check

- Applicability: **required**.
- Disposition: **compose/adapt**.
- Established: TypeSafe Jev/OpenRouter Decisions API provides typed independent decisions (noul, choice, score); Mission Control already has deterministic fleet-supervisor state/decisions.
- Borrowed: Jev typed decision surface and confidence outputs.
- Modified: pass only bounded control-plane facts; compare Jev output against the existing deterministic decision after it has already been made.
- Novel remainder: Mission-Control-specific state sanitization, question set, non-authoritative telemetry envelope, and fail-open integration.
- Uncertain: local calibration thresholds. No threshold is allowed to control behavior in this iteration.
- External baseline: the existing deterministic classifyFleetSupervisorTick result remains the authoritative baseline.
- Sources: TypeSafe Jev documentation and OpenRouter Decisions API / Jev model documentation reviewed 2026-09-21.

## Implementation

1. Add an opt-in Jev shadow client with pinned model/config and strict sanitized input.
2. Add typed MC questions for owner-gate, engineering-blocker, stalled-state, next-action, and consequence level.
3. Run it after deterministic fleet classification; attach results to emitted tick telemetry only.
4. Never send raw prompts, messages, logs, private thread locators, credentials, or other user content.
5. Add focused tests for disabled mode, sanitization, successful typed mapping, provider failure, and fleet-supervisor non-authority.
6. Run typecheck plus focused/affected tests under the repository test-efficiency observer.

## Verification

- Focused Jev + fleet-supervisor regression: **16/16 passed**.
- Mission Control full regression suite: **401/401 passed**.
- TypeScript `npm run typecheck`: passed.
- Canonical root test gate: **388/388 passed**.
- Canonical deterministic audit: **0 errors**, one pre-existing root-AGENTS size warning.
- `git diff --check`: required immediately before commit.
- Live Jev requests: **0**. Paid inference/spend: **0**.
- Runtime activation: deliberately not performed; enabling the shadow classifier requires an OpenRouter API key and incurs paid inference.

## Result

The source implementation is complete. Deterministic Mission Control behavior remains authoritative; Jev is an opt-in shadow observer only. Its output is calibration telemetry and cannot authorize routing, owner notification, recovery, or terminal state.
