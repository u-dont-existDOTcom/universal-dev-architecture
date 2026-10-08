# UDA enforcement coverage — first integration, continuity and migration slices 1–2a

Rules can be readable and easy to find without ever changing an answer or blocking an action. This inventory makes that gap visible. It checks declared coverage, not the semantic truth of an agent's judgment or live enforcement across every consumer. The owner outcome remains OPEN.

## Dispositions

- **STRUCTURED_ENFORCED:** all behavioral obligations in this source have exact task-time records and an evaluable admission path. Large files with a narrow slice do not qualify. After supervisor correction of slice 2a, six kernel sections and three complete behavioral patterns are in this state; other large pattern sources still have unstructured remainders. An obligation-level bootstrap exception is carried outside activated UDA, not represented as an admitted obligation.
- **STRUCTURED_PARTIAL:** some obligations have exact records; the entry names the remaining operative obligations in `legacy_remainder`. It stays in the migration backlog. Semantic records now accept exact-candidate receipts and fail closed with UNKNOWN when no matching, well-formed receipt supplies a judgment.
- **WORKFLOW_ONLY:** the source is a specialist authoritative workflow or reference, with a source-specific explanation. This is an explicit exception, not a claim of semantic task-time enforcement. Some specialist workflows do contain behavior; that fact stays visible.
- **LEGACY_UNSTRUCTURED:** a behavioral rule still relies on prose/index application. Its exact identity and migration priority are reported. Routing does not count as enforcement.
- **NOT_ACTIVE:** only superseded, historical or retired sources. A specific reason and an active successor for supersession are required. Live unindexed guidance cannot use this state.

## What evidence can establish

`TEXT_PRESENCE` proves text or a fixture exists. `ROUTING` proves an index or graph route. `COMPILATION` proves records can enter a representative contract. None proves the actual answer/action obeyed a rule. Only `ADMISSION` and `BEHAVIORAL_REGRESSION` can support a structured disposition, and the inventory still requires exact source records. Admission evidence for a partial semantic record proves binding/admission behavior, including UNKNOWN blocking; it does not prove the semantic judgment. Other local runtime admission controls are useful supporting evidence but do not replace task-time record mapping.

A wildcard, an index listing, a graph node, a generic green test total or the removed legacy source-list field cannot certify enforcement. Source/selector checks inspect the section that owns the record, not an arbitrary sentence elsewhere in the file. Mechanical validation establishes bindings and declared structure; human review still decides whether the inventory captures all operative obligations and whether a specialist exception is justified.

## Activation routes

`KERNEL_ALWAYS` loads a root section with activated UDA authority. `STRUCTURED_TRIGGER` uses the listed records' trigger facts. `INDEX_TRIGGER` is an explicit leading When/Before/For/After/Whenever/While/If clause interpreted by the reasoning agent with a recorded activation reason. `PARENT_PATTERN` follows a named active parent that literally mentions the child's path. Parent cycles are rejected. These routes describe reachability, not successful application. They preserve the small active contract instead of loading every pattern on every task.

The kernel profile uses the required `repository_kind: uda-kernel` classification and requires `uda_kernel: true`. This kind retains policy-command checks. The versioned `.github/uda-kernel` identity marker independently activates coverage validation, including in archives without Git metadata, so rewriting both profile fields or removing the profile cannot disable the gate. Its presence activates the gate regardless of its contents. Either affirmative profile field also activates validation for kernels without the identity file. Standalone `policy` consumers without the identity file or an affirmative kernel profile field remain exempt.

## Adding or migrating a rule

1. Read the full source and its applicable authority. A new pattern file or root level-two section immediately joins the computed universe.
2. Add exactly one entry in `rules/rule-graph/enforcement-coverage.v1.json`, with canonical id, behavioral classification, actors, phases, destinations, evidence and a real activation route.
3. For structured coverage, list every exact `task_time_records` id. Each record must exist, match this source (and root section), and be claimed once. Supply both ADMISSION and BEHAVIORAL_REGRESSION evidence for a fully structured section. Enumerate every operative sentence or clause in its obligation_map and capture its independent source_clause_manifest in the owner requirement record; use partial coverage with an exact legacy_remainder when obligations remain. A fully enforced pattern also requires `pre_section_sha256` for the complete source before its first level-two heading (the entire source if there is no such heading). Every level-two section in a fully enforced pattern must have a manifest entry: mapped clause pins plus `source_sha256` of the complete section body, or `classification: NON_OPERATIVE` with a specific `reason` and `source_sha256` of the exact section body (after the heading, before the next level-two heading). Non-operative declarations require human review; the validator verifies their shape and content binding, not their semantic truth.
4. For a specialist workflow exception, explain the actual domain and authoritative workflow. For retirement, name the reason and successor. Neither disposition hides a live missing route.
5. New backlog is forbidden. The baseline identity pin stays unchanged; current backlog shrinks only through STRUCTURED_ENFORCED identities reported in removed_since_baseline. Additions require `owner_authorized_additions` with exact id, owner quote, ISO date and source. The baseline pins identities, not just a total, and must match the initial count and canonical identity-list SHA-256 preserved in the owner requirement record. Editing that pin alone cannot authorize growth; owner quotes and coordinated policy rewrites still require human authority review.
6. Update docs counts/backlog and run `python3 scripts/uda_enforcement_coverage.py validate` and `python3 scripts/uda_enforcement_coverage.py report`. The deterministic repository audit runs validation at error level. If task-time metadata or bound source changes, regenerate the lock with `python3 scripts/uda_rule_graph.py validate --write-lock rules/rule-graph/generated/source-lock.v1.json` and regenerate the representative Mission Control projection with `python3 scripts/uda_rule_graph.py compile --task examples/rule-graph/work-handoff.json --mode graph --output tools/codex-mission-control/restored/codex-mission-control/generated/rule-graph/work-handoff-contract.json`. These are derived artifacts, not Mission Control runtime changes.

## Recomputed baseline

The supplied branch includes main at 991c7a08b7d9f831327d9075175b8d70c34c37e6. Before edits it had 70 indexed patterns, 86 pattern files, 31 trigger-less index lines and 16 unindexed files. Nine task-time records directly source six files: root AGENTS.md and five patterns; 65 indexed patterns lack direct records. There are two mechanical and nine semantic obligations. The graph has 36 active nodes and one superseded node. The baseline findings retain these counts; the exact pinned backlog identities are in `rules/rule-graph/enforcement-legacy-baseline.v1.json`. Current exact identities and dispositions are in the coverage inventory and its report, rather than repeated in the requirement record. Live GitHub freshness could not be verified in the network-isolated sandbox.

The systemic gap fits existing logic-map entries: LF-2.1 for unloaded/stale guidance; LF-7.1 for a loaded check missing the real endpoint; LF-7.2 for presence/routing tests that cannot reject violating behavior; LF-7.3 for overstated coverage. No new failure category is necessary.

## Current counts

Inventory entries: 98

Indexed patterns: 84

Migration backlog: 77

Task-time records: 70, sourced from 12 files, with 2 mechanical and 78 semantic obligations. Corrected slice 2a adds 28 records and extends three continuity records; its 31 records carry 32 semantic behaviors and 281 mapped clause rows.

| Disposition | Count |
|---|---:|
| STRUCTURED_ENFORCED | 9 |
| STRUCTURED_PARTIAL | 8 |
| WORKFLOW_ONLY | 10 |
| LEGACY_UNSTRUCTURED | 69 |
| NOT_ACTIVE | 2 |

Six root sections, the two review/merge patterns and exclusive active-task locks are STRUCTURED_ENFORCED. Context-compaction resilience and terminal admission are STRUCTURED_PARTIAL with exact operative remainders, alongside the six earlier partial sources. The parent owner outcome remains OPEN for owner-outcome/operating-system slice 2b and later priorities.

The immutable baseline pins 84 identities. Corrected backlog falls from 78 before slice 2a to 77: only the task-lock pattern is a complete promotion. Seven baseline identities are removed, with zero additions. P1 is 15, P2 is 47 and P3 is 15. The two review/merge identities never belonged to the baseline. The owner explicitly required correcting overstated dispositions; the requirement records that authority and pins partial clause maps without authorizing new baseline identities.

## Kernel slice 1 obligation map

Each row below matches the inventory's obligation_map exactly. One obligation covers each coherent behavior at its boundary. The 103 unchanged clause rows map to 23 structured behaviors and one unchanged exception; 102 clauses are structured. Detail remains in exact selectors, acceptance evidence and non-substitutes rather than requiring a receipt for each sentence. These are declared source coverage and receipt-admission regressions, not proof of universal runtime invocation or semantic truth.

Records apply to chat, work, codex and claude unless the source limits the actor: the Work permission record applies only to work/codex. Every-turn records trigger on governance_required; the live-root record also needs owner_requires_live_root, and instruction maintenance needs the existing action_classes value instruction_maintenance. Unknown trigger facts remain unresolved and block. No new facts were introduced, so no new envelope declarations are required.

Payload/action-dependent obligations remain selected with not_applicable_allowed: true. Their bound receipts must explain the absent condition, including coordination when only one safe in-scope approach exists and outbound-link verification when no outbound link is sent. NOT_APPLICABLE is not an escape from an active payload obligation; its semantic correctness still requires review. Each obligation declares its actual retrieval, reasoning, pre-action, handoff, persistence or final-delivery boundary, destination, acceptance evidence, non-substitutes, carry-through and repair. Pre-action gates are not deferred to the final. Reusable output is checked at handoff to recipient-file-and-chat-summary; owner-required artifacts and companions are checked at their actual handoff. Prose and outbound links are checked before surfacing any owner-visible message or question payload, including commentary. Completion claims and explicit final-only duties remain at final-delivery to owner-visible-final.

The final-first-line-timestamp and final-elapsed-time obligations retain the built-in final_timestamp_first_line and final_elapsed_time predicates. A bound semantic PASS cannot admit a missing or misplaced timestamp, an absent elapsed-time report or incorrect duration arithmetic. Supply both clock readings for the elapsed predicate; it also matches the final stamp to the supplied second reading. The existing semantic two-read-cadence obligation judges actual current-turn clock provenance separately. Receipts cannot override mechanical PASS or FAIL results. Owner-input continuation permits reason-bound NOT_APPLICABLE when the turn is not an answer, correction, upload or requested clarification to an active task.

Before slice 2a, the representative rendered Work handoff was 27,355 bytes, below the 32 KiB (32,768-byte) rendering cap; the first slice draft was 79,386 bytes, and the usage-limit continuity records added 3,288 bytes when they joined it. Its envelope selects the receiving work actor, activating the Work/codex permission boundary rather than Chat-only handoff obligations. The Work adapter emits each selected record's exact normative source once with acceptance/non-substitute boundary rows and shared provenance/lifecycle values; redundant behavior summaries remain in structured selected_rules. Authority owner/domain and every exact source binding reach the prompt. Before slice 2a, Mission Control's injected Work block was 33,139 bytes. Its prompt limit is 48 KiB: a regression keeps at least 8 KiB of it for the wrapper and the bounded directive, and the actual outgoing prompt, including its directive, is measured against the limit. Both boundaries reject oversized UTF-8 payloads before dispatch. The earlier 24 KiB and 32 KiB figures were borrowed from Codex's AGENTS.md discovery budget, which does not apply to a Work prompt; with the continuity records they would have refused every graph-mode Work dispatch, so the limits were revalidated instead of removing records from Work. No selectors or enumerated clauses were removed.


| Section | Before structured obligations | After consolidated obligations | Preserved map clauses | Exceptions |
|---|---:|---:|---:|---:|
| Follow-up derivation | 16 | 3 | 16 | 0 |
| Instruction composition | 12 | 3 | 12 | 0 |
| Operational references | 9 | 3 | 9 | 0 |
| Bootstrap | 26 | 6 | 27 | 1 |
| Continuation | 6 | 1 | 6 | 0 |
| Workflow | 33 | 7 | 33 | 0 |
| Total | 102 | 23 | 103 | 1 |

### Obligation-level exceptions

An obligation that cannot be checked inside activated UDA may carry an exception instead of a record only for BOOTSTRAP_NOT_LOADED or OWNER_SETTINGS_CHANGE. Each exception contains the exact owning sentence, a specific reason and a named, resolvable carrier. Difficulty of semantic checking is not an exception. A loaded-root fetch duty stays structured; the duty to disclose failure when the required bootstrap never loaded is carried by the owner-side minimal bootstrap below. There are no owner-settings-change exceptions in this slice and no owner settings were changed.

Validation requires every map sentence to occur exactly once in its owning section; every mapped record/obligation to exist and belong to that section; every mapped sentence to occur in that record's exact-text selectors; every selected record obligation to be mapped (several clauses may share it); every exact selector clause to remain represented; and every exception to have one of the two allowed kinds, a specific reason and an existing carrier/anchor. Complete maps and both evidence classes admit STRUCTURED_ENFORCED; partial sections retain their exact operative legacy_remainder. Each enforced section must also match the independently captured clause count and canonical SHA-256 of its sorted exact sentence strings, including exception clauses, in the requirement record's source_clause_manifest. Lock/projection regeneration never updates that pin, so coordinated record/map deletion or clause shortening fails. Changes to the pin require source-completeness review; the digest verifies preservation, not semantic completeness or authority. Human review still owns completeness against the prose. The report lists the exceptions separately, and the backlog validator prohibits removing a baseline identity by reclassifying it as workflow-only or inactive.

### AGENTS.md#follow-up-goal-derivation-and-assistant-added-requirements

Clauses 16; consolidated obligations 3; structured clauses 16; excepted 0; remaining 0.

