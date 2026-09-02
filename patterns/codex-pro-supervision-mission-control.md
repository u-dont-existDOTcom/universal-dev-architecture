# Codex–Pro Supervision Mission Control Architecture

**Status:** Proposed reference architecture  
**Date:** 2026-08-30  
**Primary operator:** Joel Rosenblum  
**Scope:** Local supervision of four or more Codex workers, each associated with an independent ChatGPT Pro supervisor, with an optional ChatGPT Extra High repository-reading stage and a shared attention-oriented dashboard.

---

## 1. Executive decision

Build **Mission Control as a supervisory evidence, judgment, and owner-attention layer on top of OpenAI Symphony**, rather than as a competing coding-agent orchestrator.

Use the following division of responsibility:

- **Linear** is the recommended live work-control plane: queue state, priority, blockers, dependencies, and review/decision gates.
- **GitHub** is the durable authority for task contracts, owner decisions, code, commits, pull requests, CI, architecture, and recovery state.
- **Symphony** owns Codex worker dispatch, workspace isolation, App Server sessions, concurrency, reconciliation, retries, and stopping workers when tracker state makes them ineligible.
- **Mission Control** owns normalized telemetry, deterministic checks, evidence packets, supervisor-session mapping, review import, drift findings, owner-decision routing, and the dashboard.
- **Extra High ChatGPT** is an optional **Repository Evidence Reader**. It may pull and organize GitHub evidence, but it must not issue the supervisory verdict.
- **Pro ChatGPT** is the **semantic supervisor/judge**. It receives a self-contained, versioned packet and must never depend on reliable GitHub access.
- **Joel** remains the only authority for genuine product, policy, safety, publication, spending, access, or irreversible tradeoffs.

The system is therefore not “better than OpenAI or Anthropic” in general. It composes their established execution and evaluation patterns around one specialized operating problem they do not solve as a product: **detecting whether several active Codex workers remain faithful to Joel’s objectives, and directing Joel’s scarce attention only where intervention is needed.**

---

## 2. Preserved independent conception snapshot

This snapshot records the project concept before adapting it to external implementations.

### Problem

Four or more Codex workers can appear active and technically healthy while slowly departing from their assigned objective, using an unacceptable method, narrowing the requested outcome, bypassing an owner decision, or claiming completion without adequate evidence.

### Candidate mechanism

```text
Codex workers
    -> structured runtime events and semantic checkpoints
    -> one independent Pro supervisor per active task
    -> shared Mission Control dashboard
```

### Original constraints

- The dashboard is an audit and observability layer, not another autonomous coding supervisor.
- All workers must be visible at once.
- Each worker must show objective, current status, alignment, GREEN/YELLOW/RED, ON_TRACK/WATCH/REDIRECT, current step, checkpoint freshness, tests, and drift warnings.
- Each task must link directly to its Codex and Pro chats.
- Pro web chats cannot be assumed to access GitHub reliably.
- Long-running architecture and handoff state must survive in GitHub rather than chat memory.
- The system should be local and lightweight.

### Independent insight retained

The distinctive value is not generic multi-agent scheduling. It is the separation of:

1. **execution health** — is the worker running?;
2. **progress** — how much of the contract is verified?;
3. **objective alignment** — is it still doing the right job by an acceptable method?;
4. **evidence quality** — can its claims be checked?; and
5. **owner attention** — does Joel actually need to decide or intervene?

External work strengthens this conception but does not replace it.

---

## 3. Existing-work scan and build decision

### 3.1 Already solved well enough to reuse

OpenAI Symphony already defines or implements:

- issue-driven worker dispatch;
- one isolated workspace per issue;
- Codex App Server sessions;
- bounded concurrency;
- continuation turns;
- retries and backoff;
- reconciliation against tracker state;
- terminal-state stopping and cleanup;
- repository-owned `WORKFLOW.md` policy;
- tracker adapters;
- host-side tracker authentication;
- structured runtime state and a basic dashboard/API.

OpenAI’s harness-engineering guidance already establishes:

- repository-local durable knowledge;
- narrow `AGENTS.md` entry points rather than giant instruction dumps;
- isolated worktrees/workspaces;
- deterministic tests and guardrails;
- agent-legible logs, traces, metrics, and artifacts;
- humans specifying intent and validating consequential outcomes.

Anthropic’s published work already establishes:

- structured progress files and Git checkpoints for long-running agents;
- artifact-based handoffs;
- planner/generator/evaluator separation;
- combining deterministic, model-based, and human graders;
- clear multidimensional rubrics;
- an `Unknown` outcome for insufficient evidence;
- calibration of model judges against human judgments;
- trajectory inspection rather than final-answer-only scoring;
- parallelization only when work is genuinely separable.

OpenTelemetry already supplies useful emerging vocabulary for agent/workflow/tool spans, although its GenAI agent conventions remain in development.

### 3.2 Partially solved

- Basic runtime dashboards exist, but they emphasize activity and process health rather than owner-intent fidelity.
- Agent-as-a-judge research supports richer evaluation, but model judges remain biased and require deterministic grounding and calibration.
- Symphony has tracker/filesystem recovery, but exact in-memory runtime, retry, and blocked state may not survive restart.
- Parallel coding agents are established, but conflict management and system-level objective drift remain active engineering problems.

### 3.3 User-specific unresolved remainder

The following should be built:

- self-contained supervisor packet generation for a Pro chat without dependable repository access;
- an optional Extra High GitHub-reading bridge with exact provenance and completeness receipts;
- persistent task-to-Pro-chat association;
- objective-drift taxonomy and rubric;
- owner-decision gates;
- attention-prioritized multi-worker dashboard;
- structured import of Pro verdicts;
- browser links and best-effort chat relay;
- calibration scenarios drawn from Joel’s real failures.

### 3.4 Explicit decision

- **Reuse:** Symphony, Linear, GitHub, Codex App Server, CI, OpenTelemetry vocabulary.
- **Adapt:** Anthropic’s artifact handoffs, evaluator separation, multidimensional evals, and transcript/trajectory review.
- **Compose:** deterministic evidence collection + optional Extra High reader + Pro semantic judgment.
- **Invent narrowly:** objective-drift contract, packet protocol, review schema, owner-attention dashboard.
- **Experiment:** whether Extra High improves evidence completeness enough to justify the extra stage.
- **Do not build now:** a custom scheduler, generic multi-agent framework, distributed workflow engine, or brittle full automation of ChatGPT’s web UI.

---

## 4. Foundational architecture principles

### 4.1 One authority per dimension

Avoid one vague “source of truth.” Each dimension has exactly one authority:

| Dimension | Authority |
|---|---|
| Current owner intent | Latest explicit owner instruction, then versioned GitHub task contract |
| Live work state | Linear |
| Code and durable implementation evidence | GitHub |
| Worker process/session state | Symphony plus local process observation |
| Deterministic verification | Test/CI/artifact receipts |
| Semantic supervisory judgment | Validated Pro review record |
| Genuine tradeoff decisions | Joel |
| Dashboard projection | Rebuildable projection from the above; never independent authority |

This table does not define an authority rank. A load-bearing claim may require
several scoped authorizations at once. Use the conjunctive claim record,
append-only transition ledger, subject-bound reproduction receipt, and
reasoning-surface observation/verdict admission controls defined in
`patterns/supervision-assurance-planes-and-pro-meta-review.md`. A reasoning
decision cannot substitute for `OWNER_EXPLICIT`, and reproduction cannot
promote a fact into policy.

### 4.2 Task-centric, not session-centric

A durable task survives:

- a Codex restart;
- a new workspace attempt;
- a Pro chat rollover;
- an Extra High reader failure;
- a Mission Control restart;
- a model-picker change.

The primary identity is `task_id`, not a Codex thread ID or chat URL.

### 4.3 Retrieval and judgment are separate roles

The Extra High reader answers:

> What exact repository evidence is relevant, and what is missing?

The Pro supervisor answers:

> Given the contract and evidence, is the worker still pursuing the objective correctly, and what should happen next?

The reader must not pre-decide the verdict. The supervisor must not be forced to retrieve its own evidence.

### 4.4 Claims are not evidence

