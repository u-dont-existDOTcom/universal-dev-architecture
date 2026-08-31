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

The all-worker queue is the default. Non-green cards must expose the task, execution state, worker-to-contract state, contract-to-owner state, overall traffic/verdict, exact problem, evidence, directive/response, correction lifecycle, next trigger, owner action, continuation boundary, and checkpoint age. Numeric alignment is secondary.

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
- legacy v1 events, which remain readable but never gain v2 authority by translation.

## Owner-choice relay

`DECISION_REQUIRED` must include:

- exact decision context and question;
- at least two fully described options;
- benefits, drawbacks, and downstream consequences for every option;
- recommendation option and reasoning;
- complete Pro analysis reference;
- explicit default if unanswered.

Both queue and detail views render the complete packet. A compressed summary is invalid.

## Correction and closure

The lifecycle distinguishes preparation, issuance, delivery, delivery failure, acknowledgement, start, evidence submission/rejection, verification, resolution, reopen, block, failure, withdrawal, and supersession. Milestones derive only from the current attempt.

Finding state changes are evidence-gated. Bare terminal assertions, unrelated receipts, stale evidence, cross-worker basis events, illegal transitions, and dangling directive effects fail closed. Verification validity covers every declared dimension and resolution records whether the work was corrected, the finding invalidated, or both.

## Terminal comparator

The comparator directly checks the latest owner outcome rather than trusting completion labels. Root achievement needs current exact-candidate independent receipts mapped into both required owner outcomes and reconciliation, no open gap or blocking finding, and a fresh supervisor authority-vector review. Root cancellation and authorized owner changes require exact durable owner decisions.

## Ingestion and trust

The daemon internal token is generated at runtime unless explicitly supplied. External `POST /api/events` is disabled without `MISSION_CONTROL_INGEST_CREDENTIALS`, a JSON map from producer ID to fixed kind and a 32+ character secret. The external bearer authenticates that producer; the daemon independently validates event/status authority and embedded identity.

## Completion boundary

This slice is complete only when source restoration, frozen audit, attention-first UI, dual alignment, typed completion, owner authority/reconciliation, contract-laundering and AskRigor fixtures, append-only guarantees, read-only Symphony seam, responsive evidence, archive integrity, exact commands, state checkpoint, and independent review are durable. Completion of this slice never claims the overall Mission Control owner outcome complete.
