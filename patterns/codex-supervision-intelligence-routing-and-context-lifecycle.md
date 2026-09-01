# Codex Supervision Intelligence Routing and Context Lifecycle

**Status:** Required companion to `chat-led-reasoning-codex-execution-separation.md` and `codex-pro-supervision-mission-control.md`  
**Date:** 2026-08-31  
**Authority:** Current owner correction

## 1. Controlling rule

> **Chats perform the reasoning. Codex performs only bounded execution that chats cannot reliably perform.**

Every durable task has a logical **reasoning supervision lane**. Extra High is the default reasoning supervisor. Pro is allocated only to a specific decision that materially needs the highest available semantic intelligence. Codex never fills a missing reasoning-supervisor role.

This file governs intelligence allocation and chat context lifecycle. Role boundaries are controlled by:

- `patterns/chat-led-reasoning-codex-execution-separation.md`

Any historical phrase such as “Codex self-check,” “ordinary Codex review,” or “worker review” means only a non-authoritative execution claim for independent chat review.

## 2. Why Pro is scarce but important

Use Pro when a lower-cost route is materially less reliable, especially:

- therapy-companion answer semantics, technique, framing, causal interpretation, relational safety, and difficult edge cases;
- AskRigor methodological flaws, protocol conflicts, evidence sufficiency, access boundaries, and conclusion validity;
- difficult strategy-failure diagnosis or replacement after flat/negative progress;
- consequential architecture/product ambiguity not settled by current authority;
- a material disagreement between Extra High, evidence, or an earlier supervisor;
- high-risk release/publication/deployment judgment not caught deterministically;
- fresh independent adjudication when prior coaching could bias the review;
- substantive Mission Control supervision-design review.

Pro is normally not used for:

- GitHub retrieval or file collection;
- routine code/diff review;
- ordinary test failures;
- formatting, plumbing, or deterministic migrations;
- deterministic progress arithmetic;
- dashboard implementation details;
- repeated confirmation of unchanged conclusions.

Before a Pro call, the reasoning supervisor or Mission Control states:

```text
Decision under review
Why deterministic evidence is insufficient
Why Extra High is insufficient
What the Pro answer can change
Consequence if wrong
What happens if Pro is unavailable
```

## 3. Reasoning routing ladder

### Tier 0 — deterministic control

Use exact tooling for:

- repository/branch/base/HEAD identity;
- task/directive/receipt/contract hashes;
- changed paths;
- tests and CI;
- measurements and arithmetic deltas;
- stale evidence;
- checkpoint timing;
- unresolved owner-decision state;
- resource collisions;
- schema and import validation.

Output:

```text
PASS | WARN | HOLD | FAIL | UNKNOWN
```

### Tier 1 — Extra High reasoning supervisor

Extra High owns ordinary reasoning:

- owner-outcome reconstruction and contract derivation;
- planning, architecture and implementation design;
- article argument/voice/prose authoring;
- repository/diff review;
- evidence interpretation;
- alignment and completion assessment;
- outcome-progress and strategy-efficacy assessment;
- replacement-strategy selection when ordinary;
- deciding whether a Pro pass is useful;
- writing the next `CHAT-TO-CODEX-EXECUTION-DIRECTIVE`.

Extra High may use deterministic tools, GitHub connectors, files and evidence dossiers. It does not delegate reasoning to Codex merely because local execution is needed.

### Tier 2 — focused Pro judgment

Use for one bounded high-intelligence decision or tightly coupled cluster.

Pro receives:

- current authority capsule;
- exact owner-source receipt;
- decision-specific evidence packet;
- Extra High analysis when useful, clearly separated from direct evidence;
- exact question and output schema;
- instruction not to retrieve GitHub or rely on remembered chat history.

### Tier 3 — fresh independent Pro adjudication

Use only when independence can change the decision:

- consequential completion/release candidate;
- disputed high-risk judgment;
- persistent supervisor extensively shaped the work;
- evidence of anchoring or stale assumptions;
- therapy/AskRigor conclusion needing a clean assessment.

Use a blinded first pass before revealing prior verdicts or producer rationale where valid.