| Exact sentence or clause | Record / obligation or exception carrier |
|---|---|
| Before authoring, launching, or accepting a consequential follow-up task, re-bind the proposed work to the current parent owner outcome | uda.kernel.followup-derivation / rebind-before-author-launch-accept |
| and follow `patterns/owner-goal-followup-and-requirement-accretion.md`. | uda.kernel.followup-derivation / rebind-before-author-launch-accept |
| First classify the root outcome as `OPEN`, `SATISFIED`, `SUPERSEDED`, `CANCELED`, or `AUTHORITY_UNRESOLVED`, | uda.kernel.followup-derivation / rebind-before-author-launch-accept |
| and state the exact remaining owner gap. | uda.kernel.followup-derivation / rebind-before-author-launch-accept |
| A useful improvement is not unfinished owner work merely because it is technically attractive. | uda.kernel.followup-derivation / rebind-before-author-launch-accept |
| Every new mandatory requirement that was not already present in the owner outcome must declare its origin and necessity. | uda.kernel.followup-derivation / rebind-before-author-launch-accept |
| An `ASSISTANT_INFERENCE` or inherited choice (not a declared gate) with unresolved necessity may be only a bounded reversible experiment; it may not become a fail-closed blocker, architecture prerequisite, root acceptance criterion, stronger assurance gate, or reason to disable a previously working owner-aligned path. | uda.kernel.followup-derivation / rebind-before-author-launch-accept |
| Treat stronger assurance as requirement accretion when it changes whether work may proceed or count as complete. | uda.kernel.followup-derivation / rebind-before-author-launch-accept |
| Independent readback, provider attestation, extra reviewers, new trust boundaries, and similar controls must identify the current owner decision/outcome they materially change and why a simpler evidence standard is insufficient before becoming mandatory. | uda.kernel.followup-derivation / rebind-before-author-launch-accept |
| If a newly added control blocks or degrades a previously working owner-aligned path, stop the compensating-fix chain | uda.kernel.followup-derivation / revalidate-first-added-control |
| and revalidate the first added requirement against the parent outcome and the strongest materially simpler alternative. | uda.kernel.followup-derivation / revalidate-first-added-control |
| Preserve useful supporting work, | uda.kernel.followup-derivation / revalidate-first-added-control |
| but restore the simpler valid path when necessity is not established. | uda.kernel.followup-derivation / revalidate-first-added-control |
| This gate runs at follow-up-task authoring, before the new framing is handed to Work or another executor. | uda.kernel.followup-derivation / rebind-before-author-launch-accept |
| A later worker faithfully executing a substituted goal is too late. | uda.kernel.followup-derivation / rebind-before-author-launch-accept |
| At experiment launch, apply the operational owner-method contract to the actual runnable configuration. | uda.kernel.followup-derivation / actual-runnable-method |

### AGENTS.md#instruction-composition

Clauses 12; consolidated obligations 3; structured clauses 12; excepted 0; remaining 0.

| Exact sentence or clause | Record / obligation or exception carrier |
|---|---|
| Before handling any task, including a brief request to remember a preference, open `LESSON-INDEX.md`, | uda.kernel.instruction-activation / open-index-every-task |
| select entries whose triggers match, | uda.kernel.instruction-activation / open-index-every-task |
| and read their current patterns. | uda.kernel.instruction-activation / open-index-every-task |
| Instruction maintenance uses `patterns/instruction-composition-and-portable-intelligence.md`; | uda.kernel.instruction-maintenance / maintenance-pattern-owner |
| activation uses `patterns/task-time-lesson-activation.md`. | uda.kernel.instruction-activation / open-index-every-task |
| Resolve graph-covered dependencies via `rules/UDA-RULE-GRAPH.json`/`scripts/uda_rule_graph.py`; | uda.kernel.instruction-activation / resolve-covered-dependencies |
| canonical prose remains authoritative; | uda.kernel.instruction-activation / resolve-covered-dependencies |
| unmapped rules stay index-routed; | uda.kernel.instruction-activation / resolve-covered-dependencies |
| shopping routes through `LESSON-INDEX.md`. | uda.kernel.instruction-activation / resolve-covered-dependencies |
| Task-specific rules live in patterns | uda.kernel.instruction-maintenance / maintenance-pattern-owner |
| and are reached through `LESSON-INDEX.md`; | uda.kernel.instruction-maintenance / maintenance-pattern-owner |
| a new task rule adds a pattern and an index entry, never a root line. | uda.kernel.instruction-maintenance / maintenance-pattern-owner |

### AGENTS.md#owner-facing-operational-references

Clauses 9; consolidated obligations 3; structured clauses 9; excepted 0; remaining 0.

| Exact sentence or clause | Record / obligation or exception carrier |
|---|---|
| In user-facing prose, never make repository identifiers the primary explanation. | uda.kernel.operational-references / plain-language-first |
| Pull-request numbers, issue numbers, branch names, commit SHAs, workflow/run/job IDs, and similar opaque references are locating metadata, not semantic referents. | uda.kernel.operational-references / plain-language-first |
| Immediately before surfacing any outbound link to the owner, open the exact destination, follow redirects, and verify that the final page resolves successfully to the intended current content—not an error, 404, dead, parked, or stale page. | uda.kernel.outbound-links / exact-current-destination |
| Search snippets, cached previews, remembered URLs, and earlier checks do not count as verification. | uda.kernel.outbound-links / exact-current-destination |
| If the exact link cannot be verified in the current turn, do not surface it. | uda.kernel.outbound-links / exact-current-destination |
| Never present a broken or unverified link as a recommendation. | uda.kernel.outbound-links / exact-current-destination |
| **Delivery is part of completion.** | uda.kernel.artifact-delivery / usable-delivery-before-completion |
| When the owner needs to use a file, packet, handoff, protocol, report, generated artifact, or other output, do not make them navigate GitHub branches or repository paths to obtain it. | uda.kernel.artifact-delivery / usable-delivery-before-completion |
| Before delivering that output, load the delivery-priority, provenance, companion-material, and pre-close usability rules: `patterns/human-readable-operational-references.md` → **Compact rules moved from root `AGENTS.md`**. | uda.kernel.artifact-delivery / usable-delivery-before-completion |

### AGENTS.md#per-turn-bootstrap-invariants

Clauses 27; consolidated obligations 6; structured clauses 26; excepted 1; remaining 0.

| Exact sentence or clause | Record / obligation or exception carrier |
|---|---|
| For **every assistant turn** governed by this architecture, the **first line of the final user-visible assistant answer MUST be an explicit date-and-time stamp including a timezone or UTC offset**. | uda.final.timestamp / final-first-line-timestamp |
| This is a final-output contract and a pre-answer invariant, not a task-dependent recommendation. | uda.final.timestamp / final-first-line-timestamp |
| The timestamp must appear in the final answer/message content delivered to the user on every assistant turn. | uda.final.timestamp / final-first-line-timestamp |
| A timestamp written only in hidden reasoning, visible thinking/reasoning UI, analysis, tool-call commentary, scratch work, or any intermediate channel **does not satisfy this requirement**. | uda.final.timestamp / final-first-line-timestamp |
| An earlier timestamp in reasoning or an intermediate step does not satisfy the final-output contract; use the second reading in the final answer. | uda.final.timestamp / final-first-line-timestamp |
| Two clock readings per turn, no others (owner, 2026-09-30). | uda.kernel.clock-cadence / two-read-cadence |
| First: the message's sent time if the surface shows it, else a read as the turn's first action. | uda.kernel.clock-cadence / first-reading |
| Second: a read right before writing the final answer. | uda.kernel.clock-cadence / two-read-cadence |
| Read with `date -u` in a shell tool, else the current-time tool, else the code tool's clock; | uda.kernel.clock-cadence / two-read-cadence |
| if a read fails or isn't later than the first, use the next one once. | uda.kernel.clock-cadence / two-read-cadence |
| Never compare clocks or read mid-task. | uda.kernel.clock-cadence / two-read-cadence |
| The final answer opens with the second reading | uda.final.timestamp / final-elapsed-time |
| and says how long the turn took in total. | uda.final.timestamp / final-elapsed-time |
| Don't reuse a prior-turn timestamp | uda.kernel.clock-cadence / two-read-cadence |
| or present capture time as hidden provider sent time. | uda.kernel.clock-cadence / two-read-cadence |
| If no clock answers, say so rather than inventing a time. | uda.kernel.clock-cadence / two-read-cadence |
| Before finalizing every assistant turn, perform a literal output check: the first user-visible line of the final answer must match a date + time + timezone/UTC-offset form. | uda.final.timestamp / final-first-line-timestamp |
| If it does not, prepend the second reading; the check needs no further reading. | uda.final.timestamp / final-first-line-timestamp |
| Apply it on every turn even for trivial arithmetic, greetings, smoke tests, follow-up acknowledgments, corrections, status updates, or prompts that otherwise warrant a direct one-line answer. | uda.final.timestamp / final-first-line-timestamp |
| Simple answers, low-effort reasoning, tool avoidance, brevity, and shallow repository reads **must not waive this invariant**. | uda.final.timestamp / final-first-line-timestamp |
| When current owner instructions require the canonical GitHub bootstrap, **re-fetch the live default-branch root `AGENTS.md` on every user turn before task reasoning, artifact composition, task execution, or answering**. | uda.bootstrap.live-root / live-root-refetch |
| Tool discovery, current-clock checks, and the bootstrap retrieval itself are permitted prerequisites. | uda.bootstrap.live-root / live-root-refetch |
| A prior-turn fetch, cached copy, remembered summary, or earlier reasoning does not satisfy per-turn activation. | uda.bootstrap.live-root / live-root-refetch |
| If required GitHub/bootstrap access is unavailable, the final answer must still begin with the timestamp and then state the access failure explicitly rather than pretending the bootstrap occurred. | BOOTSTRAP_NOT_LOADED / docs/uda-enforcement-coverage.md#minimal-always-on-owner-bootstrap-replacement |
| Treat failure to emit the timestamp as the first line of the final user-visible answer on any assistant turn as an instruction-following failure even when the timestamp appeared during thinking or the underlying task answer is otherwise correct. | uda.final.timestamp / final-first-line-timestamp |
| **Every turn:** reusable output over ~8,000 characters goes in a file, for any recipient; | uda.kernel.output-budget / file-for-long-reusable-output |
| chat gets a summary: `patterns/worker-directive-delivery-and-chat-output-budget.md`. | uda.kernel.output-budget / file-for-long-reusable-output |

### AGENTS.md#pre-final-continuation-invariant

Clauses 6; consolidated obligations 1; structured clauses 6; excepted 0; remaining 0.

| Exact sentence or clause | Record / obligation or exception carrier |
|---|---|
| Before final delivery, apply `patterns/codex-github-operating-system.md` → **Continuation and stop admission**. | uda.kernel.continuation / execute-open-frontier |
| An OPEN task with a safe authorized executable next action requires doing it now, not just diagnosing or planning it. | uda.kernel.continuation / execute-open-frontier |
| A self-authored scope or completed lease cannot cancel parent implementation authority. | uda.kernel.continuation / execute-open-frontier |
| Check the actual final output: stop only at an evidenced boundary, | uda.kernel.continuation / execute-open-frontier |
| finish independent work, | uda.kernel.continuation / execute-open-frontier |
| and preserve explicit owner restrictions and real access, spending, privacy, platform, and irreversible-action gates. | uda.kernel.continuation / execute-open-frontier |

### AGENTS.md#workflow

Clauses 33; consolidated obligations 7; structured clauses 33; excepted 0; remaining 0.

