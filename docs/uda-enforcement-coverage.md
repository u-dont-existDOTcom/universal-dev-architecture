# UDA enforcement coverage — first integration and kernel migration slice 1

Rules can be readable and easy to find without ever changing an answer or blocking an action. This inventory makes that gap visible. It checks declared coverage, not the semantic truth of an agent's judgment or live enforcement across every consumer. The owner outcome remains OPEN.

## Dispositions

- **STRUCTURED_ENFORCED:** all behavioral obligations in this source have exact task-time records and an evaluable admission path. Large files with a narrow slice do not qualify. Slice 1 has six kernel sections in this state; large pattern sources still have unstructured remainders. An obligation-level bootstrap exception is carried outside activated UDA, not represented as an admitted obligation.
- **STRUCTURED_PARTIAL:** some obligations have exact records; the entry names the remaining operative obligations in `legacy_remainder`. It stays in the migration backlog. Semantic records now accept exact-candidate receipts and fail closed with UNKNOWN when no matching, well-formed receipt supplies a judgment.
- **WORKFLOW_ONLY:** the source is a specialist authoritative workflow or reference, with a source-specific explanation. This is an explicit exception, not a claim of semantic task-time enforcement. Some specialist workflows do contain behavior; that fact stays visible.
- **LEGACY_UNSTRUCTURED:** a behavioral rule still relies on prose/index application. Its exact identity and migration priority are reported. Routing does not count as enforcement.
- **NOT_ACTIVE:** only superseded, historical or retired sources. A specific reason and an active successor for supersession are required. Live unindexed guidance cannot use this state.

## What evidence can establish

`TEXT_PRESENCE` proves text or a fixture exists. `ROUTING` proves an index or graph route. `COMPILATION` proves records can enter a representative contract. None proves the actual answer/action obeyed a rule. Only `ADMISSION` and `BEHAVIORAL_REGRESSION` can support a structured disposition, and the inventory still requires exact source records. Admission evidence for a partial semantic record proves binding/admission behavior, including UNKNOWN blocking; it does not prove the semantic judgment. Other local runtime admission controls are useful supporting evidence but do not replace task-time record mapping.

A wildcard, an index listing, a graph node, a generic green test total or the removed legacy source-list field cannot certify enforcement. Source/selector checks inspect the section that owns the record, not an arbitrary sentence elsewhere in the file. Mechanical validation establishes bindings and declared structure; human review still decides whether the inventory captures all operative obligations and whether a specialist exception is justified.

## Activation routes

`KERNEL_ALWAYS` loads a root section with activated UDA authority. `STRUCTURED_TRIGGER` uses the listed records' trigger facts. `INDEX_TRIGGER` is an explicit leading When/Before/For/After/Whenever/While/If clause interpreted by the reasoning agent with a recorded activation reason. `PARENT_PATTERN` follows a named active parent that literally mentions the child's path. Parent cycles are rejected. These routes describe reachability, not successful application. They preserve the small active contract instead of loading every pattern on every task.

The kernel profile uses the required `repository_kind: uda-kernel` classification and requires `uda_kernel: true`. This kind retains policy-command checks and runs coverage validation even if the marker is removed or invalid. Standalone `policy` consumers without an affirmative kernel marker remain exempt.

## Adding or migrating a rule

1. Read the full source and its applicable authority. A new pattern file or root level-two section immediately joins the computed universe.
2. Add exactly one entry in `rules/rule-graph/enforcement-coverage.v1.json`, with canonical id, behavioral classification, actors, phases, destinations, evidence and a real activation route.
3. For structured coverage, list every exact `task_time_records` id. Each record must exist, match this source (and root section), and be claimed once. Supply both ADMISSION and BEHAVIORAL_REGRESSION evidence for a fully structured section. Enumerate every operative sentence or clause in its obligation_map; use partial coverage with an exact legacy_remainder when obligations remain.
4. For a specialist workflow exception, explain the actual domain and authoritative workflow. For retirement, name the reason and successor. Neither disposition hides a live missing route.
5. New backlog is forbidden. The baseline identity pin stays unchanged; current backlog shrinks only through STRUCTURED_ENFORCED identities reported in removed_since_baseline. Additions require `owner_authorized_additions` with exact id, owner quote, ISO date and source. The baseline pins identities, not just a total, and must match the initial count and canonical identity-list SHA-256 preserved in the owner requirement record. Editing that pin alone cannot authorize growth; owner quotes and coordinated policy rewrites still require human authority review.
6. Update docs counts/backlog and run `python3 scripts/uda_enforcement_coverage.py validate` and `python3 scripts/uda_enforcement_coverage.py report`. The deterministic repository audit runs validation at error level. If task-time metadata or bound source changes, regenerate the lock with `python3 scripts/uda_rule_graph.py validate --write-lock rules/rule-graph/generated/source-lock.v1.json` and regenerate the representative Mission Control projection with `python3 scripts/uda_rule_graph.py compile --task examples/rule-graph/work-handoff.json --mode graph --output tools/codex-mission-control/restored/codex-mission-control/generated/rule-graph/work-handoff-contract.json`. These are derived artifacts, not Mission Control runtime changes.

## Recomputed baseline

The supplied branch includes main at 991c7a08b7d9f831327d9075175b8d70c34c37e6. Before edits it had 70 indexed patterns, 86 pattern files, 31 trigger-less index lines and 16 unindexed files. Nine task-time records directly source six files: root AGENTS.md and five patterns; 65 indexed patterns lack direct records. There are two mechanical and nine semantic obligations. The graph has 36 active nodes and one superseded node. The baseline findings retain these counts; the exact pinned backlog identities are in `rules/rule-graph/enforcement-legacy-baseline.v1.json`. Current exact identities and dispositions are in the coverage inventory and its report, rather than repeated in the requirement record. Live GitHub freshness could not be verified in the network-isolated sandbox.

The systemic gap fits existing logic-map entries: LF-2.1 for unloaded/stale guidance; LF-7.1 for a loaded check missing the real endpoint; LF-7.2 for presence/routing tests that cannot reject violating behavior; LF-7.3 for overstated coverage. No new failure category is necessary.

## Current counts

Inventory entries: 96

Indexed patterns: 82

Migration backlog: 78

Task-time records: 25, sourced from 7 files, with 0 mechanical and 111 semantic obligations.

