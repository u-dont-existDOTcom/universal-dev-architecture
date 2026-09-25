# Diagnose-before-replacement strategy refinement

Status: OWNER-APPROVED + MERGE AUTHORIZED
Date: 2026-09-25

## Owner outcome

Remove arbitrary attempt-count method abandonment from the reusable outcome/strategy controller. Flat, unclear, mixed, or variable progress must trigger evidence-bound diagnosis first; concrete implementation/preparation/pacing/delivery gaps may refine a still-plausible parent strategy without resetting its history. Replacement/stop remains available for decision-relevant refusal, harm, infeasibility/resource exhaustion, specific mismatch, adequately tested contradiction/nonresponse, or a clearly better supported alternative.

## Scope

- Generalize the rule beyond InnerSignal.
- Preserve repair-candidate evidence ordering: development failures reject; development passes do not validate.
- Preserve failed-strategy lineage: a refinement cannot relabel a genuinely failed/exhausted parent back into viability.
- Keep the Mission Control instruction chain within the documented 32 KiB default budget.
- Add deterministic fixtures for skill-learning/delayed uncertainty, concrete refinement, deterministic contradiction, and refusal.

## Candidate changes

- `patterns/outcome-advancement-and-strategy-efficacy.md`: new diagnose-before-replacement and first-class refinement-lineage contract.
- `AGENTS.md`: compact root activation invariant aligned with the canonical rule.
- `templates/OUTCOME-PROGRESS-RECEIPT.json`: effect model, exposure/window review, and refinement lineage fields.
- `templates/CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md`: remove fixed two-flat-cycle replacement rule.
- `LESSON-INDEX.md` and `rules/UDA-RULE-GRAPH.json`: task-time discoverability/activation.
- `evals/method-premise/diagnose-before-replace.json`: deterministic distinction fixtures.

## Boundary

The owner explicitly approved the rules merger on 2026-09-25. Merge to Universal `main` is authorized after the repository-declared full test/audit gate and required GitHub check pass. Current direct-failure and safety rules are retained; this change does not make a failed strategy indefinitely refinable. This authority does not extend to unrelated releases or repositories.
