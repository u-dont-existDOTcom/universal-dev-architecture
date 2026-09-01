# Mission Control — Symphony Gap Audit and One-Worker Pilot

**Status:** Ready for Codex execution  
**Date:** 2026-08-30  
**Assurance lane:** Decision, then Iteration  
**Architecture authority:** PR #42 on branch `architecture/codex-pro-supervision-mission-control-20260830`

## 1. Objective

Inspect the actual current Mission Control implementation and compare it against stock OpenAI Symphony plus the current scarce-Pro/context-lifecycle architecture before writing more orchestration code.

Then build the smallest read-only one-worker pilot that proves:

- exact task/worker identity;
- Symphony runtime ingestion;
- deterministic evidence packet creation;
- optional Extra High evidence-reader handoff;
- a focused Pro review that does not require GitHub access;
- structured review import tied to packet, contract revision, and HEAD;
- restart-safe Mission Control state;
- Pro allocation only when a named decision justifies it.

Do not proceed directly to a four-worker production-style implementation.

---

## 2. Required read order

Read fresh:

1. current owner instructions;
2. repository-local authority for the existing Mission Control implementation, if any;
3. `AGENTS.md`, repository map, current-state checkpoint, and active task lock in that implementation;
4. current default-branch and all active Mission Control branches/worktrees;
5. Universal architecture PR #42:
   - `patterns/codex-pro-supervision-mission-control.md`
   - `patterns/codex-supervision-intelligence-routing-and-context-lifecycle.md`
   - `audits/2026-08-30-codex-pro-supervision-existing-work-scan.md`
6. current `openai/symphony` `SPEC.md` and reference-implementation documentation;
7. actual local processes, ports, SQLite files, event schemas, and dashboard behavior.

GitHub and actual runtime state are canonical. Do not trust an old chat summary for implementation status.

---

## 3. Owner correction that must govern the audit

Do not evaluate the implementation against a “one Pro chat per worker, always active” design.

The required model is:

```text
logical supervision lane per task
    -> deterministic checks by default
    -> Extra High for repository reading / ordinary semantic review
    -> focused Pro only for highest-intelligence decisions
    -> fresh Pro only when independent adjudication matters
```

Priority Pro uses include:

- therapy-answer semantics, technique, safety, relational interpretation, and difficult edge cases;
- AskRigor methodological flaws, conclusion validity, protocol conflicts, evidence sufficiency, and access boundaries;
- genuine high-uncertainty, high-consequence decisions not resolved by the contract or Extra High.

Routine implementation, GitHub retrieval, tests, plumbing, UI changes, and ordinary code review must not consume Pro.

Related Pro reviews reuse one scope-bound chat while context remains healthy. Mission Control must use compact authority capsules, delta packets, context-pressure tracking, and explicit rollover criteria rather than creating a new chat for every checkpoint or retaining one chat indefinitely.

---

## 4. Preserve a diagnostic snapshot before modification

Record:

```text
implementation repository or local path
current branch and HEAD
all relevant branches/worktrees
uncommitted changes
running processes and ports
current database/schema
current API routes
current dashboard screenshots
current worker/supervisor event formats
current chat-link behavior
current tests and their last exact results
```

If implementation work exists only locally, preserve a recovery branch/archive before changing it. Do not create a competing repository until the existing state has been identified.

---

## 5. Diagnostic-only comparison

For each current component, classify:

```text
KEEP
ADAPT
REPLACE_WITH_SYMPHONY
DELETE_AS_DUPLICATE
DEFER
UNKNOWN / NEEDS_EVIDENCE
```

### 5.1 Symphony-owned capabilities

Check whether current code duplicates:

- tracker polling;
- issue eligibility;
- worker dispatch;
- per-task workspace creation;
- Codex App Server launch and continuation;
- concurrency limits;
- retry/backoff;
- tracker reconciliation;
- terminal-state stopping/cleanup;
- runtime state API;
- basic process observability.

