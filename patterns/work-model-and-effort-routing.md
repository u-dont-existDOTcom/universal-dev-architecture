# Work Model and Effort Routing

Status: REQUIRED OWNER POLICY
Date: 2026-09-14

## Purpose and authority

Choose between GPT-5.6 Sol and GPT-6 Astra by expected marginal value per
Work/Codex allowance, not by vague task difficulty or model prestige. This is an
owner-set routing policy adapted from current official OpenAI guidance; it is
not a claim that Astra is universally better or that a token-rate ratio predicts
the cost of a completed task.

This pattern composes with
[`chat-work-execution-routing-threshold.md`](chat-work-execution-routing-threshold.md).
Chat owns semantic, architectural, strategy, acceptance, and owner-intent
reasoning. Work receives only the bounded execution residue.

Optimize:

```text
probability of correct direct-endpoint execution × useful completion speed
-------------------------------------------------------------------------
                    Work/Codex allowance consumed
```

Consumer-seam correctness is the acceptance boundary. Raw test totals, textual
similarity, model prestige, token count, or the lowest numerical effort setting
are not substitutes.

## Admission and availability

### Tier 0 — no Work

Keep the existing Chat/Work admission gate. If Chat can perform the action, do
not invoke Work. Resolve semantic or architectural uncertainty in Chat before
selecting a Work model.

Select only a model and effort actually exposed on the execution surface. If a
configured surface cannot select or verify them, record that limitation rather
than fabricating a setting. A missing model, allowance readout, or control is an
availability fact, not authority to change accounts, subscriptions, or paid
credits.

### Selection assurance

Profile identity uses `routingPolicyBaseCommit` for the original routing ladder
and `contractVersion: TRUSTED_SETTER_V1` for these trust/assurance semantics.
The base commit is not the current policy content or a future merge identity.

Only a trusted task-creation boundary may attest setter application. It records
`work_task_creation_selection_applied` under an authenticated SYSTEM producer,
binding the authorization, directive/revision/task, profile, exact setters,
producer, optional provider locator, and timestamp. WORKER requests carry only
a durable evidence reference. Worker raw setters and readback claims are never
evidence. Preflight, finalization, and telemetry revalidate the durable binding.
`SET_REQUEST_ONLY` requires that trusted record. The current unavailable bridge
leaves autonomous runtime blocked as `WORK_TASK_CREATION_BRIDGE_UNAVAILABLE`.

Every new Work profile declares one of two assurance requirements:

- `SET_REQUEST_SUFFICIENT` is the ordinary state. The authorized launcher must
  submit the exact source-authorized model and effort setters and durably record
  those setter values. On a `SET_ONLY` surface, effective provider model and
  effort remain `null`, identity evidence is `SET_REQUEST_ONLY`, and execution
  may proceed. Setter evidence is never described as independent readback.
- `INDEPENDENT_READBACK_REQUIRED` is selected by Chat only when the decision
  depends on proving effective provider model/effort identity, such as a
  controlled Sol-versus-Astra calibration. A `SET_ONLY` surface fails closed.

Any exact setter mismatch or independently observed contradiction fails closed.
The source Chat message digest and the materialized execution-directive artifact
digest identify different objects and normally differ. Admission must bind both
through the current durable directive identity, revision, task, source
provenance, and exact Work profile; it must not equate the two digests or trust a
worker-supplied digest by itself. Legacy directives remain explicitly
`LEGACY_MODEL_PROFILE_UNSPECIFIED`.

## Canonical model-and-effort ladder

### Tier 1 — GPT-5.6 Sol Low

Use Sol Low for deterministic or near-deterministic execution whose success is
mostly faithful application of an already resolved plan:

- apply an exact authored patch;
- copy, move, or rename known files;
- run specified tests, builds, or lint commands;
- collect logs, hashes, or status;
- package artifacts or perform deterministic transformations;
- execute an exact schema/data migration with a fully specified mapping; or
- repair a simple bug whose diagnosis and patch shape Chat already supplied.

A large repository or difficult original owner request does not justify Astra
when little execution-side branching remains.

### Tier 2 — GPT-5.6 Sol Medium

Sol Medium is the default bounded implementation tier after Chat has reduced the
task. Use it for ordinary bounded features, routine multi-file edits with frozen
semantics, known reproductions with a small hypothesis space, direct
consumer-seam regressions, architecture-decided refactors, localized test
failures, and comparable work with tactical implementation choices but little
strategic interpretation.

### Tier 3 — GPT-6 Astra Low

For genuinely hard execution, normally route to Astra Low rather than
reflexively escalating Sol Medium to Sol High. Admit Astra Low for at least one
strong trigger or at least two ordinary triggers.

Strong triggers — any one is sufficient:

- computer, browser, or GUI execution where visual judgment or multi-app state
  materially affects success;
- hard debugging with an unknown causal seam after Chat has resolved strategy;
- substantial hidden coupling where a locally plausible patch can miss the
  actual consumer endpoint;
- long-horizon execution with dependent tool stages and meaningful recovery
  branching;
- a prior Sol Medium failure classified as `EXECUTION_REASONING_SHORTFALL`; or
- complex cross-file or cross-system implementation that must discover the
  implementation surface from evidence despite a clear outcome contract.

Ordinary triggers — at least two are required:

- broad dependency surface;
- substantial tactical branching;
- difficult test-failure localization;
- nontrivial runtime or process-state reasoning;
- materially relevant multimodal or visual evidence;
- exact behavior spanning multiple wrappers, adapters, or consumers;
- repeated local fixes that did not advance the direct endpoint; or
- quality depending on prioritizing evidence rather than following explicit
  edit instructions.

