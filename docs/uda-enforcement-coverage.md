# UDA enforcement coverage — first integration, pass 1

Rules can be readable and easy to find without ever changing an answer or blocking an action. This inventory makes that gap visible. It checks declared coverage, not the semantic truth of an agent's judgment or live enforcement across every consumer. The owner outcome remains OPEN.

## Dispositions

- **STRUCTURED_ENFORCED:** all behavioral obligations in this source have exact task-time records and an evaluable admission path. Large files with a narrow slice do not qualify. Pass 1 has no entries in this state.
- **STRUCTURED_PARTIAL:** some obligations have exact records; the entry names the remaining operative obligations in `legacy_remainder`. It stays in the migration backlog. Semantic records currently compile and fail closed with UNKNOWN, without a receipt acceptance path.
- **WORKFLOW_ONLY:** the source is a specialist authoritative workflow or reference, with a source-specific explanation. This is an explicit exception, not a claim of semantic task-time enforcement. Some specialist workflows do contain behavior; that fact stays visible.
- **LEGACY_UNSTRUCTURED:** a behavioral rule still relies on prose/index application. Its exact identity and migration priority are reported. Routing does not count as enforcement.
- **NOT_ACTIVE:** only superseded, historical or retired sources. A specific reason and an active successor for supersession are required. Live unindexed guidance cannot use this state.

## What evidence can establish

`TEXT_PRESENCE` proves text or a fixture exists. `ROUTING` proves an index or graph route. `COMPILATION` proves records can enter a representative contract. None proves the actual answer/action obeyed a rule. Only `ADMISSION` and `BEHAVIORAL_REGRESSION` can support a structured disposition, and the inventory still requires exact source records. Admission evidence for a partial semantic record proves UNKNOWN blocks; it does not prove semantic PASS. Other local runtime admission controls are useful supporting evidence but do not replace task-time record mapping.

A wildcard, an index listing, a graph node, a generic green test total or the removed legacy source-list field cannot certify enforcement. Source/selector checks inspect the section that owns the record, not an arbitrary sentence elsewhere in the file. Mechanical validation establishes bindings and declared structure; human review still decides whether the inventory captures all operative obligations and whether a specialist exception is justified.

## Activation routes

`KERNEL_ALWAYS` loads a root section with activated UDA authority. `STRUCTURED_TRIGGER` uses the listed records' trigger facts. `INDEX_TRIGGER` is an explicit leading When/Before/For/After/Whenever/While/If clause interpreted by the reasoning agent with a recorded activation reason. `PARENT_PATTERN` follows a named active parent that literally mentions the child's path. Parent cycles are rejected. These routes describe reachability, not successful application. They preserve the small active contract instead of loading every pattern on every task.

## Adding or migrating a rule

1. Read the full source and its applicable authority. A new pattern file or root level-two section immediately joins the computed universe.
2. Add exactly one entry in `rules/rule-graph/enforcement-coverage.v1.json`, with canonical id, behavioral classification, actors, phases, destinations, evidence and a real activation route.
3. For structured coverage, list every exact `task_time_records` id. Each record must exist, match this source (and root section), and be claimed once. Supply admission or behavioral regression evidence. Use partial coverage when obligations remain.
4. For a specialist workflow exception, explain the actual domain and authoritative workflow. For retirement, name the reason and successor. Neither disposition hides a live missing route.
5. New backlog is forbidden. Existing backlog may shrink freely; additions require `owner_authorized_additions` with exact id, owner quote, ISO date and source. The baseline pins identities, not just a total, and must exactly match the preserved initial baseline finding in the owner requirement record. Editing that pin alone cannot authorize growth; owner quotes and coordinated policy rewrites still require human authority review.
6. Update docs counts/backlog and run `python3 scripts/uda_enforcement_coverage.py validate` and `python3 scripts/uda_enforcement_coverage.py report`. The deterministic repository audit runs validation at error level. If task-time metadata or bound source changes, regenerate the lock with `python3 scripts/uda_rule_graph.py validate --write-lock rules/rule-graph/generated/source-lock.v1.json` and regenerate the representative Mission Control projection with `python3 scripts/uda_rule_graph.py compile --task examples/rule-graph/work-handoff.json --mode graph --output tools/codex-mission-control/restored/codex-mission-control/generated/rule-graph/work-handoff-contract.json`. These are derived artifacts, not Mission Control runtime changes.

## Recomputed baseline