Worker statements are stored in a distinct `worker_claims` section. They do not become evidence until corroborated by commits, files, tests, CI, runtime artifacts, or independently retrieved material.

### 4.5 Deterministic checks precede semantic judgment

Use code for facts such as:

- branch and SHA identity;
- whether HEAD moved;
- changed paths;
- test result and timestamp;
- CI status;
- unresolved owner-decision state;
- evidence-packet hash;
- stale or missing checkpoint;
- unauthorized path changes;
- active resource collision.

Reserve Pro reasoning for semantic questions that code cannot settle reliably.

### 4.6 Supervisors advise and gate; they do not silently rewrite intent

A supervisor may:

- approve continuation;
- identify uncertainty;
- issue a bounded redirect;
- require more evidence;
- escalate a genuine owner decision.

It may not silently replace the objective, acceptance criteria, owner position, or risk policy.

### 4.7 Human attention is the constrained resource

The main dashboard is an attention allocator. It should answer:

- Where must Joel look now?
- Why?
- What exact decision or intervention is required?
- What evidence supports the alert?
- Can all other work continue safely without him?

---

## 5. Overall topology

```mermaid
flowchart LR
    O[Joel] -->|objectives and decisions| G[GitHub task contracts]
    O -->|priority and readiness| L[Linear control plane]

    G --> S[Symphony instances]
    L --> S
    S --> C1[Codex worker A]
    S --> C2[Codex worker B]
    S --> C3[Codex worker C]
    S --> C4[Codex worker D]

    C1 --> GH[GitHub code / PR / CI]
    C2 --> GH
    C3 --> GH
    C4 --> GH

    S --> M[Mission Control daemon]
    L --> M
    GH --> M
    C1 -->|semantic checkpoint claims| M
    C2 -->|semantic checkpoint claims| M
    C3 -->|semantic checkpoint claims| M
    C4 -->|semantic checkpoint claims| M

    M --> P[Versioned evidence packet]
    P -->|default direct route| PRO[Persistent Pro supervisor]
    P -->|optional retrieval manifest| XH[Extra High evidence reader]
    XH --> D[Provenance-locked evidence dossier]
    D --> PRO

    PRO -->|structured verdict| M
    M --> UI[Mission Control dashboard]
    UI --> O

    M -->|validated redirect / gate state| L
    O -->|owner decision| M
    M -->|decision record| G
```

### Deployment topology

Run these as separate local processes:

1. **Symphony instance(s)** — initially one per active project/repository workflow.
2. **Mission Control daemon** — long-running Node.js/TypeScript process; only writer to SQLite.
3. **Mission Control web app** — Next.js/React UI; communicates only through daemon APIs/SSE.
4. **SQLite database** — event store plus projections.
5. **Content-addressed artifact store** — packets, patches, test logs, screenshots, and imported review artifacts.
6. **`mc` CLI** — checkpoint, packet, import, diagnostics, and recovery commands.
7. **Optional Brave relay** — opens/reuses task-specific chats and copies packets; never a source of truth.

Keep the daemon separate from the Next.js runtime. Background polling and event ingestion must not depend on development reloads, browser tabs, or serverless-style request lifecycles.

---

## 6. Linear versus GitHub Issues

### 6.1 Recommended primary mode: Linear + GitHub

Use Linear because the orchestration problem needs richer state than `open`/`closed`:

```text
Backlog
Ready
In Progress
Supervisor Hold
Rework
Owner Decision
Human Review
Merging
Done
Canceled
Duplicate
```

Recommended Symphony configuration:

- **Active:** `Ready`, `In Progress`, `Rework`, optionally `Merging`.
- **Inactive but nonterminal:** `Backlog`, `Supervisor Hold`, `Owner Decision`, `Human Review`.
- **Terminal:** `Done`, `Canceled`, `Duplicate`.

Linear also supplies first-class blockers and issue relationships. Mission Control should not recreate a dependency engine when the tracker already has one.

### 6.1A Blockers are scoped; waits require admission

Mission Control must not project a repository-global status label directly onto every active task. Resolve the validated branch-bound active-task lock and matching task-local checkpoint first. A global blocker affects the current frontier only when a current `SCOPED-BLOCKER` record explicitly binds the task, strategy family, directive, required capability, or operation and proves a causal dependency.

Preserve unrelated global blockers in the task projection as ignored or suspended competing sources. Show their identity, scope, age, and relation; do not hide or delete them. A task card must separately show active blockers, ignored/unrelated blockers, the repository-global relation, current wait identity/horizon, unblock actor or mechanism, owner action, and whether unrelated work may continue.

Waiting is admitted only through `WAIT-ADMISSION`: exact task and blocking-source identity, causal dependency, changing condition and source, actor/mechanism, polling or notification mechanism, bounded horizon, and expiry state. If no actor or mechanism can change the condition, do not poll. Persist the truthful scoped state while keeping independent frontiers executable.

The active-task projection must fail closed rather than merely decorate the dashboard. Bind current owner-source/correction authority through a separately validated independent receipt, then bind the selected checkpoint's path, Git ref, commit/blob identity, content hash, task ID, branch, and owner-outcome epoch/hash. Never trust a receipt-status label asserted inside the authority projection. Project the affected frontier as `AUTHORIZED`, `BLOCKED_BY_APPLICABLE_BLOCKER`, `BLOCKER_REVALIDATION_REQUIRED`, `REASONING_REVIEW_REQUIRED`, or `INVALID_AUTHORITY`; list its permitted action class, blocked capabilities, and blocker IDs separately from independent frontiers that may continue.

Classify every blocker as `OPERATIONAL` or one of the non-waivable policy classes. Task-declared independence cannot bypass a causally applicable safety, privacy, security, permission, spending, publication, or irreversible-action boundary. Conversely, repository-wide classification alone does not block an operation without the causal edge.

Substantive execution directives require resolved `VALID` authority, an authorized affected frontier whose permitted action class includes `SUBSTANTIVE_EXECUTION`, no applicable/revalidation/ambiguous blocker for that operation, and a valid referenced wait admission. `REASONING_REVIEW_DUE` permits only `REASONING_HANDOFF`; `OWNER_DECISION_REQUIRED` permits evidence preservation and authorized owner-wait handling. The directive must be transactionally compared with the current resolver and wait-admission outputs, including owner receipt, checkpoint, blocker, capability, action-class, and wait identities; self-asserted projection fields cannot authorize execution. Under unresolved, invalid, or ambiguous authority, only typed allowlisted recovery, evidence-preservation, or reasoning-handoff actions may run. Blocker waits bind the exact unblock event; owner waits bind decision ID and action; reasoning waits bind the accepted executor-reasoning handoff and require continuous lease coverage from wait start through next check and declared horizon. Later coverage requires an accepted durable transfer or renewal bound to the exact lease/controller identities. All waits use parsed timestamps and nonterminal expiry states.

### 6.2 GitHub remains canonical where it is strongest

GitHub stores:

- task contract and revision history;
- owner decision records;
- code and architecture;
- branch, commit, and PR history;
- tests and CI;
- durable current-state/recovery artifacts;
- reusable supervision protocols.

### 6.3 Do not fully mirror the systems

The Linear issue contains only operational material:

- `task_id`;
- plain-language title and short objective;
- repository identifier;
- link to the canonical task contract;
- pinned contract revision, Git commit, and SHA-256;
- current runtime directive;
- risk/assurance labels;
- dependencies and state.

Do not copy the entire contract and all evidence bidirectionally. That creates drift and makes conflict resolution ambiguous.

### 6.4 GitHub-only fallback

Use Symphony’s GitHub Issues adapter when:

- the task set is small;
- a new SaaS is undesirable;
- open/closed state is sufficient;
- labels can safely carry the limited workflow metadata.

Do not build a custom GitHub Projects state adapter until the Linear pilot demonstrates a real reason to avoid Linear.

---

## 7. Durable task contract

Every nontrivial task has a versioned contract in the target repository.

### 7.1 Minimum fields

