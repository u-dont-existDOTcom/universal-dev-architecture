# Fresh review launch — method-premise supervision pilot v1

Use a fresh reasoning context that has not read the Life Patterns root-cause audit, the pilot proposal, the development fixture with expected labels, the answer key, or PR #96 discussion.

## Allowed reads before freezing predictions

Read only these files from the exact candidate head named by the launcher:

1. `patterns/task-time-lesson-activation.md`
2. `templates/ACTIVE-LESSON-CONTRACT.md`
3. `templates/PRIOR-WORK-SCAN.md`
4. `templates/METHOD-FORK-CARD.md`
5. `evals/method-premise/blind-supervision-cases-v1.json`

Do **not** read before prediction freeze:

- `evals/method-premise/blind-supervision-answer-key-v1.json`
- `evals/method-premise/manufactured-prerequisite-pilot.json`
- `evals/method-premise/universal-activation-wiring-pilot.json`
- `audits/2026-09-12-manufactured-prerequisite-supervision-replay.md`
- `proposals/2026-09-12-outcome-first-supervision-discussion.md`
- any Human Design / Life Patterns repository material
- PR #96 body/comments/reviews

## Task

For every `method_case`, independently decide:

- `gate_triggered`: `true | false`
- `necessity_state`: `ESTABLISHED | UNRESOLVED | NOT_NECESSARY | null`
- `disposition`: `commit_or_scale | bounded_experiment_only | do_not_promote_as_prerequisite | ordinary_iteration | owner_decision`
- `owner_action`: `NONE | DECISION_REQUIRED`
- `critical_reason`: one concise reason tied to the supplied facts

For every `activation_case`, decide:

- `activation_status`: `ACTIVE | NOT_ACTIVATED | STALE`
- `critical_reason`: one concise reason tied to the supplied facts

Important:

- Do not assume simpler is always better.
- Distinguish a genuine requirement/constraint from one particular implementation.
- Do not manufacture owner decisions when a cheap reversible probe can resolve uncertainty.
- Do not waive a verified hard external requirement merely because an alternative is simpler.
- Rules existing in a repository are not automatically evidence they were active on a task.

## Required output

Return **only** one JSON object in this form:

```json
{
  "schema_version": 1,
  "candidate_head": "<exact reviewed commit>",
  "method_cases": {
    "CASE-A": {
      "gate_triggered": true,
      "necessity_state": "UNRESOLVED",
      "disposition": "bounded_experiment_only",
      "owner_action": "NONE",
      "critical_reason": "..."
    }
  },
  "activation_cases": {
    "ACT-A": {
      "activation_status": "NOT_ACTIVATED",
      "critical_reason": "..."
    }
  }
}
```

Do not reconcile against any expected answer before the complete JSON prediction is frozen outside this context.
