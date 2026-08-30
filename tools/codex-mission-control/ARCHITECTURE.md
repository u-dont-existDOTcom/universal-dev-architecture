# Architecture summary

```text
Codex workers ─┐
               ├─ POST /api/events ─ SQLite append-only ledger
Pro supervisors┘                         │
                                         ├─ deterministic event fold
                                         ├─ configurable drift evaluator
                                         ├─ review-window change summary
                                         └─ SSE invalidation → React dashboard
```

## Stable invariants

- One immutable objective contract per mission and worker.
- Append-only events are the source of truth; current status is derived.
- Stable event IDs make retries idempotent and payload reuse conflicts fail closed.
- Drift weights and thresholds are configurable outside the UI.
- REDIRECT and major contract violations immediately force RED.
- The displayed alignment is the lower of deterministic alignment and Pro-supervisor alignment.
- Mark viewed appends a review cursor; it never mutates work evidence.
- The dashboard prioritizes intervention, changes since review, alignment, evidence, and only then raw logs.

The complete implementation record, prior-work scan, TypeScript schemas, JSON Schemas, README, design decisions, and tests are inside the restored source archive.