```yaml
schema_version: 1
task_id: MC-2026-000123
revision: 4
title: Build participant recovery flow
repository: u-dont-existDOTcom/example
assurance_lane: iteration   # iteration | decision | release
risk_class: high            # low | medium | high | restricted

objective: >
  The exact user-visible result to produce.

current_baseline:
  ref: main
  commit: abcdef123456...

constraints:
  - id: C-001
    text: Private participant records must remain on the Railway volume.
  - id: C-002
    text: Pro supervisors cannot be required to access GitHub.

non_goals:
  - id: N-001
    text: Do not redesign authentication during this task.

acceptance_criteria:
  - id: A-001
    weight: 30
    text: A returning participant can recover the exact existing record.
    required_evidence:
      - focused test
      - live smoke receipt
  - id: A-002
    weight: 20
    text: A different participant cannot retrieve that record.
    required_evidence:
      - negative authorization test

allowed_scope:
  paths: []
  systems: []

forbidden_actions:
  - production data deletion
  - publication
  - unapproved spending

owner_decisions:
  - decision_id: DEC-003
    status: resolved
    summary: Preserve the existing participant identifier model.

supervision:
  mode: gated             # advisory | gated
  reader: extra_high_optional
  judge: pro_extended
  final_independent_review: true

completion_boundary:
  type: owner_testable_candidate
```

### 7.2 Authority and mutation rules

- Codex may propose a contract revision but may not silently edit authoritative requirements.
- A controller or owner-authorized worker records revisions.
- Every packet pins the contract’s repository path, Git commit, revision, and SHA-256.
- A contract revision automatically invalidates unreconciled packets and reviews.
- Owner decisions become separate durable records and are referenced from the contract.

---

## 8. Symphony integration

### 8.1 Use stock Symphony first

Start from the current reference implementation and specification. Do not fork or port it before the pilot identifies a concrete blocker.

Use Symphony for:

- tracker polling;
- dispatch eligibility;
- per-issue workspaces;
- App Server startup;
- bounded concurrency;
- repeated turns;
- retries/backoff;
- tracker-state reconciliation;
- stopping ineligible workers;
- basic runtime API/state.

### 8.2 One instance per project/repository initially

A single cross-repository scheduler sounds elegant but introduces dynamic cloning, credential scopes, configuration branching, and resource conflicts. Initially run one workflow instance per project or repository and let Mission Control aggregate them.

This preserves a simple rule:

```text
one Symphony workflow -> one repository contract and bootstrap path
```

Cross-project task dependencies remain in Linear and Mission Control.

### 8.3 Do not depend on in-memory Symphony state for audit history

Mission Control persists its own normalized events. After restart it reconciles against:

- Linear issue state;
- Symphony’s current state API;
- process liveness;
- workspace existence;
- Git branch/HEAD;
- open PR and CI state;
- last durable checkpoint.

Never infer that an issue is safe merely because Symphony’s blocked map was cleared by restart.

### 8.4 Runtime state ingestion

Phase 1 should poll Symphony’s JSON state API and emit normalized deltas. Avoid modifying Symphony just to obtain a push stream.

Only add a Symphony event webhook or patch after measuring that polling loses decision-relevant events or imposes unacceptable latency.

### 8.5 Safer execution defaults

- Dedicated Unix account or tightly scoped user service.
- Dedicated workspace root.
- `workspace-write` sandbox by default.
- Network access only when the task needs it.
- Host-side tracker credentials; do not expose raw Linear/GitHub tokens to the child process.
- Per-instance concurrency limits.
- Scratch repository for initial live integration tests.
- Explicit policy for operator-input-required events; never let a run wait indefinitely.

---

## 9. Worker status and checkpoint protocol

### 9.1 Two telemetry classes

#### Native runtime telemetry

Derived from Symphony/App Server/process state:

- started/stopped;
- thread/turn identifiers;
- running/blocked/stalled/retrying/failed;
- tool activity;
- token/rate-limit snapshots when available;
- last runtime event time.

This is used for liveness, not semantic alignment.

#### Semantic worker checkpoint

Emitted at meaningful boundaries by a tiny local CLI or append-only endpoint:

```json
{
  "schema_version": 1,
  "task_id": "MC-2026-000123",
  "run_id": "run_01J...",
  "checkpoint_id": "cp_01J...",
  "contract_revision": 4,
  "base_sha": "...",
  "head_sha": "...",
  "dirty_fingerprint": null,
  "current_step": "Implementing negative authorization test",
  "next_step": "Run focused tests, then exercise recovery in browser",
  "worker_claims": [
    "Recovery lookup now uses the participant-bound identifier"
  ],
  "acceptance_criteria_claims": [
    {"id": "A-001", "status": "partial"},
    {"id": "A-002", "status": "not_verified"}
  ],
  "tests_claimed": [
    {"command": "npm test -- recovery", "result": "passed"}
  ],
  "blockers": [],
  "owner_decision_requested": false,
  "created_at": "2026-08-30T13:00:00Z"
}
```

The checkpoint contains claims. Mission Control independently verifies what it can.

### 9.2 Default cadence

- Runtime liveness: continuous/polled every few seconds.
- Semantic checkpoint: after a meaningful commit, phase boundary, newly discovered blocker, architecture/method change, or approximately every 10–15 active minutes during long uninterrupted work.
- Pro review: trigger-based, not every heartbeat.

### 9.3 Checkpoint requirements

- Prefer a clean commit at review boundaries.
- If the workspace is dirty, capture a binary-safe diff, untracked-file inventory, and deterministic fingerprint.
- A done candidate requires a clean durable snapshot unless the contract explicitly allows an artifact-only result.
- Missing or invalid checkpoints never imply completion.

---

## 10. Evidence acquisition hierarchy

Use this order:

### Level 1 — deterministic local collector (default)

Collect directly from Git/GitHub/CI/runtime:

- contract bytes and hash;
- base/head SHAs;
- branch and dirty state;
- changed-file inventory;
- patch/diff;
- relevant file excerpts;
- commit messages;
- PR metadata;
- exact test commands/results/timestamps;
- CI checks;
- runtime receipts;
- screenshots or other artifacts;
- owner decisions;
- prior unresolved findings.

### Level 2 — Extra High Repository Evidence Reader (optional)

Use when semantic selection across a large repository is needed, GitHub connector retrieval is materially easier, or the deterministic packet would be too large without informed selection.

The reader is an evidence organizer, not the judge.

### Level 3 — worker self-report

Include only in a clearly labeled claims section.

### Level 4 — Pro direct GitHub access

Treat as opportunistic supplemental access only. No review may depend on it.

---

## 11. Versioned evidence packet

Every supervisory turn is tied to one immutable packet.

### 11.1 Packet layout

```text
packet-MC-2026-000123-p017/
  manifest.json
  task-contract.md
  task-contract.json
  current-state.json
  deterministic-findings.json
  worker-claims.json
  acceptance-criteria.json
  changes/
    diff.patch
    changed-files.json
    relevant-excerpts.md
  verification/
    tests.json
    ci.json
    runtime-smoke.json
  artifacts/
    ...
  prior-findings.json
  reader/
    retrieval-manifest.json
    dossier.json              # optional
  prompts/
    extra-high-reader.md
    pro-supervisor.md
  hashes.sha256
```

### 11.2 Manifest fields

```json
{
  "schema_version": 1,
  "packet_id": "pkt_01J...",
  "task_id": "MC-2026-000123",
  "packet_sequence": 17,
  "created_at": "2026-08-30T13:12:00Z",
  "repository": "owner/repo",
  "contract_revision": 4,
  "contract_commit": "...",
  "contract_sha256": "...",
  "base_sha": "...",
  "head_sha": "...",
  "dirty_fingerprint": null,
  "previous_packet_id": "pkt_01J...",
  "prompt_versions": {
    "reader": "reader-v1.0.0",
    "supervisor": "supervisor-v1.0.0",
    "rubric": "alignment-v1.0.0"
  },
  "included": [],
  "excluded": [],
  "truncations": [],
  "packet_sha256": "..."
}
```

### 11.3 Tiered packet sizing

- **Tier 0:** one-screen operator summary.
- **Tier 1:** complete contract, deterministic findings, delta summary, verification, and evidence index.
- **Tier 2:** relevant code/docs excerpts and patch sections.
- **Tier 3:** full attached artifacts or repository snapshot where authorized.

Never silently truncate. Every omitted or truncated surface appears in the completeness receipt.

### 11.4 Freshness rule