| Exact sentence or clause | Record / obligation or exception carrier |
|---|---|
| When multiple safe in-scope execution approaches achieve the same outcome, choose the better-coordinated approach without asking the owner to select an execution mode: | uda.kernel.coordination / choose-coordinated-route |
| use isolated workspaces, | uda.kernel.coordination / choose-coordinated-route |
| a durable plan and recovery ledger, | uda.kernel.coordination / choose-coordinated-route |
| delegation plus independent review when safely separable and decision-relevant, | uda.kernel.coordination / choose-coordinated-route |
| and serialize shared mutable state. | uda.kernel.coordination / choose-coordinated-route |
| This standing permission does not broaden task authority and does not replace substantive owner decisions. | uda.kernel.coordination / choose-coordinated-route |
| An owner answer, correction, upload, or requested clarification is input to the active task, not a completion event. | uda.kernel.owner-input-continuation / resume-after-input |
| After incorporating it, continue automatically to the next safe in-scope action while the stated goal remains unfinished. | uda.kernel.owner-input-continuation / resume-after-input |
| Do not return only an acknowledgment or ask the owner what to do next when repository state, the task plan, or the request already determines that step. | uda.kernel.owner-input-continuation / resume-after-input |
| Pause only for a genuine missing owner decision, new authority, destructive or irreversible risk, unavailable permission or credential, spending, publication, or access, or an explicit request to stop. | uda.kernel.owner-input-continuation / resume-after-input |
| Work selects authorized task-scoped access and the automatic reviewer; do not ask the owner to choose routine permissions. | uda.kernel.work-permissions / automatic-task-access-review |
| This adds no semantic, spending, publication, representation, destructive, or self-approval authority. | uda.kernel.work-permissions / automatic-task-access-review |
| Resolve engineering blockers; ask only about a material tradeoff, with plain consequences and a recommendation, or a required human gate. | uda.kernel.owner-interaction / minimize-owner-choice |
| Minimize owner choice as an execution invariant. | uda.kernel.owner-interaction / minimize-owner-choice |
| Resolve routine implementation details and already-authorized subordinate actions without asking. | uda.kernel.owner-interaction / minimize-owner-choice |
| A confirmation for the same destination, data boundary, scope, and consequence remains valid across retries, resumed execution, or an alternate authorized transport path; a failed tool or transport does not consume that approval. | uda.kernel.owner-interaction / minimize-owner-choice |
| Ask again only if those facts materially change or the platform requires a fresh human gesture. | uda.kernel.owner-interaction / minimize-owner-choice |
| If owner interaction is genuinely required, finish independent preparation, | uda.kernel.owner-interaction / consolidate-confirmations |
| consolidate the exact dependent actions into the fewest confirmations permitted, | uda.kernel.owner-interaction / consolidate-confirmations |
| explain the concrete downside or risk and why the gate is mandatory, | uda.kernel.owner-interaction / consolidate-confirmations |
| give a recommended default, | uda.kernel.owner-interaction / consolidate-confirmations |
| and resume automatically after the answer. | uda.kernel.owner-interaction / consolidate-confirmations |
| Before declaring a host, device, service, session, or other target inaccessible—or asking the owner to identify, restart, reconnect, or configure an opaque machine-generated target—recover its semantic identity and the authorized access topology first. | uda.kernel.target-recovery / identity-and-topology-before-escalation |
| Treat a failed connector/device transport as a route-specific failure, not proof that the underlying target is unavailable. | uda.kernel.target-recovery / identity-and-topology-before-escalation |
| Inspect current connected endpoints plus task-relevant local mappings such as SSH config/aliases, durable task state, service/process metadata, and recent authorized execution history; | uda.kernel.target-recovery / identity-and-topology-before-escalation |
| from a healthy authorized endpoint, use bounded read-only probes such as `hostname` and exact target-path existence/read checks to prove which route reaches the same target. | uda.kernel.target-recovery / identity-and-topology-before-escalation |
| Use an equivalent authorized alternate route when one exists. | uda.kernel.target-recovery / identity-and-topology-before-escalation |
| Never ask the owner to recognize an opaque identifier merely because the first transport failed. | uda.kernel.target-recovery / identity-and-topology-before-escalation |
| Escalate only after plausible authorized routes are exhausted or a genuinely human-only action remains. | uda.kernel.target-recovery / identity-and-topology-before-escalation |
| When you explicitly commit to a substantive operation, method, comparison, audit, experiment, or artifact, keep it as an open obligation until it is actually executed, I explicitly supersede it, or new evidence makes it invalid and you say so. | uda.kernel.operation-commitments / keep-promised-operation-open |
| Adjacent analysis, planning, preparation, or a different method does not count as completion. | uda.kernel.operation-commitments / keep-promised-operation-open |
| Before switching methods, declaring progress complete, or ending a substantial pass, verify what observable result proves each promised operation actually occurred. | uda.kernel.operation-commitments / keep-promised-operation-open |
| If a still-valid promised step was displaced by later work, execute it before continuing. | uda.kernel.operation-commitments / keep-promised-operation-open |

The 2026-10-07 maintainer-handoff addition in `patterns/suggested-fix-queue.md` remains text-only coverage within its existing `LEGACY_UNSTRUCTURED` identity. Its tests protect step 9, the `uda-lane` label and README/index routing; they do not enforce live handoff, maintainer check-ins or filing-agent edit restrictions. The inventory records those limits and the migration work; the backlog remains 84 identities.

## Exact migration backlog

P1 retains 15 high-leverage identities; P2 has 47 and P3 has 15. Every P1 entry is behavioral. Corrected partial compaction and terminal-admission coverage stays visible here.

Order migration by P1, P2, P3 first, then by how often the trigger fires: EVERY_TURN, FREQUENT, CONDITIONAL, SPECIALIST; use the id only to break ties. Frequency classes are declared routing estimates, not measured usage. Each entry retains its specific next step. The report uses this same order.

| Entry id | Priority | Estimated trigger frequency |
|---|---|---|
| `patterns/chat-work-execution-routing-threshold.md` | P1 | FREQUENT |
| `patterns/codex-github-operating-system.md` | P1 | FREQUENT |
| `patterns/context-compaction-resilience.md` | P1 | FREQUENT |
| `patterns/owner-outcome-invariant-and-contract-laundering-prevention.md` | P1 | FREQUENT |
| `patterns/reasoning-selection.md` | P1 | FREQUENT |
| `patterns/source-interpretation-provenance.md` | P1 | FREQUENT |
| `patterns/task-time-lesson-activation.md` | P1 | FREQUENT |
| `patterns/terminal-response-admission-and-autonomous-continuation.md` | P1 | FREQUENT |
| `patterns/worker-directive-delivery-and-chat-output-budget.md` | P1 | FREQUENT |
| `patterns/chatgpt-client-surface-capability-and-thread-recovery.md` | P1 | CONDITIONAL |
| `patterns/cross-family-reasoning-check.md` | P1 | CONDITIONAL |
| `patterns/logic-failure-map.md` | P1 | CONDITIONAL |
| `patterns/owner-goal-followup-and-requirement-accretion.md` | P1 | CONDITIONAL |
| `patterns/recommendation-preflight-integrity.md` | P1 | CONDITIONAL |
| `patterns/shopping-research.md` | P1 | CONDITIONAL |
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

## Review/merge-gate integration reconciliation (slice 2)

The maintainer lane chose structured admission for the review-convergence policy change on 2026-10-07. Both new behavioral patterns are STRUCTURED_ENFORCED; no specialist exception or legacy addition was used, and no owner quotation or authorization entry was added. The immutable 84-identity baseline remains unchanged and the backlog stayed 78 before and after that historical review/merge slice; corrected slice 2a now leaves 77. The integration draft temporarily listed both new identities as legacy, producing an invalid 80-entry backlog; that was never authorized backlog growth. Earlier integration findings remain historical. The newest slice finding records live disposition counts.

The review pattern contributes 70 operative clauses in 8 records and 8 obligations. The unchanged merge-gate pattern contributes 58 clauses in 6 records and 8 obligations. Enumerated clauses include operative scope/authority limits, failure and repair clauses, transfer qualifications and the Problem section formulas and assumptions used by rule 4; incident history and relationships to other patterns remain explanatory context. The formula-use obligation binds unit/run and hard-floor estimates, independently known-correct items with findings adjudicated false, the eligible denominator including unflagged items, and labelled guesses when those labels are unavailable. Pilot size must support the predeclared scale decision; upper error-rate or lower measured-pass-rate confidence bounds, including zero-flag/all-pass cases, carry sampling uncertainty into every floor and unit/run estimate. An inadequate pilot is enlarged with a predeclared sample size or the gate redesigned before scale. The review-fix round adds five formula/assumption clauses and replaces one evidence clause with three; it adds no records or obligations. Each source has a whole-pattern independent clause pin and independent count/hash pins for every operative level-two section, using sorted exact clause strings in source_clause_manifest. Every level-two section also pins its complete body, so added prose beside existing mapped clauses cannot evade review through lock/projection regeneration. Nonzero-miss floors use the binomial tail for each floor's own n, p and allowed misses k, or a measured known-correct false-failure rate; the zero-miss formulas retain their original scope. Record/map deletion and same-count selector shortening fail even after regenerating the lock and projection. Pin hashes establish preservation, not completeness or semantic truth.

All new records apply to chat, work, codex and claude under governance_required. They reuse the existing action_classes fact with only three new values: review_round means designing, requesting or running noisy language-model review rounds whose findings govern acceptance; review_finding_judgment means judging/accepting those noisy-reviewer findings; merge_gate means designing, changing or operating merge gates, including deciding whether a pull request may merge and preflighting the workstream's hosted merge/release/deploy path. Deterministic checks are outside both review action values. No new fact keys were introduced. Every illustrative example explicitly declares these values absent from its KNOWN action_classes list. UNKNOWN or missing actor/action/governance facts block, while known unrelated actions do not select these records. A generic Work handoff performs none of them.

Boundaries are the actual review request/plan, scale design, acceptance decision, output/cycle persistence, hosted-capability checkpoint, merge-eligibility check, owner questions handoff and post-action persistence. Owner-click batching and hosted readback are separate obligations; failure escalation and recording a later owner reply are separate too. All 16 obligations are semantic: the current task-time predicates cannot certify their complete meaning in both directions. Bound receipts retain acceptance evidence, non-substitutes, carry-through and repair. Fourteen payload-dependent obligations remain selected with not_applicable_allowed: true and require a reason-bound receipt for an absent action; the two authority invariants do not allow NOT_APPLICABLE. There are no new obligation exceptions. Golden synthetic judgments test admission, not semantic truth, live gate operations or authenticated reviewer independence.

At that historical review/merge boundary the rendered generic Work projection stayed 27,355 bytes before and after (32,768-byte cap). At that boundary Mission Control's actual injected block stayed 33,139 bytes (49,152-byte prompt limit, with 8,192 bytes reserved for the wrapper/directive; 7,821 bytes of additional headroom). Sizes were measured with the current adapter; no limits or runtime code changed beyond incoming main's machinery. The documented regeneration commands produced both derived files. The generic handoff selects none of the 14 new records.

The table-driven fixture folders in tests/fixtures/review-merge-slice/ contain one neutral envelope, violating/compliant/near-miss candidates and hash-free verdicts per record. Receipts bind at test time. Regressions cover failure, compliance, non-substitutes, per-obligation missing/FAIL receipts, cross-candidate and rewrite replay, reason-bound NOT_APPLICABLE, actor/action scope, UNKNOWN facts, clause maps and source pins. Existing pattern text tests remain separate TEXT_PRESENCE evidence.

### Convergent review acceptance obligation map

Source: `patterns/convergent-review-acceptance-gates.md`. All clauses below are structured; no exceptions or remaining clauses.

