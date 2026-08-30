# Codex Supervision Intelligence Routing and Context Lifecycle

**Status:** Required owner correction and companion to `codex-pro-supervision-mission-control.md`  
**Date:** 2026-08-30  
**Authority:** Current owner correction  

## 1. Normative correction

This pattern supersedes any reading of the Mission Control architecture that implies:

- one always-active Pro chat for every Codex worker;
- Pro review on every checkpoint or heartbeat;
- Pro as the default repository reader;
- a new Pro chat for every task step;
- keeping one Pro chat alive indefinitely regardless of context pressure.

The corrected rule is:

> Every durable task has a logical supervision lane. Most decisions are handled by deterministic evidence and ordinary Codex/Extra High review. A Pro chat is allocated only when a specific decision requires the highest available semantic judgment. Once allocated, a related Pro chat is reused while its scope and context remain healthy; it rolls over only at explicit context, authority, independence, or contamination boundaries.

This correction preserves the core Mission Control objective: detect objective drift and route owner attention. It changes the cost model and session topology, not the evidence or authority model.

---

## 2. Why Pro is scarce

Pro reasoning is reserved for decisions where lower-cost routes are materially less reliable, especially:

- evaluating therapy-companion answers, techniques, framing, causal interpretations, safety boundaries, and emotionally consequential edge cases;
- evaluating AskRigor research conclusions, methodological flaws, protocol conflicts, evidentiary sufficiency, access boundaries, and the severity/impact of research defects;
- resolving high-uncertainty architecture or product tradeoffs where established evidence does not determine one reversible path;
- adjudicating a material disagreement between the worker, Extra High reviewer, deterministic evidence, or an earlier supervisor;
- reviewing high-risk release/publication/deployment boundaries when semantic failure would not be caught by deterministic gates;
- determining whether a newly discovered choice genuinely requires the owner.

Pro is normally **not** used for:

- reading GitHub;
- collecting files or diffs;
- routine implementation review;
- ordinary test failures;
- state reconciliation;
- formatting, plumbing, migrations already fixed by contract, or bounded refactors;
- dashboard presentation changes;
- retries caused by missing evidence;
- repeated confirmation of an unchanged conclusion;
- work whose outcome cannot change based on the review.

Before requesting Pro, Mission Control must be able to state:

```text
Decision under review:
Why deterministic checks are insufficient:
Why Extra High is insufficient:
What the Pro answer can change:
What happens if Pro is unavailable:
```

If these fields cannot be completed, Pro is not justified.

---

## 3. Supervision routing ladder

### Tier 0 — deterministic control

Use for facts and hard invariants:

- repository, branch, base, and HEAD identity;
- contract revision/hash;
- changed paths;
- test and CI results;
- stale evidence;
- missing artifacts;
- checkpoint timing;
- unresolved owner-decision state;
- unauthorized path/resource collision;
- packet/review schema and hash validation.

Output:

```text
PASS
WARN
HOLD
FAIL
UNKNOWN
```

### Tier 1 — worker self-check and repository contract

Codex evaluates its own work against:

- task contract;
- acceptance criteria;
- repository instructions;
- focused tests;
- current-state checkpoint.

Its output remains a claim until independently verified.

### Tier 2 — Extra High repository review

Use Extra High when semantic repository reading is required but the decision does not need Pro-level judgment.

Typical work:

- retrieving and organizing GitHub evidence;
- comparing implementation to an explicit contract;
- ordinary architecture/code review;
- tracing a failure through a repository;
- producing a provenance-locked evidence dossier;
- identifying missing evidence;
- checking whether a prior finding was actually addressed.

Extra High may issue a bounded technical recommendation when it is the assigned reviewer, but when preparing evidence for Pro it must operate in **reader mode** and avoid pre-deciding the supervisory verdict.

### Tier 3 — focused Pro judgment

Use for one clearly defined high-intelligence decision or a tightly coupled decision cluster.

Pro receives:

- a compact current authority capsule;
- a decision-specific evidence packet;
- direct evidence and Extra High dossier where useful;
- exact output schema;
- explicit instruction not to retrieve GitHub or rely on remembered chat history.

### Tier 4 — fresh independent Pro adjudication

Use only when independence itself can change the decision:

- consequential done/release candidate;
- disputed high-risk judgment;
- persistent supervisor has coached the worker extensively;
- evidence of anchoring or stale assumptions;
- therapy/AskRigor conclusion whose validity materially depends on a clean assessment.

A Tier 4 chat receives a blinded first pass before prior verdicts or producer rationale.

---

## 4. Routing is decision-level, not task-level

A high-risk project does not make every implementation action Pro-worthy.

