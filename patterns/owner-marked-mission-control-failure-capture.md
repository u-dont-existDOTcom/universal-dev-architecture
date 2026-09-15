# Owner-marked Mission Control failure capture

**Status:** Current universal capture rule  
**Date:** 2026-09-15

## Purpose

Prevent an owner-explicitly identified reasoning, instruction-following, routing, or execution failure from remaining only in chat context when the owner intends it to become durable Mission Control evidence.

This rule closes a destination/activation gap. Mission Control already has an append-only event ledger, supervision-design feedback records, supervision-escape assurance, and dedicated supervisor routes. Those mechanisms do not by themselves prove that an arbitrary ordinary ChatGPT conversation was observed or persisted.

## Trigger

Activate this rule when the owner explicitly does any of the following:

- identifies a current or prior assistant/Chat/Work/Codex failure as a Mission Control example;
- says to save, record, capture, log, or preserve a failure for Mission Control;
- asks whether such failures/examples were actually recorded;
- asks to recover previously reported Mission Control failure examples.

A generic complaint, disagreement, or negative reaction does **not** authorize a public-repository write merely because it could be useful as feedback. When capture intent is ambiguous, answer the substantive issue and do not publish conversation content by inference.

## Required capture boundary

When the trigger is explicit and current Chat has ordinary GitHub write capability to the canonical architecture repository, the active Chat must make the durable write itself on an isolated task branch before claiming that the failure is saved. Do not route the write to Work merely because Work originally implemented Mission Control.

A valid capture records, as applicable:

- the bounded owner correction or exact quote when safely publishable;
- a digest of the source text;
- the failure mechanism rather than only the surface complaint;
- source/recovery quality (`EXACT_TEXT`, `BOUNDED_SUMMARY`, or `PARTIAL_RECOVERY`);
- relevant evidence and affected control;
- current status and the next verification boundary.

Use the existing `feedback/mission-control/` family for supervision-design defects and the existing Mission Control event schema when an authenticated runtime ingestion route is actually available. Do not invent a second failure database, event ledger, scheduler, or supervisor.

## Privacy and public-repository boundary

The universal repository is public. Never persist secrets, credentials, private chat locators, account identifiers, private infrastructure details, medical/private personal content, or another person's sensitive information merely to preserve a failure example.

If the exact owner text is sensitive, store only the smallest non-sensitive description needed to identify the failure mechanism plus a digest/provenance note when useful. State that exact source text was intentionally not published. Privacy redaction is not evidence loss when the semantic defect and source binding remain sufficient for the engineering task.

## Recovery of prior examples

When the owner asks to recover earlier examples:

1. search the available prior-conversation/project context and relevant Git history;
2. preserve exact quotes only when actually recovered;
3. label paraphrased or remembered incidents as `BOUNDED_SUMMARY` or `PARTIAL_RECOVERY`;
4. do not manufacture an exact quote, timestamp, message ID, or causal detail;
5. deduplicate against already durable Mission Control records;
6. retain branch/ref provenance when exact historical evidence lives off `main`.

A recovery list is evidence inventory, not automatic semantic adjudication. Whether an incident is a `SUPERVISION_ESCAPE`, its materiality, family identity, and whether a prior repair failed remain reasoning judgments under `patterns/mission-control-owner-discovered-supervision-escape-assurance.md`.

## Capture truth states

Use these meanings in owner-facing claims:

- `NOT_DURABLE` — present only in conversation/memory/scratch state or a write failed;
- `CAPTURED_BRANCH_ONLY` — durable GitHub artifact exists on a non-canonical task branch;
- `CANONICAL` — durable artifact is present on the canonical branch or accepted canonical runtime ledger;
- `PARTIAL_RECOVERY` — an incident is durably represented but exact source evidence could not be fully recovered.

Do not call `NOT_DURABLE` saved. Do not call `CAPTURED_BRANCH_ONLY` canonical. A schema, template, prompt, queue intent, or statement that a failure will be remembered is a non-satisfying proxy for the requested durable capture.

## Failure behavior

If the owner explicitly requests capture but GitHub/runtime write access is unavailable, finish any safe local diagnosis and say explicitly that the record is **not yet durable**. Do not claim success and do not silently substitute ChatGPT Memory.

If the capture path itself repeatedly drops explicit owner-marked failures, treat that recurrence as evidence that the existing capture/enforcement plane needs redesign. Follow the existing anti-meta-recursion rule: repair the current plane rather than adding another supervisor or ledger.

## Acceptance regressions

At minimum, future enforcement should cover:

1. `save this failure for Mission Control` + GitHub write available -> a durable artifact identity exists before the assistant claims it is saved;
2. explicit capture + write unavailable -> assistant reports `NOT_DURABLE`, not success;
3. ordinary criticism without capture intent -> no automatic public-repository publication;
4. recovery of prior examples -> exact quotes and summaries are labeled distinctly;
5. sensitive source text -> bounded sanitized artifact, no private locator/secret disclosure;
6. pre-existing template/event schema with no emitted artifact -> does not count as capture.

## Relationship to existing controls

This rule composes with:

- `patterns/durable-chat-learning.md`;
- `patterns/task-time-lesson-activation.md`;
- `patterns/mission-control-owner-discovered-supervision-escape-assurance.md`;
- `patterns/runtime-chat-work-authority-admission-and-internal-routing.md`;
- `templates/SUPERVISION-DESIGN-FEEDBACK.json`;
- `templates/SUPERVISION-ESCAPE.json`.

It does not authorize passive surveillance of arbitrary personal chats, automatic publication of complaints, or semantic classification by deterministic code.