The supplied branch includes main at 991c7a08b7d9f831327d9075175b8d70c34c37e6. Before edits it had 70 indexed patterns, 86 pattern files, 31 trigger-less index lines and 16 unindexed files. Nine task-time records directly source six files: root AGENTS.md and five patterns; 65 indexed patterns lack direct records. There are two mechanical and nine semantic obligations. The graph has 36 active nodes and one superseded node. Exact identities are preserved in the branch checkpoint and the owner requirement's `related_findings`. Live GitHub freshness could not be verified in the network-isolated sandbox.

The systemic gap fits existing logic-map entries: LF-2.1 for unloaded/stale guidance; LF-7.1 for a loaded check missing the real endpoint; LF-7.2 for presence/routing tests that cannot reject violating behavior; LF-7.3 for overstated coverage. No new failure category is necessary.

## Current counts

Inventory entries: 96

Indexed patterns: 82

Migration backlog: 84

| Disposition | Count |
|---|---:|
| STRUCTURED_ENFORCED | 0 |
| STRUCTURED_PARTIAL | 6 |
| WORKFLOW_ONLY | 10 |
| LEGACY_UNSTRUCTURED | 78 |
| NOT_ACTIVE | 2 |

The six partial sources are the bootstrap kernel section, task-time lesson activation, owner-goal follow-up, Chat/Work execution routing, the repository operating system, and worker-directive/output delivery. No behavioral rule was newly fully structured in pass 1. The pinned backlog has the same 84 identities, so shrinkage is zero. The report shows exact removed identities after migration.

## Exact migration backlog

P1 prioritizes behavioral reasoning/minimum-owner-choice/exact-target discipline, task activation, logic diagnosis, source provenance, continuation/stop, owner outcome, capability claims, output delivery, shopping preflight, triggered cross-family checks, worker handoff/routing, current-state recovery and task locks. P2 covers other cross-task controls; P3 is narrower specialist maintenance when behavioral. Each inventory entry supplies its specific next step.