Examples:

| Project/task | Decision | Route |
|---|---|---|
| Therapy companion | Fix button layout or transcript scrolling | Tier 0–2 |
| Therapy companion | Judge whether a response is leading, harmful, invalidating, or psychologically unsound | Tier 3 |
| Therapy companion | Final adjudication after the supervising Pro helped design the response | Tier 4 |
| AskRigor | Repair JSON schema, transport, retry, or UI bug | Tier 0–2 |
| AskRigor | Decide whether a trial flaw materially invalidates a conclusion | Tier 3 |
| AskRigor | Resolve disputed protocol interpretation at a release boundary | Tier 4 |
| Article project | Retrieve citations or compare versions | Tier 0–2 |
| Article project | Resolve a foundational argument conflict the owner has not decided | Tier 3 only when requested or materially unresolved |
| General software | Implement explicit acceptance criteria | Tier 0–2 |
| General software | Choose between two irreversible architectures with high uncertainty | Tier 3 |

Only the decision requiring Pro is gated. Independent reversible work continues unless it can contaminate or foreclose that decision.

---

## 5. Domain routing profiles

### 5.1 Therapy semantic profile

Default:

```text
code / UI / storage / tests -> deterministic + Extra High
response semantics / technique / safety / relational interpretation -> Pro
consequential completion -> fresh Pro when independence matters
```

Pro triggers include:

- a new therapeutic technique or response policy;
- a change to how the bot interprets user meaning, blame, trust, trauma, attachment, inner-child material, altered states, or vulnerability;
- possible leading, coercive, invalidating, overconfident, dependency-forming, or unsafe behavior;
- a difficult edge case not settled by current canonical rules;
- evaluation of actual generated therapy answers against the intended clinical/relational architecture.

Routine regression cases may be batch-evaluated in one decision-specific Pro packet rather than one chat turn per answer.

### 5.2 AskRigor semantic profile

Default:

```text
API / MCP / repository / transport / schemas / deterministic protocol identity -> deterministic + Extra High
methodological flaw detection / evidence interpretation / protocol reasoning / conclusion boundaries -> Pro
consequential disputed audit or protocol release -> fresh Pro when needed
```

Pro triggers include:

- whether a methods flaw changes what a review/trial can support;
- severity and impact of bias, synthesis, registration, access, reproducibility, or evidence-selection defects;
- conflict between Universal and HRP requirements;
- whether an advertised reusable audit remains compatible and fresh;
- whether uncertainty or an access boundary must block a conclusion.

Pro must not be spent fetching articles, manifests, repository files, or raw tool output that Extra High or deterministic tooling can supply.

### 5.3 General-development profile

Default to deterministic evidence, Codex self-check, and Extra High review. Pro is exceptional and requires a recorded decision-changing rationale.

---

## 6. Pro allocation model

### 6.1 Logical supervisor slot

Every task record has:

```text
supervision_route
supervision_reason
pro_required_now
pro_session_id (nullable)
extra_high_session_id (nullable)
next_review_trigger
```

A missing Pro session is normal. It does not mean the task is unsupervised.

### 6.2 Create Pro lazily

Do not create a Pro chat when a task starts merely because the task might eventually need one.

Create it when:

- the first justified Tier 3 gate occurs; or
- a project has a known near-term therapy/AskRigor semantic review boundary and pre-seeding the compact authority capsule prevents disruption.

### 6.3 Persistent scope key

A Pro chat is associated with:

```text
{domain, objective_family, contract_epoch}
```

not automatically with one worker process.

Appropriate reuse:

- the same therapy response-behavior campaign;
- the same AskRigor audit/protocol decision stream;
- the same high-level architecture decision through several evidence checkpoints.

Avoid one global Pro chat spanning unrelated tasks. Cross-task persistence saves chats but causes authority mixing, anchoring, and context contamination.

### 6.4 Pro queue priority

When capacity is constrained, order pending Pro work:

1. user safety or therapy-answer evaluation;
2. AskRigor/health-research conclusion validity;
3. genuine owner decision blocking consequential work;
4. high-risk release/publication/deployment gate;
5. material dispute or contradictory evidence;
6. optional architecture optimization.

A lower-priority task may continue reversible work while waiting.

---

## 7. Pro review request contract

Each request should ask one decision or one inseparable cluster, not “review the whole project.”

```yaml
review_request_id: rr_...
task_id: MC-...
decision_id: D-...
route: PRO_FOCUSED

question: >
  The exact judgment requested.

why_pro:
  deterministic_insufficient: ...
  extra_high_insufficient: ...
  consequence_of_error: ...

can_change:
  - worker directive
  - acceptance criterion interpretation
  - release gate

cannot_change:
  - owner-locked objective
  - unrelated implementation choices

required_evidence_ids: []
excluded_history: []
output_schema_version: 1
context_capsule_id: ctx_...
packet_id: pkt_...
```