| Exact sentence or clause | Record / obligation |
|---|---|
| After a repair, send the reviewer only the earlier findings and the items the repair changed. | uda.review.change-scope / change-scope-at-boundary |
| Carry forward every item that passed and did not change. | uda.review.change-scope / change-scope-at-boundary |
| Give each item a stable ID when it is first produced, and match items to their earlier verdicts mechanically, by ID, exact content and the complete evaluator configuration (reviewer prompt, rubric, model/version, sampling settings and frozen reference; hashes are enough), never by asking the reviewer. | uda.review.change-scope / change-scope-at-boundary |
| An item whose ID, content or evaluator configuration does not match counts as changed; a configuration change counts every affected item as changed and requires re-review before aggregate acceptance. | uda.review.change-scope / change-scope-at-boundary |
| a repair cycle re-reviews items that passed and did not change under the same evaluator configuration, or carries a verdict across an evaluator configuration change; | uda.review.change-scope / change-scope-at-boundary |
| Carrying an item forward assumes its verdict depends only on that item, the frozen reference and the bound evaluator configuration. | uda.review.change-scope / change-scope-at-boundary |
| When a verdict depends on other items (order, duplicates, consistency across items), declare the dependency and count a change to the other item as a change to this one. | uda.review.change-scope / change-scope-at-boundary |
| Re-review the change, not the whole unit. | uda.review.change-scope / change-scope-at-boundary |
| Fix the number of repair cycles before the first cycle runs. | uda.review.repair-bound / repair-bound-at-boundary |
| Declare a stall rule along with the repair bound, for example "two repairs in a row that leave the count the same or higher". | uda.review.repair-bound / repair-bound-at-boundary |
| If a controlling directive fixes a repair limit, the stall rule can end repairs sooner and never extends them (`patterns/structured-output-failure-boundary.md`). | uda.review.repair-bound / repair-bound-at-boundary |
| Stopping repairs does not show that the unit, the repair method, or the reviewer is wrong. | uda.review.repair-bound / repair-bound-at-boundary |
| The next step is diagnosis or an owner decision (`patterns/outcome-advancement-and-strategy-efficacy.md`, section 9.4). | uda.review.repair-bound / repair-bound-at-boundary |
| repairs have no bound fixed in advance, or findings per cycle are not recorded; | uda.review.repair-bound / repair-bound-at-boundary |
| Bound the repairs and degrade by item. | uda.review.repair-bound / repair-bound-at-boundary |
| A directive's ceiling stays a ceiling. | uda.review.repair-bound / repair-bound-at-boundary |
| A bound ends spend and proves nothing else. | uda.review.repair-bound / repair-bound-at-boundary |
| When the repairs run out, withhold only the items still flagged and mark them for review, keep every other item, and record each omission that is still flagged (a reference item the reviewer says the output lacks) as a gap in the output. | uda.review.item-degradation / item-degradation-at-boundary |
| Do not discard the unit, and do not halt the pipeline: one unit's leftover flags never stop units that do not depend on it. | uda.review.item-degradation / item-degradation-at-boundary |
| A unit that consumes or checks the withheld items waits until they are reviewed, or runs without them and records the gap; it never treats them as accepted. | uda.review.item-degradation / item-degradation-at-boundary |
| Keep the independent units moving while the question waits. | uda.review.item-degradation / item-degradation-at-boundary |
| a unit is discarded, or the pipeline halted, because some items stay flagged. | uda.review.item-degradation / item-degradation-at-boundary |
| Accept a run on aggregate measures with floors stated in advance, not on every unit reaching zero findings. | uda.review.acceptance-floors / acceptance-floors-at-boundary |
| An example set is pooled recall against a frozen reference (the share of all reference items, across all units, that the output kept) at or above a stated level, plus zero critical misses. | uda.review.acceptance-floors / acceptance-floors-at-boundary |
| Where units are not interchangeable, because each customer, source or experiment must keep its own required items, add a per-unit or per-stratum minimum to the floors: a pooled measure lets strong units hide one that kept nothing. | uda.review.acceptance-floors / acceptance-floors-at-boundary |
| Freeze the reference before the gate runs, and never trade a hard floor against another measure. | uda.review.acceptance-floors / acceptance-floors-at-boundary |
| Report the failed units and the error counts beside the aggregate, each measure on its own line, so a passing aggregate hides neither. | uda.review.acceptance-floors / acceptance-floors-at-boundary |
| An aggregate can hide a bad unit, which is why rule 3 reports failed units and error counts beside it. | uda.review.acceptance-floors / acceptance-floors-at-boundary |
| A frozen reference is only as sound as its own provenance. | uda.review.acceptance-floors / acceptance-floors-at-boundary |
| Gate on aggregates with hard floors. | uda.review.acceptance-floors / acceptance-floors-at-boundary |
| Suppose each item in a correct unit of n items draws a false flag independently with probability p. | uda.review.false-failure / false-failure-at-boundary |
| The unit then passes a zero-finding gate with probability (1 - p)^n. | uda.review.false-failure / false-failure-at-boundary |
| With p = 0.05 and n = 27 that is about 25%. | uda.review.false-failure / false-failure-at-boundary |
| Requiring all N units to pass multiplies the chances: if each unit passes with probability q, all N pass with probability q^N. | uda.review.false-failure / false-failure-at-boundary |
| Even q = 0.99 gives 0.99^162, about 20%, across 162 units. | uda.review.false-failure / false-failure-at-boundary |
| For a recall floor r over n known-correct reference items, the allowed misses are k = n - ceil(r*n). | uda.review.false-failure / false-failure-at-boundary |
| Under the same independence and constant-p model, the false-failure probability is P(Binomial(n, p) > k) = sum from j = k + 1 to n of C(n, j) p^j (1 - p)^(n - j), where C(n, j) counts combinations. | uda.review.false-failure / false-failure-at-boundary |
| With k = 0 this reduces to the zero-miss formula above. | uda.review.false-failure / false-failure-at-boundary |
| For example, r = 0.95, n = 100 and p = 0.01 allow k = 5 misses and give about 0.0535% false failures, versus about 63.4% for zero allowed misses. | uda.review.false-failure / false-failure-at-boundary |
| Apply the binomial tail to each aggregate, per-unit and per-stratum floor using its own n, p and allowed misses k, or measure that floor's false-failure rate on independently known-correct work. | uda.review.false-failure / false-failure-at-boundary |
| Before a gate runs over many units, estimate how often it will fail correct work, using the formulas in the Problem section. | uda.review.false-failure / false-failure-at-boundary |
| Take p from a pilot on units independently known to be correct (the frozen reference, for example), or from earlier cycles' records only for items independently known to be correct, with any findings adjudicated false. | uda.review.false-failure / false-failure-at-boundary |
| Estimate p as the number of distinct reviewed known-correct items receiving at least one adjudicated false flag divided by all reviewed known-correct items, including unflagged items; count each item once even if it has multiple false findings, and exclude genuine defects and unadjudicated records. | uda.review.false-failure / false-failure-at-boundary |
| When those labels are unavailable, treat p as a guess and say so. | uda.review.false-failure / false-failure-at-boundary |
| State the confidence level and method, and size a representative pilot in advance for the tolerable false-failure rate at the intended scale. | uda.review.false-failure / false-failure-at-boundary |
| Use a one-sided upper confidence bound p_upper in place of the point estimate p in every unit/run and hard-floor calculation, or a one-sided lower confidence bound on each directly measured floor pass rate. | uda.review.false-failure / false-failure-at-boundary |
| Under the independent constant-p model, zero false flags among t known-correct items give the exact one-sided bound p_upper = 1 - alpha^(1/t) at confidence 1 - alpha; with t = 20 and alpha = 0.05 this is about 13.9%, not zero. | uda.review.false-failure / false-failure-at-boundary |
| Likewise, if all u independent known-correct units pass a floor, its exact lower bound is q_lower = alpha^(1/u), not 1. | uda.review.false-failure / false-failure-at-boundary |
| Report the pilot counts and bounds; if the pilot is too small to rule out material rejection, enlarge it with a predeclared sample size or redesign before scale, rather than admitting the gate on a point estimate. | uda.review.false-failure / false-failure-at-boundary |
| Apply the estimate to each hard floor too: a zero-critical-misses floor is a zero-findings gate over the m critical items alone, so it fails correct work with probability 1 - (1 - p)^m. | uda.review.false-failure / false-failure-at-boundary |
| If the conservative bound would reject enough correct work to change the decision, redesign the gate with rules 1 to 3 before the run, not after. | uda.review.false-failure / false-failure-at-boundary |
| a gate needs zero findings from a model reviewer on every unit and no false-failure estimate was made; | uda.review.false-failure / false-failure-at-boundary |
| The formulas assume false flags are independent at one constant rate p. | uda.review.false-failure / false-failure-at-boundary |
| Real flags cluster, since one misreading can flag several items, and p differs by item type and by reviewer. | uda.review.false-failure / false-failure-at-boundary |
| Treat the formulas as planning estimates, and prefer a pass rate measured on known-correct units with its confidence bound. | uda.review.false-failure / false-failure-at-boundary |
| A reviewer that misses real defects needs a different reviewer or a deterministic check. | uda.review.false-failure / false-failure-at-boundary |
| Estimate the false-failure rate before running at scale. | uda.review.false-failure / false-failure-at-boundary |
| Record the number of findings after every cycle, with the item IDs. | uda.review.cycle-escalation / cycle-escalation-at-boundary |
| When the count stays flat or bounces across repairs, stop spending rounds and apply rule 2. | uda.review.cycle-escalation / cycle-escalation-at-boundary |
| Put the question on the owner questions page (`patterns/owner-questions-page.md`) with the per-cycle counts, what each cycle changed, and the options (for example accept the partial result with its gaps, change the gate, or have a person review the flagged items). | uda.review.cycle-escalation / cycle-escalation-at-boundary |
| Track findings per cycle and stop early when they do not fall. | uda.review.cycle-escalation / cycle-escalation-at-boundary |
| The rules shape a gate that an agent or pipeline designs, or that a project leaves open. | uda.review.declared-authority / declared-authority-at-boundary |
| They never lower a gate the owner or the project's authority has declared blocking. | uda.review.declared-authority / declared-authority-at-boundary |
| For a declared zero-finding gate, run it as declared, put the false-failure estimate and the proposed aggregate gate on the owner questions page as a proposal, and keep running the declared gate until the owner or the project authority changes it (`patterns/owner-goal-followup-and-requirement-accretion.md`, **Declared gates are not accretion**). | uda.review.declared-authority / declared-authority-at-boundary |
| The pattern addresses false flags. | uda.review.declared-authority / declared-authority-at-boundary |
| It makes no claim about which reviewer or model is better. | uda.review.declared-authority / declared-authority-at-boundary |
| It adds no gate to any project and does not lower a gate that the owner or a project has declared. | uda.review.declared-authority / declared-authority-at-boundary |
| Declared gates stay hard. | uda.review.declared-authority / declared-authority-at-boundary |
| it covers only gates whose checker is a noisy reviewer. It adds no blocking gate and lowers no declared one. | uda.review.declared-authority / declared-authority-at-boundary |
| Repair: make the estimate; switch to the change-only review of rule 1; fix a bound and a stall rule; move acceptance to the aggregate of rule 3 (as a proposal when the gate is declared); withhold items and record gaps as in rule 2; and put the counts on the owner questions page. | uda.review.failure-repair / failure-repair-at-boundary |


### Agent-completable merge gates obligation map

Source: `patterns/agent-completable-merge-gates.md`. All clauses below are structured; no exceptions or remaining clauses.

| Exact sentence or clause | Record / obligation |
|---|---|
| For a workstream that will merge, release, or deploy through hosted controls, list each hosted gate on that path (for example required reviews, resolved conversations, required checks, bypass limits, environment approvals, and the merge itself) from current settings evidence, not from repository files (`patterns/codex-github-operating-system.md`). | uda.merge-gate.capability / capability-at-boundary |
| For each gate, check that the agent can satisfy it with the permissions it actually has: account or token scopes, the connector's actions, the sandbox, and the permission or safety layer's own refusals, which can block an action the platform allows. | uda.merge-gate.capability / capability-at-boundary |
| Check the exact action, not a neighboring one, because being able to read threads says nothing about resolving them (`patterns/reasoning-selection.md`, capability edges). | uda.merge-gate.capability / capability-at-boundary |
| Read the permission rules or documentation that govern the action, query the settings read-only, or use a refusal already on record. | uda.merge-gate.capability / capability-at-boundary |
| Attempt the action itself only on a destination the workstream already authorizes for such tests, such as a sandbox repository, never by creating a hosted object just to probe. | uda.merge-gate.capability / capability-at-boundary |
| Record can or cannot for each gate in the task checkpoint. | uda.merge-gate.capability / capability-at-boundary |
| the first sign that the agent cannot complete a hosted gate comes at the merge step; | uda.merge-gate.capability / capability-at-boundary |
| Which actions a permission layer refuses depends on the platform, the account and the layer's current configuration. | uda.merge-gate.capability / capability-at-boundary |
| Check the exact action in the current session; do not rely on this pattern's example. | uda.merge-gate.capability / capability-at-boundary |
| Check the gates when the workstream starts. | uda.merge-gate.capability / capability-at-boundary |
| Put one question on the owner questions page (`patterns/owner-questions-page.md`) at the start, not at the first merge. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| It is the owner's decision because it changes what the platform enforces. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| Name the gate in plain words, say why the agent cannot satisfy it, and give the options with a recommendation. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| First sort the gate. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| A clerical gate records a step whose substance a check can verify, such as resolved review conversations or an up-to-date branch. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| An approval gate exists for independent human authorization, such as a required approving review or an environment approval, and an agent-run check cannot stand in for that separation. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| (the recommendation for a clerical gate; never offered for an approval gate). | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| It ends the recurring clicks, and it costs the platform's own enforcement unless the check is also made a required status check. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| scoped to that one action, with the approval and scope written down. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| It keeps the platform gate and removes the clicks, and it costs tooling the owner must approve and maintain. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| The agent never grants itself the permission that was refused. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| (the recommendation for an approval gate) when the gate exists for a person's authorization or the owner wants a person to confirm each one. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| Rule 4 then applies, and the agent can attach the substance check's result so the approval rests on a verified result. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| An owner action that returns on every pull request signals a gate the agent cannot complete. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| Raise the gate once instead of treating each return as a new request; the one decision in rule 2 covers them all. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| Raise it once per workstream and gate. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| Reopen it only when the gate, the agent's permissions, or the permission or safety layer changes. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| the owner is asked for the same gate action on a second pull request with no decision on the page; | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| Replacing a gate changes what the platform enforces. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| The owner accepts that tradeoff in deciding; the agent states it in the question. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| If the agent cannot complete a gate, raise one owner decision early. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| Replace the gate with a check the agent can run that verifies substance | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| Automate the gate with owner-approved tooling, | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| Keep the gate and the clicks, | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| Do not hand the owner a recurring chore list. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| One question per gate. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| it adds one start-of-workstream check and at most one owner question per gate. It adds no blocking gate and changes no hosted setting. | uda.merge-gate.owner-decision / owner-decision-at-boundary |
| The check passes when the latest review of the exact head commit reports nothing open, every earlier finding maps to a fix commit or to a written reason it was not changed, and the required status checks pass. | uda.merge-gate.substance-check / substance-check-at-boundary |
| When the gate it replaces is the up-to-date-branch requirement, the check also confirms that the head contains the current base commit, or runs the required checks on the exact merge result, so checks that passed on an older base cannot admit a change that conflicts with newer work. | uda.merge-gate.substance-check / substance-check-at-boundary |
| Bind that result to the base commit it checked, and rerun it whenever the base moves before the merge, or use a merge queue that tests the exact merge. | uda.merge-gate.substance-check / substance-check-at-boundary |
| a thread is marked resolved with no fix and no written reason to point to. | uda.merge-gate.substance-check / substance-check-at-boundary |
| The substance check is only as good as the review behind it. | uda.merge-gate.substance-check / substance-check-at-boundary |
| It does not turn an author's own review into independent review (`patterns/independent-evaluation-separation.md`), and it assumes a reviewer that reports open findings against the exact head commit. | uda.merge-gate.substance-check / substance-check-at-boundary |
| Until the gate is removed or automated, it stays in force: list each instance that still needs the owner under **For you to do**, grouped into one step with exact links (rule 4), so the page stays the complete list of his work, and attach the substance check's result to each pull request so his clicks rest on a verified result. | uda.merge-gate.owner-clicks / owner-clicks-at-boundary |
| When a click is unavoidable, batch it into one step: exact links to every target in one place (the **For you to do** section of the owner questions page), | uda.merge-gate.owner-clicks / owner-clicks-at-boundary |
| The owner is then not asked twice, and the agent does not take "done" on faith. | uda.merge-gate.owner-clicks / verify-owner-action |
| and a read-back the agent runs afterward to confirm it worked, such as a hosted query that counts the threads still open. | uda.merge-gate.owner-clicks / verify-owner-action |
| A click that records a choice only the owner can make (accept a risk, approve a spend, merge a change) stays with the owner. | uda.merge-gate.authority / authority-at-boundary |
| Nothing here lets an agent relax a hosted gate, use an owner-only bypass, merge around a refusal, or disguise a refused action behind another tool or route. | uda.merge-gate.authority / authority-at-boundary |
| A refusal by the permission or safety layer is a boundary (`patterns/worker-self-remediation-before-owner-interruption.md`, **Fail closed on genuine boundaries**). | uda.merge-gate.authority / authority-at-boundary |
| The agent proposes the replacement, and the owner decides (`patterns/owner-goal-followup-and-requirement-accretion.md`, **Declared gates are not accretion**). | uda.merge-gate.authority / authority-at-boundary |
| A hosted setting counts as changed only when settings or API evidence shows it (`patterns/codex-github-operating-system.md`). | uda.merge-gate.authority / authority-at-boundary |
| It adds no gate and grants no authority. Changing a hosted gate stays the owner's decision. | uda.merge-gate.authority / authority-at-boundary |
| Keep owner clicks for decisions. | uda.merge-gate.authority / authority-at-boundary |
| No bypass. | uda.merge-gate.authority / authority-at-boundary |
| A declared gate stays until the owner changes it. | uda.merge-gate.authority / authority-at-boundary |
| Repair: stop listing the click; put the decision on the owner questions page with a recommendation; batch the unavoidable clicks as in rule 4; | uda.merge-gate.failure-repair / failure-repair-at-boundary |
| and move the answer to **Decided** when the owner replies. | uda.merge-gate.failure-repair / record-owner-reply |