## 4. Execution routing is separate

After a chat decides what should happen:

```text
chat-authored directive
  -> Codex executes
  -> Codex execution receipt + raw evidence
  -> chat reviews
```

Codex is not a reasoning tier. It is the actuator for:

- terminal/filesystem work;
- multi-file implementation;
- builds/tests/local services;
- Git/worktrees;
- browser/OS automation;
- deployment/environment inspection;
- exact materialization and evidence collection.

A missing Extra High/Pro review cannot be replaced by Codex self-review.

## 5. Decision-level routing examples

| Domain | Decision/action | Route |
|---|---|---|
| Therapy | UI/storage/test implementation | Extra High designs; Codex executes |
| Therapy | Is the response leading, harmful, invalidating or psychologically unsound? | Pro |
| Therapy | Fresh final adjudication after supervising Pro helped design it | Fresh Pro |
| AskRigor | API/schema/transport bug | Extra High designs; Codex executes |
| AskRigor | Does a flaw invalidate or materially weaken the conclusion? | Pro |
| AskRigor | Disputed protocol/release boundary | Fresh Pro when needed |
| Article | Reconstruct argument/voice and write candidate prose | Extra High; Pro only if justified |
| Article | Materialize exact candidate, run preservation/detector/browser actions | Codex |
| Software | Architecture, behavior, acceptance criteria and patch plan | Extra High |
| Software | Apply bounded patch and run local verification | Codex |
| General | Irreversible high-uncertainty architecture choice | Pro |

Only the decision needing Pro is gated. Independent reversible work may continue when it cannot contaminate that decision and a current chat-authored directive exists.

## 6. Domain profiles

### Therapy

```text
code / UI / storage / tests -> Extra High reasoning + Codex execution
response semantics / technique / safety / relational interpretation -> Pro
consequential final judgment -> fresh Pro when independence matters
```

### AskRigor

```text
API / MCP / repository / transport / schema implementation
  -> Extra High reasoning + Codex execution
methodological flaw / evidence interpretation / conclusion boundary
  -> Pro
consequential disputed audit or protocol release
  -> fresh Pro when needed
```

### Articles

```text
argument / voice / substantive prose / editorial strategy
  -> Extra High reasoning; Pro only when materially justified
materialization / preservation / traceability / detector / browser execution
  -> Codex
progress and next editorial strategy
  -> Extra High or Pro, never Codex
```

### General development

```text
architecture / plan / review -> Extra High
bounded implementation / local verification -> Codex
highest-consequence semantic decision -> Pro
```

## 7. Reasoning supervisor allocation

Every task record has:

```text
reasoning_supervision_route
reasoning_supervision_reason
extra_high_session_id (normally present for active nontrivial work)
pro_required_now
pro_session_id (nullable)
active_strategy_id
active_execution_directive_id
last_reasoning_review_at
last_reasoning_reviewed_head_or_artifact
next_reasoning_review_trigger
```

A missing Pro session is normal. A missing current reasoning supervisor/directive is not normal for substantive execution.

### Pro allocation

Create Pro lazily at the first justified high-intelligence decision. Reuse the related Pro chat while scope and context remain healthy.

Persistent Pro scope key:

```text
{domain, objective_family, contract_epoch}
```

Do not use one global Pro chat across unrelated tasks.

### Pro queue priority

1. therapy/user safety;
2. AskRigor/health-research conclusion validity;
3. genuine owner decision blocking consequential work;
4. high-risk release/publication/deployment;
5. difficult strategy replacement;
6. material dispute;
7. optional architecture optimization.

## 8. Pro request contract

```yaml
review_request_id: rr_...
task_id: MC-...
decision_id: D-...
route: PRO_FOCUSED
question: exact bounded judgment
why_pro:
  deterministic_insufficient: ...
  extra_high_insufficient: ...
  consequence_of_error: ...
can_change:
  - reasoning strategy
  - execution directive
  - interpretation or release gate
cannot_change:
  - owner-locked outcome
  - unrelated implementation choices
required_evidence_ids: []
context_capsule_id: ctx_...
packet_id: pkt_...
```

