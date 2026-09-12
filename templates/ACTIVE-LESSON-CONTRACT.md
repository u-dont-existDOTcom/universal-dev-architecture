# Active Lesson Contract

Task: `<task identity>`
Authority checked: `<repo/ref/current state>`
Compiled at: `<date/time or commit>`
Contract status: `CURRENT | STALE`

Use this as a **small task-time application gate**, not as another lesson archive. Load only lessons that can materially change the current task.

## Guidance activation provenance

Record this before claiming that universal/project lesson controls protected the task.

- Guidance layer: `<universal | project | owner-correction bundle>`
- Source repository/ref/commit: `<exact current source when available>`
- Activation route: `<project AGENTS/bootstrap | current task directive | current owner instruction | authenticated supervision/admission path | other authoritative route>`
- Route evidence: `<path/ref/receipt/exact in-context source>`
- Activation status: `ACTIVE | NOT_ACTIVATED | STALE`

`rule exists in GitHub`, `the model may know it`, and `a prior chat once loaded it` are not activation evidence. If current authority says the task is governed by this guidance and status is `NOT_ACTIVATED` or `STALE`, consequential method commitment, release, or owner-facing substantive delivery is blocked until current guidance is actually loaded and the relevant lesson set is compiled.

## Active lessons

For each lesson:

### `<lesson id / short name>`
- Source: `<repo/ref/path or owner correction>`
- Trigger: `<why it applies now>`
- Required behavior: `<what must actually happen>`
- Failure condition: `<observable evidence it was not applied>`
- Repair: `<what to do on failure>`
- Enforcement: `mechanical | semantic | owner-evaluated`

## Pre-attempt activation

- Guidance activation provenance: `PASS | FAIL`
- Authority/current-state freshness: `PASS | FAIL`
- Relevant lesson retrieval complete: `PASS | FAIL`
- Latest owner correction activated: `PASS | FAIL | N/A`
- Active set small enough to remain live: `PASS | FAIL`

Result: `ACTIVE | BLOCKED`

## Pre-delivery / pre-action admission receipt

For each active lesson record:

- `<lesson>`: `PASS | NOT_APPLICABLE | FAIL` — evidence: `<literal span/action/check/result>`

Guidance activation: `ACTIVE | NOT_ACTIVATED | STALE`
Contract freshness: `CURRENT | STALE`

Admission: `ADMITTED | BLOCKED`

A substantive `FAIL`, stale contract, or required-but-unactivated guidance layer blocks the affected delivery/action. `I read it`, `the prompt included it`, and `I remembered it` are not application evidence.

## Feedback refresh

If the owner corrects/rejects the work or the task materially changes:

1. preserve the correction/change in canonical working state;
2. update the lesson store when warranted;
3. recompile this contract before the next substantive attempt;
4. mark the previous contract stale rather than silently reusing it.