### Tier 4 — GPT-6 Astra Medium

Use Astra Medium only when at least one concrete condition holds:

- Astra Low missed the direct endpoint for a likely execution-reasoning cause;
- the task begins with multiple strong Astra triggers; or
- failure or rework cost makes the expected benefit of deeper Astra reasoning
  clearly exceed its additional allowance use.

Importance or stakes alone are not execution-complexity evidence.

### Tier 5 — GPT-6 Astra High, XHigh, or Max

These are exception tiers. Use one only when a lower Astra tier produced evidence
of insufficient reasoning on the same bounded problem, or a release-critical and
unusually difficult end-to-end execution has a concrete need for more inference.
Chat must first verify that missing information, permissions, strategy,
architecture, acceptance criteria, and owner authority are not the blocker.
Record the reason. Never use maximum effort "just to be safe."

### Sol High exception

Sol High is not the normal escalation after Sol Medium. Use it instead of Astra
Low only when a concrete resource condition favors it:

- Astra is unavailable;
- Astra allowance is scarce enough that preserving it has decision value; or
- later local telemetry shows this task class is more allowance-efficient on
  Sol High without meaningful correctness loss.

Absent one of those conditions, hard execution starts at Astra Low.

## Diagnose before escalation

Classify a failed Work attempt before changing model or effort:

- `CHAT_PLAN_DEFECT` — wrong architecture, incomplete acceptance, semantic
  ambiguity, unresolved intent, or wrong endpoint. Stop Work escalation and
  return evidence to Chat so Chat can repair the directive.
- `ACCESS_CONTEXT_DEFECT` — missing file, connector, workspace, permission,
  network, or tool. Repair access/context when authorized; model escalation is
  forbidden as a substitute.
- `EXECUTION_REASONING_SHORTFALL` — the model had the right task and evidence
  but failed to find the correct implementation seam, searched inadequately, or
  missed the direct endpoint despite sufficient context. Escalate according to
  the ladder.
- `MECHANICAL_EXECUTION_FAILURE` — transient command failure, typo, simple patch
  conflict, or clearly recoverable flaky test. Retry or repair at the current
  tier when bounded; do not escalate automatically.

Only `EXECUTION_REASONING_SHORTFALL` directly justifies model/effort escalation.

## Fast mode

Fast mode defaults to a `DO_NOT_ENABLE_FAST` request. Enable it only when low
latency has material decision value, current allowance is adequate, and the task
is not being made more expensive merely for convenience. Record it as a
separate consumption choice, not a capability upgrade. When the execution
surface exposes neither a Fast setter nor readback, record capability
`UNOBSERVABLE` and observed state `null`; never translate “do not enable” into a
claim that Fast was verified off. Under `SET_REQUEST_SUFFICIENT`, work may
proceed when no available control requested or enabled Fast. A request to enable
Fast fails closed if the surface cannot set it.

## Allowance-aware routing

Before a long Astra run or any Astra Medium-or-higher run, inspect current
Work/Codex usage when the surface exposes it. Do not invent reserve thresholds.
If allowance is materially constrained, keep deterministic and ordinary work on
Sol, preserve Astra capacity for known high-value hard work when practical, and
use Sol High only as the explicit conservation exception above. Do not assume
models use separate allowance pools without current product evidence. This
policy authorizes no purchased credits or spend.

## Prospective calibration contract

Use [`../templates/WORK-MODEL-ROUTING-TELEMETRY.json`](../templates/WORK-MODEL-ROUTING-TELEMETRY.json)
for the next 10 nontrivial Work executions. Record the routing decision and
direct endpoint result without prompts, source content, credentials, or other
sensitive data.

After task 5, produce a concise local summary only and do not mutate Universal
policy automatically. After task 10, return the evidence to Chat for policy
review.

Do not duplicate tasks merely to fill the window. A future paired comparison is
admitted only if natural telemetry leaves a specific, materially consequential
routing boundary ambiguous. Without a new Chat directive, cap that comparison
at two frozen tasks with identical base, directive, endpoint, and permissions,
and vary only the smallest model/effort alternatives needed to resolve the
boundary. Never create a broad benchmark suite from this contract.

## Official-source provenance — checked 2026-09-14

Current official sources support these dated priors:

- OpenAI describes GPT-6 Astra as its most capable model for the hardest
  end-to-end work and GPT-5.6 Sol as a strong model for complex professional
  work: <https://learn.chatgpt.com/docs/models>.
- The Work pricing page says local and cloud tasks share plan usage allowance,
  shows lower estimated local-message ranges for Astra than Sol, and lists
  flexible-credit token rates for Astra at exactly 2.5 times Sol in input,
  cached-input, and output classes: <https://learn.chatgpt.com/docs/pricing>.
- OpenAI says higher reasoning effort can improve complex tasks but takes longer
  and uses more tokens, so start at the default and increase only when needed:
  <https://learn.chatgpt.com/docs/models>.
- The current model guide describes preserving the effective effort when moving
  to Astra, except that none/minimal users should start at low:
  <https://developers.openai.com/api/docs/guides/latest-model>.

The current official pages checked above do **not** contain the earlier supplied
claim that “Astra Low can outperform Sol High” or the associated recommendation
to try Astra Low/Medium when coming from Sol High. That statement is therefore
not preserved as a current OpenAI quote or fact. The Astra-Low-first ladder
remains the owner's explicit optimization policy, informed by current capability
and allowance evidence and subject to the bounded telemetry review.

Message estimates, plan entitlements, model availability, UI labels, reasoning
levels, and credit rates are volatile. Dated values above are provenance, not
permanent routing thresholds; recheck official sources before a later material
policy revision.