Mission Control rejects a Pro request that lacks a decision, consequence, or bounded authority.

---

## 8. Context architecture

### 8.1 Never rely on conversational memory alone

Even when a Pro chat is reused, every review turn receives a current compact capsule. The prompt must not say only:

> Continue reviewing what we discussed.

It must establish the current effective state by exact identifiers.

### 8.2 Context capsule

The capsule contains only current authority and unresolved state:

```text
capsule manifest and hash
scope key and chat epoch
task/objective family
active contract revision and hash
current owner decisions
active constraints and non-goals
current accepted architecture/method
unresolved supervisor findings
findings explicitly resolved or superseded since last turn
last reviewed HEAD
current HEAD
next decision/review trigger
rubric/prompt versions
```

It excludes:

- full chat transcripts;
- resolved historical discussion;
- repeated code listings;
- superseded contracts;
- old worker rationales;
- every prior packet;
- unrelated project background.

### 8.3 Delta packet

After the first review in a chat epoch, send:

- current capsule;
- diff from last reviewed SHA to current SHA;
- new/changed evidence only;
- current acceptance-criteria deltas;
- responses to unresolved findings;
- exact decision question.

Do not resend the entire repository or complete project history merely because the chat is persistent.

### 8.4 Evidence expansion loop

If Pro returns `NEEDS_MORE_EVIDENCE`:

1. validate the requested evidence classes;
2. route retrieval to deterministic tooling or Extra High;
3. create a supplemental packet tied to the same decision;
4. return to the same Pro chat if context remains healthy;
5. do not spend another Pro turn asking it to perform repository retrieval.

---

## 9. Context budget and pressure

### 9.1 Safe budget, not advertised maximum

ChatGPT web surfaces may not expose a stable exact effective context budget. Mission Control therefore uses a configurable, conservatively tested:

```text
safe_context_budget_tokens
```

Do not set this merely to a product marketing maximum. Reserve capacity for:

- system/developer instructions;
- the current response;
- tool metadata;
- estimation error;
- internal compaction behavior.

### 9.2 Estimation

For every chat epoch track:

```text
estimated_input_tokens_sent
estimated_output_tokens_received
current_capsule_tokens
next_packet_tokens
reserved_output_tokens
safety_margin_tokens
```

Use a tokenizer where available. Otherwise use a conservative character-based approximation and mark the estimate as approximate.

### 9.3 Context pressure

```text
context_pressure =
  estimated_effective_retained_context
  + current_capsule
  + next_packet
  + reserved_output
  + safety_margin
  ------------------------------------------------
  safe_context_budget
```

Starting operational thresholds, subject to calibration:

| Pressure | State | Action |
|---:|---|---|
| < 0.50 | HEALTHY | Reuse chat with delta packet |
| 0.50–0.65 | COMPACT | Remove resolved history; regenerate capsule |
| 0.65–0.75 | PRESSURED | Use only decision-essential evidence; prepare rollover capsule |
| 0.75–0.85 | ROLLOVER_REQUIRED | Start a new chat before the next substantive review |
| > 0.85 | BLOCKED | Do not submit another packet until rollover or verified reduction |

These are conservative workflow defaults, not claims about a specific model’s context limit.

### 9.4 Per-request packet cap

A single Pro packet should normally consume no more than approximately one quarter of the configured safe budget. A larger packet requires:

- explicit necessity;
- tiered evidence index;
- disclosed truncation/exclusion ledger;
- reserved output capacity;
- likely fresh chat if high-consequence.

### 9.5 Context quality signals

Trigger early compaction or rollover even below numeric thresholds when the Pro chat:

- cites superseded facts;
- confuses tasks or workers;
- repeats a resolved concern;
- forgets a current owner lock;
- becomes anchored to its own earlier proposal;
- produces contradictory verdicts without new evidence;
- appears to respond to stale rather than current packet identity.

Context pressure is both quantitative and behavioral.

---

## 10. Persistence versus rollover

### 10.1 Reuse the existing Pro chat when

- the scope key is unchanged;
- the decision stream is related;
- the contract epoch is compatible;
- context state is HEALTHY or successfully COMPACT;
- there is no requirement for an independent judgment;
- prior context provides useful domain continuity rather than bias.

### 10.2 Start a new Pro chat when