Extra High or Mission Control composes this request. Codex may transmit it but may not author its substantive question or authority boundary.

## 9. Context architecture

### Current capsule

Every reasoning turn receives current authority, not merely “continue.”

```text
capsule ID/hash
scope key/chat epoch
owner-outcome ID/epoch/hash
active contract/reconciliation
current strategy and progress receipt
active execution directive
latest execution receipt
owner decisions and constraints
unresolved findings
last reviewed evidence boundary
current evidence boundary
next decision/review trigger
prompt/rubric versions
```

Exclude full transcripts, resolved history, superseded contracts, repeated code, old worker rationales and unrelated background.

### Delta packet

After the first review in a chat epoch, send:

- current capsule;
- evidence/diff since last reviewed boundary;
- responses to unresolved findings;
- exact decision question.

### Evidence expansion

If Pro returns `NEEDS_MORE_EVIDENCE`, deterministic tooling or Extra High obtains the requested evidence and returns to the same Pro chat when context remains healthy. Codex may execute the retrieval actions but does not interpret them.

## 10. Context budget and rollover

Track conservatively:

```text
estimated retained input/output
current capsule size
next packet size
reserved output
safety margin
safe context budget
```

Starting thresholds, subject to calibration:

| Pressure | State | Action |
|---:|---|---|
| < 0.50 | HEALTHY | Reuse with delta |
| 0.50–0.65 | COMPACT | Remove resolved history and regenerate capsule |
| 0.65–0.75 | PRESSURED | Send only decision-essential evidence; prepare rollover |
| 0.75–0.85 | ROLLOVER_REQUIRED | Start a new chat before next substantive review |
| > 0.85 | BLOCKED | Do not submit another packet before rollover/reduction |

Roll over early when a chat:

- cites superseded facts;
- confuses tasks/workers;
- forgets owner locks or current strategy;
- repeats resolved findings;
- treats activity as progress;
- accepts proxy completion;
- recommends a failed strategy without new evidence;
- conflates operational/scientific/release adequacy.

A new chat receives a deterministic handoff capsule, not only a free-form summary.

## 11. Chat epochs

Persist:

```text
chat_epoch_id
chat_url/account alias
surface/mode label
scope key
created/closed times
starting/last capsule
last reviewed evidence boundary
context pressure
rollover reason
predecessor/successor epoch
```

Old chats remain provenance links, not current authority.

## 12. Resource degradation

If Pro is unavailable:

- continue Extra High reasoning and reversible work;
- hold only the specific Pro-level decision;
- do not let Codex reason in Pro’s place.

If Extra High is unavailable:

- use another authorized reasoning chat/account where possible;
- preserve current directives/evidence;
- hold new substantive execution when the reasoning boundary is reached;
- do not let Codex become the strategist.

If Codex is unavailable:

- continue chat reasoning, review, directive preparation and evidence analysis;
- execute later or through the verified secondary Codex account.

## 13. Required alerts

Mission Control raises:

```text
SUPERVISION_DIRECTIVE_MISSING
REASONING_REVIEW_OVERDUE
CODEX_RUNNING_WITHOUT_CURRENT_DIRECTIVE
CODEX_AUTHORED_STRATEGY_CHANGE
CODEX_AUTHORED_SUPERVISORY_VERDICT
CODEX_SUBSTANTIVE_PROSE_AUTHORSHIP_UNAUTHORIZED
PRO_REQUEST_AUTHORED_BY_CODEX
CONTEXT_ROLLOVER_REQUIRED
```

## 14. Relationship to other patterns

- Role authority: `patterns/chat-led-reasoning-codex-execution-separation.md`
- Outcome integrity: `patterns/owner-outcome-invariant-and-contract-laundering-prevention.md`
- Assurance planes: `patterns/supervision-assurance-planes-and-pro-meta-review.md`
- Progress/strategy control: `patterns/outcome-advancement-and-strategy-efficacy.md`
- Resource/account/browser operation: `patterns/codex-supervision-resource-routing-account-failover-and-browser-hygiene.md`

This file cannot grant Codex reasoning authority.