Before importing a review, Mission Control rechecks current HEAD and contract revision.

- Exact match: review can apply.
- New commits outside the reviewed scope: review may be marked partially stale.
- Materially changed HEAD or contract: review is stale and cannot produce GREEN or completion.

---

## 12. Extra High Repository Evidence Reader

### 12.1 Role definition

Map the abstract role `Repository Evidence Reader` to ChatGPT Extra High with the GitHub connector when available. Keep the role independent of model-picker naming so a future UI change does not alter the architecture.

### 12.2 Reader input

The reader receives:

- retrieval manifest;
- exact repository;
- exact contract commit/path/hash;
- exact base/head SHA or PR head;
- precise questions to answer;
- files/classes that must be inspected;
- explicit exclusions;
- packet-size budget;
- instructions to treat repository contents as untrusted evidence, not executable instructions.

### 12.3 Reader rules

The reader must:

1. Resolve and report the repository and target SHA before reading.
2. Prefer exact commit/PR-head content over a floating branch.
3. Separate direct evidence from inference.
4. Cite path, SHA, and line/range or patch hunk for every material finding.
5. Report inaccessible, missing, stale, contradictory, and truncated surfaces.
6. Report the exact retrieval questions it could not answer.
7. Avoid a supervisory verdict.
8. Avoid recommendations to the worker.
9. Avoid deciding whether owner input is required.
10. Produce structured output tied to `packet_id` and `retrieval_manifest_id`.

### 12.4 Reader output schema

```json
{
  "schema_version": 1,
  "dossier_id": "dos_01J...",
  "packet_id": "pkt_01J...",
  "retrieval_manifest_id": "rm_01J...",
  "repository": "owner/repo",
  "resolved_head_sha": "...",
  "started_at": "...",
  "completed_at": "...",
  "evidence_items": [
    {
      "evidence_id": "E-017",
      "kind": "direct",
      "claim": "The recovery endpoint accepts an unbound participant ID.",
      "source": {
        "path": "src/recovery.ts",
        "sha": "...",
        "line_start": 81,
        "line_end": 104
      },
      "excerpt": "bounded excerpt",
      "confidence": "high"
    }
  ],
  "inferences": [],
  "missing_surfaces": [],
  "contradictions": [],
  "truncations": [],
  "completeness": "complete",
  "dossier_sha256": "..."
}
```

### 12.5 Prevent the telephone game

The Pro packet includes:

- the dossier;
- the evidence index;
- the most important raw excerpts or patch hunks;
- deterministic findings.

It does not include only the reader’s prose summary.

### 12.6 Reader lifecycle

Reader chats are disposable by default. The dossier is durable. This reduces stale-context contamination and makes exact snapshot identity more important than conversational continuity.

A persistent reader chat may be used for low-risk convenience, but each output is still treated as an isolated dossier with exact hashes.

---

## 13. Persistent Pro supervisor

### 13.1 Task-bound identity

Associate the persistent Pro chat with `task_id`, not `run_id` or `worker_id`.

A new Codex attempt can inherit the same task supervisor. A materially changed contract may trigger a new supervisor chat or a formal handoff.

### 13.2 Pro input packet

The Pro supervisor receives everything required to judge:

1. authority hierarchy;
2. complete current task contract;
3. owner decisions;
4. current assurance lane and risk;
5. deterministic findings;
6. evidence dossier/raw evidence;
7. verification results;
8. current worker claims;
9. prior unresolved supervisory findings;
10. exact requested output schema.

The prompt states explicitly:

> Do not rely on GitHub access. Judge only the supplied versioned packet. Return `NEEDS_MORE_EVIDENCE` rather than guessing.

### 13.3 Two-pass independence for consequential reviews

For high-risk, done-candidate, release, or disputed reviews:

**Pass A — blinded assessment**

- contract;
- objective evidence;
- deterministic findings;
- no worker narrative;
- no prior verdict.

Freeze the findings.

**Pass B — reconciliation**

- reveal worker claims and prior findings;
- identify discrepancies;
- finalize verdict.

For ordinary low-risk iteration, a single structured pass is acceptable, but claims and evidence remain separate sections.

### 13.4 Pro output schema

```json
{
  "schema_version": 1,
  "review_id": "rev_01J...",
  "packet_id": "pkt_01J...",
  "packet_sha256": "...",
  "task_id": "MC-2026-000123",
  "contract_revision": 4,
  "reviewed_head_sha": "...",

  "verdict": "WATCH",
  "traffic_light": "YELLOW",

  "dimensions": {
    "objective_fidelity": 92,
    "constraint_compliance": 88,
    "method_fidelity": 61,
    "scope_discipline": 90,
    "owner_decision_compliance": 100,
    "verification_adequacy": 58,
    "supervisor_confidence": 82
  },

  "hard_vetoes": [],
  "drift_findings": [
    {
      "type": "METHOD_DRIFT",
      "severity": "material",
      "statement": "The implementation changed the identifier model despite the retained owner decision.",
      "evidence_ids": ["E-017", "E-019"]
    }
  ],
  "evidence_gaps": [],
  "acceptance_criteria_assessment": [],

  "recommended_worker_directive": {
    "action": "continue_with_guard",
    "text": "Preserve the participant-bound identifier and add the negative authorization test before further UI work."
  },

  "next_review_trigger": "after focused authorization tests pass",

  "owner_decision_required": false,
  "owner_decision": null,

  "rationale": "Concise evidence-linked final rationale; no hidden chain of thought."
}
```

### 13.5 Allowed verdicts

- `ON_TRACK` — continue under the current contract.
- `WATCH` — continue with a specific guard, evidence request, or nearer checkpoint.
- `REDIRECT` — current path must stop or materially change.
- `NEEDS_MORE_EVIDENCE` — automatic evidence-acquisition loop; not an owner decision.

Execution states such as `BLOCKED`, `FAILED`, or `DONE_CANDIDATE` are not Pro verdicts.

### 13.6 Owner-decision output

Use only when the choice is genuinely outside delegated authority:

```json
{
  "owner_decision_required": true,
  "owner_decision": {
    "question": "Should recovery prioritize backward compatibility or invalidate legacy links?",
    "why_owner_is_required": "This changes user-visible product behavior and data migration policy.",
    "options": [
      {"id": "A", "outcome": "...", "risks": ["..."]},
      {"id": "B", "outcome": "...", "risks": ["..."]}
    ],
    "recommended_default": "A",
    "reversible": false
  }
}
```

Do not escalate ordinary implementation choices that a competent technical lead can resolve within the contract.

### 13.7 Chat rollover

Create a new Pro chat when:

- the contract changes materially;
- accumulated context appears stale or contradictory;
- the supervisor begins repeating superseded findings;
- a release-grade independent review is required.

The handoff contains structured records, not the entire old transcript:

- contract and owner decisions;
- latest packet;
- prior verdicts;
- unresolved findings;
- review/rubric versions;
- old and new chat URLs.

---

## 14. Independent final adjudicator

A persistent supervisor that has coached the worker is not fully independent at a consequential completion boundary.

For high-risk release, publication, deployment, security, scientific-method, therapy, or AskRigor decisions, use a fresh Pro adjudicator that:

- did not coach the implementation;
- receives a blinded packet first;
- sees the exact contract and evidence;
- does not inherit the persistent supervisor’s verdict until findings are frozen.

This is conditional, not universal ceremony. Low-risk reversible iteration should not be slowed by unnecessary duplicate review.

---

## 15. Separate state machines

Never collapse these into one status.

### 15.1 Work-control state — Linear

```text
BACKLOG
READY
IN_PROGRESS
SUPERVISOR_HOLD
REWORK
OWNER_DECISION
HUMAN_REVIEW
MERGING
DONE
CANCELED
DUPLICATE
```

### 15.2 Execution state — Symphony/process

```text
IDLE
STARTING
RUNNING
INPUT_REQUIRED
BLOCKED
STALLED
RETRYING
FAILED
EXITED
STOPPED
```

### 15.3 Judgment state — Pro

```text
ON_TRACK
WATCH
REDIRECT
NEEDS_MORE_EVIDENCE
```

### 15.4 Traffic light — operator projection

```text
GREEN
YELLOW
RED
```

### 15.5 Evidence state