| Entry id | Priority |
|---|---|
| `AGENTS.md#follow-up-goal-derivation-and-assistant-added-requirements` | P1 |
| `AGENTS.md#instruction-composition` | P1 |
| `AGENTS.md#owner-facing-operational-references` | P1 |
| `AGENTS.md#per-turn-bootstrap-invariants` | P1 |
| `AGENTS.md#pre-final-continuation-invariant` | P1 |
| `AGENTS.md#workflow` | P1 |
| `patterns/agent-to-agent-consultation.md` | P1 |
| `patterns/artifact-authority-promotion-and-supersession.md` | P1 |
| `patterns/chat-led-reasoning-codex-execution-separation.md` | P1 |
| `patterns/chat-work-execution-routing-threshold.md` | P1 |
| `patterns/chatgpt-client-surface-capability-and-thread-recovery.md` | P1 |
| `patterns/chatgpt-developer-mcp-chat-lifecycle.md` | P1 |
| `patterns/chatgpt-work-cloud-dispatch.md` | P1 |
| `patterns/codex-github-operating-system.md` | P1 |
| `patterns/codex-pro-supervision-mission-control.md` | P1 |
| `patterns/codex-supervision-intelligence-routing-and-context-lifecycle.md` | P1 |
| `patterns/codex-supervision-resource-routing-account-failover-and-browser-hygiene.md` | P1 |
| `patterns/codex-worker-permissions.md` | P1 |
| `patterns/consilience-and-expected-observability.md` | P1 |
| `patterns/context-compaction-resilience.md` | P1 |
| `patterns/coverage-before-depth-in-selection.md` | P1 |
| `patterns/cross-family-reasoning-check.md` | P1 |
| `patterns/delegate-easy-work-to-cheaper-models.md` | P1 |
| `patterns/durable-chat-learning.md` | P1 |
| `patterns/durable-write-checkpoints.md` | P1 |
| `patterns/editorial-authority-and-lossless-editing.md` | P1 |
| `patterns/exact-git-write-handoff.md` | P1 |
| `patterns/exclusive-active-task-locks.md` | P1 |
| `patterns/executable-frontier-coherence.md` | P1 |
| `patterns/external-evaluation-reproducibility.md` | P1 |
| `patterns/failed-strategy-lineage-and-negative-evidence-binding.md` | P1 |
| `patterns/functional-neighborhood-discovery-for-monitoring.md` | P1 |
| `patterns/github-first-agent-bootstrap.md` | P1 |
| `patterns/human-readable-operational-references.md` | P1 |
| `patterns/independent-evaluation-separation.md` | P1 |
| `patterns/instruction-composition-and-portable-intelligence.md` | P1 |
| `patterns/interview-evidence-information-gain.md` | P1 |
| `patterns/logic-failure-map.md` | P1 |
| `patterns/normality-base-rate-target-preservation.md` | P1 |
| `patterns/outcome-advancement-and-strategy-efficacy.md` | P1 |
| `patterns/owner-goal-followup-and-requirement-accretion.md` | P1 |
| `patterns/owner-marked-mission-control-failure-capture.md` | P1 |
| `patterns/owner-outcome-invariant-and-contract-laundering-prevention.md` | P1 |
| `patterns/owner-questions-page.md` | P1 |
| `patterns/parallel-chat-write-isolation.md` | P1 |
| `patterns/persistent-browser-automation-hygiene.md` | P1 |
| `patterns/reasoning-selection.md` | P1 |
| `patterns/recommendation-preflight-integrity.md` | P1 |
| `patterns/rule-graph-activation-and-dependency-resolution.md` | P1 |
| `patterns/runtime-chat-work-authority-admission-and-internal-routing.md` | P1 |
| `patterns/shopping-research.md` | P1 |
| `patterns/source-interpretation-provenance.md` | P1 |
| `patterns/supervision-assurance-planes-and-pro-meta-review.md` | P1 |
| `patterns/task-time-lesson-activation.md` | P1 |
| `patterns/terminal-response-admission-and-autonomous-continuation.md` | P1 |
| `patterns/whole-argument-reconstruction.md` | P1 |
| `patterns/work-model-and-effort-routing.md` | P1 |
| `patterns/worker-directive-delivery-and-chat-output-budget.md` | P1 |
| `patterns/worker-github-publication-and-recovery.md` | P1 |
| `patterns/worker-self-remediation-before-owner-interruption.md` | P1 |
| `AGENTS.md#authority` | P2 |
| `AGENTS.md#code-review-rules` | P2 |
| `AGENTS.md#universal-and-owner-specific-infrastructure-boundary` | P2 |
| `patterns/canonical-design-os-bootstrap.md` | P2 |
| `patterns/carrying-uda-into-standalone-projects.md` | P2 |
| `patterns/conversational-prose-speakability.md` | P2 |
| `patterns/development-assurance-lanes.md` | P2 |
| `patterns/existing-work-scan-and-scholarly-discovery.md` | P2 |
| `patterns/interactive-shell-command-safety.md` | P2 |
| `patterns/long-range-research-mission-supervision.md` | P2 |
| `patterns/mission-control-multi-host-submission-scheduling.md` | P2 |
| `patterns/mission-control-owner-discovered-supervision-escape-assurance.md` | P2 |
| `patterns/paid-workflow-safety.md` | P2 |
| `patterns/platform-native-deployment-before-new-infrastructure.md` | P2 |
| `patterns/portable-vs-owner-specific-deployment-data.md` | P2 |
| `patterns/research-before-reinvention.md` | P2 |
| `patterns/self-updating-launcher-reexec.md` | P2 |
| `patterns/shared-provider-submission-queue.md` | P2 |
| `patterns/structured-output-failure-boundary.md` | P2 |
| `patterns/suggested-fix-queue.md` | P2 |
| `patterns/targeted-artifact-edit-preservation.md` | P2 |
| `patterns/test-efficiency-and-verification-budget.md` | P2 |
| `patterns/transformation-preservation-proof.md` | P2 |
| `patterns/web-data-provider-escalation.md` | P2 |

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

## Pass boundary and bootstrap limits

Pass 2 follows on this branch: semantic receipts, explicit activation/protection state and the domain-neutral dominated-route regression. Pass 1 does not implement or claim those effects. The existing checker still returns UNKNOWN for semantic obligations. It has no exact-candidate receipt acceptance and does not distinguish OUTSIDE_UDA from enforced activation in its output yet.

A turn that authoritative owner/project instructions allow to skip UDA remains outside guaranteed protection. Repository code cannot protect a turn that never loads it, and owner settings are unchanged. The recommended owner instruction for universal per-turn protection is:

> On every user turn, load the current canonical default-branch root AGENTS.md before substantive reasoning or action, including simple turns. Follow its always-on minimum obligations, then load task-relevant index patterns conditionally. If retrieval fails, say so explicitly and do not claim UDA protection.

This replaces any “unless it is very simple” exemption. It is a proposed owner-side instruction, not an applied settings change or a pass-1 activation-state implementation.

## Review judgment limits

`patterns/living-mermaid-workflow-maps.md` is treated as specialist documentation maintenance; `patterns/github-actions-pr-ref-namespace-safety.md` as specialist workflow ref/log topology. Neither exception proves downstream adoption, and both should be reviewed if the owner wants their authoring behavior structured. The six symbolic-analysis exceptions retain their live domain constraints and scientific-validation limits. Evidence classes are declared after reading tests, but file-level evidence can contain several types of check; the report never upgrades routing to admission.