| Disposition | Count |
|---|---:|
| STRUCTURED_ENFORCED | 6 |
| STRUCTURED_PARTIAL | 6 |
| WORKFLOW_ONLY | 10 |
| LEGACY_UNSTRUCTURED | 72 |
| NOT_ACTIVE | 2 |

Six root sections are STRUCTURED_ENFORCED after slice 1. The six remaining partial pattern sources are task-time lesson activation, owner-goal follow-up, Chat/Work execution routing, the repository operating system, worker-directive/output delivery and reasoning selection. Their exact unstructured remainders stay in backlog; the parent owner outcome remains OPEN.

The immutable baseline pins 84 identities. Current backlog is 78: six fully structured sections removed, no additions. P1 falls from 22 to 16; P2 remains 47 and P3 remains 15. The report's removed_since_baseline lists only those six sections. The original pass-1/pass-2 counts remain historical requirement findings.

## Kernel slice 1 obligation map

Each row below matches the inventory's obligation_map exactly. Compound instructions are split where they impose distinct effects; repeated boundary reminders retain separate obligations. The 103 rows contain 102 structured obligations and one exception. These are declared source coverage and receipt-admission regressions, not proof of universal runtime invocation or semantic truth.

Records apply to chat, work, codex and claude unless the source limits the actor: the Work permission record applies only to work/codex. Every-turn records trigger on governance_required; the live-root record also needs owner_requires_live_root, and instruction maintenance needs the existing action_classes value instruction_maintenance. Unknown trigger facts remain unresolved and block. No new facts were introduced, so no new envelope declarations are required.

Payload/action-dependent obligations remain selected with not_applicable_allowed: true. Their bound receipts must explain the absent condition, including outbound-link verification when no outbound link is sent. NOT_APPLICABLE is not an escape from an active payload obligation; its semantic correctness still requires review. Each obligation declares its actual retrieval, reasoning, pre-action, handoff, persistence or final-delivery boundary, destination, acceptance evidence, non-substitutes, carry-through and repair. Pre-action gates are not deferred to the final. Reusable output is checked at handoff to the intended recipient file and chat summary; owner-required artifacts and companions are checked at their actual handoff. Prose and outbound links are checked before surfacing any owner-visible message or question payload, including commentary. Completion claims and explicit final-only duties remain at final-delivery.

The prior timestamp predicates checked a particular serialization (an ISO-shaped timestamp and a fixed Elapsed time phrase). Those are useful built-in predicates, but the root does not prescribe those complete formats: a compliant duration can use different wording, and a shape match cannot prove clock provenance or a valid time. Slice 1 makes the source timestamp/elapsed obligations semantic, with exact-candidate evidence covering the readings and final. The unchanged built-in predicates are tested independently in narrowly scoped test contracts; receipts cannot override their PASS or FAIL results. No new predicate kind or fixed-format owner requirement was added.

### Obligation-level exceptions

An obligation that cannot be checked inside activated UDA may carry an exception instead of a record only for BOOTSTRAP_NOT_LOADED or OWNER_SETTINGS_CHANGE. Each exception contains the exact owning sentence, a specific reason and a named, resolvable carrier. Difficulty of semantic checking is not an exception. A loaded-root fetch duty stays structured; the duty to disclose failure when the required bootstrap never loaded is carried by the owner-side minimal bootstrap below. There are no owner-settings-change exceptions in this slice and no owner settings were changed.

Validation requires every map sentence to occur exactly once in its owning section; every mapped record/obligation to exist and belong to that section; every mapped sentence to occur in that record's exact-text selectors; every selected record obligation to be mapped; and every exception to have one of the two allowed kinds, a specific reason and an existing carrier/anchor. Complete maps and both evidence classes admit STRUCTURED_ENFORCED; partial sections retain their exact operative legacy_remainder. Human review still owns completeness against the prose. The report lists the exceptions separately, and the backlog validator prohibits removing a baseline identity by reclassifying it as workflow-only or inactive.

### AGENTS.md#follow-up-goal-derivation-and-assistant-added-requirements

Found 16; structured 16; excepted 0; remaining 0.

| Exact sentence or clause | Record / obligation or exception carrier |
|---|---|
| Before authoring, launching, or accepting a consequential follow-up task, re-bind the proposed work to the current parent owner outcome | uda.kernel.followup-derivation / rebind-before-author-launch-accept |
| and follow `patterns/owner-goal-followup-and-requirement-accretion.md`. | uda.kernel.followup-derivation / apply-followup-pattern |
| First classify the root outcome as `OPEN`, `SATISFIED`, `SUPERSEDED`, `CANCELED`, or `AUTHORITY_UNRESOLVED`, | uda.kernel.followup-derivation / classify-root-and-gap |
| and state the exact remaining owner gap. | uda.kernel.followup-derivation / state-exact-owner-gap |
| A useful improvement is not unfinished owner work merely because it is technically attractive. | uda.kernel.followup-derivation / useful-is-not-unfinished |
| Every new mandatory requirement that was not already present in the owner outcome must declare its origin and necessity. | uda.kernel.followup-derivation / requirement-origin-necessity |
| An `ASSISTANT_INFERENCE` or inherited choice (not a declared gate) with unresolved necessity may be only a bounded reversible experiment; it may not become a fail-closed blocker, architecture prerequisite, root acceptance criterion, stronger assurance gate, or reason to disable a previously working owner-aligned path. | uda.kernel.followup-derivation / unresolved-inference-experiment-only |
| Treat stronger assurance as requirement accretion when it changes whether work may proceed or count as complete. | uda.kernel.followup-derivation / assurance-is-accretion |
| Independent readback, provider attestation, extra reviewers, new trust boundaries, and similar controls must identify the current owner decision/outcome they materially change and why a simpler evidence standard is insufficient before becoming mandatory. | uda.kernel.followup-derivation / simpler-proof-insufficient |
| If a newly added control blocks or degrades a previously working owner-aligned path, stop the compensating-fix chain | uda.kernel.followup-derivation / stop-compensating-chain |
| and revalidate the first added requirement against the parent outcome and the strongest materially simpler alternative. | uda.kernel.followup-derivation / revalidate-first-added-control |
| Preserve useful supporting work, | uda.kernel.followup-derivation / preserve-useful-support |
| but restore the simpler valid path when necessity is not established. | uda.kernel.followup-derivation / restore-simpler-path |
| This gate runs at follow-up-task authoring, before the new framing is handed to Work or another executor. | uda.kernel.followup-derivation / gate-at-authoring |
| A later worker faithfully executing a substituted goal is too late. | uda.kernel.followup-derivation / later-faithful-worker-too-late |
| At experiment launch, apply the operational owner-method contract to the actual runnable configuration. | uda.kernel.followup-derivation / actual-runnable-method |

