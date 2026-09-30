# Logic failure map

## Status

Current universal pattern. Origin: **OWNER** request, 2026-09-29: "do we need to have like a full list of logic failures rather than my patchwork list?" and, after the proposal, "yes build the logic failure map".

## Why a map

The rules in this architecture were each added after a real failure. They work, but they grew as a patchwork: some overlap, some kinds of failure have no check, and nothing shows the whole picture. This map puts every known kind of failure in one place, organized by the stage of work where it starts. Each entry names a quick check that catches it and the rule that already covers it.

Use it three ways:

1. **When something goes wrong, place it on the map first.** Find the stage and the entry. If an entry fits, repair that entry's check or rule; that is where the generating condition lives (`AGENTS.md` → **Causal failure diagnosis**). Add a new entry only when a real failure fits none, with the failure, a check and the example.
2. **At task time, load the stages the task touches, not the whole map.** Before reporting to the owner, run stage 9's checks; before a consequential action, stage 6's. `patterns/task-time-lesson-activation.md` selects them.
3. **To see where the architecture is weakest,** count owner-marked failures per entry (`patterns/owner-marked-mission-control-failure-capture.md`). Entries that keep recurring need a stronger check, preferably a mechanical one.

## Existing-work basis

The multi-agent rows use the Multi-Agent System Failure Taxonomy (MAST): 14 failure modes in 3 categories, built from 150 annotated traces of multi-agent systems (Cemri, Pan, Yang et al., "Why Do Multi-Agent LLM Systems Fail?", 2025, https://arxiv.org/abs/2503.13657). The **MAST** column gives the matching mode. The reasoning rows restate checks this architecture already keeps in `patterns/reasoning-selection.md`, and the failure-cause list in root `AGENTS.md` (**Causal failure diagnosis**) is the diagnostic companion to this map.

"No check yet" marks a known failure that no rule covers. It is a gap, not a mandate: a check is added when a real failure shows it is needed.

## The map

### 1. Understanding the request

| ID | Failure | Quick check | Covered by | MAST |
|---|---|---|---|---|
| LF-1.1 | Answering a different question than the one asked: the target drifts to something easier or adjacent. | Restate the exact question; compare the kind of claim in the answer with the kind the question asks for. | `patterns/normality-base-rate-target-preservation.md`; `patterns/reasoning-selection.md` | FM-1.1 |
| LF-1.2 | Misreading what a short reply refers to. | Resolve the reply against the message it answers, in order, before the topic. | `patterns/reasoning-selection.md` | |
| LF-1.3 | The owner's outcome is quietly replaced by an easier contract. | Trace the deliverable back to the owner's own words. | `patterns/owner-outcome-invariant-and-contract-laundering-prevention.md`; `patterns/supervision-assurance-planes-and-pro-meta-review.md` | FM-1.1 |
| LF-1.4 | A requirement the owner never asked for becomes a blocker. | Declare each new requirement's origin and necessity. | `patterns/owner-goal-followup-and-requirement-accretion.md` | |
| LF-1.5 | Guessing on a decision that is the owner's, or asking about one that isn't. | Is the choice routine and reversible? Then decide; otherwise ask once, with a recommendation. | Root `AGENTS.md` (Workflow); `patterns/worker-self-remediation-before-owner-interruption.md` | FM-2.2 |
| LF-1.6 | Critiquing or transforming a long source without its whole argument. | Reconstruct the complete claim before changing or judging it. | `patterns/whole-argument-reconstruction.md` | |

### 2. Loading instructions and context

| ID | Failure | Quick check | Covered by | MAST |
|---|---|---|---|---|
| LF-2.1 | Working from stale or missing instructions: a remembered copy, or rules that never loaded. | Fetch the live bootstrap; compile the task's active rules. | Root `AGENTS.md` (bootstrap invariants); `patterns/task-time-lesson-activation.md`; `patterns/rule-graph-activation-and-dependency-resolution.md`; `patterns/github-first-agent-bootstrap.md`; `patterns/durable-chat-learning.md`; `patterns/canonical-design-os-bootstrap.md` | |
| LF-2.2 | Losing state across a context reset and then redoing or contradicting finished work. | Resume from the checkpoint, reconciled against Git. | `patterns/context-compaction-resilience.md`; `state/CURRENT-STATE.md` (Task checkpoints) | FM-1.4 |
| LF-2.3 | Working on the wrong task or branch while several are open. | Check the task lock and the branch before acting. | `patterns/exclusive-active-task-locks.md`; `patterns/parallel-chat-write-isolation.md` | |
| LF-2.4 | Treating a stale artifact as current authority. | Promote by exact identity; follow supersession. | `patterns/github-first-agent-bootstrap.md`; `patterns/artifact-authority-promotion-and-supersession.md` | |
| LF-2.5 | A standalone runtime never loads applicable architecture rules, so its agents or jobs operate without them. | Name the runtime; trace each applicable rule to an enforced, provenance-recorded project import and a test. | `patterns/carrying-uda-into-standalone-projects.md` | |
| LF-2.6 | Instructions inherit into the wrong scope or carry owner-specific material into a portable product. | Check inheritance scope and separate portable rules from owner-specific deployment content. | `patterns/instruction-composition-and-portable-intelligence.md` | |

### 3. Gathering evidence

| ID | Failure | Quick check | Covered by | MAST |
|---|---|---|---|---|
| LF-3.1 | Reporting live state from memory: usage, CI results, deployments, queues, balances. | Check it this turn, or label it an estimate with its basis and age. | `patterns/reasoning-selection.md` (observed-state claims) | |
| LF-3.2 | A claim about another agent, tool or runtime stated beyond where it was checked. | Name the exact runtime; test it there. | `patterns/agent-to-agent-consultation.md`; `templates/MISSION-CONTROL-GLOBAL-PM-BOOTSTRAP.md` (capability edges) | |
| LF-3.3 | Absence, uniqueness or recency claims ("the only copy", "the latest version") beyond the scope searched. | Say what was searched; settle by lookup where possible. | `patterns/reasoning-selection.md` | |
| LF-3.4 | Going deep on the first option before surveying the kinds of option. | Inventory the distinct classes first; keep unknowns visible. | `patterns/coverage-before-depth-in-selection.md`; `patterns/functional-neighborhood-discovery-for-monitoring.md` | |
| LF-3.5 | Rebuilding something that already exists. | Scan existing work before investing. | `patterns/research-before-reinvention.md`; `patterns/existing-work-scan-and-scholarly-discovery.md` | |
| LF-3.6 | A paraphrase treated as the source's own words. | Keep exact wording and provenance apart from interpretation. | `patterns/source-interpretation-provenance.md` | |
| LF-3.7 | A vivid or detailed account treated as strong evidence. | Ask what independent evidence it adds; keep denominators. | `patterns/interview-evidence-information-gain.md` | |
| LF-3.8 | An old pass or green label trusted as a current result. | Reproduce the exact boundary before relying on it. | `patterns/external-evaluation-reproducibility.md` | |

### 4. Reasoning

| ID | Failure | Quick check | Covered by | MAST |
|---|---|---|---|---|
| LF-4.1 | A feature shared by the positive cases taken as the cause, though the controls share it too. | Specificity check against the negative cases. | `patterns/reasoning-selection.md` | |
| LF-4.2 | A hypothesis kept although it predicts the opposite of what was seen. | Evidence-direction check for each candidate. | `patterns/reasoning-selection.md` | |
| LF-4.3 | A numeric comparison that is wrong: units, denominators, the direction of "cheaper" or "more". | Normalize, recompute and recheck each inequality at the point of use. | `patterns/reasoning-selection.md` | |
| LF-4.4 | A failure explained with shorthand ("I forgot") instead of its mechanism. | Name the mechanism; separate facts, inferences and guesses. | Root `AGENTS.md` (Causal failure diagnosis); `patterns/logic-failure-map.md` | |
| LF-4.5 | A costly-if-wrong conclusion checked only by the model family that reached it. | Send it to the other family. | `patterns/cross-family-reasoning-check.md` | |
| LF-4.6 | Grading your own work. | Separate the evaluator from the producing context. | `patterns/independent-evaluation-separation.md` | |

### 5. Deciding and planning

| ID | Failure | Quick check | Covered by | MAST |
|---|---|---|---|---|
| LF-5.1 | Keeping a strategy that isn't working, or dropping one before it could work. | Compare direct outcome evidence with the strategy's expected effect and window. | `patterns/outcome-advancement-and-strategy-efficacy.md` | |
| LF-5.2 | A loop that doesn't converge: the same kind of step repeated, or review rounds that each find new edge cases. | Cap the rounds; when a cap is hit, change the method (for example one full audit) rather than repeat the step. | `patterns/outcome-advancement-and-strategy-efficacy.md` | FM-1.3 |
| LF-5.3 | New infrastructure where the existing platform already offers it. | Inventory the platform's own deployment surfaces first. | `patterns/platform-native-deployment-before-new-infrastructure.md` | |
| LF-5.4 | Recommending before checking the facts that decide it: price, availability, fit. | Resolve the deciding facts before naming a candidate. | `patterns/recommendation-preflight-integrity.md` | |
| LF-5.5 | The wrong model tier: the top tier for easy work, or a low tier for hard work. | Split judgment from execution; use the lowest sufficient tier. | `patterns/delegate-easy-work-to-cheaper-models.md`; `patterns/work-model-and-effort-routing.md`; `patterns/chat-work-execution-routing-threshold.md`; `patterns/codex-supervision-resource-routing-account-failover-and-browser-hygiene.md` | |
| LF-5.6 | Assurance that doesn't match the decision: release gates on an experiment, or none at a merge. | Name the lane for the decision being made now. | `patterns/development-assurance-lanes.md` | |

### 6. Acting

| ID | Failure | Quick check | Covered by | MAST |
|---|---|---|---|---|
| LF-6.1 | Doing something other than what the reasoning concluded. | Compare the action with the stated plan before running it. | No check yet | FM-2.6 |
| LF-6.2 | Exceeding the task's scope or a stop condition, such as taking a consequential adjacent action. | Check the action against the directive's boundaries. | `patterns/work-model-and-effort-routing.md` (scope judgment); `patterns/codex-worker-permissions.md`; `patterns/chat-led-reasoning-codex-execution-separation.md` | FM-1.2 |
| LF-6.3 | A change reported as done without confirming it landed: an unverified write, a local-only commit. | Verify the final bytes or the remote ref. | `patterns/durable-write-checkpoints.md`; `patterns/worker-github-publication-and-recovery.md` | |
| LF-6.4 | Content lost while editing, consolidating or porting. | Freeze the source; trace every change both ways. | `patterns/transformation-preservation-proof.md`; `patterns/editorial-authority-and-lossless-editing.md` | |
| LF-6.5 | An unsafe operation: destructive, paid or privileged. | Gate it before running; keep shell state contained. | `patterns/paid-workflow-safety.md`; `patterns/interactive-shell-command-safety.md`; `patterns/codex-worker-permissions.md` | |
| LF-6.6 | Acting on the wrong surface or with stale tool state: the shell instead of the browser, a stale session. | Run the surface preflight; bind the action to exact artifacts. | Root `AGENTS.md` (Browser-control efficiency); `patterns/persistent-browser-automation-hygiene.md`; `patterns/chatgpt-client-surface-capability-and-thread-recovery.md`; `patterns/chatgpt-developer-mcp-chat-lifecycle.md` | |
| LF-6.7 | A self-updating launcher continues under its old controlling code after fetching a new version. | Compare the fetched controlling code; if it changed, re-execute once before downstream work. | `patterns/self-updating-launcher-reexec.md` | |

### 7. Checking

| ID | Failure | Quick check | Covered by | MAST |
|---|---|---|---|---|
| LF-7.1 | No check, or a check that never reaches the real endpoint. | Name the direct evidence that the outcome happened. | `patterns/development-assurance-lanes.md`; `patterns/outcome-advancement-and-strategy-efficacy.md` | FM-3.2 |
| LF-7.2 | A check that passes for the wrong reason: a test pinning wording, asserting the implementation instead of the behavior, or a misread result. | Would the check fail if the outcome were wrong? | Root `AGENTS.md` (Code review rules) | FM-3.3 |
| LF-7.3 | A record that overstates what was checked: a receipt, flag, count or status claiming more than happened. | Derive each flag from what actually ran. | Root `AGENTS.md` (Code review rules: "Do not claim a control is active without mechanical evidence") | FM-3.3 |
| LF-7.4 | A failure put in the wrong class, so it gets the wrong fix: a serialization error treated as reasoning, a mechanical error escalated as reasoning. | Classify before changing model or approach. | `patterns/structured-output-failure-boundary.md`; `patterns/work-model-and-effort-routing.md` (failure classes) | |
| LF-7.5 | A GitHub Actions audit mistakes a checkout-created merge ref for a pull request head, or reads its own incomplete log. | Compare head refs with checkout refs; exclude the current workflow run from log retrieval. | `patterns/github-actions-pr-ref-namespace-safety.md` | |
| LF-7.6 | Repeated full or mutation tests consume time without changing a decision. | Measure test cost; run focused tests during iteration and full suites at a justified checkpoint. | `patterns/test-efficiency-and-verification-budget.md` | |

### 8. Stopping and continuing

| ID | Failure | Quick check | Covered by | MAST |
|---|---|---|---|---|
| LF-8.1 | Stopping early: planning or diagnosing instead of doing the next safe step, or ending with work open. | Is there a safe, authorized next action? Then do it. | Root `AGENTS.md` (Pre-final continuation invariant); `patterns/codex-github-operating-system.md` | FM-3.1 |
| LF-8.2 | No stopping condition: running past the goal or without an end. | State the completion condition before starting. | `patterns/codex-github-operating-system.md`; `patterns/executable-frontier-coherence.md` | FM-1.5 |
| LF-8.3 | Interrupting the owner for work the agent can do. | Try the safe self-remedy first. | `patterns/worker-self-remediation-before-owner-interruption.md` | |
| LF-8.4 | A workflow left in a state with no next step. | Every non-final state names its next work or its blocker. | `patterns/executable-frontier-coherence.md` | |
| LF-8.5 | A completed work package or release is mistaken for closure of a longer research mission. | Compare the result with the invariant purpose and the current evidence frontier before closing the root mission. | `patterns/long-range-research-mission-supervision.md` | |

### 9. Reporting and handing off

| ID | Failure | Quick check | Covered by | MAST |
|---|---|---|---|---|
| LF-9.1 | Opaque identifiers instead of plain names. | Plain name first, identifier in parentheses. | `patterns/human-readable-operational-references.md` | |
| LF-9.2 | A link surfaced without opening it. | Open the exact link this turn. | Root `AGENTS.md` (Owner-facing outbound-link quality) | |
| LF-9.3 | Output the owner can't use where it is: a repository path, a long chat dump. | Deliver it where it will be used. | `patterns/worker-directive-delivery-and-chat-output-budget.md`; `patterns/human-readable-operational-references.md` | |
| LF-9.4 | A guess or a partial check reported as fact. | Each claim says where and when it was checked. | `patterns/reasoning-selection.md` (observed-state claims); `patterns/agent-to-agent-consultation.md` | |
| LF-9.5 | A handoff missing what the next agent needs. | The brief is self-contained: goal, inputs, boundaries, acceptance check. | `patterns/worker-directive-delivery-and-chat-output-budget.md` | FM-2.4 |
| LF-9.6 | Prose becomes hard to read aloud because connective relations are lost or repetition is mechanical. | Read the passage aloud; restore natural links and check local repetition in context. | `patterns/conversational-prose-speakability.md` | |

### 10. Coordinating agents

| ID | Failure | Quick check | Covered by | MAST |
|---|---|---|---|---|
| LF-10.1 | The owner used as the channel between agents. | Consult the other agent directly. | `patterns/agent-to-agent-consultation.md` | |
| LF-10.2 | Another agent's input ignored: a review finding, a consulted answer. | Answer each finding: fixed, or wrong and why. | `patterns/agent-to-agent-consultation.md` | FM-2.5 |
| LF-10.3 | A delegate drifting from its brief. | Check the result against the brief's acceptance check. | `patterns/delegate-easy-work-to-cheaper-models.md` | FM-2.3 |
| LF-10.4 | Concurrent writers clobbering each other on a shared branch or file. | One writer per branch; one checkpoint file per task. | `patterns/parallel-chat-write-isolation.md`; `state/CURRENT-STATE.md` (Task checkpoints) | |
| LF-10.5 | Context lost when work passes between agents. | Hand over a checkpoint, not a memory. | `patterns/worker-directive-delivery-and-chat-output-budget.md`; `patterns/context-compaction-resilience.md` | FM-2.1 |
| LF-10.6 | Multi-worker supervision loses a single authority or context boundary, so execution and judgment are routed to the wrong agent. | Trace each directive and decision to its owner, worker, and supervisory lane. | `patterns/codex-pro-supervision-mission-control.md`; `patterns/codex-supervision-intelligence-routing-and-context-lifecycle.md` | |
| LF-10.7 | Multiple relay hosts send the same item, or failover resumes without a fenced authority. | Verify one durable sender admission, global pacing, and a fenced failover epoch before each send. | `patterns/mission-control-multi-host-submission-scheduling.md` | |

## Keeping the map complete

Every rule this architecture adds is placed on the map: under an existing entry, or as a new entry. A lesson that governs a workflow rather than preventing a failure is listed under **Not failure rules** below. Projects outside this architecture import the entries that apply to them (`patterns/carrying-uda-into-standalone-projects.md`).

### Not failure rules

Lessons that describe a workflow or a specialist method rather than prevent a kind of failure are listed here, so the completeness check can tell them from unplaced rules.

- `patterns/living-mermaid-workflow-maps.md` — specialist method for maintaining visual workflow documentation.
- `patterns/youtube-transcript-workflow.md` — specialist method for obtaining video transcripts.

## Requirement-accretion declaration

- Origin: `OWNER` (2026-09-29).
- Decision it changes: where a new failure goes when it happens, and which checks a task loads by stage.
- Why the simpler standard is insufficient: the patchwork gives no view of coverage, overlap or gaps, and a new failure has no place to be classified before a new rule is written.
- Why it is scoped: the map adds no gate. It routes to rules that already exist, and "No check yet" rows stay gaps until a real failure shows a check is needed.