```text
COMPLETE
PARTIAL
STALE
CONTRADICTORY
UNKNOWN
```

### 15.6 Owner-decision state

```text
NONE
REQUESTED
RESOLVED
SUPERSEDED
```

A task can validly be:

```text
work: IN_PROGRESS
execution: RUNNING
judgment: ON_TRACK
traffic: GREEN
progress: 20%
```

Low progress is not drift.

---

## 16. Alignment, progress, verification, and confidence

### 16.1 Do not ask the model for one vibes-based alignment percentage

The Pro supervisor scores dimensions. Mission Control computes the composite.

### 16.2 Recommended alignment formula

```text
alignment =
    0.35 * objective_fidelity
  + 0.25 * constraint_compliance
  + 0.15 * method_fidelity
  + 0.15 * scope_discipline
  + 0.10 * owner_decision_compliance
```

Keep these separate:

- **Progress:** weighted verified acceptance-criteria coverage.
- **Alignment:** fidelity to objective, constraints, method, scope, and decisions.
- **Verification adequacy:** strength and completeness of evidence.
- **Supervisor confidence:** confidence in the semantic judgment.
- **Evidence freshness:** deterministic match to current contract/HEAD.

The alignment number is an operational index, not a calibrated probability.

### 16.3 Hard RED vetoes

Force RED regardless of composite score when evidence establishes:

- explicit owner constraint violation;
- wrong canonical repository, branch, base, or task contract;
- work proceeding through an unresolved owner-decision gate;
- unauthorized destructive, privacy-sensitive, spending, publication, deployment, or irreversible action;
- completion claimed while mandatory hard gates fail or are absent;
- evidence tampering or material packet/HEAD mismatch;
- material scope change that alters the requested outcome without authority;
- prohibited methodology that defeats the purpose of the task.

### 16.4 Default traffic-light rules

**GREEN**

- no hard veto;
- `ON_TRACK`;
- alignment >= 85;
- verification adequacy >= 70;
- supervisor confidence >= 70;
- evidence current enough for the decision.

**YELLOW**

- `WATCH` or `NEEDS_MORE_EVIDENCE`;
- incomplete/stale evidence;
- alignment 60–84;
- low confidence;
- nonblocking drift;
- repeated no-progress loop;
- checkpoint overdue.

**RED**

- hard veto;
- `REDIRECT`;
- alignment < 60 with adequate evidence/confidence;
- genuine owner decision blocking continuation;
- worker continues after a validated hold/redirect.

Thresholds must be calibrated against Joel’s labeled scenarios rather than treated as universal constants.

---

## 17. Drift taxonomy

| Type | Meaning | Typical detector |
|---|---|---|
| `OBJECTIVE_SUBSTITUTION` | Solving a different problem that seems easier or more elegant | Pro comparison to objective |
| `SCOPE_EXPANSION` | Adding unrequested systems/refactors/features | Diff/path detector + Pro |
| `SCOPE_CONTRACTION` | Quietly omitting required outcomes | Acceptance-criteria ledger |
| `CONSTRAINT_VIOLATION` | Breaking explicit owner/project invariant | Deterministic rule or Pro |
| `METHOD_DRIFT` | Using a prohibited or purpose-defeating method | Pro with evidence |
| `AUTHORITY_DRIFT` | Trusting stale handoff/branch instead of canonical state | SHA/contract checks |
| `EVIDENCE_DRIFT` | Claims no longer match tested/current code | Test/HEAD freshness checks |
| `COMPLETION_ILLUSION` | Declaring done without end-to-end proof | Gate and artifact checks |
| `DECISION_BYPASS` | Choosing a material tradeoff without authority | Decision-state check |
| `REPETITIVE_LOOP` | Repeating failures or edits without information gain | Event fingerprinting |
| `RESOURCE_COLLISION` | Parallel workers conflict on shared mutable resource | Dependency/resource declarations |
| `HANDOFF_LOSS` | Important context disappears across worker/chat rollover | Packet completeness checks |
| `RISK_ESCALATION` | Task becomes more consequential than its declared lane | Pro + deterministic change classes |

Every finding must name evidence IDs, severity, and required response.

---

## 18. Review triggers and supervision cadence

### 18.1 Always trigger

- new complex/high-risk task after initial plan;
- contract revision;
- proposed architecture or methodology change;
- authentication, authorization, privacy, migration, billing, deployment, publication, or irreversible-data change;
- deterministic hard-veto signal;
- repeated failure/no-progress loop;
- done candidate;
- owner request.

### 18.2 Risk-adjusted cadence

**Low-risk iteration**

- initial contract sanity check;
- done-candidate review;
- event-triggered review only in between.

**Medium-risk**

- plan checkpoint;
- one or more meaningful implementation checkpoints;
- done candidate.

**High-risk or gated**

- plan/method boundary;
- each consequential phase boundary;
- before crossing a hard gate;
- done candidate;
- fresh independent adjudication where required.

### 18.3 Advisory versus gated review

**Advisory**

- worker may continue reversible in-scope work while review runs;
- a REDIRECT triggers a controlled hold.

**Gated**

- issue moves to `Supervisor Hold` before review;
- Symphony reconciles and stops the worker;
- work resumes only after ON_TRACK/WATCH directive or owner decision.

Do not gate every checkpoint by default.

---

## 19. Controlled redirect flow

A REDIRECT must be a transactional state change, not merely a dashboard warning.

```text
1. Validate review schema, packet hash, task ID, contract revision, and HEAD.
2. Move Linear issue to Supervisor Hold.
3. Observe Symphony stop/release the active run.
4. Write the bounded supervisor directive into Mission Control and the tracker’s managed runtime block.
5. Preserve the old directive and review as append-only history.
6. Move issue to Rework.
7. Symphony resumes in the preserved workspace or starts a new attempt according to policy.
8. Require a checkpoint that explicitly addresses each redirect finding.
```

Initially, steps that mutate Linear require an owner click in Mission Control. After the flow is tested, low-risk validated REDIRECTs may be automatically held/resumed according to per-task policy.

The Pro chat never directly mutates Linear or GitHub.

---

## 20. Owner-decision flow

```text
Pro -> OWNER_DECISION_REQUIRED
Mission Control validates and displays the exact choice
Linear -> Owner Decision (inactive)
Symphony stops/reconciles
Joel chooses in plain language
Mission Control records the decision
Decision is committed to GitHub task authority
Contract revision/hash is updated if required
Linear managed block is updated
Task moves to Rework or Ready
Symphony resumes
```

A decision record includes:

- question;
- options and consequences;
- recommendation;
- Joel’s exact answer;
- effective date;
- affected task/contract revision;
- supersession relation;
- Git commit/hash.

Owner input is not a completion event. The system automatically continues to the next safe action after recording it.

---

## 21. Event model

Use an append-only event store.

### 21.1 Event envelope

```json
{
  "schema_version": 1,
  "event_id": "019...",                
  "idempotency_key": "source:unique-key",
  "task_id": "MC-2026-000123",
  "project_id": "proj_...",
  "worker_id": "worker_...",
  "run_id": "run_...",
  "trace_id": "...",
  "span_id": "...",
  "parent_span_id": "...",
  "sequence": 144,
  "occurred_at": "...",
  "received_at": "...",
  "source": "symphony",
  "type": "CODEX_TURN_COMPLETED",
  "payload": {},
  "artifact_refs": []
}
```

Use UUIDv7 or another time-sortable collision-resistant identifier. Enforce idempotency and detect sequence gaps.

### 21.2 Core event types

```text
PROJECT_REGISTERED
TASK_REGISTERED
CONTRACT_REVISED
OWNER_DECISION_RECORDED
TRACKER_STATE_CHANGED
WORKER_CLAIMED
WORKER_STARTED
CODEX_THREAD_STARTED
CODEX_TURN_STARTED
CODEX_TOOL_EXECUTED
CODEX_TURN_COMPLETED
CODEX_TURN_FAILED
WORKER_INPUT_REQUIRED
WORKER_BLOCKED
WORKER_STALLED
RETRY_SCHEDULED
WORKER_STOPPED
CHECKPOINT_RECEIVED
COMMIT_OBSERVED
FILE_DELTA_OBSERVED
TEST_STARTED
TEST_COMPLETED
CI_UPDATED
ARTIFACT_RECORDED
PACKET_CREATED
READER_DOSSIER_IMPORTED
SUPERVISOR_REVIEW_IMPORTED
REVIEW_INVALIDATED
WATCH_ISSUED
REDIRECT_ISSUED
OWNER_DECISION_REQUESTED
OWNER_DECISION_RESOLVED
DONE_CANDIDATE
VERIFICATION_PASSED
TASK_CLOSED
INTEGRATION_DEGRADED
```

