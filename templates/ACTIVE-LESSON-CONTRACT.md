# Active Lesson Contract

Task: `<task identity>`
Authority checked: `<repo/ref/current state>`
Compiled at: `<date/time or commit>`
Contract status: `CURRENT | STALE`

Use this as a **small task-time application gate**, not as another lesson archive. Load only lessons that can materially change the current task.

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

- Authority/current-state freshness: `PASS | FAIL`
- Relevant lesson retrieval complete: `PASS | FAIL`
- Latest owner correction activated: `PASS | FAIL | N/A`
- Active set small enough to remain live: `PASS | FAIL`

Result: `ACTIVE | BLOCKED`

## Pre-delivery / pre-action admission receipt

For each active lesson record:

- `<lesson>`: `PASS | NOT_APPLICABLE | FAIL` — evidence: `<literal span/action/check/result>`

Contract freshness: `CURRENT | STALE`

Admission: `ADMITTED | BLOCKED`

A substantive `FAIL` or `STALE` blocks delivery/action. `I read it`, `the prompt included it`, and `I remembered it` are not application evidence.

## Feedback refresh

If the owner corrects/rejects the work or the task materially changes:

1. preserve the correction/change in canonical working state;
2. update the lesson store when warranted;
3. recompile this contract before the next substantive attempt;
4. mark the previous contract stale rather than silently reusing it.