- context is `ROLLOVER_REQUIRED` or `BLOCKED`;
- the contract/objective changes materially;
- the old chat contains a foundational false assumption;
- unrelated tasks have contaminated the context;
- the supervisor repeatedly uses superseded evidence;
- a fresh independent Tier 4 adjudication is required;
- a long-dormant task resumes and the old context cannot be validated cheaply;
- the user explicitly requests a fresh independent review.

### 10.3 Do not create chats mechanically

A new checkpoint, commit, worker attempt, or packet does not by itself require a new Pro chat.

### 10.4 Chat epochs

Identify each chat lifecycle as:

```text
task-or-scope-key / pro / epoch-001
```

Persist:

```text
chat_epoch_id
chat_url
mode_label_visible_to_user
created_at
closed_at
scope_key
starting_capsule_id
last_capsule_id
last_reviewed_head
context_pressure
rollover_reason
predecessor_epoch_id
successor_epoch_id
```

Old chats remain provenance links, not active authority.

---

## 11. Structured compaction and handoff

### 11.1 Do not ask a model to summarize an entire old conversation as the sole handoff

Mission Control constructs the handoff deterministically from durable records:

- active contract;
- exact owner decisions;
- accepted and unresolved findings;
- current evidence/HEAD;
- review dispositions;
- next trigger.

The old Pro may verify the proposed handoff state when the decision is high-risk, but its free-form summary is not the authority.

### 11.2 Rollover capsule

```json
{
  "schema_version": 1,
  "capsule_id": "ctx_...",
  "scope_key": "therapy/response-policy/epoch-4",
  "predecessor_chat_epoch": "pro-e003",
  "contract_revision": 7,
  "contract_sha256": "...",
  "current_head_sha": "...",
  "owner_decision_ids": [],
  "effective_constraints": [],
  "accepted_findings": [],
  "unresolved_findings": [],
  "superseded_findings": [],
  "next_decision": "...",
  "do_not_reopen": [],
  "source_review_ids": [],
  "capsule_sha256": "..."
}
```

### 11.3 First message in the new chat

It must state:

- this is a new chat epoch;
- the prior chat is provenance only;
- the capsule is the current effective state;
- GitHub access is not required;
- unresolved findings are listed exhaustively;
- superseded issues must not be revived without new evidence;
- the current decision and output schema.

---

## 12. Fresh independent adjudication

A new chat created for context rollover is not automatically independent if it receives the old supervisor’s conclusions.

For Tier 4:

1. create a separate adjudicator epoch;
2. provide contract and direct evidence first;
3. withhold producer rationale and prior verdict;
4. freeze initial findings;
5. then reveal prior review and discrepancies for reconciliation.

The persistent supervising Pro may continue after adjudication, but the adjudicator does not become the new everyday supervisor unless explicitly assigned.

---

## 13. Dashboard additions

Each task card should show:

```text
supervision tier
why Pro is or is not required
Pro gate status
Pro queue priority
active Pro chat epoch (optional)
active Extra High reader chat (optional)
last Pro-reviewed HEAD
context pressure
context state
next Pro trigger
reviews consumed in current epoch
```

Suggested labels:

```text
NO_PRO_NEEDED
PRO_TRIGGER_PENDING
PRO_QUEUED
PRO_ACTIVE
PRO_CONTEXT_COMPACT
PRO_ROLLOVER_REQUIRED
PRO_LIMIT_BLOCKED
PRO_REVIEW_CURRENT
PRO_REVIEW_STALE
```

The dashboard must not display a missing Pro chat as a warning when the routing policy says Pro is unnecessary.

---

## 14. Event and data-model extensions

### Events

```text
SUPERVISION_ROUTE_SELECTED
PRO_REQUEST_REJECTED_AS_UNJUSTIFIED
PRO_SESSION_ALLOCATED
PRO_REVIEW_QUEUED
PRO_REVIEW_STARTED
PRO_REVIEW_COMPLETED
PRO_CONTEXT_PRESSURE_CHANGED
PRO_CONTEXT_COMPACTED
PRO_ROLLOVER_REQUIRED
PRO_CHAT_EPOCH_CLOSED
PRO_CHAT_EPOCH_OPENED
PRO_LIMIT_REACHED
PRO_LIMIT_CLEARED
EXTRA_HIGH_RETRIEVAL_REQUESTED
EXTRA_HIGH_DOSSIER_COMPLETED
```

### Tables/fields

```text
supervision_routes
review_requests
pro_chat_epochs
context_capsules
context_budget_observations
pro_usage_ledger
review_queue
```

Every Pro review remains linked to:

```text
decision_id
packet_id
capsule_id
chat_epoch_id
contract_revision
reviewed_head_sha
```

---