## Semantic receipt workflow and limits

Compile the current task after loading its authority. The compile output binds the whole envelope, including owner corrections, so recompiling after a correction changes `content_sha256` even if the selected rules stay the same.

```sh
python3 scripts/uda_rule_graph_task_time.py compile --task task.json --output contract.json
python3 scripts/uda_rule_graph_task_time.py receipt --contract contract.json --phase final-delivery --payload final.txt --output receipts.json
python3 scripts/uda_rule_graph_task_time.py check --contract contract.json --phase final-delivery --destination owner-visible-final --payload final.txt --receipts receipts.json
```

The skeleton contains a receipt for each semantic obligation due in that phase. Fill `verdict` with PASS, FAIL or NOT_APPLICABLE; give short `evidence` about the literal candidate, the asserting actor's `id`, `kind` and `relation` (SAME_AGENT or INDEPENDENT), and an ISO date/time with timezone in `issued_at`. For NOT_APPLICABLE, also give `not_applicable_reason`; it is accepted only when the obligation explicitly sets `not_applicable_allowed: true`. The blank skeleton itself cannot admit work. This CLI and the `scripts/uda_rule_graph.py` facade support the same receipt and check commands.

Every receipt binds `contract_sha256` to the compiled contract's `content_sha256`, plus `rule_id`, `obligation_id`, `phase`, `destination` and `payload_sha256`. Payload hashing uses the exact file bytes: UTF-8 characters, CRLF, whitespace and the final newline all matter. Check verifies the contract's content hash too. Optional `--destination` evaluates only obligations due at that destination and lists the others under `out_of_scope`; no due match returns NOT_EVALUATED. Without it, every due obligation is evaluated and each receipt must match its declared destination. For the kernel elapsed-time predicate, supply `--clock-start` and `--clock-end` and a literal `Elapsed time: N minutes [M seconds]` or `Elapsed time: N seconds` line. Receipts establish the separate clock-provenance judgment; they do not replace mechanical predicates or change their result format.

A phase with several destinations is admitted when each destination's scoped check is ADMITTED with its own payload: the final answer for `owner-visible-final`, the checkpoint text for `durable-task-checkpoint`.

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

Both passes of the first integration are implemented. This establishes inventory, activation-state reporting, semantic binding admission and a behavioral regression; it does not establish universal live behavioral enforcement. The parent owner outcome remains OPEN; kernel slice 1 left 78 partial/legacy identities, and corrected slice 2a leaves 77. Later slices migrate the remaining P1 patterns and subsequent priorities. The baseline pin remains unchanged: no added identities and seven fully structured removals are now reported.

## Usage-limit continuity slice

The direct owner request dated 2026-10-07 requires no lost work and a one-line way to continue in another account. `docs/requirements/2026-10-07-usage-limit-continuity.owner-requirement.json` preserves the verbatim request and separates OWNER_REQUIRED outcome from the supplied ASSISTANT_INFERENCE mechanism. Context-compaction resilience §3 now requires continuous completed-step checkpoints and a current turn-end handoff; an optional visible early warning supplements saving rather than deferring it to a threshold or a helper at the limit.

All three records use exact-text selectors within that subsection and semantic receipt admission at `durable-task-checkpoint`. The two continuous-save records also bind the tiny one-shot exemption in the pattern's Limits section. Their source-bound acceptance evidence, non-substitutes, carry-through and repair are in the task-time metadata.

| Task-time record | Trigger | Due phase | Destination |
|---|---|---|---|
| `uda.continuity.step-checkpoint` | OPEN outcome; task mode outside INSTRUCTION_ONLY, DIAGNOSTIC_ONLY, NO_CHANGE and STOP; `continuity_required = true` | persistence, each completed step | durable-task-checkpoint |
| `uda.continuity.turn-end-handoff` | Same OPEN implementation and continuity-scope trigger | final-delivery, before ending the turn | durable-task-checkpoint |
| `uda.continuity.usage-warning` | OPEN implementation AND `usage_warning_visible = true` | persistence, immediately at the warning | durable-task-checkpoint |

Declare `continuity_required` from the actual task scope: true for multi-step, multi-session or long-running work needing durable recovery, false for a tiny one-shot task. False excludes both continuous-save records and their semantic receipts; missing or UNKNOWN scope remains unresolved on otherwise applicable work. A visible usage warning retains its immediate-save trigger independently of that scope fact.

Every example envelope explicitly declares the warning false or ABSENT. Missing or UNKNOWN warning facts remain unresolved on otherwise applicable work and block admission; false/ABSENT warning facts never cancel the other two checkpoints. The fixtures distinguish this from instruction-only, diagnostic, no-change, stop and non-OPEN tasks, which do not select these records.

Persistence checks require current task facts through `check --task task.json`, including when compilation omitted the warning rule. A changed `usage_warning_visible` state/value blocks the stale contract until recompilation; the refreshed warning contract then requires a receipt for the immediate save and small, restartable next action. Fresh explicit ABSENT observations remain valid. Fact provenance and semantic judgments remain assertions rather than independent observation of a provider usage indicator.

| Record | Violating candidate | Compliant candidate | Near-miss non-substitute |
|---|---|---|---|
| Step checkpoint | Session-only completed work: BLOCKED | Pushed work and saved done/next/exact action: ADMITTED | Chat summary and promise to save at 98%: BLOCKED |
| Turn-end handoff | Prior-turn checkpoint, inaccessible account state: BLOCKED | Current checkpoint, reachable private handoff, account-bound recreation list and one-line resume: ADMITTED | Correct chat final with stale durable checkpoint: BLOCKED |
| Usage warning | Visible warning followed by one long unsaved step: BLOCKED | Immediate save and a small restartable step: ADMITTED | Separate helper reserved for the limit: BLOCKED |

The nine domain-neutral candidates and hash-free verdict files live in `tests/fixtures/usage-limit-continuity/`. `tests/test_uda_usage_limit_continuity.py` binds receipts to the compiled contract and actual candidate bytes at test time. The regressions exercise these cases, actor/trigger selection, one-shot final admission without checkpoint receipts, unknown scope/warning facts, no-receipt/destination failures, checkpoint rewrites, owner-correction replay, requirement provenance, separate final/checkpoint payloads and running-task warning refresh in both CLI entrypoints. Golden semantic verdicts are assertions: the checker verifies binding and reports `judgment_proved: false`, rather than inferring semantic correctness, a push or private-store reachability from prose.

The report now counts the following evidence classes. An entry may occur in several classes, so these counts do not sum to the universe and do not imply universal enforcement.

| Evidence class | Inventory entries |
|---|---:|
| TEXT_PRESENCE | 92 |
| ROUTING | 82 |
| COMPILATION | 8 |
| ADMISSION | 27 |
| BEHAVIORAL_REGRESSION | 24 |

At its historical integration boundary, the continuity slice changed one LEGACY_UNSTRUCTURED entry to STRUCTURED_PARTIAL, with 96 entries, 82 indexed patterns and 84 backlog identities (P1 22, P2 47, P3 15), zero additions and removals. The current counts above include the later kernel and review/merge migrations. No baseline pin was changed. The source lock and representative Work handoff projection are regenerated; Mission Control runtime and owner settings are untouched. A worker that never loaded UDA remains outside its protection, and an optional status-line warning remains surface-specific.

## Continuation and closure migration slice 2a

Supervisor correction preserves the three canonical pattern files byte-for-byte. Task locks are fully structured; terminal admission and compaction retain exact operative remainders. Whole-pattern/pre-section and per-section source pins remain, including for these partial maps. The validator permits this corrective reclassification only with the owner-authorized exact baseline identity, date, quote, source and reason; it does not count a correction as a new backlog addition.

| Pattern | Reviewed clause rows | Mapped | Literal remainder | Records / behaviors | Disposition |
|---|---:|---:|---:|---:|---|
| Terminal response admission | 68 | 65 | 3 | 9 / 9 | STRUCTURED_PARTIAL |
| Context-compaction resilience | 90 | 73 | 17 plus wider persistence scope | 6 / 6 | STRUCTURED_PARTIAL |
| Exclusive active-task locks | 143 | 143 | 0 | 16 / 17 | STRUCTURED_ENFORCED |
| Total | 301 | 281 | 20 plus wider scope | 31 / 32 | |

The representative Work handoff restores `continuity_required:true` with its original provenance, “multi-step work requires durable recovery across turns or sessions.” It always selects step-checkpoint and turn-end-handoff. Their original regression expectations are restored. Durable-memory, recovery-checkpoint and durable-boundaries clauses share the continuity persistence record's unchanged exact selectors and expanded evidence. The catch-all “whenever losing the current chat would otherwise create ambiguity or rework” and the distinction between compaction efficiency and persistence are explicit. No selector is shortened and no cap is increased.

Restoring continuity alone reproduces the 33,814-byte oversized render. Consolidation still exceeds the cap after mandatory event refresh. Distinct reasoning-outcome, recovery-limit and successor-recovery clauses therefore remain in compaction's exact `legacy_remainder`, rather than being silently dropped or triggered on unrelated facts. The consolidated persistence record retains its original OPEN executable-work trigger; the broader diagnostic/stopped/satisfied-task persistence scope is also recorded as remainder. Its indexed, trigger-selected compaction source stays STRUCTURED_PARTIAL.

At claim time each terminal label requires its entry evidence: INCOMPLETE while findings remain; BLOCKED only with durable evidence naming the genuine boundary; READY_FOR_PROTECTED_MERGE only after task acceptance passed on the exact head with cited output and no open findings; COMPLETE only after protected merge, readback and immutable receipt. Wrong-head acceptance and READY with findings are explicit non-substitutes. Anti-substitutes retain pre-action task selection and a separate final-delivery claim obligation, including the exact contradictory work-in-progress PR claim.

Terminal receipts require actual final-response command output: exit status, terminalResponseAllowed, decision and terminalStateVectorSha256. Server-side clauses cite native Mission Control final-response and worker-route tests. Authority evidence keeps privacy and security, removes the unsourced revalidation addition, and carries the operational relationship to all four predecessor controls. All thirteen required findings must come from actual active-task authority resolver output in the authority, blocker and wait receipts. All nine recovery events are prohibited substitutes in final-delivery terminal admission; persistence still owns saving and recovering progress.

Nine event-gated records and all nineteen core exclusive-task records refresh on `action_classes`; compaction resume-reconciliation and completion-closeout also refresh on `continuity_required`. Even an initially excluded record retains its refresh guard at the real phase/destination; entering or leaving exclusive scope and other action-class changes block until recompilation and fresh receipts. Missing current facts block; unchanged facts preserve existing admission behavior. Rendered reminders share identical boundaries while the structured contract retains every per-rule guard. Both portable instructions select governance plus instruction_maintenance for one-shot adoption and retain reason-bound NOT_APPLICABLE. Independent table pins protect every record's trigger, due phase and N/A permission, including both anti-substitute phases.

| Measured production boundary | Before slice 2a | Corrected | Unchanged budget |
|---|---:|---:|---:|
| Compiled rendered Work contract, UTF-8 | 27,355 | 31,443 | 32,768 |
| Mission Control injected Work block, UTF-8 | 33,139 | 37,194 | 40,960 |

Continuity-scope refresh adds 63 rendered bytes to the earlier 31,254-byte contract (42 for the checkpoint guards, then 21 for resume/closeout guards), yielding the reviewed 31,317-byte baseline. Turn-end handoff outcome-status refresh adds 22 bytes, yielding 31,339; controller actor refresh adds 69 bytes, yielding 31,408; worker continuation actor refresh adds 35 bytes, yielding 31,443. The injected block remains 37,194 bytes. The handoff refreshes on `owner_outcome_status` so completion invalidates the OPEN contract and recompilation drops the handoff obligation. Controller resume refreshes on `actor` even when initially omitted, so a chat-to-controller transition requires recompilation at `controller-continuation-state` and then a controller receipt. The seven worker-only continuation records also refresh on `actor` when omitted from chat/controller contracts, blocking receiving work/codex/claude destination checks until recompilation and fresh receipts. Both checkpoint rules and compaction resume-reconciliation/completion-closeout retain a refresh boundary for `continuity_required` even when initially omitted, so scope expansion requires recompilation at their persistence, pre-action and final-delivery destinations. Manifest-backed partial entries require a nonempty obligation map before clause-pin comparison.

The injected block is measured through the unchanged production adapter's ruleGraphPromptBlock/workHandoffRuleGraphProjection using Buffer.byteLength on the joined block. Its allowance is the 49,152-byte prompt cap minus the unchanged 8,192-byte wrapper/directive reserve. The production prompt regression asserts both continuity ids and reserve compliance. Source lock and projection use the documented generation commands.

Twenty fixture sets now have bespoke near-misses that omit or violate a particular clause. No template or literal non-substitute sentence is required in a candidate. The suite still proves exact binding, actor/trigger/phase/destination admission, stale-receipt rejection and source/deletion protection, not semantic truth. The mechanical timestamp case now isolates bad elapsed-time reporting while preserving a valid first-line timestamp.

