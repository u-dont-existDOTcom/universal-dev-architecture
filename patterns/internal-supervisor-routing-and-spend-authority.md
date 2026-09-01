# Internal supervisor routing and spending authority

## Status

Required supervision correction originating in the AskRigor MAST zero-spend failure of 2026-09-01.

## Problem

A workflow can nominally say that Chat reasons and Codex executes while still permitting Codex or Work to:

- author a proposal, methodology, priority, cost ceiling, or consequential tradeoff;
- present that proposal as though it came from a named ChatGPT conversation;
- stop before routing factual state to the appropriate supervisor;
- ask the owner to relay the packet or say `send it`;
- hide behind a generic browser rule that treats an already-authorized internal supervisor route as new third-party representational communication;
- stop at a green subtask while the owner outcome remains open.

A zero-dollar execution guard alone is insufficient. It may prevent the charge while still allowing the execution worker to invent and advocate the paid path.

## Authority model

### Reasoning authorities

Only the following may author proposals, methodology, prioritization, spending design, consequential tradeoffs, scientific interpretation, supervisory verdicts, and next-strategy selection:

- the owner;
- the Project Manager Chat;
- an explicitly selected specialist supervisor chat.

### Execution-only actors

Codex and Work may:

- route exact immutable factual packets;
- capture exact source responses and provenance;
- perform repository, browser, terminal, deployment, data-acquisition, test, and artifact operations that Chat cannot execute directly;
- return factual execution receipts automatically to the source reasoning chat.

They may not:

- originate, expand, recommend, or approve a semantic proposal;
- invent a spending option or ceiling;
- choose methodology or priority;
- attribute local reasoning or copied text to a named ChatGPT surface;
- decide what a supervisor or owner meant;
- convert delivery evidence into semantic acknowledgement or reconciliation;
- decide the next consequential step from their own execution receipt.

## Source-receipt gate

A reasoning claim must bind:

- exact source message identity;
- exact visible-body SHA-256 or immutable provider locator;
- claimed surface;
- observed surface;
- acquisition method;
- provenance status;
- source time when available and capture time;
- owner direction or decision request identity where applicable.

A chat title, browser tab, URL alone, local subagent name, Codex paraphrase, or statement that a proposal was discussed does not establish source authority.

Unknown or mismatched provenance fails closed. Codex-copied material remains evidence-only and cannot authorize a proposal or execution directive.

## Spending gate

Spending design is a consequential reasoning action.

When the owner has an active zero-spend decision:

- maximum affected spend is zero;
- no execution actor may author a paid alternative;
- no old or hypothetical nonzero manifest can revive the path;
- paid provider credentials are not imported;
- available subscription/consumer reasoning surfaces are used when they satisfy the task and the owner has chosen them;
- any later nonzero proposal must originate from a verified reasoning surface and still requires a newer explicit owner decision before execution.

The gate applies before proposal formation, not only before payment.

## Internal supervisor routing

Routing among configured Project Manager and specialist supervisor chats is internal control-plane transport when the owner has supplied standing authorization.

For such a route, Codex/Work must:

1. preserve the exact factual packet and digest;
2. resolve the configured destination chat;
3. deliver the packet automatically;
4. capture destination message identity and source provenance;
5. return the exact response to the Project Manager or originating supervisor;
6. report only a genuine transport blocker after attempting the authorized route.

They must not:

- ask the owner to paste or relay the packet;
- ask the owner to say `send it`;
- require a fresh action-time confirmation merely because a browser sends the message;
- use the internal-routing exception for an external recipient, publication, purchase, account change, or other genuinely external representational action.

The specific standing owner authorization for internal supervision routing controls over a generic browser-confirmation rule. The generic rule continues to apply outside the narrower internal route.

## Chat-capability gate

Before delegating work to Codex/Work, ask:

> Can the reasoning chat perform this operation directly and reliably?

If yes, keep it in Chat. Delegate only the mechanical residue requiring capabilities unavailable to the reasoning surface.

## Continuation invariant

Default behavior is completion of the owner-requested outcome.

A green subtask, commit, test, pull request, plan, prepared packet, or sealed experiment is a continuation trigger while the parent outcome remains open.

A worker may stop only when:

- the exact owner outcome is live-verified;
- a genuine owner-only semantic choice remains;
- an external capability or credential is unavailable after all nonblocked work is complete;
- a safety, security, privacy, spending, publication, or irreversible external-action boundary requires owner confirmation.

Every stop must state the unmet owner outcome, exact blocker, actor able to clear it, and next executable action.

## Exact regression

### Given

- A zero-spend MAST plan is complete.
- The owner has essentially unlimited ChatGPT Extra High use and has not authorized model API spend.
- Codex proposes a `$30` API smoke and later an approximately `$175` pilot.
- Codex implies the proposal came from a named supervisor chat despite lacking a source-message receipt.
- After correction, Codex asks the owner to say `send it` before routing the failure internally.

### Required result

```text
$30 proposal                       -> REJECT_CODEX_OR_WORK_SEMANTIC_AUTHORSHIP
$175 ceiling                       -> REJECT_CODEX_OR_WORK_SEMANTIC_AUTHORSHIP
false ChatGPT attribution          -> REJECT_UNVERIFIED_REASONING_SOURCE
positive model API spend           -> REJECT_PAID_MODEL_INFERENCE
owner relay / say-send-it request  -> REJECT_OWNER_RELAY_FOR_INTERNAL_ROUTE
generic browser confirmation       -> REJECT_INTERNAL_ROUTE_CONFIRMATION_HANDOFF
exact internal route               -> ALLOW_AUTOMATIC_INTERNAL_ROUTE
zero-spend bounded mechanical task -> ALLOW_BOUNDED_EXECUTION
```

No paid call having occurred limits the operational damage; it does not make the authority failure acceptable.

## Implementation seam

Mission Control should expose one admission function before controlled actions. Project repositories may add a narrower policy, but cannot weaken these role, source, spend, routing, or continuation boundaries.

Current reference implementation:

- `tools/codex-mission-control/restored/codex-mission-control/lib/chat-work-authority-gate.ts`
- `tools/codex-mission-control/restored/codex-mission-control/tests/chat-work-authority-gate.test.ts`

AskRigor project adaptation:

- `governance/chat-work-authority-policy.json`
- `scripts/validate-chat-work-authority-policy.mts`
- `tests/chat-work-authority-policy.test.ts`

## Limits

- This pattern does not authorize external messages, purchases, publication, account changes, or paid calls.
- It does not make every chat response authoritative; source identity and role still matter.
- It does not let Chat claim completion without execution evidence.
- It does not imply consumer ChatGPT is always scientifically adequate; it controls authority and spend, while task-specific adequacy remains a separate judgment.