### AGENTS.md#instruction-composition

Found 12; structured 12; excepted 0; remaining 0.

| Exact sentence or clause | Record / obligation or exception carrier |
|---|---|
| Before handling any task, including a brief request to remember a preference, open `LESSON-INDEX.md`, | uda.kernel.instruction-activation / open-index-every-task |
| select entries whose triggers match, | uda.kernel.instruction-activation / select-matching-triggers |
| and read their current patterns. | uda.kernel.instruction-activation / read-current-patterns |
| Instruction maintenance uses `patterns/instruction-composition-and-portable-intelligence.md`; | uda.kernel.instruction-maintenance / maintenance-pattern-owner |
| activation uses `patterns/task-time-lesson-activation.md`. | uda.kernel.instruction-activation / activation-owner |
| Resolve graph-covered dependencies via `rules/UDA-RULE-GRAPH.json`/`scripts/uda_rule_graph.py`; | uda.kernel.instruction-activation / resolve-covered-dependencies |
| canonical prose remains authoritative; | uda.kernel.instruction-activation / canonical-prose-authority |
| unmapped rules stay index-routed; | uda.kernel.instruction-activation / unmapped-index-routing |
| shopping routes through `LESSON-INDEX.md`. | uda.kernel.instruction-activation / shopping-index-routing |
| Task-specific rules live in patterns | uda.kernel.instruction-maintenance / rules-in-patterns |
| and are reached through `LESSON-INDEX.md`; | uda.kernel.instruction-maintenance / rules-index-reachability |
| a new task rule adds a pattern and an index entry, never a root line. | uda.kernel.instruction-maintenance / new-rule-not-root |

### AGENTS.md#owner-facing-operational-references

Found 9; structured 9; excepted 0; remaining 0.

| Exact sentence or clause | Record / obligation or exception carrier |
|---|---|
| In user-facing prose, never make repository identifiers the primary explanation. | uda.kernel.operational-references / plain-language-first |
| Pull-request numbers, issue numbers, branch names, commit SHAs, workflow/run/job IDs, and similar opaque references are locating metadata, not semantic referents. | uda.kernel.operational-references / metadata-not-meaning |
| Immediately before surfacing any outbound link to the owner, open the exact destination, follow redirects, and verify that the final page resolves successfully to the intended current content—not an error, 404, dead, parked, or stale page. | uda.kernel.outbound-links / exact-current-destination |
| Search snippets, cached previews, remembered URLs, and earlier checks do not count as verification. | uda.kernel.outbound-links / no-cached-verification |
| If the exact link cannot be verified in the current turn, do not surface it. | uda.kernel.outbound-links / withhold-unverified-link |
| Never present a broken or unverified link as a recommendation. | uda.kernel.outbound-links / no-broken-recommendation |
| **Delivery is part of completion.** | uda.kernel.artifact-delivery / delivery-is-completion |
| When the owner needs to use a file, packet, handoff, protocol, report, generated artifact, or other output, do not make them navigate GitHub branches or repository paths to obtain it. | uda.kernel.artifact-delivery / usable-delivery-before-completion |
| Before delivering that output, load the delivery-priority, provenance, companion-material, and pre-close usability rules: `patterns/human-readable-operational-references.md` → **Compact rules moved from root `AGENTS.md`**. | uda.kernel.artifact-delivery / load-compact-delivery-rules |

### AGENTS.md#per-turn-bootstrap-invariants

Found 27; structured 26; excepted 1; remaining 0.

| Exact sentence or clause | Record / obligation or exception carrier |
|---|---|
| For **every assistant turn** governed by this architecture, the **first line of the final user-visible assistant answer MUST be an explicit date-and-time stamp including a timezone or UTC offset**. | uda.final.timestamp / final-first-line-timestamp |
| This is a final-output contract and a pre-answer invariant, not a task-dependent recommendation. | uda.final.timestamp / final-boundary-contract |
| The timestamp must appear in the final answer/message content delivered to the user on every assistant turn. | uda.final.timestamp / final-surface-timestamp |
| A timestamp written only in hidden reasoning, visible thinking/reasoning UI, analysis, tool-call commentary, scratch work, or any intermediate channel **does not satisfy this requirement**. | uda.final.timestamp / intermediate-is-not-final |
| An earlier timestamp in reasoning or an intermediate step does not satisfy the final-output contract; use the second reading in the final answer. | uda.final.timestamp / second-reading-in-final |
| Two clock readings per turn, no others (owner, 2026-09-30). | uda.kernel.clock-cadence / two-read-cadence |
| First: the message's sent time if the surface shows it, else a read as the turn's first action. | uda.kernel.clock-cadence / first-reading |
| Second: a read right before writing the final answer. | uda.kernel.clock-cadence / second-reading |
| Read with `date -u` in a shell tool, else the current-time tool, else the code tool's clock; | uda.kernel.clock-cadence / clock-priority-and-retry |
| if a read fails or isn't later than the first, use the next one once. | uda.kernel.clock-cadence / single-failed-read-retry |
| Never compare clocks or read mid-task. | uda.kernel.clock-cadence / no-midtask-comparison |
| The final answer opens with the second reading | uda.final.timestamp / final-opens-with-second-reading |
| and says how long the turn took in total. | uda.final.timestamp / final-elapsed-time |
| Don't reuse a prior-turn timestamp | uda.kernel.clock-cadence / current-turn-provenance |
| or present capture time as hidden provider sent time. | uda.kernel.clock-cadence / honest-capture-provenance |
| If no clock answers, say so rather than inventing a time. | uda.kernel.clock-cadence / unavailable-clock-disclosure |
| Before finalizing every assistant turn, perform a literal output check: the first user-visible line of the final answer must match a date + time + timezone/UTC-offset form. | uda.final.timestamp / literal-final-check |
| If it does not, prepend the second reading; the check needs no further reading. | uda.final.timestamp / prepend-without-reread |
| Apply it on every turn even for trivial arithmetic, greetings, smoke tests, follow-up acknowledgments, corrections, status updates, or prompts that otherwise warrant a direct one-line answer. | uda.final.timestamp / trivial-turns-included |
| Simple answers, low-effort reasoning, tool avoidance, brevity, and shallow repository reads **must not waive this invariant**. | uda.final.timestamp / no-brevity-waiver |
| When current owner instructions require the canonical GitHub bootstrap, **re-fetch the live default-branch root `AGENTS.md` on every user turn before task reasoning, artifact composition, task execution, or answering**. | uda.bootstrap.live-root / live-root-refetch |
| Tool discovery, current-clock checks, and the bootstrap retrieval itself are permitted prerequisites. | uda.bootstrap.live-root / only-bootstrap-prerequisites |
| A prior-turn fetch, cached copy, remembered summary, or earlier reasoning does not satisfy per-turn activation. | uda.bootstrap.live-root / no-prior-activation-substitute |
| If required GitHub/bootstrap access is unavailable, the final answer must still begin with the timestamp and then state the access failure explicitly rather than pretending the bootstrap occurred. | EXCEPTION BOOTSTRAP_NOT_LOADED; docs/uda-enforcement-coverage.md#minimal-always-on-owner-bootstrap-replacement; This disclosure applies when required GitHub bootstrap cannot load, so no activated UDA contract exists to admit that turn. |
| Treat failure to emit the timestamp as the first line of the final user-visible answer on any assistant turn as an instruction-following failure even when the timestamp appeared during thinking or the underlying task answer is otherwise correct. | uda.final.timestamp / classify-missing-stamp-failure |
| **Every turn:** reusable output over ~8,000 characters goes in a file, for any recipient; | uda.kernel.output-budget / file-for-long-reusable-output |
| chat gets a summary: `patterns/worker-directive-delivery-and-chat-output-budget.md`. | uda.kernel.output-budget / chat-summary-of-file |

