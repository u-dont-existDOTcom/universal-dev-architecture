# Active lesson contract — Mission Control owner-request integrity

Date: 2026-09-01
Status: ACTIVE
Scope: Every new owner correction or requested Mission Control improvement on this branch

## Why this contract exists

The timestamp request was repeatedly preserved as discussion but weakened in execution into adjacent deliverables such as event timestamps, relative age, plans, schemas, and explanations. The repository already contained owner-outcome and task-time lesson controls; they were not activated at the point of work and delivery.

This contract therefore reuses:

- `patterns/owner-outcome-invariant-and-contract-laundering-prevention.md`;
- `patterns/task-time-lesson-activation.md`;
- `patterns/transformation-preservation-proof.md`;
- `docs/architecture/2026-09-01-direct-project-manager-supervision-control-plane.md`.

The existing-work basis is requirements traceability and verification rather than a new memory theory: ISO/IEC/IEEE 29148 requirements engineering, NASA bidirectional requirements traceability, and requirements-verification matrices.

## Active rules

### OI-1 — Literal owner request remains authority

Trigger: Joel requests or corrects an owner-visible behavior.

Required behavior: preserve the exact message, source identity/time when available, and SHA-256 before normalization. The normalized outcome may make the request testable but may not weaken or substitute it.

Failure condition: a plan, issue, summary, worker interpretation, or older task state becomes the apparent requirement without a backward trace to the literal owner message.

Enforcement: mechanical source/digest checks plus semantic comparison.

### OI-2 — Observable acceptance and proxy exclusions

Trigger: any request using `fix`, `improve`, `add`, `remove`, `show`, `route`, `preserve`, `change`, or an equivalent correction.

Required behavior: record what the owner must be able to observe, what evidence proves it, and which nearby artifacts do not satisfy it.

Failure condition: documentation, schemas, tests, PR state, CI, capture metadata, or an explanation is called completion when the requested behavior has not been demonstrated.

Enforcement: mechanical status vocabulary and owner-outcome terminal comparator.

### OI-3 — Task-time reactivation after owner correction

Trigger: the owner says a previously requested change remains unfixed or rejects a completion claim.

Required behavior: immediately refresh this active contract before the next substantive attempt. Continue to implementation; do not return only another causal explanation.

Failure condition: the correction is saved for closeout but does not change the next action or admission gate.

Enforcement: task-local contract plus parent `tools/codex-mission-control/AGENTS.md`.

### OI-4 — Time-source truth

Trigger: current time or message sent time is requested or needed.

Required behavior: use an available trusted clock for current check time. Keep current check time, source sent time, Mission Control capture time, and unavailable time distinct.

Failure condition: claiming there is literally no way to know the current time while a trusted system/tool clock is available; or presenting capture time as source sent time.

Enforcement: message-time functions, source-message receipts, UI labels, tests, and live verification.

### OI-5 — Learned-attractor control, not diagnosis recursion

Trigger: a model correctly diagnoses a repeated prose defect yet reproduces it.

Required behavior: classify diagnosis as present and generative control as absent. Test changes to search, decoding, activation, preference adaptation, or source transformation rather than adding another critique or model debate.

Failure condition: more explanation, self-critique, prohibitions, or Claude/GPT argument is treated as the causal intervention.

Enforcement: semantic experiment review and preregistered arm controls.

## Current requirement records

- `docs/requirements/2026-09-01-visible-chat-message-time.owner-requirement.json`
- `docs/requirements/2026-09-01-future-owner-improvement-integrity.owner-requirement.json`

## Pre-delivery gate

Before any later claim that one of these requirements is fixed, report each required outcome as `MET`, `UNMET`, or `UNKNOWN` with direct evidence. `LIVE_VERIFIED` is permitted only when every terminal-required outcome is `MET` at the requested boundary.

## Current result

The specific timestamp implementation has source-bound message records, deterministic display code, an ingestion CLI, and green tests/CI on the draft branch. It is not yet demonstrated as the complete live Project Manager/supervisor workflow, so its truthful state remains `IMPLEMENTED_NOT_LIVE_VERIFIED`.

The generic owner-improvement integrity rule is now active for this Mission Control subtree and task branch. It is not yet proven across all projects or merged into the canonical branch, so it must not be described as universally deployed.