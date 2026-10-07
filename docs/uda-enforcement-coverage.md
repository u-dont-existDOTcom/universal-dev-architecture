# UDA enforcement coverage — first integration, passes 1 and 2

Rules can be readable and easy to find without ever changing an answer or blocking an action. This inventory makes that gap visible. It checks declared coverage, not the semantic truth of an agent's judgment or live enforcement across every consumer. The owner outcome remains OPEN.

## Dispositions

- **STRUCTURED_ENFORCED:** all behavioral obligations in this source have exact task-time records and an evaluable admission path. Large files with a narrow slice do not qualify. This first integration has no entries in this state; large sources still have unstructured remainders.
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
3. For structured coverage, list every exact `task_time_records` id. Each record must exist, match this source (and root section), and be claimed once. Supply admission or behavioral regression evidence. Use partial coverage when obligations remain.
4. For a specialist workflow exception, explain the actual domain and authoritative workflow. For retirement, name the reason and successor. Neither disposition hides a live missing route.
5. New backlog is forbidden. Existing backlog may shrink freely; additions require `owner_authorized_additions` with exact id, owner quote, ISO date and source. The baseline pins identities, not just a total, and must match the initial count and canonical identity-list SHA-256 preserved in the owner requirement record. Editing that pin alone cannot authorize growth; owner quotes and coordinated policy rewrites still require human authority review.
6. Update docs counts/backlog and run `python3 scripts/uda_enforcement_coverage.py validate` and `python3 scripts/uda_enforcement_coverage.py report`. The deterministic repository audit runs validation at error level. If task-time metadata or bound source changes, regenerate the lock with `python3 scripts/uda_rule_graph.py validate --write-lock rules/rule-graph/generated/source-lock.v1.json` and regenerate the representative Mission Control projection with `python3 scripts/uda_rule_graph.py compile --task examples/rule-graph/work-handoff.json --mode graph --output tools/codex-mission-control/restored/codex-mission-control/generated/rule-graph/work-handoff-contract.json`. These are derived artifacts, not Mission Control runtime changes.

## Recomputed baseline

The supplied branch includes main at 991c7a08b7d9f831327d9075175b8d70c34c37e6. Before edits it had 70 indexed patterns, 86 pattern files, 31 trigger-less index lines and 16 unindexed files. Nine task-time records directly source six files: root AGENTS.md and five patterns; 65 indexed patterns lack direct records. There are two mechanical and nine semantic obligations. The graph has 36 active nodes and one superseded node. The baseline findings retain these counts; the exact pinned backlog identities are in `rules/rule-graph/enforcement-legacy-baseline.v1.json`. Current exact identities and dispositions are in the coverage inventory and its report, rather than repeated in the requirement record. Live GitHub freshness could not be verified in the network-isolated sandbox.

The systemic gap fits existing logic-map entries: LF-2.1 for unloaded/stale guidance; LF-7.1 for a loaded check missing the real endpoint; LF-7.2 for presence/routing tests that cannot reject violating behavior; LF-7.3 for overstated coverage. No new failure category is necessary.

## Current counts

Inventory entries: 96

Indexed patterns: 82

Migration backlog: 84

Task-time records: 10, sourced from 7 files, with 2 mechanical and 10 semantic obligations.

| Disposition | Count |
|---|---:|
| STRUCTURED_ENFORCED | 0 |
| STRUCTURED_PARTIAL | 7 |
| WORKFLOW_ONLY | 10 |
| LEGACY_UNSTRUCTURED | 77 |
| NOT_ACTIVE | 2 |

The seven partial sources are the bootstrap kernel section, task-time lesson activation, owner-goal follow-up, Chat/Work execution routing, the repository operating system, worker-directive/output delivery, and reasoning selection. The last now structures the dominated-route obligation; its other reasoning obligations remain in the legacy remainder. No whole source was newly fully structured in either pass. The pinned backlog has the same 84 identities, so shrinkage is zero. The report shows exact removed identities after migration.

## Exact migration backlog

P1 is exactly the issue's 22 high-leverage identities that remain in backlog. Other general behavioral entries are P2 (47); mechanics specific to a project or infrastructure surface are P3 (15), including Mission Control supervision/relay, browser automation, worker permissions and Work cloud dispatch. Every P1 entry is behavioral, checked by the validator.