### AGENTS.md#pre-final-continuation-invariant

Found 6; structured 6; excepted 0; remaining 0.

| Exact sentence or clause | Record / obligation or exception carrier |
|---|---|
| Before final delivery, apply `patterns/codex-github-operating-system.md` → **Continuation and stop admission**. | uda.kernel.continuation / apply-stop-admission |
| An OPEN task with a safe authorized executable next action requires doing it now, not just diagnosing or planning it. | uda.kernel.continuation / execute-open-frontier |
| A self-authored scope or completed lease cannot cancel parent implementation authority. | uda.kernel.continuation / preserve-parent-authority |
| Check the actual final output: stop only at an evidenced boundary, | uda.kernel.continuation / evidenced-stop-boundary |
| finish independent work, | uda.kernel.continuation / finish-independent-work |
| and preserve explicit owner restrictions and real access, spending, privacy, platform, and irreversible-action gates. | uda.kernel.continuation / preserve-real-gates |

### AGENTS.md#workflow

Found 33; structured 33; excepted 0; remaining 0.

| Exact sentence or clause | Record / obligation or exception carrier |
|---|---|
| When multiple safe in-scope execution approaches achieve the same outcome, choose the better-coordinated approach without asking the owner to select an execution mode: | uda.kernel.coordination / choose-coordinated-route |
| use isolated workspaces, | uda.kernel.coordination / isolate-workspaces |
| a durable plan and recovery ledger, | uda.kernel.coordination / durable-plan-recovery |
| delegation plus independent review when safely separable and decision-relevant, | uda.kernel.coordination / separable-delegation-review |
| and serialize shared mutable state. | uda.kernel.coordination / serialize-shared-state |
| This standing permission does not broaden task authority and does not replace substantive owner decisions. | uda.kernel.coordination / no-coordination-authority-expansion |
| An owner answer, correction, upload, or requested clarification is input to the active task, not a completion event. | uda.kernel.owner-input-continuation / owner-input-is-input |
| After incorporating it, continue automatically to the next safe in-scope action while the stated goal remains unfinished. | uda.kernel.owner-input-continuation / resume-after-input |
| Do not return only an acknowledgment or ask the owner what to do next when repository state, the task plan, or the request already determines that step. | uda.kernel.owner-input-continuation / no-determined-next-step-question |
| Pause only for a genuine missing owner decision, new authority, destructive or irreversible risk, unavailable permission or credential, spending, publication, or access, or an explicit request to stop. | uda.kernel.owner-input-continuation / genuine-pause-only |
| Work selects authorized task-scoped access and the automatic reviewer; do not ask the owner to choose routine permissions. | uda.kernel.work-permissions / automatic-task-access-review |
| This adds no semantic, spending, publication, representation, destructive, or self-approval authority. | uda.kernel.work-permissions / no-added-authority |
| Resolve engineering blockers; ask only about a material tradeoff, with plain consequences and a recommendation, or a required human gate. | uda.kernel.owner-interaction / resolve-engineering-blockers |
| Minimize owner choice as an execution invariant. | uda.kernel.owner-interaction / minimize-owner-choice |
| Resolve routine implementation details and already-authorized subordinate actions without asking. | uda.kernel.owner-interaction / resolve-authorized-details |
| A confirmation for the same destination, data boundary, scope, and consequence remains valid across retries, resumed execution, or an alternate authorized transport path; a failed tool or transport does not consume that approval. | uda.kernel.owner-interaction / approval-survives-transport |
| Ask again only if those facts materially change or the platform requires a fresh human gesture. | uda.kernel.owner-interaction / fresh-approval-only-for-change |
| If owner interaction is genuinely required, finish independent preparation, | uda.kernel.owner-interaction / independent-preparation |
| consolidate the exact dependent actions into the fewest confirmations permitted, | uda.kernel.owner-interaction / consolidate-confirmations |
| explain the concrete downside or risk and why the gate is mandatory, | uda.kernel.owner-interaction / explain-mandatory-risk |
| give a recommended default, | uda.kernel.owner-interaction / recommended-default |
| and resume automatically after the answer. | uda.kernel.owner-interaction / resume-after-human-answer |
| Before declaring a host, device, service, session, or other target inaccessible—or asking the owner to identify, restart, reconnect, or configure an opaque machine-generated target—recover its semantic identity and the authorized access topology first. | uda.kernel.target-recovery / identity-and-topology-before-escalation |
| Treat a failed connector/device transport as a route-specific failure, not proof that the underlying target is unavailable. | uda.kernel.target-recovery / route-failure-scope |
| Inspect current connected endpoints plus task-relevant local mappings such as SSH config/aliases, durable task state, service/process metadata, and recent authorized execution history; | uda.kernel.target-recovery / inspect-endpoints-mappings |
| from a healthy authorized endpoint, use bounded read-only probes such as `hostname` and exact target-path existence/read checks to prove which route reaches the same target. | uda.kernel.target-recovery / bounded-identity-and-path-probes |
| Use an equivalent authorized alternate route when one exists. | uda.kernel.target-recovery / equivalent-alternate-route |
| Never ask the owner to recognize an opaque identifier merely because the first transport failed. | uda.kernel.target-recovery / no-opaque-recognition-request |
| Escalate only after plausible authorized routes are exhausted or a genuinely human-only action remains. | uda.kernel.target-recovery / exhaust-routes-or-human-gate |
| When you explicitly commit to a substantive operation, method, comparison, audit, experiment, or artifact, keep it as an open obligation until it is actually executed, I explicitly supersede it, or new evidence makes it invalid and you say so. | uda.kernel.operation-commitments / keep-promised-operation-open |
| Adjacent analysis, planning, preparation, or a different method does not count as completion. | uda.kernel.operation-commitments / adjacent-work-not-completion |
| Before switching methods, declaring progress complete, or ending a substantial pass, verify what observable result proves each promised operation actually occurred. | uda.kernel.operation-commitments / observable-result-before-close |
| If a still-valid promised step was displaced by later work, execute it before continuing. | uda.kernel.operation-commitments / execute-displaced-valid-step |

