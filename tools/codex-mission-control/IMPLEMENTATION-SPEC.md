# Mission Control adaptation implementation contract

## Purpose

Adapt the existing PR #41 dashboard into the current owner-source, dual-alignment, typed-completion Mission Control slice. The application allocates owner attention and audits correction truth. It does not orchestrate Codex workers.

## Runtime composition

- Next.js 16 / React 19 / TypeScript;
- Node built-in SQLite behind one daemon writer;
- versioned append-only event envelopes with stable IDs, exact idempotency, and a global SHA-256 hash chain;
- daemon SSE notifications plus canonical JSON refetch;
- deterministic Zod schemas and projection/comparator tests;
- a fixture-tested stock Symphony read-only adapter.

## Required public projection

The all-worker queue is the default. Non-green cards must expose the task, execution state, worker-to-contract state, contract-to-owner state, overall traffic/verdict, exact problem, evidence, directive/response, correction lifecycle, next trigger, owner action, continuation boundary, and checkpoint age. Attention and healthy variants share one complete renderer for the owner target/gap, latest/best evidence, strategy, supporting work, next measurement/intervention, reasoning identity/age, directive, Codex state, stop/review boundary, receipt/claim, Pro escalation, owner action, and next review. Numeric alignment is secondary.

The Test cleanup fixture is normative:

```text
Problem: Worker is changing the forbidden production scheduler and callers to solve a test-only task.
Directive: Stop and revert production scheduler and caller changes; return to tests/** or test-support/**; rerun the focused test command.
State: REDIRECT DELIVERED — AWAITING ACKNOWLEDGEMENT.
Owner action: NONE.
```

## Event families

The v2 event union in `restored/codex-mission-control/lib/schema.ts` is authoritative. Major families are:

- owner source, owner outcome, owner decision, task contract, and objective reconciliation;
- worker checkpoint, supervisor assessment, evidence receipt, and research verdict;
- immutable finding plus validated finding-status changes;
- target-neutral correction lifecycle with complete attempt, authority, evidence, validity, actor, owner-action, and continuation bindings;
- typed completion claim and supervision route;
- supervision-design feedback and read-only Symphony observations;
- reasoning-supervision decisions, versioned execution directives, Codex starts, execution-only receipts, outcome-progress receipts, and supervision alerts;
- legacy v1 events, which remain readable but never gain v2 authority by translation.

## Owner-choice relay

`DECISION_REQUIRED` must include:

- exact decision context and question;
- at least two fully described options;
- benefits, drawbacks, and downstream consequences for every option;
- recommendation option and reasoning;
- complete Pro analysis reference;
- explicit default if unanswered.

Both queue and detail views render the complete packet. A compressed summary is invalid. Every owner-action source reference is validated for same-worker durable provenance before append.

## Correction and closure

The lifecycle distinguishes preparation, issuance, delivery, delivery failure, acknowledgement, start, evidence submission/rejection, verification, resolution, reopen, block, failure, withdrawal, and supersession. Milestones derive only from the current attempt.

Finding state changes are evidence-gated. Bare terminal assertions, unrelated receipts, stale evidence, cross-worker basis events, illegal transitions, and dangling directive effects fail closed. Verification validity covers every declared dimension and resolution records whether the work was corrected, the finding invalidated, or both.

## Terminal comparator

The comparator directly checks the latest owner outcome rather than trusting completion labels. Root achievement needs current exact-candidate independent receipts mapped into both required owner outcomes and reconciliation, no open gap or blocking finding, and a fresh supervisor authority-vector review. Root cancellation and authorized owner changes require exact durable owner decisions.

Numeric progress is also derived rather than trusted. Every numeric receipt declares whether higher or lower is better and stores exact baseline/previous/current deltas. Inconsistent bytes are rejected; projection independently recalculates the effective advancement, strategy efficacy, and same-strategy hold so a hostile `ADVANCING`/`VIABLE` label cannot create GREEN.

For current owner-outcome epochs, substantive Codex execution requires a reasoning decision bound to the exact current owner-outcome ID, epoch, and hash plus one exact versioned directive bound to that same authority. Legacy reasoning without these fields is readable but non-authoritative. Execution receipts are factual only and their supervisory/progress/adequacy/completion/escalation fields are literal `null`. A stop receipt prevents another start until a later independent chat review and directive. Three-turn handoffs bind the actual durable authority vector and high-water sequence.

For nonnumeric progress, `ADVANCING` requires both current and best evidence to reference current, verified, independent, same-worker durable receipts classified as direct owner-outcome evidence or a validated leading indicator. Validated leading indicators state their predictive basis and later direct-outcome decision boundary. Supporting-only work, future instructions, gaps, placeholders, missing receipts, and activity-only receipts fail closed to unmeasured/uncertain rather than GREEN.

## Ingestion and trust

The daemon internal token is generated at runtime unless explicitly supplied. External `POST /api/events` is disabled without `MISSION_CONTROL_INGEST_CREDENTIALS`, a JSON map from producer ID to fixed kind, a 32+ character secret, and nonempty worker/task scopes. The external bearer authenticates that producer; the BFF forwards immutable identity and scopes, and the daemon independently validates worker scope, task scope, event/status authority, and embedded identity.

## Completion boundary

This slice is complete only when source restoration, frozen audit, attention-first UI, dual alignment, typed completion, owner authority/reconciliation, contract-laundering and AskRigor fixtures, append-only guarantees, read-only Symphony seam, responsive evidence, archive integrity, exact commands, state checkpoint, and independent review are durable. Completion of this slice never claims the overall Mission Control owner outcome complete.