Order migration by P1, P2, P3 first, then by how often the trigger fires: EVERY_TURN, FREQUENT, CONDITIONAL, SPECIALIST; use the id only to break ties. Frequency classes are declared routing estimates, not measured usage. Each entry retains its specific next step. The report uses this same order.

| Entry id | Priority | Estimated trigger frequency |
|---|---|---|
| `AGENTS.md#follow-up-goal-derivation-and-assistant-added-requirements` | P1 | EVERY_TURN |
| `AGENTS.md#instruction-composition` | P1 | EVERY_TURN |
| `AGENTS.md#owner-facing-operational-references` | P1 | EVERY_TURN |
| `AGENTS.md#per-turn-bootstrap-invariants` | P1 | EVERY_TURN |
| `AGENTS.md#pre-final-continuation-invariant` | P1 | EVERY_TURN |
| `AGENTS.md#workflow` | P1 | EVERY_TURN |
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

Every receipt binds `contract_sha256` to the compiled contract's `content_sha256`, plus `rule_id`, `obligation_id`, `phase`, `destination` and `payload_sha256`. Payload hashing uses the exact file bytes: UTF-8 characters, CRLF, whitespace and the final newline all matter. Check verifies the contract's content hash too. Optional `--destination` binds the check's target; when omitted each receipt must still match its obligation's declared destination. Supply the existing `--clock-start` and `--clock-end` arguments for mechanical elapsed-time obligations; receipts do not replace mechanical predicates or change their result format.

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

UDA cannot protect turns it never loaded. Replace the owner's **"unless it's very simple"** bootstrap exemption with this exact proposed owner-side instruction:

> On every user turn, before substantive reasoning, artifact composition, action or answering, load the current canonical default-branch root AGENTS.md, including on very simple turns. Apply its always-on minimal bootstrap obligations. Then use LESSON-INDEX.md to load deeper guidance only when its trigger matches the current task. If the live root cannot be retrieved, say so explicitly, record the bootstrap as NOT_LOADED, and do not claim UDA protection.

This is an owner-side instruction draft; this repository change does not edit owner settings. Minimal bootstrap is always on; deeper loading stays conditional.

## Dominated-route regression and integration boundary

`uda.reasoning.dominated-alternative` selects operational_command, procedure and practical_method requests for chat, work, codex and claude. Unknown `request_kind` remains unresolved. Its single semantic obligation is due at final-delivery to owner-visible-final; its exact selector is the new domain-neutral sentence beside minimum-owner-choice guidance in reasoning selection.

The fixtures in `tests/fixtures/dominated-route/` use abstract inputs/outputs. The old final presents a two-command route, then the same transform command's direct-output option, and calls the latter preferable: its golden FAIL receipt blocks. The repaired one-command final's PASS receipt admits and stays one line (under 160 characters). Replaying a PASS receipt for the old payload or rewriting the final without a new receipt blocks. When intermediate approval before output is a real material tradeoff, both alternatives remain and the golden PASS receipt admits them. These fixtures pin source provenance to the exact source blob for commit-independent golden bindings; production compilation preserves repository-revision provenance. The isolated regression checks the dominated-route slice; the existing mechanical suites separately check timestamps and elapsed time.

Both passes of the first integration are implemented. This establishes inventory, activation-state reporting, semantic binding admission and a behavioral regression; it does not establish universal live behavioral enforcement. The parent owner outcome remains OPEN with 84 partial/legacy identities. Later passes migrate coherent slices in the corrected priority order. The backlog pin remains unchanged, with zero added identities and zero fully removed identities.

## Review judgment limits

`patterns/living-mermaid-workflow-maps.md` is treated as specialist documentation maintenance; `patterns/github-actions-pr-ref-namespace-safety.md` as specialist workflow ref/log topology. Neither exception proves downstream adoption, and both should be reviewed if the owner wants their authoring behavior structured. The six symbolic-analysis exceptions retain their live domain constraints and scientific-validation limits. Evidence classes are declared after reading tests, but file-level evidence can contain several types of check; the report never upgrades routing to admission.