## Exact migration backlog

P1 retains 16 of the issue's 22 high-leverage identities after the six kernel sections are removed. Other general behavioral entries are P2 (47); mechanics specific to a project or infrastructure surface are P3 (15), including Mission Control supervision/relay, browser automation, worker permissions and Work cloud dispatch. Every P1 entry is behavioral, checked by the validator.

Order migration by P1, P2, P3 first, then by how often the trigger fires: EVERY_TURN, FREQUENT, CONDITIONAL, SPECIALIST; use the id only to break ties. Frequency classes are declared routing estimates, not measured usage. Each entry retains its specific next step. The report uses this same order.

| Entry id | Priority | Estimated trigger frequency |
|---|---|---|
| `patterns/chat-work-execution-routing-threshold.md` | P1 | FREQUENT |
| `patterns/codex-github-operating-system.md` | P1 | FREQUENT |
| `patterns/owner-outcome-invariant-and-contract-laundering-prevention.md` | P1 | FREQUENT |
| `patterns/reasoning-selection.md` | P1 | FREQUENT |
| `patterns/source-interpretation-provenance.md` | P1 | FREQUENT |
| `patterns/task-time-lesson-activation.md` | P1 | FREQUENT |
| `patterns/worker-directive-delivery-and-chat-output-budget.md` | P1 | FREQUENT |
| `patterns/chatgpt-client-surface-capability-and-thread-recovery.md` | P1 | CONDITIONAL |
| `patterns/context-compaction-resilience.md` | P1 | CONDITIONAL |
| `patterns/cross-family-reasoning-check.md` | P1 | CONDITIONAL |
| `patterns/exclusive-active-task-locks.md` | P1 | CONDITIONAL |
| `patterns/logic-failure-map.md` | P1 | CONDITIONAL |
| `patterns/owner-goal-followup-and-requirement-accretion.md` | P1 | CONDITIONAL |
| `patterns/recommendation-preflight-integrity.md` | P1 | CONDITIONAL |
| `patterns/shopping-research.md` | P1 | CONDITIONAL |
| `patterns/terminal-response-admission-and-autonomous-continuation.md` | P1 | CONDITIONAL |
| `AGENTS.md#authority` | P2 | EVERY_TURN |
| `AGENTS.md#code-review-rules` | P2 | EVERY_TURN |
| `AGENTS.md#universal-and-owner-specific-infrastructure-boundary` | P2 | EVERY_TURN |
| `patterns/conversational-prose-speakability.md` | P2 | FREQUENT |
| `patterns/development-assurance-lanes.md` | P2 | FREQUENT |
| `patterns/human-readable-operational-references.md` | P2 | FREQUENT |
| `patterns/instruction-composition-and-portable-intelligence.md` | P2 | FREQUENT |
| `patterns/test-efficiency-and-verification-budget.md` | P2 | FREQUENT |
| `patterns/agent-to-agent-consultation.md` | P2 | CONDITIONAL |
| `patterns/artifact-authority-promotion-and-supersession.md` | P2 | CONDITIONAL |
| `patterns/canonical-design-os-bootstrap.md` | P2 | CONDITIONAL |
| `patterns/carrying-uda-into-standalone-projects.md` | P2 | CONDITIONAL |
| `patterns/consilience-and-expected-observability.md` | P2 | CONDITIONAL |
| `patterns/coverage-before-depth-in-selection.md` | P2 | CONDITIONAL |
| `patterns/delegate-easy-work-to-cheaper-models.md` | P2 | CONDITIONAL |
| `patterns/durable-chat-learning.md` | P2 | CONDITIONAL |
| `patterns/durable-write-checkpoints.md` | P2 | CONDITIONAL |
| `patterns/editorial-authority-and-lossless-editing.md` | P2 | CONDITIONAL |
| `patterns/exact-git-write-handoff.md` | P2 | CONDITIONAL |
| `patterns/executable-frontier-coherence.md` | P2 | CONDITIONAL |
| `patterns/existing-work-scan-and-scholarly-discovery.md` | P2 | CONDITIONAL |
| `patterns/external-evaluation-reproducibility.md` | P2 | CONDITIONAL |
| `patterns/failed-strategy-lineage-and-negative-evidence-binding.md` | P2 | CONDITIONAL |
| `patterns/functional-neighborhood-discovery-for-monitoring.md` | P2 | CONDITIONAL |
| `patterns/github-first-agent-bootstrap.md` | P2 | CONDITIONAL |
| `patterns/independent-evaluation-separation.md` | P2 | CONDITIONAL |
| `patterns/interactive-shell-command-safety.md` | P2 | CONDITIONAL |
| `patterns/interview-evidence-information-gain.md` | P2 | CONDITIONAL |
| `patterns/long-range-research-mission-supervision.md` | P2 | CONDITIONAL |
| `patterns/normality-base-rate-target-preservation.md` | P2 | CONDITIONAL |
| `patterns/outcome-advancement-and-strategy-efficacy.md` | P2 | CONDITIONAL |
| `patterns/owner-questions-page.md` | P2 | CONDITIONAL |
| `patterns/paid-workflow-safety.md` | P2 | CONDITIONAL |
| `patterns/parallel-chat-write-isolation.md` | P2 | CONDITIONAL |
| `patterns/platform-native-deployment-before-new-infrastructure.md` | P2 | CONDITIONAL |
| `patterns/portable-vs-owner-specific-deployment-data.md` | P2 | CONDITIONAL |
| `patterns/research-before-reinvention.md` | P2 | CONDITIONAL |
| `patterns/rule-graph-activation-and-dependency-resolution.md` | P2 | CONDITIONAL |
| `patterns/self-updating-launcher-reexec.md` | P2 | CONDITIONAL |
| `patterns/structured-output-failure-boundary.md` | P2 | CONDITIONAL |
| `patterns/suggested-fix-queue.md` | P2 | CONDITIONAL |
| `patterns/targeted-artifact-edit-preservation.md` | P2 | CONDITIONAL |
| `patterns/transformation-preservation-proof.md` | P2 | CONDITIONAL |
| `patterns/web-data-provider-escalation.md` | P2 | CONDITIONAL |
| `patterns/whole-argument-reconstruction.md` | P2 | CONDITIONAL |
| `patterns/worker-github-publication-and-recovery.md` | P2 | CONDITIONAL |
| `patterns/worker-self-remediation-before-owner-interruption.md` | P2 | CONDITIONAL |
| `patterns/chat-led-reasoning-codex-execution-separation.md` | P3 | SPECIALIST |
| `patterns/chatgpt-developer-mcp-chat-lifecycle.md` | P3 | SPECIALIST |
| `patterns/chatgpt-work-cloud-dispatch.md` | P3 | SPECIALIST |
| `patterns/codex-pro-supervision-mission-control.md` | P3 | SPECIALIST |
| `patterns/codex-supervision-intelligence-routing-and-context-lifecycle.md` | P3 | SPECIALIST |
| `patterns/codex-supervision-resource-routing-account-failover-and-browser-hygiene.md` | P3 | SPECIALIST |
| `patterns/codex-worker-permissions.md` | P3 | SPECIALIST |
| `patterns/mission-control-multi-host-submission-scheduling.md` | P3 | SPECIALIST |
| `patterns/mission-control-owner-discovered-supervision-escape-assurance.md` | P3 | SPECIALIST |
| `patterns/owner-marked-mission-control-failure-capture.md` | P3 | SPECIALIST |
| `patterns/persistent-browser-automation-hygiene.md` | P3 | SPECIALIST |
| `patterns/runtime-chat-work-authority-admission-and-internal-routing.md` | P3 | SPECIALIST |
| `patterns/shared-provider-submission-queue.md` | P3 | SPECIALIST |
| `patterns/supervision-assurance-planes-and-pro-meta-review.md` | P3 | SPECIALIST |
| `patterns/work-model-and-effort-routing.md` | P3 | SPECIALIST |