## 15. Pro limit and outage behavior

When Pro is unavailable or a usage limit is reached:

- mark the integration state truthfully;
- preserve the pending decision and priority;
- continue unrelated reversible work;
- route evidence acquisition and ordinary review to deterministic/Extra High layers;
- block only the semantic boundary that genuinely requires Pro;
- do not repeatedly retry and consume attention;
- do not substitute a weaker model when the contract requires Pro;
- do not ask the owner merely because Pro retrieval failed.

For a therapy or AskRigor semantic gate, the task may remain at `Supervisor Hold` while independent code/plumbing tasks continue.

---

## 16. Anti-patterns

Do not:

- assign a Pro chat to every worker on startup;
- send every heartbeat to Pro;
- ask Pro to browse GitHub repeatedly;
- resend the whole repository or entire task history every turn;
- use one permanent Pro chat for all therapy or all AskRigor work indefinitely;
- create a new chat for every commit;
- trust ChatGPT’s internal automatic summarization as the recovery mechanism;
- let an Extra High evidence summary replace raw evidence;
- burn Pro capacity on malformed packet retries that local validation could catch;
- ask Pro questions whose answers cannot change the current action;
- treat a context-pressure estimate as proof that the chat remembers everything;
- treat a rollover chat as independent when it has already seen the prior verdict;
- leave resolved findings in every future packet “just in case.”

---

## 17. Default examples

### Example A — ordinary frontend implementation

```text
Codex implements explicit UI acceptance criteria.
Deterministic tests pass.
Extra High reviews the diff.
No material ambiguity or owner decision exists.
Result: no Pro chat is created.
```

### Example B — therapy answer regression suite

```text
Codex changes response-selection behavior.
Deterministic tests verify routing and formatting.
Extra High assembles 12 representative transcripts and exact expected constraints.
One focused Pro review evaluates the semantic/relational behavior across the batch.
The same Pro chat is reused for the correction checkpoint with a delta packet.
A fresh Pro adjudicator is used only at the consequential release gate if independence matters.
```

### Example C — AskRigor methods flaw

```text
Codex fixes article acquisition and audit schemas.
Extra High verifies repository state and assembles source-linked evidence.
Pro evaluates whether the identified methods flaws alter the conclusions the review can support.
Pro is not asked to fetch the paper or inspect GitHub.
```

### Example D — context rollover

```text
A persistent therapy Pro chat reaches PRESSURED state and begins repeating a resolved finding.
Mission Control constructs a deterministic rollover capsule.
A new Pro chat receives the capsule, current contract, unresolved findings, and the next decision-specific packet.
The prior chat remains linked as provenance but is no longer active authority.
```

---

## 18. Acceptance tests

The implemented architecture must demonstrate:

1. Four workers can run while zero Pro chats are active when no decision requires Pro.
2. A routine code review routes to Extra High without Pro.
3. A therapy-answer semantic change routes to focused Pro.
4. An AskRigor transport bug does not route to Pro.
5. An AskRigor conclusion-validity decision does route to Pro.
6. `NEEDS_MORE_EVIDENCE` routes retrieval to deterministic/Extra High systems before returning to Pro.
7. A new worker attempt does not create a new Pro chat when the task/scope epoch is unchanged.
8. A material contract change invalidates incompatible reviews and can trigger a new chat epoch.
9. A persistent chat receives delta packets, not the entire history.
10. Context pressure triggers compaction and then rollover before a hard overflow condition.
11. A rollover preserves all current owner decisions and unresolved findings.
12. Superseded findings are not silently revived in the new chat.
13. A fresh adjudicator remains blinded to the prior verdict until its first findings are frozen.
14. Pro outage blocks only the decision that requires Pro.
15. The dashboard explains why Pro is required rather than merely showing that it is active.
16. No review applies to a different packet, contract revision, or HEAD.
17. Context limits and packet budgets are configurable and measured rather than assumed.

---

## 19. Implementation order

1. Add supervision-route fields and decision-level review requests.
2. Add deterministic Pro-justification validation.
3. Add context-capsule schema and chat-epoch records.
4. Add token/context estimation and pressure states.
5. Change dashboard semantics from “one Pro per worker” to “optional Pro escalation per task decision.”
6. Add Extra High evidence-reader routing.
7. Add persistent-chat delta packets.
8. Add deterministic rollover capsules.
9. Add fresh adjudicator flow.
10. Calibrate thresholds against real therapy, AskRigor, and ordinary-development scenarios.

The stock Symphony pilot and current Mission Control gap audit must use this corrected routing model from the beginning; otherwise the implementation will overconsume Pro capacity and encode the wrong chat topology.