### 21.3 OpenTelemetry compatibility

Use compatible concepts where stable:

- `trace_id`, `span_id`, `parent_span_id`;
- `invoke_agent`;
- `invoke_workflow`;
- `plan`;
- `execute_tool`;
- provider/model/mode metadata.

Do not hard-code the entire database to unstable draft attribute names. Maintain an internal stable schema with an export/mapping layer.

### 21.4 Privacy

Do not store hidden chain of thought. Store:

- final structured output;
- concise evidence-linked rationale;
- tool/action metadata;
- redacted bounded errors;
- content hashes and artifact references.

Full prompts, raw logs, model outputs, and user data are opt-in artifacts with retention rules, not default event payloads.

---

## 22. SQLite and artifact-store design

### 22.1 SQLite rules

- WAL mode.
- Foreign keys enabled.
- One writer: Mission Control daemon.
- Explicit schema migrations.
- Append-only `events` table.
- Rebuildable projection tables.
- Transactional packet/review import.
- Daily local backup while idle or using SQLite’s safe backup API.

### 22.2 Core tables

```text
projects
tasks
task_contract_revisions
acceptance_criteria
tracker_bindings
workers
worker_runs
events
checkpoints
evidence_items
evidence_packets
reader_dossiers
supervisor_sessions
supervisor_reviews
drift_findings
owner_decisions
warnings
artifacts
resource_claims
links
integration_health
```

### 22.3 Large artifact storage

Store large content under:

```text
data/artifacts/sha256/ab/abcdef...
```

Database row:

```text
artifact_id
sha256
media_type
size_bytes
classification
created_at
source
local_path
retention_policy
```

Deduplicate by hash. Verify bytes on read.

### 22.4 Sensitive local metadata

- Chat URLs remain local; do not commit them to public repositories.
- File permissions default to owner-only.
- Restricted projects may use SQLCipher or an encrypted filesystem.
- Never include credentials in packets, events, or chat handoffs.

---

## 23. Mission Control daemon interfaces

### Read APIs

```text
GET /api/v1/projects
GET /api/v1/tasks
GET /api/v1/tasks/:taskId
GET /api/v1/tasks/:taskId/timeline
GET /api/v1/tasks/:taskId/evidence
GET /api/v1/tasks/:taskId/reviews
GET /api/v1/health
GET /api/v1/stream                  # SSE
```

### Append/import APIs

```text
POST /api/v1/events
POST /api/v1/tasks/:taskId/checkpoints
POST /api/v1/tasks/:taskId/packets
POST /api/v1/reader-dossiers/import
POST /api/v1/supervisor-reviews/import
POST /api/v1/owner-decisions
```

### Controlled mutation APIs

```text
POST /api/v1/tasks/:taskId/hold
POST /api/v1/tasks/:taskId/resume
POST /api/v1/tasks/:taskId/redirect
POST /api/v1/tasks/:taskId/close
```

Requirements:

- loopback bind by default;
- local authentication token/session;
- CSRF protection for browser mutations;
- idempotency keys;
- optimistic concurrency using current task/contract revision;
- full event receipt for each mutation;
- no arbitrary shell-command endpoint.

---

## 24. Dashboard information architecture

### 24.1 Main screen: attention queue

Sort in this order:

1. owner decision required;
2. RED;
3. YELLOW/WATCH;
4. done candidate awaiting verification;
5. blocked/stalled;
6. healthy GREEN tasks.

### 24.2 Worker/task card

Show:

- plain-language task title;
- repository/project;
- worker name;
- work-control state;
- execution state;
- current step;
- verified progress;
- alignment index;
- GREEN/YELLOW/RED;
- ON_TRACK/WATCH/REDIRECT;
- verification adequacy;
- supervisor confidence;
- evidence freshness;
- last runtime event;
- last semantic checkpoint and SHA;
- latest tests/CI;
- top drift warning;
- next review trigger;
- links: Linear, GitHub task contract, branch/PR, Codex session, Pro supervisor, Extra High dossier chat.

### 24.3 Detail screen

Tabs:

```text
Overview
Contract
Timeline
Changes
Evidence
Tests
Supervisor
Decisions
Integrations
```

### 24.4 Main-screen exclusions

Do not show a live raw log firehose, giant transcript, every tool call, or every changed file. Those belong one click deeper.

### 24.5 Operator actions

- Open/reuse Codex chat.
- Open/reuse Pro supervisor chat.
- Generate packet.
- Generate Extra High retrieval prompt.
- Import dossier/review.
- Hold worker.
- Apply validated redirect.
- Record owner decision.
- Resume worker.
- Mark a finding resolved with evidence.

Every action displays the plain-language effect before identifiers.

---

## 25. Browser and ChatGPT web integration

### 25.1 Critical-path rule

ChatGPT web automation is convenience, not infrastructure truth.

Repository retrieval uses authenticated CLI or local Git whenever those routes
satisfy the capability. Do not open repository browser tabs merely to acquire
evidence already available through deterministic tooling. Before any headed
browser mutation, instantiate `templates/BROWSER-OPERATION-RECEIPT.json` and
record the needed capability, alternatives, necessity, baseline ownership,
one-tab transient cap, same-session actions, and cleanup. The claimed
`agentOpenedTabIds` must equal successful `OPEN` actions plus exact same-session,
same-transaction proofs in an immutable
`templates/BROWSER-OWNERSHIP-REGISTRY.json`; cleanup must reconcile opened,
successfully closed, and remaining tab IDs exactly.

The system must still work through:

- generated packet files;
- copyable prompts;
- manual paste/upload;
- structured JSON import.

### 25.2 Brave operating mode

- Reuse a dedicated Brave profile and existing tabs.
- Keep headed windows on a secondary workspace/monitor and avoid stealing focus.
- Default other browser operations to headless.
- Persist task-to-chat URL mapping locally.
- Use clear chat titles, for example:
  - `[MC][MC-2026-000123][PRO SUPERVISOR]`
  - `[MC][MC-2026-000123][EXTRA HIGH READER][P017]`

### 25.3 Relay boundaries

The optional relay may:

- open a known chat URL;
- create a new chat when explicitly required;
- place prompt/packet content on the clipboard;
- upload selected packet files;
- copy the final structured response for import.

It must not:

- scrape hidden reasoning;
- infer success merely from DOM text;
- silently submit consequential prompts;
- handle credentials;
- become the only copy of a review;
- use a chat response without packet-ID/hash validation.
- navigate or close an owner-existing, protected, unknown-ownership, or
  other-session tab;
- infer who closed a stale or absent tab;
- exceed one agent-opened transient tab without a recorded necessity exception.

### 25.4 Model-surface recording

Use `templates/REASONING-SURFACE-OBSERVATION-RECEIPT.json` for current browser
evidence. Bind the signed-in surface and externally supplied canonical,
non-anonymous account reference, exact visible mode before
submission, transaction and conversation session, exact submitted payload, one
completed response and response digest, and exact visible mode afterward.
Each verified observation needs a nonempty evidence reference and strict
RFC3339 timezone-bearing observation time. The relying party supplies exact
admission-question bytes and exact canonical declarative transform-spec bytes;
the evaluator's fixed implementation must reproduce the submitted bytes twice.
A transform description, output hash, arbitrary callable, or stateful callable
is insufficient. The transform class is non-subclassable, exact-type checked,
and executed through the evaluator's non-virtual implementation. Registry
inputs are exact-type checked and their complete canonical records, identity,
digest, head, and order are deterministically rebuilt and compared at every
evaluator and resolution boundary. A factory label or transferable construction
token is not evidence of trust; a direct field constructor, subclass, partial
record, or immutable-looking mapping is not a registry. Schema `date-time`
checks validate the real RFC3339 calendar value, not only a matching string
shape. Runtime use applies that same check to every declared timestamp,
including claim creation/expiry, transition and reproduction times, receipt and
nested observation times, verdict issue/admission, and the top-level browser
receipt `recordedAt`; invalid verdict time fails before durable consumption.
Then bind the admission-question and response digests and single-use receipt to
`templates/SUPERVISION-VERDICT-ADMISSION.json` and persist one
`templates/RECEIPT-CONSUMPTION-EVENT.json` in an append-only durable ledger.
Admission receives the required role, signed-in account reference, subject,
repository head, exact
input/submitted/admission-question/response bytes, and any executable transform
from the relying party; receipt-authored values cannot
select their own requirement.