## Previously unindexed sources

Six live specialist methods and six behavioral sources now have direct index triggers. Two other live sources retain named parents that match their operational triggers; failure-diagnosis reachability alone was not used for ordinary pre-action activation. Only the two superseded compatibility paths are NOT_ACTIVE. The symbolic errata is live normative correction and is not retired.

| Source | Disposition | Route or retirement |
|---|---|---|
| `patterns/chatgpt-work-cloud-dispatch.md` | LEGACY_UNSTRUCTURED | Named parent `patterns/chat-work-execution-routing-threshold.md`. |
| `patterns/codex-github-operating-standard.md` | NOT_ACTIVE | Superseded by `patterns/codex-github-operating-system.md`. |
| `patterns/context-gated-symbolic-personality-synthesis-errata.md` | WORKFLOW_ONLY | Direct index trigger. |
| `patterns/context-gated-symbolic-personality-synthesis.md` | WORKFLOW_ONLY | Direct index trigger. |
| `patterns/contextual-symbolic-prediction-causality-and-phase-controls.md` | WORKFLOW_ONLY | Direct index trigger. |
| `patterns/continuous-candidate-signature-ranking.md` | WORKFLOW_ONLY | Direct index trigger. |
| `patterns/dynamic-successor-discovery-for-monitoring.md` | NOT_ACTIVE | Superseded by `patterns/functional-neighborhood-discovery-for-monitoring.md`. |
| `patterns/exact-git-write-handoff.md` | LEGACY_UNSTRUCTURED | Direct index trigger. |
| `patterns/failed-strategy-lineage-and-negative-evidence-binding.md` | LEGACY_UNSTRUCTURED | Named parent `patterns/outcome-advancement-and-strategy-efficacy.md`. |
| `patterns/fixed-target-symbolic-profile-fit-evaluation.md` | WORKFLOW_ONLY | Direct index trigger. |
| `patterns/mission-control-owner-discovered-supervision-escape-assurance.md` | LEGACY_UNSTRUCTURED | Direct index trigger. |
| `patterns/portable-vs-owner-specific-deployment-data.md` | LEGACY_UNSTRUCTURED | Direct index trigger. |
| `patterns/shared-provider-submission-queue.md` | LEGACY_UNSTRUCTURED | Direct index trigger. |
| `patterns/structured-natal-chart-comparison.md` | WORKFLOW_ONLY | Direct index trigger. |
| `patterns/targeted-artifact-edit-preservation.md` | LEGACY_UNSTRUCTURED | Direct index trigger. |
| `patterns/terminal-response-admission-and-autonomous-continuation.md` | LEGACY_UNSTRUCTURED | Direct index trigger. |

## Trigger clauses prepended

All original index text, labels and numbers were preserved. The original 31 trigger-less lines received only the following prefixes:

| Index number | Source | Prepended clause |
|---:|---|---|
| 3 | `patterns/github-first-agent-bootstrap.md` | When bootstrapping an agent or recovering canonical project state, |
| 4 | `patterns/context-compaction-resilience.md` | When context is compacted, interrupted, resumed or transferred, |
| 5 | `patterns/paid-workflow-safety.md` | Before running paid, privileged or irreversible GitHub Actions, |
| 6 | `patterns/editorial-authority-and-lossless-editing.md` | Before editing owner-authored text or preparing it for publication, |
| 7 | `patterns/source-interpretation-provenance.md` | When quoting, paraphrasing or interpreting a load-bearing source, |
| 8 | `patterns/conversational-prose-speakability.md` | When writing or editing conversational prose, |
| 9 | `patterns/external-evaluation-reproducibility.md` | Before relying on a historical evaluation result as a current control, |
| 10 | `patterns/living-mermaid-workflow-maps.md` | When maintaining a workflow with consequential stages or recovery paths, |
| 11 | `patterns/chatgpt-developer-mcp-chat-lifecycle.md` | When using a developer-MCP tool across conversation lifecycle boundaries, |
| 14 | `patterns/youtube-transcript-workflow.md` | When obtaining a transcript or subtitles from a YouTube URL, |
| 15 | `patterns/exclusive-active-task-locks.md` | Before consequential multi-session work or resuming an active task, |
| 18 | `patterns/interactive-shell-command-safety.md` | Before delivering or executing interactive shell commands, |
| 21 | `patterns/github-actions-pr-ref-namespace-safety.md` | When auditing pull-request refs or collecting logs inside GitHub Actions, |
| 23 | `patterns/transformation-preservation-proof.md` | Before accepting a consequential source-to-target transformation, |
| 25 | `patterns/independent-evaluation-separation.md` | When independent evaluation can change a consequential judgment or delivery claim, |
| 27 | `patterns/executable-frontier-coherence.md` | When designing or resuming a server-controlled multistage workflow, |
| 28 | `patterns/task-time-lesson-activation.md` | Before substantive work, consequential action or owner delivery, |
| 29 | `patterns/codex-pro-supervision-mission-control.md` | When designing or operating supervised repository execution, |
| 30 | `patterns/codex-supervision-intelligence-routing-and-context-lifecycle.md` | When allocating supervision reasoning or managing related chat context, |
| 31 | `patterns/codex-supervision-resource-routing-account-failover-and-browser-hygiene.md` | When routing scarce execution resources, accounts or browser automation, |
| 32 | `patterns/owner-outcome-invariant-and-contract-laundering-prevention.md` | Before defining task contracts, handoffs or completion criteria from an owner request, |
| 33 | `patterns/supervision-assurance-planes-and-pro-meta-review.md` | When supervising worker alignment, research assurance or supervision-design changes, |
| 35 | `patterns/chat-led-reasoning-codex-execution-separation.md` | When assigning reasoning and bounded execution across agent roles, |
| 36 | `patterns/structured-output-failure-boundary.md` | When a structured evaluator artifact fails parsing or validation, |
| 37 | `patterns/codex-worker-permissions.md` | When initializing a worker or repairing its runtime permission boundary, |
| 40 | `patterns/mission-control-multi-host-submission-scheduling.md` | Before browser relay submission, host failover or retry scheduling, |
| 43 | `patterns/instruction-composition-and-portable-intelligence.md` | When composing, inheriting, distributing or deduplicating instructions, |
| 45 | `patterns/durable-write-checkpoints.md` | When a repository mutation is ambiguous or unverified, |
| 50 | `patterns/artifact-authority-promotion-and-supersession.md` | Before treating an artifact as current authority or projecting its supersession, |
| 55 | `patterns/interview-evidence-information-gain.md` | When eliciting or interpreting interview evidence, |
| 64 | `patterns/shopping-research.md` | Before substantive shopping research or recommending an exact offer, |

The five additional behavioral index routes cover exact Git writes, supervision escape assurance, portable deployment data, shared provider submissions and targeted artifact edits before their actual operational boundaries. Existing original lines and numbering remain intact.

## New direct index triggers

The twelve new direct routes use these leading clauses:

| Index number | Source | Trigger clause |
|---:|---|---|
| 71 | `patterns/context-gated-symbolic-personality-synthesis.md` | When synthesizing a context-dependent symbolic personality profile, |
| 72 | `patterns/context-gated-symbolic-personality-synthesis-errata.md` | When applying symbolic personality synthesis or evaluating its timing claims, |
| 73 | `patterns/contextual-symbolic-prediction-causality-and-phase-controls.md` | When evaluating symbolic timing predictions or cognitive phase switching, |
| 74 | `patterns/continuous-candidate-signature-ranking.md` | When ranking timestamp or location candidates against a multidimensional signature, |
| 75 | `patterns/fixed-target-symbolic-profile-fit-evaluation.md` | When evaluating descriptive fit against a fixed symbolic-profile target, |
| 76 | `patterns/structured-natal-chart-comparison.md` | When comparing natal charts or running blinded chart matching, |
| 77 | `patterns/terminal-response-admission-and-autonomous-continuation.md` | Before an exclusive-task worker emits a terminal response, |
| 78 | `patterns/exact-git-write-handoff.md` | Before handing off a bounded Git write, |
| 79 | `patterns/mission-control-owner-discovered-supervision-escape-assurance.md` | When reviewing owner-discovered supervision failures or exercising terminal escape assurance, |
| 80 | `patterns/portable-vs-owner-specific-deployment-data.md` | Before transferring deployment guidance across projects or publishing portable patterns, |
| 81 | `patterns/shared-provider-submission-queue.md` | Before coordinating browser submissions across sessions or workers sharing a provider, |
| 82 | `patterns/targeted-artifact-edit-preservation.md` | Before a targeted artifact edit, |

## Open policy change reconciliation