Default decision: reuse stock Symphony unless a tested, decision-relevant gap is demonstrated.

### 5.2 Mission-Control-owned capabilities

Identify existing support for:

- append-only normalized events;
- task contract identity/revision/hash;
- deterministic evidence collection;
- semantic worker checkpoints;
- worker claims separated from evidence;
- versioned packet creation;
- Extra High dossier import;
- Pro review import and validation;
- progress/alignment/verification/confidence separation;
- drift taxonomy;
- owner-decision gates;
- context capsules and chat epochs;
- Pro scarcity/routing;
- dashboard attention ordering;
- direct Codex/Pro/Extra High/GitHub/tracker links;
- restart reconciliation.

### 5.3 Current architecture risks

Explicitly look for:

- one-number alignment without rubric dimensions;
- one Pro chat created for every worker;
- Pro calls on heartbeats rather than decision triggers;
- Pro expected to inspect GitHub;
- whole-history packet resends;
- no packet/HEAD freshness validation;
- worker self-report treated as evidence;
- dashboard process owning long-running polling state;
- Next.js dev/server lifecycle used as the daemon;
- mutable current-state rows with no append-only history;
- chat URL or private data committed publicly;
- browser DOM automation on the critical path;
- automatic redirect/merge/deploy from unvalidated model prose;
- duplicated scheduler logic that Symphony already supplies.

---

## 6. Required audit output

Return a short owner-facing audit first:

### Actually complete

Only capabilities demonstrated in current code/runtime.

### Partially complete

State exact missing boundary.

### Not implemented

Do not infer from planned files.

### Duplicated by Symphony

Name current code and exact Symphony replacement.

### Regressions and risks

Prioritize semantic drift, authority, data, privacy, and recovery risks.

### Recommended keep/delete/adapt map

Include file/module identifiers as locating metadata after plain-language descriptions.

### Next smallest pilot

Specify exact files and processes to touch.

Do not begin broad refactoring before freezing this audit.

---

## 7. One-worker pilot topology

```text
scratch or low-risk tracker task
        -> stock Symphony
        -> one isolated Codex workspace
        -> Symphony JSON state/API
        -> Mission Control daemon adapter
        -> SQLite append-only event store
        -> deterministic Git/GitHub evidence packet
        -> optional Extra High reader dossier
        -> focused Pro review only for a chosen semantic decision
        -> schema/hash/HEAD-validated import
        -> read-only dashboard projection
```

No automatic redirect, merge, deployment, or owner-decision mutation in the pilot.

---

## 8. Pilot task selection

Choose a low-risk repository or scratch fixture with:

- an explicit task contract;
- a small real code change;
- deterministic tests;
- one semantic review question that can justify a focused Pro demonstration;
- no private participant/therapy data;
- no production deployment;
- no spending or publication.

The Pro demonstration may use a synthetic therapy/AskRigor-style semantic fixture if the real implementation task does not warrant Pro. Do not manufacture Pro use for ordinary code merely to exercise the pipeline without labeling it a test fixture.

---

## 9. Minimum schemas for the pilot

Implement only the fields required to prove identity and lifecycle.

### Task contract

```text
task_id
revision
objective
constraints
non_goals
acceptance criteria
risk/assurance lane
repository
base commit
owner decisions
supervision route
```

### Event envelope

```text
event_id
idempotency_key
task_id
run_id
source
type
occurred_at
received_at
payload
artifact refs
```

### Checkpoint

```text
task_id
run_id
contract revision
base/head SHA
current/next step
worker claims
acceptance-criterion claims
test claims
blocker/owner-decision flags
```

### Packet manifest

```text
packet_id
task_id
contract revision/hash
base/head SHA
included/excluded/truncated surfaces
prompt/rubric versions
packet hash
```

### Review import