Coverage limits remain explicit: action classes and continuity scope are self-declared; event triggers do not independently prove the real event; reason-bound N/A on already declared events still needs correct semantic judgment. Future provider polling and resume-on-clear cannot be established by one admission receipt. Those multi-event controller clauses remain in terminal admission's exact legacy remainder. No live universal behavior, protected merge, publication or independent review is claimed.

### patterns/terminal-response-admission-and-autonomous-continuation.md

| Exact sentence or clause | Record / obligation |
|---|---|
| Before any worker emits a terminal response, it must reconcile the current authoritative execution state: | uda.continuation.state-reconciliation / state-reconciliation-at-boundary |
| 1. current owner instruction or correction; | uda.continuation.state-reconciliation / state-reconciliation-at-boundary |
| 2. branch-bound active-task lock; | uda.continuation.state-reconciliation / state-reconciliation-at-boundary |
| 3. canonical durable current-state checkpoint; | uda.continuation.state-reconciliation / state-reconciliation-at-boundary |
| 4. live artifact/evidence ledger and current queue; | uda.continuation.state-reconciliation / state-reconciliation-at-boundary |
| 5. current Mission Control terminal comparison and structured blockers; | uda.continuation.state-reconciliation / state-reconciliation-at-boundary |
| 6. current chat-authored directive and any required reasoning handoff. | uda.continuation.state-reconciliation / state-reconciliation-at-boundary |
| It does **not** close the root task. | uda.continuation.controller-resume / controller-resume-at-boundary |
| For an exclusive active task, **ending a response is a controlled terminal action**. | uda.continuation.terminal-admission / terminal-admission-at-boundary |
| A terminal response is admitted only when at least one of these current, source-bound conditions is true: | uda.continuation.terminal-admission / terminal-admission-at-boundary |
| - the requested root outcome is complete under its actual acceptance/terminal evidence gate; | uda.continuation.terminal-admission / terminal-admission-at-boundary |
| - the owner has explicitly canceled, stopped, or replaced the current outcome; | uda.continuation.terminal-admission / terminal-admission-at-boundary |
| - a genuine owner decision is required and no independent safe in-scope work remains; | uda.continuation.terminal-admission / terminal-admission-at-boundary |
| - a genuine external blocker prevents the required frontier, has no admitted workaround or independent safe work remaining, and is durably recorded; | uda.continuation.terminal-admission / terminal-admission-at-boundary |
| - a bounded execution directive has reached a real reasoning-review stop and the exact factual receipt has already been routed automatically to the configured reasoning chat. | uda.continuation.terminal-admission / terminal-admission-at-boundary |
| A reasoning-review or external-blocker pause ends only the current execution turn. | uda.continuation.terminal-admission / terminal-admission-at-boundary |
| Treat these as recovery events. | uda.continuation.recovery-events / recovery-events-at-boundary |
| Persist state, compact/reopen/restart as necessary, then recover the active task and continue from the first missing or stale action without repeating verified work. | uda.continuation.recovery-events / recovery-events-at-boundary |
| When a required provider action is temporarily unavailable: | uda.continuation.provider-waits / provider-waits-at-boundary |
| 1. record the exact changing condition and admitted wait horizon; | uda.continuation.provider-waits / provider-waits-at-boundary |
| 2. advance independent safe in-scope work that does not depend on the provider; | uda.continuation.provider-waits / provider-waits-at-boundary |
| 5. terminally pause only when the wait is a genuine external blocker for **all** remaining authorized work and the controller has durable evidence of that state. | uda.continuation.provider-waits / provider-waits-at-boundary |
| A cooldown is not an owner decision. | uda.continuation.provider-waits / provider-waits-at-boundary |
| Mission Control-managed execution workers must consult the deterministic final-response gate immediately before an owner-facing terminal response: | uda.continuation.mission-control-gate / mission-control-gate-at-boundary |
| ```text GET /api/worker-channel/<worker>/finalization ``` | uda.continuation.mission-control-gate / mission-control-gate-at-boundary |
| The endpoint authenticates the execution worker but does not accept worker-supplied terminal facts. | uda.continuation.mission-control-gate / mission-control-gate-at-boundary |
| Mission Control reads its own current projected ledger and returns either: | uda.continuation.mission-control-gate / mission-control-gate-at-boundary |
| ```text 200 terminalResponseAllowed:true ``` | uda.continuation.mission-control-gate / mission-control-gate-at-boundary |
| or: | uda.continuation.mission-control-gate / mission-control-gate-at-boundary |
| ```text 409 terminalResponseAllowed:false mustContinue:true requiredNextAction:<durably derived next action> ``` | uda.continuation.mission-control-gate / mission-control-gate-at-boundary |
| A `409` means the worker must not emit a terminal handoff. | uda.continuation.mission-control-gate / mission-control-gate-at-boundary |
| It must execute or route the returned safe next action within existing authority. | uda.continuation.mission-control-gate / mission-control-gate-at-boundary |
| The gate reuses the canonical Mission Control terminal comparator rather than creating a second completion model. | uda.continuation.mission-control-gate / mission-control-gate-at-boundary |
| It additionally checks current READY/IN_PROGRESS queue work, durable checkpoint next steps, structured blocker ownership/workarounds, recoverable wait conditions, whether a required reasoning-review route is newer than the stop/blocker it claims to satisfy, and whether an owner-decision pause is backed by the authoritative Mission Control owner-obligation projection rather than merely a worker-authored `needsOwner` assertion. | uda.continuation.mission-control-gate / mission-control-gate-at-boundary |
| Use precise semantics: | uda.continuation.pause-semantics / pause-semantics-at-boundary |
| - `ALLOW_ROOT_CLOSE` — the source-bound terminal comparator permits actual task completion. | uda.continuation.pause-semantics / pause-semantics-at-boundary |
| - `ALLOW_OWNER_CANCELLATION` — current owner authority canceled the outcome. | uda.continuation.pause-semantics / pause-semantics-at-boundary |
| - `ALLOW_OWNER_DECISION_PAUSE` — a current owner obligation exists and no independent safe work remains. | uda.continuation.pause-semantics / pause-semantics-at-boundary |
| - `ALLOW_EXTERNAL_BLOCKED_PAUSE` — a genuine external blocker prevents all remaining authorized work, with no workaround. | uda.continuation.pause-semantics / pause-semantics-at-boundary |
| - `ALLOW_REASONING_HANDOFF_PAUSE` — the current bounded execution turn stopped for reasoning and the exact factual handoff is already durably routed after the current stop receipt. | uda.continuation.pause-semantics / pause-semantics-at-boundary |
| All pause states except root close/cancellation leave the root task open. | uda.continuation.pause-semantics / pause-semantics-at-boundary |
| A rejected terminal attempt should preserve an explicit reason such as: | uda.continuation.rejection-repair / rejection-repair-at-boundary |
| ```text REJECT_SAFE_WORK_REMAINS REJECT_RECOVERABLE_WAIT_TERMINALIZATION REJECT_UNROUTED_REASONING_STOP REJECT_SELF_OWNED_BLOCKER REJECT_BLOCKER_WITH_WORKAROUND REJECT_OWNER_DECISION_AUTHORITY_MISSING REJECT_UNVERIFIED_BLOCKED_STATE REJECT_TERMINAL_PROOF_MISSING ``` | uda.continuation.rejection-repair / rejection-repair-at-boundary |
| Do not convert these into an owner question when the required next action is already mechanically known. | uda.continuation.rejection-repair / rejection-repair-at-boundary |
| It does not broaden task scope or authority. | uda.continuation.authority-limits / authority-limits-at-boundary |
| Safety, privacy, security, permission, spending, publication, irreversible-action, and explicit owner-stop boundaries remain controlling. | uda.continuation.authority-limits / authority-limits-at-boundary |
| - The gate can only be as current as the Mission Control ledger and project recovery artifacts it projects. | uda.continuation.authority-limits / authority-limits-at-boundary |
| - A true semantic ambiguity must still go to the authorized reasoning chat; deterministic continuation may not invent strategy. | uda.continuation.authority-limits / authority-limits-at-boundary |
| - A real safety, permission, spending, publication, access, or irreversible-action boundary is not bypassed merely because other execution is possible. | uda.continuation.authority-limits / authority-limits-at-boundary |
| - Tiny one-shot tasks without an exclusive active-task contract do not require this machinery. | uda.continuation.authority-limits / authority-limits-at-boundary |
| This rule operationalizes, rather than replaces: | uda.continuation.authority-limits / authority-limits-at-boundary |
| - `patterns/exclusive-active-task-locks.md`; | uda.continuation.authority-limits / authority-limits-at-boundary |
| - the standing continuous-next-step rule in `patterns/codex-github-operating-system.md`; | uda.continuation.authority-limits / authority-limits-at-boundary |
| - `templates/CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md`; | uda.continuation.authority-limits / authority-limits-at-boundary |
| - the Mission Control terminal comparator. | uda.continuation.authority-limits / authority-limits-at-boundary |
| None of the following is, by itself, permission for a terminal response: | uda.continuation.terminal-admission / terminal-admission-at-boundary |
| - context compaction or context-window pressure; | uda.continuation.terminal-admission / terminal-admission-at-boundary |
| - response/token-budget pressure; | uda.continuation.terminal-admission / terminal-admission-at-boundary |
| - many tool calls or a long-running turn; | uda.continuation.terminal-admission / terminal-admission-at-boundary |
| - a checkpoint or recovery commit; | uda.continuation.terminal-admission / terminal-admission-at-boundary |
| - browser-tab cleanup or browser-memory pressure; | uda.continuation.terminal-admission / terminal-admission-at-boundary |
| - a provider cooldown, temporary rate limit, retry/backoff interval, or transient tool outage; | uda.continuation.terminal-admission / terminal-admission-at-boundary |
| - the end of a batch when the next batch/ordinal is already determined; | uda.continuation.terminal-admission / terminal-admission-at-boundary |
| - ordinary green tests while task acceptance remains open; | uda.continuation.terminal-admission / terminal-admission-at-boundary |
| - a worker-authored `blocked`, `done`, or handoff statement without current structured authority/evidence. | uda.continuation.terminal-admission / terminal-admission-at-boundary |

Operative remainder: Lifetime continuation after admission is not established by a single pre-action receipt: The controller must preserve resumability and continue automatically when the new directive arrives or the blocking condition clears. 3. keep checking the changing condition at the configured bounded interval; 4. resume the blocked frontier automatically when it clears; Runtime polling, cleared-condition detection and automatic continuation require multi-event controller evidence; current final-response gate tests cover terminal decisions, not the complete lifetime.

### patterns/context-compaction-resilience.md