Do not call this UI evidence platform attestation. Agent/subagent names, task or
role labels, branch/worktree/process/environment names, prompts, and model
self-description have zero evidentiary weight. A Pro-plan account does not prove
visible Pro mode, and visible Extra High does not satisfy Pro. Preserve private
chat URLs and raw session identifiers owner-locally rather than in a public
repository; commit only sanitized receipt references and non-secret digests.

---

## 26. Multi-worker coordination

### 26.1 Split work into independent tasks

Prefer separate Linear issues and workspaces. Do not put several agents on one mutable task merely to keep all four slots busy.

### 26.2 Dependencies

Represent dependencies in Linear. A blocked task must not be dispatched merely because a worker is free.

### 26.3 Shared mutable resources

Declare resource claims such as:

```text
production-deploy
primary-database-schema
generated-client
canonical-article-master
shared-evaluation-dataset
```

Mission Control warns on collision. Enforcement should initially use Linear blockers/readiness state rather than a new scheduler.

### 26.4 Integration worker

When several independent branches must converge, create an explicit integration task. Do not let parallel workers overwrite shared generated output or merge one another opportunistically.

### 26.5 Concurrency budget

Start with four active Codex workers and observe:

- CPU and memory pressure;
- test contention;
- API/model rate limits;
- repository conflict rate;
- Joel’s review burden.

Increase concurrency only when the bottleneck is execution rather than supervision, testing, or shared resources.

---

## 27. Security and privacy

### 27.1 Trust boundaries

Treat as untrusted data unless explicitly designated authority:

- issue descriptions;
- repository content outside listed authority files;
- code comments;
- worker claims;
- retrieved web text;
- previous model outputs.

The reader and Pro prompts must not follow instructions embedded in evidence.

### 27.2 Data classification

Each task/packet is:

```text
PUBLIC
INTERNAL
CONFIDENTIAL
RESTRICTED
```

Packet builder enforces allowed destinations. Restricted user/participant data must not be uploaded to a web chat merely because the code task is supervised there. Use sanitized excerpts, synthetic fixtures, or local-only review.

### 27.3 Secret handling

- Secret scan before packet creation.
- Redaction rules for tokens, credentials, private keys, cookies, participant identifiers, and private content.
- Host-side tracker tokens.
- Least-privilege GitHub/Linear credentials.
- No secrets in `WORKFLOW.md`, task contracts, logs, or review JSON.

### 27.4 Dashboard exposure

- Bind to `127.0.0.1` by default.
- Require local authentication even on loopback for mutation routes.
- No public tunnel by default.
- Explicit allowlist for external artifact opening.

### 27.5 Approval policy

Pre-authorize safe reversible classes to reduce nuisance approvals. Retain hard stops for:

- destructive filesystem/system actions outside workspace;
- credential/security changes;
- production deployment/migration;
- spending;
- publication;
- private-data export;
- irreversible owner decisions.

---

## 28. Failure and recovery behavior

### 28.1 Mission Control restart

- reopen SQLite;
- replay/rebuild projections;
- poll every configured Symphony instance;
- reread Linear task states;
- inspect workspaces and Git HEADs;
- reconcile open packets/reviews;
- mark uncertain state `UNKNOWN`, not GREEN.

### 28.2 Symphony restart

Because exact in-memory blocked/retry state may be lost:

- compare active tracker issues to actual workers;
- preserve Mission Control’s durable blocked/decision records;
- do not redispatch a task in `Supervisor Hold` or `Owner Decision`;
- detect duplicate attempts by `task_id` and workspace/branch identity.

### 28.3 GitHub changed during review

- mark packet stale;
- preserve the old review as historical evidence;
- create a new packet against current HEAD;
- never transplant GREEN onto unreviewed code.

### 28.4 Reader failure or connector incompleteness

- fall back to deterministic local packet;
- mark dossier missing/partial;
- continue reversible low-risk iteration if the review is advisory;
- hold a hard-gated/release decision until adequate evidence exists.

### 28.5 Pro outage or usage limit

- set `SUPERVISION_DEGRADED`;
- continue low-risk reversible work under explicit policy;
- block only the boundary that actually requires Pro judgment;
- do not substitute an unauthorized weaker judge merely to clear the gate.

### 28.6 Invalid review output

If JSON/schema/hash validation fails:

- preserve raw response as an artifact if allowed;
- mark `REVIEW_INVALID`;
- regenerate the import prompt or request a corrected structured answer;
- never interpret malformed prose as ON_TRACK.

### 28.7 Worker ignores redirect

- move issue to inactive `Supervisor Hold`;
- wait for Symphony reconciliation;
- stop the process if required by documented policy;
- preserve workspace;
- inject the exact redirect into the managed runtime block;
- resume as `Rework`.

### 28.8 Packet too large

- preserve the full local artifact set;
- produce tiered packet/index;
- use the reader to select relevant evidence;
- disclose all exclusions/truncations;
- allow Pro to return `NEEDS_MORE_EVIDENCE` with exact requested evidence IDs.

---

## 29. Evaluation and calibration program

### 29.1 Scenario bank

Build from real failures, including:

- wrong branch or stale handoff treated as authority;
- worker says done while end-to-end behavior fails;
- prohibited humanization method despite green tests;
- unresolved owner decision bypassed;
- unnecessary broad refactor;
- omitted acceptance criterion;
- excessive testing loop with no information gain;
- missing live validation;
- shared-resource collision;
- GitHub reader returns incomplete/truncated evidence;
- head changes after packet creation;
- worker claim conflicts with code;
- genuinely aligned but low-progress worker;
- creative valid implementation that differs from an expected path.

### 29.2 Metrics

- hard-violation recall;
- false RED rate;
- false GREEN rate;
- drift-detection latency;
- packet completeness;
- stale-review rate;
- evidence citation accuracy;
- owner-decision precision;
- unnecessary owner interruptions;
- time from redirect to corrected checkpoint;
- review/token/usage cost;
- recovery correctness after process restart;
- disagreement between persistent supervisor, fresh adjudicator, and Joel.

### 29.3 Calibration

- Joel labels a small representative set.
- Compare model output to those labels.
- Maintain both positive and negative cases.
- Include `Unknown` cases.
- Recalibrate when prompt/rubric/model surface materially changes.
- Never optimize solely for the composite alignment score.
- Read sampled review transcripts and evidence packets; aggregate metrics alone are insufficient.

### 29.4 Extra High bridge experiment

Compare three routes on the same tasks:

```text
A. Deterministic packet -> Pro
B. Deterministic packet + Extra High dossier -> Pro
C. Pro attempts direct GitHub retrieval
```

Measure completeness, correctness, review latency, cost/limits, stale evidence, and owner burden.

Keep the Extra High stage only if it materially improves decision quality or packet efficiency.

---

## 30. Recommended repository structure

For a dedicated implementation repository:

```text
codex-mission-control/
  AGENTS.md
  README.md
  WORKFLOW.md
  apps/
    daemon/
    web/
  packages/
    contracts/
    event-store/
    symphony-adapter/
    tracker-adapter/
    github-evidence/
    packet-builder/
    supervision/
    browser-relay/          # optional
  schemas/
    task-contract.schema.json
    checkpoint.schema.json
    evidence-packet.schema.json
    reader-dossier.schema.json
    supervisor-review.schema.json
    owner-decision.schema.json
  prompts/
    reader/
    supervisor/
    adjudicator/
  evals/
    scenarios/
    fixtures/
    expected/
  docs/
    architecture/
    adr/
    operations/
  scripts/
  data/                     # ignored; local runtime only
```

