# Active-task authority and blocker-scope gap map

Directive: `docs/exec-plans/2026-08-31-mission-control-active-task-authority-and-blocker-scope.md`
Baseline: `465b3b3c330189148409d509d5acb21fd898d544`

| Required control | Baseline state | Implementation in this slice | Duplication/compatibility disposition |
|---|---|---|---|
| Branch-bound exclusive task identity | Solved by `patterns/exclusive-active-task-locks.md` and `templates/ACTIVE-TASK.json` | Extended with exact ref, task-local checkpoint, global-state relation, blocker references, execution frontier, and wait identity | Reuse; no second task-lock system |
| Owner-outcome and task-local authority | Solved for identity/reconciliation | Added fixed authority precedence and deterministic task/checkpoint/branch/ref/outcome matching | Reuse owner-outcome fields; no semantic owner interpretation in code |
| Repository-global blocker scope | Missing executable control | Added `templates/SCOPED-BLOCKER.json` plus `evaluate_blocker_applicability` | New integration; generic `BLOCKED` text is never parsed as scope |
| Global-state relation to active task | Missing | Added five-state relation and suspended-competing-source projection | New integration; historical global evidence remains preserved |
| Wait admission | Reasoning-handoff polling was solved; general waits were not | Added `templates/WAIT-ADMISSION.json` plus `validate_wait_admission` | Extends without reopening executor-handoff liveness/resource accounting |
| Directive binding | Chat directive existed without blocker/wait identity | Added `authorityContext` and deterministic validation | Compatible schema-v2 extension |
| Mission Control projection | Blocker concept existed but scope/relation were not separated | Added `project_task_blockers` with active, ignored, revalidation, ambiguity, wait, owner-action, and unrelated-work fields | Read-only deterministic projection; no new scheduler |
| Exact InnerSignal regression | Missing | Added executable stale-global-blocker fixture and reducer tests | Project facts are a hostile fixture only; InnerSignal code is untouched |
| Legitimate propagating blockers | Policy prose existed | Added counter-regressions for security freeze, explicit CI dependency, owner decision, release/publication scoping, supersession, and completed conditions | Preserves repository-wide policy controls |
| Index/bootstrap recovery | Active-task lock was routed, but global-state precedence and wait admission were absent | Updated shared bootstrap, Mission Control/chat-led patterns, template/index routes | No alternate bootstrap or authority doctrine |

No existing baseline implementation supplied equivalent pure authority, blocker-applicability, wait-admission, or projection functions. `scripts/executor_handoff_state.py` remains the closed-loop reasoning-handoff reducer; this slice adds only directive authority-context validation there.