| Exact sentence or clause | Record / obligation |
|---|---|
| A project must therefore be designed so that losing old chat detail does not mean losing project state. | uda.continuity.step-checkpoint / save-completed-step |
| Use this hierarchy: | uda.continuity.step-checkpoint / save-completed-step |
| - **conversation/context = working RAM**; | uda.continuity.step-checkpoint / save-completed-step |
| - **canonical repository = durable project memory**; | uda.continuity.step-checkpoint / save-completed-step |
| - **Git history = durable audit trail and rollback path**; | uda.continuity.step-checkpoint / save-completed-step |
| - **current-state/checkpoint file = recovery entry point**; | uda.continuity.step-checkpoint / save-completed-step |
| - **exact project artifacts/evidence = authority for factual implementation state**. | uda.continuity.step-checkpoint / save-completed-step |
| Any decision, constraint, discovery, architecture choice, completed step, or unresolved blocker that would matter after a new thread or context compaction must be written into the canonical repository rather than left only in chat. | uda.continuity.step-checkpoint / save-completed-step |
| For any project with multi-step, multi-session, or long autonomous work, maintain a concise canonical recovery file such as `CURRENT-STATE.md`, `state/CURRENT-STATE.md`, or an equivalent machine-readable state file chosen by the project. | uda.continuity.step-checkpoint / save-completed-step |
| The exact filename may vary, but there must be one obvious current recovery entry point referenced by the project's main index/bootstrap. | uda.continuity.step-checkpoint / save-completed-step |
| With concurrent branches, keep that entry point for repository-level state and give each task its own checkpoint. | uda.continuity.step-checkpoint / save-completed-step |
| Per-task files avoid merge conflicts while the recovery entry point stays obvious. | uda.continuity.step-checkpoint / save-completed-step |
| At minimum, the state checkpoint should record: | uda.continuity.step-checkpoint / save-completed-step |
| - current goal / task; | uda.continuity.step-checkpoint / save-completed-step |
| - authoritative baseline or relevant commit/ref; | uda.continuity.step-checkpoint / save-completed-step |
| - important active decisions and owner constraints; | uda.continuity.step-checkpoint / save-completed-step |
| - bootstrap requirements and blocking gates that the task directive or handoff established, so they stay active after compaction; | uda.continuity.step-checkpoint / save-completed-step |
| - completed work that must not be repeated; | uda.continuity.step-checkpoint / save-completed-step |
| - current step / last durable checkpoint; | uda.continuity.step-checkpoint / save-completed-step |
| - remaining work; | uda.continuity.step-checkpoint / save-completed-step |
| - blockers or unresolved questions; | uda.continuity.step-checkpoint / save-completed-step |
| - relevant artifacts, evidence, tests, logs, branches, and commits; | uda.continuity.step-checkpoint / save-completed-step |
| - uncommitted/dirty-working-tree status when relevant; | uda.continuity.step-checkpoint / save-completed-step |
| - the next safe resume action or command. | uda.continuity.step-checkpoint / save-completed-step |
| Keep this file concise and operational. | uda.continuity.step-checkpoint / save-completed-step |
| It is a recovery map, not a transcript dump. | uda.continuity.step-checkpoint / save-completed-step |
| Plan usage limits, like context limits, can end a turn without warning. | uda.continuity.step-checkpoint / save-completed-step |
| Never defer saving to a usage threshold. | uda.continuity.step-checkpoint / save-completed-step |
| At each completed step, push the work to the task branch (work-in-progress commits are fine) and update the checkpoint's done, next, and exact next action. | uda.continuity.step-checkpoint / save-completed-step |
| A fresh session in any account must be able to resume from durable state alone. | uda.continuity.step-checkpoint / save-completed-step |
| The worker that holds the context writes the checkpoint; do not launch a separate helper at the limit to save work. | uda.continuity.step-checkpoint / save-completed-step |
| - Tiny one-shot tasks do not need a dedicated current-state file. | uda.continuity.step-checkpoint / save-completed-step |
| Before ending a turn on OPEN work, make the durable checkpoint reflect that turn's state and include a one-line resume instruction. | uda.continuity.turn-end-handoff / save-turn-end-handoff |
| Keep owner-private supervisor state that cannot go in a public repository in a private durable store the successor can reach. | uda.continuity.turn-end-handoff / save-turn-end-handoff |
| List anything bound to one account that the successor must recreate, such as scheduled check-ins and memory. | uda.continuity.turn-end-handoff / save-turn-end-handoff |
| When a usage signal is visible at or above a warning level (about 90%), checkpoint immediately and take only small, restartable steps. | uda.continuity.usage-warning / checkpoint-visible-usage-warning |
| This warning supplements continuous checkpoints and never replaces them. | uda.continuity.usage-warning / checkpoint-visible-usage-warning |
| If only a model-specific weekly limit is reached, switching model family in the same account is a valid way to continue. | uda.continuity.usage-warning / checkpoint-visible-usage-warning |
| Update the current-state file whenever losing the current chat would otherwise create ambiguity or rework, especially: | uda.continuity.step-checkpoint / save-completed-step |
| - after a meaningful implementation/research/editorial milestone; | uda.continuity.step-checkpoint / save-completed-step |
| - after a consequential owner decision or constraint change; | uda.continuity.step-checkpoint / save-completed-step |
| - after discovering a blocker or falsifying an approach; | uda.continuity.step-checkpoint / save-completed-step |
| - before/after risky migrations or long autonomous runs; | uda.continuity.step-checkpoint / save-completed-step |
| - before handing work to another agent/thread; | uda.continuity.step-checkpoint / save-completed-step |
| - before claiming a multi-step task complete. | uda.continuity.step-checkpoint / save-completed-step |
| Do not wait for the model to detect that compaction is imminent. | uda.continuity.step-checkpoint / save-completed-step |
| Context limits are implementation details and may not be visible to the worker. | uda.continuity.step-checkpoint / save-completed-step |
| After interruption, a new thread, a model switch, or suspected context loss: | uda.compaction.resume-reconciliation / resume-reconciliation-at-boundary |
| 1. inspect the canonical repository and working tree; | uda.compaction.resume-reconciliation / resume-reconciliation-at-boundary |
| 2. read the project bootstrap/index and current-state checkpoint; | uda.compaction.resume-reconciliation / resume-reconciliation-at-boundary |
| 3. inspect recent relevant Git commits and durable artifacts; | uda.compaction.resume-reconciliation / resume-reconciliation-at-boundary |
| 4. reconcile the checkpoint against actual repository state; | uda.compaction.resume-reconciliation / resume-reconciliation-at-boundary |
| 5. identify exactly what survived and what remains; | uda.compaction.resume-reconciliation / resume-reconciliation-at-boundary |
| 6. update stale checkpoint data before continuing; | uda.compaction.resume-reconciliation / resume-reconciliation-at-boundary |
| 7. resume from the latest verified durable boundary without repeating completed work. | uda.compaction.resume-reconciliation / resume-reconciliation-at-boundary |
| Re-activating the task's gates is part of resuming. | uda.compaction.resume-reconciliation / resume-reconciliation-at-boundary |
| A summary that names a rule does not make it active; reload the rule and its enforcement point (see `patterns/task-time-lesson-activation.md`). | uda.compaction.resume-reconciliation / resume-reconciliation-at-boundary |
| The checkpoint is a routing document, not higher authority than the repository itself. | uda.compaction.resume-reconciliation / resume-reconciliation-at-boundary |
| If it conflicts with exact Git state, current artifacts, tests, or newer owner instructions, the newer verified evidence wins and the checkpoint must be repaired. | uda.compaction.resume-reconciliation / resume-reconciliation-at-boundary |
| For substantive long-running work, completion requires both: | uda.compaction.completion-closeout / completion-closeout-at-boundary |
| - the project's normal implementation/test/research gates; and | uda.compaction.completion-closeout / completion-closeout-at-boundary |
| - a current durable checkpoint or final state that accurately records what was completed, remaining follow-up, and relevant evidence/commits. | uda.compaction.completion-closeout / completion-closeout-at-boundary |
| Transferable lessons discovered during the work must still pass the normal lesson-closeout/disposition process. | uda.compaction.completion-closeout / completion-closeout-at-boundary |
| The current-state file is not a substitute for durable lesson promotion. | uda.compaction.completion-closeout / completion-closeout-at-boundary |
| Use or adapt this invariant: | uda.compaction.portable-instruction / portable-instruction-at-boundary |
| > Treat chat context as disposable working memory. | uda.compaction.portable-instruction / portable-instruction-at-boundary |
| Maintain project continuity in Git. | uda.compaction.portable-instruction / portable-instruction-at-boundary |
| For long-running or multi-session work, keep one canonical current-state checkpoint containing goal, decisions, completed work, current step, remaining work, blockers, evidence/commits, and next safe action. | uda.compaction.portable-instruction / portable-instruction-at-boundary |
| Push work and update the checkpoint at each completed step; never wait for a usage threshold. | uda.compaction.portable-instruction / portable-instruction-at-boundary |
| Before ending a turn on OPEN work, save that turn's state, reachable private supervisor state, account-bound items to recreate, and a one-line resume instruction. | uda.compaction.portable-instruction / portable-instruction-at-boundary |
| The worker holding the context saves it; a visible usage warning calls for an immediate checkpoint and small, restartable steps. | uda.compaction.portable-instruction / portable-instruction-at-boundary |
| On any new thread, interruption, context compaction, model switch, or account switch, reconcile the checkpoint against actual repository state and resume from the latest verified checkpoint without repeating completed work. | uda.compaction.portable-instruction / portable-instruction-at-boundary |
| Automatic model-context compaction is an efficiency mechanism, not a persistence mechanism. | uda.continuity.step-checkpoint / save-completed-step |

Operative remainder: Unselected operative clauses retained in prose after consolidation and mandatory refresh exceed the unchanged rendered budget: Do not attempt to preserve private model reasoning or every exploratory thought. Persist the user-relevant engineering/research outcomes needed for continuity: - decisions and why they were chosen; - rejected approaches when repeating them would waste time or recreate a known failure; - invariants and constraints; - evidence pointers; - test/validation results; - unresolved uncertainty; - next action. - Do not treat a stale `CURRENT-STATE` file as more authoritative than actual Git state or newer owner instructions. - Do not store secrets, credentials, tokens, or private chain-of-thought in recovery files. - Do not duplicate large logs or raw evidence into the checkpoint; link to their canonical locations. - Projects may use a machine-readable ledger/database instead of Markdown if it provides the same recovery guarantees. The general durable-memory/checkpoint/boundary clauses now carried in uda.continuity.step-checkpoint cover OPEN executable continuity; their broader multi-step diagnostic, stopped or satisfied-task persistence scope remains prose-governed. Repository-alone successor recovery at its handoff boundary also remains prose-governed: A robust project should tolerate starting a completely fresh agent conversation at any time. The test is: > Could a competent new worker, with repository access but without the old chat transcript, recover the correct current state and continue without repeating completed work or silently losing important constraints? If not, project state is insufficiently durable.

### patterns/exclusive-active-task-locks.md

