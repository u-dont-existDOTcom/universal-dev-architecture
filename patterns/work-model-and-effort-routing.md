# Work Model and Effort Routing

Status: REQUIRED OWNER POLICY
Date: 2026-09-14
Updated: 2026-09-17
Owner trial requirement: `docs/requirements/2026-09-17-work-model-routing-calibration.owner-requirement.json`

## Purpose and authority

Choose between GPT-5.6 Sol and GPT-6 Astra by observed useful completion per Work/Codex allowance, not by model prestige, benchmark generalization, or an assumption that Astra is automatically better for difficult execution.

This pattern composes with [`chat-work-execution-routing-threshold.md`](chat-work-execution-routing-threshold.md). Chat owns semantic, architectural, strategy, acceptance, permission-boundary, and owner-intent reasoning. Work receives only the bounded execution residue.

Optimize:

```text
probability of correct direct-endpoint execution × useful completion speed
-------------------------------------------------------------------------
                    Work/Codex allowance consumed
```

Consumer-seam correctness is the acceptance boundary. Scope discipline, stop-condition compliance, and consequential-action boundaries are part of correctness. A run that produces useful implementation but exceeds its authorized scope is not a clean success.

The active owner-authorized calibration from 2026-09-17 changes the prior hard-task hypothesis. **GPT-6 Astra Low is no longer the default first-line model for genuinely difficult Work.** During the trial, genuinely difficult residual execution starts with **GPT-5.6 Sol Extra High (XHigh)**. **GPT-6 Astra Extra High (XHigh)** is a matched challenger only after a qualified Sol XHigh failure, unless the owner explicitly requests another model or later evidence establishes a narrower exception.

## Admission and availability

### Tier 0 — no Work

Keep the existing Chat/Work admission gate. If Chat can perform the action, do not invoke Work. Resolve semantic or architectural uncertainty in Chat before selecting a Work model.

Select only a model and effort actually exposed on the execution surface. If a configured surface cannot select or verify them, record that limitation rather than fabricating a setting. A missing model, allowance readout, or control is an availability fact, not authority to change accounts, subscriptions, or paid credits.

## Selection assurance

Profile identity uses `routingPolicyBaseCommit` for the original routing-ladder baseline and `contractVersion: TRUSTED_SETTER_V1` for trust/assurance semantics. The base commit is provenance, not the current policy content or a future merge identity.

Only a trusted task-creation boundary may attest setter application. It records `work_task_creation_selection_applied` under an authenticated SYSTEM producer, binding the authorization, directive/revision/task, profile, exact setters, producer, optional provider locator, and timestamp. WORKER requests carry only a durable evidence reference. Worker raw setters and readback claims are never evidence. Preflight, finalization, and telemetry revalidate the durable binding. `SET_REQUEST_ONLY` requires that trusted record.

Every new Work profile declares one of two assurance requirements:

- `SET_REQUEST_SUFFICIENT` is the ordinary state. The authorized launcher must submit the exact source-authorized model and effort setters and durably record those setter values. On a `SET_ONLY` surface, effective provider model and effort remain `null`, identity evidence is `SET_REQUEST_ONLY`, and execution may proceed. Setter evidence is never described as independent readback.
- `INDEPENDENT_READBACK_REQUIRED` is selected by Chat only when the decision depends on proving effective provider model/effort identity, such as a controlled Sol-versus-Astra calibration. A `SET_ONLY` surface fails closed for that comparison claim.

Any exact setter mismatch or independently observed contradiction fails closed. The source Chat message digest and the materialized execution-directive artifact digest identify different objects and normally differ. Admission must bind both through the current durable directive identity, revision, task, source provenance, and exact Work profile; it must not equate the two digests or trust a worker-supplied digest by itself. Legacy directives remain explicitly `LEGACY_MODEL_PROFILE_UNSPECIFIED`.

## Canonical model-and-effort ladder during the active trial

### Tier 1 — GPT-5.6 Sol Low

Use Sol Low for deterministic or near-deterministic execution whose success is mostly faithful application of an already resolved plan:

- apply an exact authored patch;
- copy, move, or rename known files;
- run specified tests, builds, lint, or formatting commands;
- collect logs, hashes, or status;
- package artifacts or perform deterministic transformations;
- execute an exact schema/data migration with a fully specified mapping; or
- repair a simple bug whose diagnosis and patch shape Chat already supplied.

A large repository or difficult original owner request does not justify a high Work tier when little execution-side branching remains.

### Tier 2 — GPT-5.6 Sol Medium

Sol Medium is the default bounded implementation tier after Chat has reduced the task. Use it for ordinary bounded features, routine multi-file edits with frozen semantics, known reproductions with a small hypothesis space, direct consumer-seam regressions, architecture-decided refactors, localized test failures, and comparable work with tactical implementation choices but little strategic interpretation.

### Optional intermediate — GPT-5.6 Sol High

Sol High remains available when the residual task is materially above Sol Medium but does not meet the `GENUINELY_DIFFICULT` threshold below, or when a concrete task-specific reason makes High the lowest expected-sufficient tier. It is not mandatory to step through Sol High before Sol XHigh.