Do not create every package on day one. Extract packages only after real boundaries emerge. The required process boundary is daemon versus web app; other modules may begin inside the daemon.

---

## 31. Initial technology choices

### Mission Control daemon

- Node.js + TypeScript.
- Fastify or similarly small HTTP layer.
- SQLite with a mature migration/query library.
- Zod/JSON Schema validation at every external boundary.
- File-based content-addressed artifact store.
- Polling adapters for Symphony, Linear, and GitHub.

### Web app

- Next.js + React + TypeScript.
- Server-rendered initial state plus SSE updates.
- No direct SQLite access.
- Minimal component system focused on dense operational readability.

### Live updates

Use SSE rather than WebSockets because the dominant flow is daemon-to-dashboard state updates. Use ordinary authenticated POST requests for operator actions.

### Process management

- Development: one local command or Compose profile.
- Daily local operation: `systemd --user`, a small process supervisor, or hardened containers.
- Symphony/Codex workspaces remain isolated from the web app.

---

## 32. Phased rollout

### Phase 0 — architecture and contracts

Deliver:

- frozen architecture;
- task/checkpoint/packet/review schemas;
- drift taxonomy;
- eval scenario bank;
- gap audit of the existing local dashboard against Symphony.

Exit criterion: no custom scheduler work begins before the Symphony gap audit.

### Phase 1 — read-only one-worker pilot

- Install/run stock Symphony against a scratch repository.
- Use Linear as the control plane.
- Poll Symphony state into Mission Control.
- Collect deterministic GitHub evidence.
- Generate a packet.
- Manually submit to one Pro chat and import structured review.
- No automatic redirects.

Exit criteria:

- exact task/worker mapping;
- packet and review hashes validate;
- restart reconciliation works;
- Pro can judge without GitHub.

### Phase 2 — four-worker dashboard

- One or more Symphony instances aggregated.
- Four task cards visible simultaneously.
- Persistent Pro links.
- semantic checkpoints;
- deterministic warnings;
- attention queue;
- owner decision inbox.

Exit criterion: Joel can supervise four active tasks without reading raw logs.

### Phase 3 — Extra High reader and controlled redirect

- Add retrieval manifest/dossier protocol.
- Run A/B comparison against direct packets.
- Add owner-triggered hold/redirect/resume transaction.
- Persist all state transitions.

Exit criterion: a REDIRECT reliably stops and reorients the correct worker without affecting others.

### Phase 4 — hardening and calibration

- privacy classification/redaction;
- resource collision warnings;
- independent final adjudicator;
- scenario evals;
- backup/recovery drills;
- integration health dashboard.

### Phase 5 — optional browser convenience

- dedicated Brave relay;
- open/reuse chats;
- upload/copy helpers;
- structured response capture.

Do not make this phase a prerequisite for trustworthy supervision.

### Fork/replace Symphony trigger

Fork or implement a hardened Symphony-compatible runner only when a documented production requirement cannot be satisfied by:

- current adapters;
- `WORKFLOW.md`;
- hooks;
- a thin wrapper;
- Mission Control’s external state/evidence layer.

The trigger must name the exact missing capability and benchmark the replacement against stock Symphony.

---

## 33. Implementation acceptance criteria

The architecture is successfully instantiated when all of the following are demonstrated:

1. Four concurrent workers appear on one dashboard.
2. Each card distinguishes work state, execution state, progress, alignment, verification, confidence, and freshness.
3. A task can be GREEN at low progress.
4. A worker on the wrong branch is deterministically RED or held.
5. A Pro supervisor can issue an evidence-linked verdict without GitHub access.
6. An Extra High dossier is tied to an exact repository SHA and discloses missing/truncated evidence.
7. A changed HEAD invalidates the prior completion judgment.
8. A malformed or mismatched Pro response cannot become ON_TRACK.
9. `NEEDS_MORE_EVIDENCE` loops automatically without bothering Joel.
10. A genuine owner decision stops only the affected task.
11. Recording Joel’s decision causes automatic safe resumption.
12. A validated redirect stops and restarts the correct task with the directive preserved.
13. Mission Control restarts and reconstructs state from its event store and external systems.
14. Symphony restarts do not erase durable owner-decision or supervision holds.
15. Worker claims remain distinguishable from independent evidence.
16. Sensitive packet content is blocked or redacted according to classification.
17. Main-screen attention order surfaces owner decisions and RED tasks first.
18. Codex, Pro, Extra High, Linear, GitHub, branch/PR, and artifact links are directly usable.
19. Chat automation failure does not destroy or falsify a review.
20. The full supervision architecture and prompts are recoverable from GitHub without old chat context.

---

## 34. Explicit non-goals

Do not build at this stage:

- a general-purpose distributed workflow engine;
- a multi-tenant SaaS control plane;
- a replacement for Linear;
- a replacement for GitHub;
- a custom Codex App Server protocol;
- an autonomous supervisor that changes owner intent;
- a one-number “truth score” for a task;
- storage of hidden model chain of thought;
- full raw transcript ingestion by default;
- critical-path DOM scraping of ChatGPT;
- automatic production deployment or merging merely because Pro returns GREEN;
- parallel workers on shared mutable state without explicit decomposition/coordination;
- a hardened Symphony rewrite before the stock baseline is tested.

---

## 35. Known limitations and unresolved experiments

- ChatGPT web modes and connectors can change; role contracts must outlive product labels.
- Web chats do not expose a reproducible exact backend model identity.
- GitHub connector retrieval must be tested for exact-SHA fidelity and completeness.
- Model judges remain biased and can be overconfident.
- Persistent supervisors can become anchored by prior interactions.
- Stock Symphony is prototype software and retains some state only in memory.
- Multi-repository task graphs may eventually justify a higher-level orchestrator, but that need is unproven.
- The correct supervision cadence must be calibrated against cost, limits, drift latency, and Joel’s attention.
- Alignment thresholds require empirical calibration and should not be treated as scientific probabilities.

---

## 36. Decision register

| Decision | Choice | Reason |
|---|---|---|
| Execution baseline | Stock Symphony pilot | Avoid rebuilding solved scheduler/workspace/App Server machinery |
| Live task tracker | Linear | Rich workflow states, blockers, and strong current Symphony integration |
| Durable authority | GitHub | Versioned contracts, code, evidence, CI, and recovery |
| Dashboard backend | Separate TypeScript daemon | Durable polling/events independent of Next.js lifecycle |
| Persistence | SQLite event store + artifact files | Lightweight local auditability and replay |
| Live UI transport | SSE | One-way updates dominate; simpler than WebSockets |
| Evidence default | Deterministic local collection | Exact, cheap, reproducible |
| Semantic repository bridge | Optional Extra High reader | Solves Pro GitHub limitation without making reader the judge |
| Semantic judge | Persistent task-bound Pro chat | Continuity plus independent high-reasoning supervision |
| Final high-risk review | Fresh blinded Pro adjudicator | Prevent coaching/anchoring from masquerading as independence |
| Alignment | Weighted rubric dimensions | Reduces false precision and exposes failure type |
| Redirect authority | Validated record, initially owner-triggered | Prevent model output from directly controlling workers |
| Browser automation | Best-effort convenience | Web UI is not a stable systems interface |
| Symphony fork | Deferred behind measured gap | Benchmark before bespoke infrastructure |

---

## 37. Source baseline

This architecture was developed after a bounded scan of:

- OpenAI’s Symphony article, language-neutral specification, and current Elixir reference implementation;
- OpenAI’s harness-engineering guidance;
- Anthropic’s long-running-agent harness, evaluator-agent, parallel-agent, and agent-evaluation guidance;
- emerging agent-as-a-judge and software-agent trajectory research;
- OpenTelemetry’s developing GenAI agent/workflow/tool semantic conventions;
- the current `u-dont-existDOTcom/universal-dev-architecture` repository policies on repository authority, independent evaluation, assurance lanes, test efficiency, and research before reinvention.

The novel remainder is deliberately narrow: **GitHub-grounded evidence packaging for GitHub-unreliable Pro web supervisors, objective-drift judgment, owner-decision gating, and attention-oriented multi-worker supervision.**