```text
review_id
packet ID/hash
task ID
contract revision
reviewed HEAD
verdict
dimensions
hard vetoes
drift findings
evidence gaps
next directive/trigger
owner-decision state
```

### Context capsule / Pro epoch

```text
scope key
chat epoch
contract revision/hash
owner decisions
unresolved findings
last reviewed HEAD
current HEAD
next decision
context estimate/pressure
rollover state
```

---

## 10. Context and Pro-routing pilot requirements

The pilot must prove:

1. A worker can run with `NO_PRO_NEEDED`.
2. Extra High can be selected without creating a Pro chat.
3. A Pro request names the decision, why Extra High is insufficient, and what the answer can change.
4. The Pro packet is self-contained and does not instruct Pro to inspect GitHub.
5. The packet uses a compact capsule plus current delta.
6. A second related Pro checkpoint reuses the same chat epoch.
7. A simulated context-pressure threshold prepares a deterministic rollover capsule.
8. A new chat epoch can recover active owner decisions and unresolved findings without the old transcript.
9. `NEEDS_MORE_EVIDENCE` routes back to deterministic/Extra High evidence collection.
10. A review against stale HEAD is rejected.

---

## 11. Implementation constraints

- Keep stock Symphony outside the Mission Control codebase unless a thin wrapper/config is required.
- Do not fork Symphony during this pilot.
- Keep the Mission Control daemon separate from Next.js.
- One process owns SQLite writes.
- Use SSE for dashboard updates unless a measured requirement needs WebSockets.
- Bind locally by default.
- Do not store hidden chain of thought.
- Keep large artifacts content-addressed outside SQLite.
- Keep chat URLs and private runtime metadata local and ignored.
- Validate every imported model artifact with schema, task/packet identity, contract revision, and HEAD.
- Do not add browser automation until manual packet/review exchange works.
- Use focused tests during implementation; run complete repository gates only at the appropriate completion boundary.

---

## 12. Pilot acceptance criteria

The pilot is complete only when demonstrated from fresh state:

1. Stock Symphony starts one Codex worker from a tracker task.
2. The worker uses an isolated workspace.
3. Mission Control observes state without owning dispatch.
4. Events persist and replay after Mission Control restart.
5. Worker claims and deterministic evidence are visibly separate.
6. A packet has exact contract and code identity plus SHA-256.
7. Extra High dossier import records exact repository/HEAD and missing/truncated evidence.
8. Pro can issue a valid decision-specific review without GitHub access.
9. A mismatched or stale review fails closed.
10. Dashboard distinguishes work, execution, judgment, evidence, and owner-decision states.
11. Dashboard shows Pro as optional and explains the active route.
12. Context pressure and chat epoch are represented.
13. No custom scheduler capability remains merely because it existed before the audit.
14. No automatic consequential mutation is enabled.
15. The exact setup, run, test, and recovery commands are durable in GitHub.

---

## 13. Stop conditions requiring owner input

Pause only for:

- inability to identify the current implementation/repository after exhaustive local inspection;
- a choice that would discard unique existing work;
- creation of a new canonical repository when a plausible existing authority remains unresolved;
- Linear account/token setup or another unavailable credential;
- destructive cleanup;
- production deployment;
- spending;
- publication;
- a genuine product/policy tradeoff not fixed by the architecture.

Do not stop merely because:

- stock Symphony uses Elixir;
- the current dashboard uses TypeScript;
- Pro is unavailable;
- Linear is not yet configured;
- a routine implementation choice has several safe options.

Continue all independent safe audit/pilot work and preserve the exact blocker.

---

## 14. Required durable closeout

Commit:

- frozen diagnostic audit;
- current implementation map;
- Symphony overlap matrix;
- pilot architecture and schemas;
- exact commands and test receipts;
- screenshots/artifacts;
- unresolved gaps;
- next safe implementation step;
- a concise current-state checkpoint.

The owner-facing response must provide the usable audit/pilot artifact directly, not only branch or repository identifiers.