### Tier 3 — GPT-5.6 Sol Extra High: difficult-task baseline

During the active calibration, use **Sol XHigh first** for genuinely difficult residual execution. This is the owner-authorized difficult-task baseline for the trial, not a claim that XHigh is always the globally cheapest sufficient setting.

A task is `GENUINELY_DIFFICULT` when at least one strong trigger or at least two ordinary triggers remain **after Chat has already reduced strategy and semantics**.

Strong triggers — any one is sufficient:

- hard debugging with an unknown causal seam after Chat has resolved strategy;
- substantial hidden coupling where a locally plausible patch can miss the actual consumer endpoint;
- long-horizon execution with dependent tool stages and meaningful recovery branching;
- complex cross-file or cross-system implementation that must discover the implementation surface from evidence despite a clear outcome contract;
- a prior lower-Sol attempt on the same bounded task failed as `EXECUTION_REASONING_SHORTFALL`; or
- the residual execution contains a consequential combination of runtime/process-state reasoning, tool use, and uncertain implementation seams that makes a lower tier materially likely to require rework.

Ordinary triggers — at least two are required:

- broad dependency surface;
- substantial tactical branching;
- difficult test-failure localization;
- nontrivial runtime or process-state reasoning;
- materially relevant multimodal or visual evidence;
- exact behavior spanning multiple wrappers, adapters, or consumers;
- repeated local fixes that did not advance the direct endpoint; or
- quality depending on prioritizing conflicting evidence rather than following an explicit edit recipe.

**Browser, GUI, or computer use alone is not an Astra-first trigger.** Visual/computer-use benchmarks do not establish superior scope judgment, permission-boundary fidelity, or real-world usefulness for this owner's workflow. Browser/GUI work is classified by its residual difficulty like any other execution task.

The generic Work preflight still guards against waste on simple work. For a task that genuinely meets this difficult-task definition during the active calibration, Sol XHigh is an owner-authorized experimental baseline and must not be classified `TOO_HIGH_MATERIAL` merely because a lower tier might sometimes succeed. If the task was misclassified and is actually simple or ordinary, lower it before execution.

### Tier 4 — GPT-6 Astra Extra High: matched challenger

Astra XHigh is **not** the automatic next tier merely because a task is difficult. Admit it after a Sol XHigh attempt only when all of the following hold:

1. the Sol attempt failed the direct consumer seam or violated a material scope/gate/stop-condition boundary;
2. Chat classifies the failure as `EXECUTION_REASONING_SHORTFALL` or `EXECUTION_SCOPE_JUDGMENT_FAILURE`;
3. Chat verifies that `CHAT_PLAN_DEFECT`, `ACCESS_CONTEXT_DEFECT`, or a clearly mechanical/transient failure is not the primary blocker;
4. the same bounded task can be retried with starting state, directive, permissions, and direct endpoint held constant as closely as practical; and
5. the comparison has decision value for future routing.

Where the first attempt mutated state, use an equivalent isolated branch/worktree/environment or another safe restoration method when practical. If the starting conditions cannot be made meaningfully comparable, run Astra only if it still has operational value and mark the comparison `PARTIALLY_MATCHED` or `NOT_MATCHED`; do not claim a clean model comparison.

Astra XHigh first-line use is allowed only when:

- the owner explicitly requests it for that task; or
- later accumulated telemetry establishes a narrow task-category exception and the routing policy is deliberately revised.

### Other Astra efforts

Astra Low, Medium, High, or Max are not default rungs in this trial. They may be used for an explicitly authorized bounded experiment or availability constraint, but they must not silently recreate the superseded `Astra Low first for hard work` policy.

## Diagnose before changing model or effort

Classify a failed Work attempt before changing model or effort:

- `CHAT_PLAN_DEFECT` — wrong architecture, incomplete acceptance, semantic ambiguity, unresolved intent, wrong endpoint, or an execution directive that did not encode the required behavior. Return to Chat and repair the plan. Do not treat a model switch as the remedy.
- `ACCESS_CONTEXT_DEFECT` — missing file, connector, workspace, permission, network, tool, or unavailable environment state. Repair authorized access/context. Model escalation is forbidden as a substitute.
- `EXECUTION_REASONING_SHORTFALL` — the model had the right bounded task, evidence, authority, and tools but failed to find the correct implementation seam, searched inadequately, or could not complete the endpoint because its execution reasoning was insufficient.
- `EXECUTION_SCOPE_JUDGMENT_FAILURE` — the model materially exceeded, conflated, or ignored the requested action boundary, stop condition, gate, or consequential follow-on boundary despite the directive making that boundary clear. Examples include treating installation as authorization for an immediate restart/logout, or performing an adjacent consequential action that was not requested.
- `MECHANICAL_EXECUTION_FAILURE` — transient command failure, typo, simple patch conflict, rate/transient infrastructure failure, or clearly recoverable flaky test. Retry or repair at the current tier when bounded; do not escalate automatically.