The separate review-convergence policy change (draft/open PR #312, local snapshot 3ed51341b1f9221057c7b49c0f46402c5f878759) adds `patterns/agent-completable-merge-gates.md` and `patterns/convergent-review-acceptance-gates.md`. Both were read and are behavioral; neither exists in this branch, so neither is included as an extra inventory entry. This change does not depend on that policy change. Whichever integrates second must give both files exact dispositions and activation routes. It must structure their admission, supply a genuine specialist-workflow justification, or obtain explicit owner-authorized backlog additions. Their pre-existing open pull request does not silently exempt them from the no-growth gate. Reconcile the shared index and logic-map edits at that integration.

## Semantic receipt workflow and limits

Compile the current task after loading its authority. The compile output binds the whole envelope, including owner corrections, so recompiling after a correction changes `content_sha256` even if the selected rules stay the same.

```sh
python3 scripts/uda_rule_graph_task_time.py compile --task task.json --output contract.json
python3 scripts/uda_rule_graph_task_time.py receipt --contract contract.json --phase final-delivery --payload final.txt --output receipts.json
python3 scripts/uda_rule_graph_task_time.py check --contract contract.json --phase final-delivery --destination owner-visible-final --payload final.txt --receipts receipts.json
```

The skeleton contains a receipt for each semantic obligation due in that phase. Fill `verdict` with PASS, FAIL or NOT_APPLICABLE; give short `evidence` about the literal candidate, the asserting actor's `id`, `kind` and `relation` (SAME_AGENT or INDEPENDENT), and an ISO date/time with timezone in `issued_at`. For NOT_APPLICABLE, also give `not_applicable_reason`; it is accepted only when the obligation explicitly sets `not_applicable_allowed: true`. The blank skeleton itself cannot admit work. This CLI and the `scripts/uda_rule_graph.py` facade support the same receipt and check commands.

Every receipt binds `contract_sha256` to the compiled contract's `content_sha256`, plus `rule_id`, `obligation_id`, `phase`, `destination` and `payload_sha256`. Payload hashing uses the exact file bytes: UTF-8 characters, CRLF, whitespace and the final newline all matter. Check verifies the contract's content hash too. Optional `--destination` binds the check's target; when omitted each receipt must still match its obligation's declared destination. For a contract explicitly requiring the built-in elapsed-time serialization predicate, supply `--clock-start` and `--clock-end`; receipts do not replace mechanical predicates. The broader kernel source now uses semantic clock/final evidence and does not mandate the predicate’s fixed wording.

Missing, malformed, unbound, mismatched, stale or duplicate matching receipts leave the semantic obligation UNKNOWN and block admission. A matching FAIL blocks. An improper NOT_APPLICABLE blocks. `independent_review_required: true` rejects SAME_AGENT judgments. An owner correction requires recompilation and fresh receipts; a final rewrite, however small, requires a new receipt for its changed bytes. Unresolved applicability still blocks even if supplied receipts say PASS.

A resolved receipt result states `RECEIPT_BINDING_VERIFIED`, names `asserted_by`, and says `judgment_proved: false`. SAME_AGENT receipts are labeled APPLICATION_EVIDENCE; INDEPENDENT receipts are labeled INDEPENDENT_REVIEW_ASSERTION. These are attributed assertions, not mechanically proved semantic judgments. This code does not authenticate the actor's identity or establish their actual independence, prove that evidence entails the verdict, or prove that every prose obligation is represented. A wrong but well-formed PASS assertion can pass this binding gate. Independent review is mandatory only where the declared obligation requires it; honest provenance and appropriate semantic review remain necessary.

## Activation states and owner instruction replacement

A task envelope records `bootstrap.state`:

| Bootstrap state | Compiled activation | Protection | Check behavior |
|---|---|---|---|
| LOADED | ACTIVE, with the bootstrap record in `via` | UDA_GOVERNED | Evaluate due obligations; ADMITTED only if required checks/receipts pass and applicability is resolved |
| SKIPPED_BY_OWNER_EXEMPTION | NOT_ACTIVATED | OUTSIDE_UDA | NOT_EVALUATED, never PASS or ADMITTED |
| NOT_LOADED (or missing/other state) | NOT_ACTIVATED | OUTSIDE_UDA | NOT_EVALUATED, never PASS or ADMITTED |

Compile carries `uda_activation` and `uda_protection`, and marks an outside contract unusable for enforcement. Check without `--contract` also returns NOT_EVALUATED with OUTSIDE_UDA, including a non-success exit code. A declared LOADED state records activation provenance; the compiler does not observe or prove that retrieval happened. Do not set LOADED when the bootstrap failed.

### Minimal always-on owner bootstrap replacement

UDA cannot protect turns it never loaded. Replace the owner's **"unless it's very simple"** bootstrap exemption with this exact proposed owner-side instruction:

> On every user turn, use the visible message sent time, or take a first clock reading as the first action; take the second reading immediately before writing the final. Use date -u in a shell, then the current-time tool, then the code clock as available; if a read fails or is not later, use the next source once. Do not read mid-task or compare clocks. Before substantive reasoning, artifact composition, action or answering, load the current canonical default-branch root AGENTS.md, including on very simple turns. Apply its always-on minimal bootstrap obligations. Then use LESSON-INDEX.md to load deeper guidance only when its trigger matches the current task. Every final answer starts with the second current-turn reading as date, time and timezone/UTC offset and reports total elapsed time; check the literal first line before emitting it. If the live root cannot be retrieved, retain that final timestamp and explicitly state the access failure, record the bootstrap as NOT_LOADED, and do not claim UDA protection. Do not reuse a prior-turn timestamp or invent time; disclose when no clock answers.

This is an owner-side instruction draft; this repository change does not edit owner settings. Minimal bootstrap is always on; deeper loading stays conditional.

## Dominated-route regression and integration boundary

`uda.reasoning.dominated-alternative` selects operational_command, procedure and practical_method requests for chat, work, codex and claude. Unknown `request_kind` remains unresolved. Its single semantic obligation is due at final-delivery to owner-visible-final; its exact selector is the new domain-neutral sentence beside minimum-owner-choice guidance in reasoning selection.

The fixtures in `tests/fixtures/dominated-route/` use abstract inputs/outputs. The old final presents a two-command route, then the same transform command's direct-output option, and calls the latter preferable: its golden FAIL receipt blocks. The repaired one-command final's PASS receipt admits and stays one line (under 160 characters). Replaying a PASS receipt for the old payload or rewriting the final without a new receipt blocks. When intermediate approval before output is a real material tradeoff, both alternatives remain and the golden PASS receipt admits them. These fixtures pin source provenance to the exact source blob for commit-independent golden bindings; production compilation preserves repository-revision provenance. The isolated regression checks the dominated-route slice; the existing mechanical suites separately check timestamps and elapsed time.

Both passes of the first integration are implemented. This establishes inventory, activation-state reporting, semantic binding admission and a behavioral regression; it does not establish universal live behavioral enforcement. The parent owner outcome remains OPEN with 78 partial/legacy identities after kernel slice 1. Later slices migrate the remaining P1 patterns and subsequent priorities. The baseline pin remains unchanged: no added identities and six fully structured removals are reported.

## Review judgment limits

`patterns/living-mermaid-workflow-maps.md` is treated as specialist documentation maintenance; `patterns/github-actions-pr-ref-namespace-safety.md` as specialist workflow ref/log topology. Neither exception proves downstream adoption, and both should be reviewed if the owner wants their authoring behavior structured. The six symbolic-analysis exceptions retain their live domain constraints and scientific-validation limits. Evidence classes are declared after reading tests, but file-level evidence can contain several types of check; the report never upgrades routing to admission.