| Exact sentence or clause | Record / obligation |
|---|---|
| For consequential multi-session work in a repository with competing task sources, make the active task **exclusive, source-controlled, branch-bound, and machine-gated**. | uda.task-lock.exclusive-controls / exclusive-controls-at-boundary |
| Use four distinct controls: | uda.task-lock.exclusive-controls / exclusive-controls-at-boundary |
| 1. a machine-readable active-task lock; | uda.task-lock.exclusive-controls / exclusive-controls-at-boundary |
| 2. a preflight that verifies task and branch identity; | uda.task-lock.exclusive-controls / exclusive-controls-at-boundary |
| 3. a task-specific acceptance command that inspects required evidence; | uda.task-lock.exclusive-controls / exclusive-controls-at-boundary |
| 4. explicit terminal-state semantics that distinguish incomplete, blocked, ready to merge, and complete. | uda.task-lock.exclusive-controls / exclusive-controls-at-boundary |
| Conversation is still disposable working memory. | uda.task-lock.exclusive-controls / exclusive-controls-at-boundary |
| The active task is recovered from Git. | uda.task-lock.exclusive-controls / exclusive-controls-at-boundary |
| Use a repository-local file such as: | uda.task-lock.lock-storage / lock-storage-at-boundary |
| ```text tasks/ACTIVE-TASK.json ``` | uda.task-lock.lock-storage / lock-storage-at-boundary |
| At minimum it should record: | uda.task-lock.lock-storage / lock-storage-at-boundary |
| ```json {   "schemaVersion": 1,   "taskId": "example-task-v1",   "status": "active",   "exclusive": true,   "requiredBranch": "agent/example-task",   "pullRequest": 123,   "preflightCommand": "npm run task:preflight",   "completionCommand": "npm run task:acceptance",   "suspendedTaskSources": [     "old handoffs",     "global roadmap selection",     "unrelated worktrees",     "release queues"   ] } ``` | uda.task-lock.lock-storage / lock-storage-at-boundary |
| The lock belongs in the **target repository and task branch**, not only in a source repository, external note, or prior chat. | uda.task-lock.lock-storage / lock-storage-at-boundary |
| The lock does not grant new authority. | uda.task-lock.lock-storage / lock-storage-at-boundary |
| Current owner requirements, safety boundaries, access constraints, spending, publication, and irreversible actions retain their normal gates. | uda.task-lock.lock-storage / lock-storage-at-boundary |
| An exclusive task lock means: | uda.task-lock.competing-sources / competing-sources-at-boundary |
| - other branches and worktrees remain intact; | uda.task-lock.competing-sources / competing-sources-at-boundary |
| - historical handoffs remain evidence; | uda.task-lock.competing-sources / competing-sources-at-boundary |
| - global roadmaps remain valid for later use; | uda.task-lock.competing-sources / competing-sources-at-boundary |
| - unrelated compliance or release blockers remain true; | uda.task-lock.competing-sources / competing-sources-at-boundary |
| - none of those sources may select the current worker's next task while the lock is active. | uda.task-lock.competing-sources / competing-sources-at-boundary |
| Name the suspended competing sources explicitly. | uda.task-lock.competing-sources / competing-sources-at-boundary |
| Do not rely on a generic sentence such as “focus on this task.” | uda.task-lock.competing-sources / competing-sources-at-boundary |
| After a fresh start, resume, context compaction, or model switch, the first repository command should verify: | uda.task-lock.preflight / preflight-at-boundary |
| - the active-task file exists and parses; | uda.task-lock.preflight / preflight-at-boundary |
| - `exclusive` is true when required; | uda.task-lock.preflight / preflight-at-boundary |
| - the current branch/worktree matches `requiredBranch`; | uda.task-lock.preflight / preflight-at-boundary |
| - the canonical current-state checkpoint names the same `taskId`; | uda.task-lock.preflight / preflight-at-boundary |
| - the checkpoint names the task-specific completion command; | uda.task-lock.preflight / preflight-at-boundary |
| - competing task sources are explicitly suspended. | uda.task-lock.preflight / preflight-at-boundary |
| A wrong branch is a **hard preflight failure**. | uda.task-lock.preflight / preflight-at-boundary |
| It is not permission to choose a different task from the repository. | uda.task-lock.preflight / preflight-at-boundary |
| If the worker is in an old S001, guide-packet, compliance, release, or roadmap worktree, it should stop that task-selection process and move to the exact active-task worktree. | uda.task-lock.preflight / preflight-at-boundary |
| It should not reinterpret the owner request to match the current directory. | uda.task-lock.preflight / preflight-at-boundary |
| The canonical recovery checkpoint should prominently state: | uda.task-lock.checkpoint-mirror / checkpoint-mirror-at-boundary |
| - task ID; | uda.task-lock.checkpoint-mirror / checkpoint-mirror-at-boundary |
| - exact branch or worktree; | uda.task-lock.checkpoint-mirror / checkpoint-mirror-at-boundary |
| - pull request when applicable; | uda.task-lock.checkpoint-mirror / checkpoint-mirror-at-boundary |
| - first preflight command; | uda.task-lock.checkpoint-mirror / checkpoint-mirror-at-boundary |
| - task-specific acceptance command; | uda.task-lock.checkpoint-mirror / checkpoint-mirror-at-boundary |
| - current partial progress; | uda.task-lock.checkpoint-mirror / checkpoint-mirror-at-boundary |
| - remaining acceptance conditions; | uda.task-lock.checkpoint-mirror / checkpoint-mirror-at-boundary |
| - suspended competing task sources; | uda.task-lock.checkpoint-mirror / checkpoint-mirror-at-boundary |
| - the rule that ordinary green tests are prerequisites, not completion. | uda.task-lock.checkpoint-mirror / checkpoint-mirror-at-boundary |
| If a repository must preserve an older compliance checkpoint verbatim for audit integrity, keep it as subordinate evidence. | uda.task-lock.checkpoint-mirror / checkpoint-mirror-at-boundary |
| Put the exclusive task lock above it and say explicitly that the older “next safe action” is suspended for the active task. | uda.task-lock.checkpoint-mirror / checkpoint-mirror-at-boundary |
| Do not allow a branch-local current-state file to continue saying “do not change this policy” after a newer owner-authorized branch exists specifically to change it. | uda.task-lock.checkpoint-mirror / checkpoint-mirror-at-boundary |
| File order is not authority order. | uda.task-lock.authority-resolution / authority-resolution-at-boundary |
| For continuation of a validated active task, use: | uda.task-lock.authority-resolution / authority-resolution-at-boundary |
| ```text current exact owner instruction or correction -> active-task lock and matching task-local checkpoint -> task-local plan and current chat-authored directive -> task PR/code/tests/CI and execution evidence -> repository-global operational state where causally applicable -> historical task state, old issues, old handoffs, archived checkpoints ``` | uda.task-lock.authority-resolution / authority-resolution-at-boundary |
| Repository-wide safety, privacy, security, permission, spending, publication, and irreversible-action policies remain controlling for affected operations. | uda.task-lock.authority-resolution / authority-resolution-at-boundary |
| A more specific task-local checkpoint cannot waive them. | uda.task-lock.authority-resolution / authority-resolution-at-boundary |
| But a generic global `BLOCKED`, `WAITING`, or `OWNER_DECISION_REQUIRED` label is not transitive across task IDs. | uda.task-lock.authority-resolution / authority-resolution-at-boundary |
| The active-task lock selects one checkpoint by exact source path, Git ref, commit/blob identity, content SHA-256, task ID, branch, and owner-outcome epoch/hash. | uda.task-lock.authority-resolution / authority-resolution-at-boundary |
| Resolve the latest independently captured owner-source/correction record first; a newer valid owner stop or amendment invalidates continuation. | uda.task-lock.authority-resolution / authority-resolution-at-boundary |
| Do not accept matching prose or task fields from a substituted checkpoint whose exact identity differs. | uda.task-lock.authority-resolution / authority-resolution-at-boundary |
| Before a blocker changes the active task state, require a machine-readable `templates/SCOPED-BLOCKER.json` record proving that it is unresolved, current enough, scoped to this task/frontier/operation, causally required, not superseded, and not displaced by higher-precedence authority that establishes independence. | uda.task-lock.blocker-scope / blocker-scope-at-boundary |
| Use these repository-global relations: | uda.task-lock.blocker-scope / blocker-scope-at-boundary |
| ```text CURRENT_AND_APPLICABLE CURRENT_BUT_UNRELATED STALE_BUT_APPLICABLE_REVALIDATION_REQUIRED STALE_AND_UNRELATED AMBIGUOUS ``` | uda.task-lock.blocker-scope / blocker-scope-at-boundary |
| When a global blocker is unrelated, preserve it as `SUSPENDED_COMPETING_SOURCE`, leave the task-local execution state unchanged, and raise the applicable finding rather than deleting history. | uda.task-lock.blocker-scope / blocker-scope-at-boundary |
| When scope is semantic or ambiguous, route to the reasoning chat; Codex does not decide. | uda.task-lock.blocker-scope / blocker-scope-at-boundary |
| Blocker independence is valid only for `OPERATIONAL` blockers. | uda.task-lock.blocker-scope / blocker-scope-at-boundary |
| An applicable safety, privacy, security, permission, spending, publication, or irreversible-action policy cannot be waived by listing its blocker ID as independent. | uda.task-lock.blocker-scope / blocker-scope-at-boundary |
| Project affected-frontier authorization separately from the task's descriptive state and fail closed on applicable, stale-applicable, ambiguous, or invalid authority. | uda.task-lock.blocker-scope / blocker-scope-at-boundary |
| Required findings include: | uda.task-lock.blocker-scope / blocker-scope-at-boundary |
| ```text STALE_GLOBAL_BLOCKER_INHERITED BLOCKER_SCOPE_MISMATCH BLOCKER_CAUSAL_DEPENDENCY_MISSING GLOBAL_STATE_STALE_FOR_ACTIVE_TASK WAIT_CONDITION_NOT_ACTIONABLE WAIT_WITHOUT_ADMISSION GITHUB_UPDATE_WAIT_WITHOUT_CAUSAL_DEPENDENCY CROSS_TASK_BLOCKER_LEAKAGE INVALID_TASK_INDEPENDENCE_OVERRIDE TASK_LOCAL_CHECKPOINT_CONTENT_SHA256_MISMATCH CURRENT_OWNER_STOP WAIT_REASONING_HANDOFF_MISSING WAIT_NEXT_CHECK_OUTSIDE_HORIZON ``` | uda.task-lock.blocker-scope / blocker-scope-at-boundary |
| Waiting is a separate controlled action. `templates/WAIT-ADMISSION.json` binds the active task, exact blocker or reasoning request, causal dependency, exact changing condition, source, actor/mechanism, poll or notification identity, next check, maximum horizon, horizon-expiry state, owner action, and unrelated-work policy. | uda.task-lock.wait-admission / wait-admission-at-boundary |
| A bare `wait for GitHub to update`, `wait for CI`, `wait for issue`, or `wait for owner` fails closed. | uda.task-lock.wait-admission / wait-admission-at-boundary |
| A task-specific command such as: | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| ```bash npm run task:acceptance ``` | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| should fail closed until the actual owner deliverables exist. | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| It should inspect durable artifacts rather than infer completion from prose. | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| Depending on the task, checks may include: | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| - exact corpus count and unique IDs; | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| - separation of model input from grader-only expectations; | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| - deterministic per-case results; | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| - actual non-mock model-run receipts; | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| - multi-turn trajectory results; | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| - comparison or ablation tables; | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| - aggregate metrics and explicit retain/simplify decisions; | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| - source provenance and runtime crosswalk; | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| - unresolved severe-failure count; | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| - exact-head verification commands; | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| - stable/release boundaries; | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| - article or source immutability; | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| - protected merge and post-merge receipt. | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| The acceptance command should print structured findings such as: | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| ```text CORPUS_MANIFEST_MISSING LIVE_CAMPAIGN_BLOCKED ABLATION_SUMMARY_MISSING QUERY_INPUT_GRADER_LEAK VERIFICATION_RECEIPT_MISSING ``` | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| This turns “what remains?” into a deterministic query rather than a model judgment. | uda.task-lock.artifact-acceptance / artifact-acceptance-at-boundary |
| Use this distinction: | uda.task-lock.terminal-states / terminal-states-at-boundary |
| ```text ordinary test suite   = implemented repository behavior is internally green  task-specific acceptance   = the owner-requested work products and evidence exist  protected merge + immutable receipt   = task closeout is complete ``` | uda.task-lock.terminal-states / terminal-states-at-boundary |
| A worker may not use `npm test`, `npm run verify`, green CI, a passing mock replay, or a handful of synthetic tests as proof that a 49-case comparison, migration, audit, or live-validation campaign was completed. | uda.task-lock.terminal-states / terminal-states-at-boundary |
| Recommended vocabulary: | uda.task-lock.terminal-states / terminal-states-at-boundary |
| - `INCOMPLETE` — acceptance findings remain and work can continue; | uda.task-lock.terminal-states / terminal-states-at-boundary |
| - `BLOCKED` — a genuine external permission, credential, access, spending, safety, publication, or provider boundary prevents a required step and durable evidence names it; | uda.task-lock.terminal-states / terminal-states-at-boundary |
| - `READY_FOR_PROTECTED_MERGE` — task acceptance passes, but protected integration and receipt remain; | uda.task-lock.terminal-states / terminal-states-at-boundary |
| - `COMPLETE` — protected merge/readback and immutable closeout receipt exist. | uda.task-lock.terminal-states / terminal-states-at-boundary |
| Do not call missing implementation a blocker. | uda.task-lock.terminal-states / terminal-states-at-boundary |
| Do not call a provider timeout a model rejection. | uda.task-lock.terminal-states / terminal-states-at-boundary |
| Do not call a blocked live campaign complete. | uda.task-lock.terminal-states / terminal-states-at-boundary |
| For black-box model testing, the lock and acceptance harness should mechanically separate: | uda.task-lock.model-input-separation / model-input-separation-at-boundary |
| ```text model-facing query ``` | uda.task-lock.model-input-separation / model-input-separation-at-boundary |
| from: | uda.task-lock.model-input-separation / model-input-separation-at-boundary |
| ```text expected route prohibited behavior assertions grader metadata framework hints ``` | uda.task-lock.model-input-separation / model-input-separation-at-boundary |
| The acceptance gate should fail if grader fields leak into model input, even if all campaign result files exist. | uda.task-lock.model-input-separation / model-input-separation-at-boundary |
| The task lock should not become a permanent competing authority. | uda.task-lock.retirement / retirement-at-boundary |
| After protected merge: | uda.task-lock.retirement / retirement-at-boundary |
| 1. record exact source and merged SHAs; | uda.task-lock.retirement / retirement-at-boundary |
| 2. record required check results; | uda.task-lock.retirement / retirement-at-boundary |
| 3. record immutable post-merge receipt; | uda.task-lock.retirement / retirement-at-boundary |
| 4. set task status to complete or archive the lock under a historical task path; | uda.task-lock.retirement / retirement-at-boundary |
| 5. update the canonical current-state checkpoint; | uda.task-lock.retirement / retirement-at-boundary |
| 6. re-enable normal roadmap selection only after closeout. | uda.task-lock.retirement / retirement-at-boundary |
| A later task creates a new lock with a new task ID. | uda.task-lock.retirement / retirement-at-boundary |
| It must not silently repurpose an old task lock. | uda.task-lock.retirement / retirement-at-boundary |
| At minimum test that: | uda.task-lock.control-plane-regressions / control-plane-regressions-at-boundary |
| - preflight rejects the wrong branch; | uda.task-lock.control-plane-regressions / control-plane-regressions-at-boundary |
| - preflight rejects a stale current-state task identity; | uda.task-lock.control-plane-regressions / control-plane-regressions-at-boundary |
| - preliminary code plus ordinary green tests cannot satisfy acceptance; | uda.task-lock.control-plane-regressions / control-plane-regressions-at-boundary |
| - acceptance passes only when all declared artifacts exist; | uda.task-lock.control-plane-regressions / control-plane-regressions-at-boundary |
| - a blocked live campaign yields `BLOCKED`, not `COMPLETE`; | uda.task-lock.control-plane-regressions / control-plane-regressions-at-boundary |
| - model-input/grader leakage fails closed; | uda.task-lock.control-plane-regressions / control-plane-regressions-at-boundary |
| - unrelated roadmap or worktree state is not selected while the task is exclusive. | uda.task-lock.control-plane-regressions / control-plane-regressions-at-boundary |
| Do not rely on: | uda.task-lock.anti-substitutes / anti-substitutes-at-boundary |
| - a long prompt alone; | uda.task-lock.anti-substitutes / anti-substitutes-at-boundary |
| - a resumed conversation's hidden memory of the handoff; | uda.task-lock.anti-substitutes / anti-substitutes-at-boundary |
| - `continue` or `what's next` as task selectors; | uda.task-lock.anti-substitutes / anti-substitutes-at-boundary |
| - a global roadmap when a branch-specific owner task is active; | uda.task-lock.anti-substitutes / anti-substitutes-at-boundary |
| - a current-state file from another branch; | uda.task-lock.anti-substitutes / anti-substitutes-at-boundary |
| - ordinary CI as proof of owner-task completion; | uda.task-lock.anti-substitutes / anti-substitutes-at-claim |
| - a PR body that says “work in progress” while the worker reports complete; | uda.task-lock.anti-substitutes / anti-substitutes-at-claim |
| - conversational promises to compare without per-case comparison artifacts; | uda.task-lock.anti-substitutes / anti-substitutes-at-claim |
| - deleting parallel worktrees merely to prevent task drift. | uda.task-lock.anti-substitutes / anti-substitutes-at-boundary |
| > For consequential multi-session work with competing repository task sources, maintain one machine-readable exclusive active-task lock in the target branch. | uda.task-lock.portable-instruction / portable-instruction-at-boundary |
| After any fresh start, resume, compaction, or model switch, run the task preflight before consulting old handoffs or global roadmaps. | uda.task-lock.portable-instruction / portable-instruction-at-boundary |
| A branch mismatch fails closed. | uda.task-lock.portable-instruction / portable-instruction-at-boundary |
| Ordinary tests are prerequisites, not task completion. | uda.task-lock.portable-instruction / portable-instruction-at-boundary |
| - Tiny one-shot tasks do not need a dedicated lock. | uda.task-lock.scope-authority / scope-authority-at-boundary |
| - A lock cannot override newer owner instructions, safety policy, legal constraints, permissions, spending, publication, or irreversible-action gates. | uda.task-lock.scope-authority / scope-authority-at-boundary |
| - A task-specific acceptance script is only as strong as its artifact schemas and tests; keep it reviewed and mutation-sensitive. | uda.task-lock.scope-authority / scope-authority-at-boundary |
| - Parallel agents may have separate locks in separate worktrees, but shared mutable state must still be serialized. | uda.task-lock.scope-authority / scope-authority-at-boundary |
| - A lock prevents task drift; it does not prove the substantive implementation is correct. | uda.task-lock.scope-authority / scope-authority-at-boundary |
| Claim readiness only when the task-specific acceptance command verifies every required artifact; claim completion only after protected merge and an immutable receipt. | uda.task-lock.terminal-states / terminal-states-at-boundary |