Only `EXECUTION_REASONING_SHORTFALL` and `EXECUTION_SCOPE_JUDGMENT_FAILURE` directly admit an Astra XHigh challenger under this trial. A challenger is evidence collection plus a possible rescue attempt, not proof in advance that Astra is superior.

## Endpoint and scope scoring

Record `PASS` only when the requested direct endpoint succeeds **and** material execution boundaries were respected.

The following count against the run even if some implementation work was useful:

- unauthorized consequential adjacent actions;
- ignored stop/review gates;
- conflating a requested action with a separate follow-on action;
- architecture or semantic changes outside delegated tactical freedom;
- claiming completion when the direct consumer seam is unproven.

Preserve partial useful work in the receipt, but do not convert a boundary failure into a model success merely because tests passed.

## Fast mode

Fast mode defaults to a `DO_NOT_ENABLE_FAST` request. Enable it only when low latency has material decision value, current allowance is adequate, and the task is not being made more expensive merely for convenience. Record it as a separate consumption choice, not a capability upgrade. When the execution surface exposes neither a Fast setter nor readback, record capability `UNOBSERVABLE` and observed state `null`; never translate “do not enable” into a claim that Fast was verified off. Under `SET_REQUEST_SUFFICIENT`, work may proceed when no available control requested or enabled Fast. A request to enable Fast fails closed if the surface cannot set it.

## Allowance-aware routing

Before a long run or any difficult-task run, inspect current Work/Codex usage when the surface exposes it. Do not invent reserve thresholds. This policy authorizes no purchased credits or spend.

Current official pricing evidence checked for the preceding policy revision showed Astra flexible-credit token rates at 2.5 times Sol rates. That cost asymmetry is one reason Astra must earn a first-line role through observed task-category results rather than benchmark prestige alone. Pricing, model availability, effort labels, and allowance behavior are volatile; recheck current official sources before any later material cost conclusion or policy revision.

Do not assume models use separate allowance pools without current product evidence. If allowance telemetry is unavailable for a run, record it as unavailable rather than estimating a numeric delta.

## Prospective calibration and durable results

Use [`../templates/WORK-MODEL-ROUTING-TELEMETRY.json`](../templates/WORK-MODEL-ROUTING-TELEMETRY.json) and persist results in [`../state/WORK-MODEL-ROUTING-RESULTS.json`](../state/WORK-MODEL-ROUTING-RESULTS.json).

The **supervising Chat** owns the GitHub results write after it receives and reviews the Work receipt. Do not make Work the semantic judge of its own success merely because Work can edit files.

For each nontrivial Work attempt record a privacy-safe entry containing, when available:

- task category and residual execution class;
- routine/ordinary/genuinely-difficult classification;
- exact selected model and effort;
- primary versus challenger role;
- direct consumer-seam result;
- scope/gate, stop-condition, and unauthorized-adjacent-action failures;
- failure classification;
- wall time, retries, owner corrections, and interventions;
- observable allowance delta or explicit unavailability;
- model-identity evidence level; and
- comparison outcome when a matched challenger occurs.

Do not record prompts, private source content, credentials, private locators, or sensitive data.

Matched Sol/Astra attempts use the same `comparisonGroupId`. Hold the starting base or equivalent isolated state, directive, direct consumer-seam endpoint, and permissions constant as closely as practical. Do not deliberately duplicate otherwise unnecessary tasks merely to fill the calibration dataset.

The active trial began 2026-09-17. Review the evidence around **2026-10-08**, and also consider an earlier review if 10 genuinely difficult Sol-baseline tasks accumulate first. A review may recommend a later policy change; telemetry never mutates policy automatically.

At review, answer at least:

1. Which task categories succeed reliably on Sol XHigh without a challenger?
2. When Sol XHigh genuinely fails, how often does Astra XHigh rescue the same bounded endpoint?
3. Which model produces fewer scope, gate, stop-condition, or unauthorized-adjacent-action failures?
4. What are the observable allowance and retry costs by task category?
5. Is there repeated evidence for any narrow Astra-first exception, or should Sol remain the difficult-task default?

A single rescue may justify using Astra again for a similar failure, but it does not establish a universal Astra-first rule. Prefer repeated, task-category-specific evidence.

## Rationale and evidence limits

The prior policy used Astra Low first for hard execution partly because official OpenAI materials described Astra as the more capable model and reported strong computer-use/end-to-end results. The owner subsequently observed that those benchmark advantages did not reliably predict instruction fidelity or consequential-action judgment in actual Work tasks, and community reports reviewed on 2026-09-17 were mixed: users commonly praised Astra for difficult debugging, discovery, long autonomous passes, and some UI/TUI work, while also reporting overreach, instruction-fidelity problems, overengineering, and inconsistent practical usefulness.

That evidence supports a **trial hypothesis**, not a permanent universal claim about either model. The trial therefore uses Sol XHigh as the difficult-task baseline and Astra XHigh as a controlled challenger after qualified failure, while collecting direct owner-workflow evidence by task category.

Official and community model behavior can change. Recheck current OpenAI documentation and current community signal when the scheduled review occurs, and distinguish updated external evidence from the local trial results.
