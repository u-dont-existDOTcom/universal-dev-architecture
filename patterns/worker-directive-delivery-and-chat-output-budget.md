# Worker Directive Delivery and Chat Output Budget

**Status:** REQUIRED OWNER CORRECTION  
**Date:** 2026-09-10  
**Scope:** Universal across repositories and development workflows unless a current project-specific requirement explicitly overrides it.

## Problem

A reasoning chat can correctly decide that Codex/Work should perform the next execution step yet still stop after explaining what the worker ought to do. That leaves the owner to ask a second time for the actual worker instructions.

A separate failure mode is to paste a very large implementation brief, migration plan, review packet, or worker directive directly into chat. That bloats scrollback, slows owner review, obscures decisions, and makes later conversation recovery harder.

Both are completion failures. The first omits the executable next artifact; the second delivers it through the wrong owner-facing surface.

## Controlling rule

**When the next concrete action belongs to Codex/Work, the reasoning chat must deliver the runnable execution directive in the same turn. Do not stop at meta-commentary about what the worker should do.**

If direct handoff is available and appropriate under the current Chat/Work routing policy, perform the handoff with the complete bounded directive. If direct handoff is unavailable, declined, or the owner intends to paste the directive into an existing worker, deliver a complete ready-to-run instruction artifact.

The owner must not have to send a follow-up such as:

```text
give instructions for codex
what should I tell the worker?
put that into a prompt
```

after the reasoning chat has already selected worker execution as the next step.

This rule does not transfer reasoning authority to Codex. Chat still owns methodology, architecture, strategy, substantive judgment, and directive composition under the existing Chat-led reasoning / Codex-execution rules.

## Same-turn worker-handoff closure

Before ending a turn in which Codex/Work execution is the selected next action, verify one of these terminal conditions:

1. **DIRECT_HANDOFF_COMPLETE** — the exact bounded directive was actually sent through the supported handoff surface; or
2. **OWNER_RUNNABLE_DIRECTIVE_DELIVERED** — the complete directive was delivered to the owner in a directly usable form; or
3. **HANDOFF_BLOCKED** — a real capability, permission, safety, authority, or owner-decision boundary prevents delivery, and the blocker is stated explicitly.

The following are nonterminal:

- describing what Codex should do;
- listing proposed worker requirements without packaging them for execution;
- saying a worker prompt can be provided later;
- offering to create instructions instead of creating them;
- giving only a repository path to instructions the owner must reconstruct;
- delivering a partial prompt whose missing details remain in surrounding chat prose.

If the reasoning chat already has enough information to compose the directive, asking the owner whether they want the directive is unnecessary friction.

## Directive completeness

A ready-to-run directive must contain enough context for the worker to execute without reconstructing requirements from prior conversation.

For nontrivial work, include as applicable:

- target repository/project and canonical source of truth;
- exact objective and intended outcome;
- current/frozen state or baseline that must be preserved;
- allowed scope;
- forbidden changes/actions;
- required implementation behavior;
- required validation/tests;
- required artifacts/evidence;
- stop/review/invalidation conditions;
- completion deliverables;
- any explicit nonclaims or interpretation limits.

Use existing canonical directive templates where the workflow requires them. This pattern governs owner-facing delivery, not a competing machine schema.

## Chat output budget

**Large reusable operational payloads belong in artifacts, not in chat scrollback.**

This applies especially to:

- Codex/Work worker prompts;
- implementation briefs;
- migration plans;
- large review instructions;
- execution specifications;
- evaluation protocols;
- long handoff packets;
- multi-page checklists intended for reuse or pasting elsewhere.

Use this default delivery threshold:

- If the complete operational payload is roughly **a couple of rendered pages or less**, a fenced code block is acceptable.
- If it is clearly longer than that, or would materially bloat scrollback, create a `.md` or other appropriate text artifact and return the direct file link.
- As a mechanical fallback when page length is uncertain, prefer an artifact once the payload is roughly **>1,200 words or >8,000 characters**, unless the owner explicitly requested inline text.
- If the payload contains large tables, generated data, verbose logs, or long machine-readable structures, prefer an artifact even below the word threshold when inline rendering would be cumbersome.

Do not split one large directive across several chat messages merely to avoid the file rule. Package it as one artifact.

## Owner-facing response shape

When a long artifact is used, chat should contain only what the owner needs to orient and act:

1. a concise statement of the decision or action taken;
2. the direct artifact link;
3. critical caveats/blockers that would be unsafe or misleading to hide only inside the file;
4. provenance such as branch/PR/commit only when useful.

Do **not** duplicate the full artifact inline after linking it.

The file is for reusable operational detail. The chat remains the decision and navigation surface.

## Preserve substantive visibility

Output minimization must not hide consequential decisions.

Keep in chat:

- the selected strategy or recommendation;
- important interpretation changes;
- material safety/integrity caveats;
- whether a study/run/result is valid or invalid;
- any real owner decision still required;
- what was actually handed off or created.

Move to the artifact:

- exhaustive implementation steps;
- full acceptance matrices;
- detailed worker constraints;
- long test inventories;
- large schemas/examples;
- verbose provenance lists;
- reusable operational instructions.

## Interaction with Chat / Work routing

This pattern does not make Work/Codex the default.

First apply `patterns/chat-work-execution-routing-threshold.md`:

- if Chat can safely perform the bounded GitHub/action itself, do it in Chat;
- if terminal/local/browser/long-range execution is genuinely required, use Codex/Work for that residue;
- Chat authors the substantive directive and retains reasoning authority.

Then apply this pattern to close the handoff:

```text
Chat decides worker execution is next
-> Chat composes the complete runnable directive now
-> short directive: deliver in one fenced code block
-> long directive: materialize as .md/text artifact and link it
-> direct handoff available/accepted: send the exact directive
-> owner receives only concise orientation + artifact/handoff status
```

A declined direct Work handoff does not erase the obligation to deliver runnable instructions when the owner still wants to use an existing Codex/worker surface. Deliver the owner-runnable directive through the available artifact surface instead.

## Anti-patterns

Reject:

```text
"I would tell Codex to..."
"The next worker should..."
"Here is what the worker needs to cover..."
"Want me to turn this into Codex instructions?"
```

when worker execution has already been selected as the next action and enough information exists to author the directive.

Also reject:

```text
<several screens of worker instructions pasted into ordinary chat>
```

when the same content can be delivered as a `.md` artifact with a short owner-facing summary.

## Completion check

Before sending the final owner-facing response for a worker-bound task, ask internally:

```text
1. Did I merely discuss the worker instructions, or did I actually deliver them?
2. Can the worker run from the delivered directive without reconstructing prior chat?
3. Is the payload small enough for inline chat?
4. If not, did I create/link an artifact instead of bloating scrollback?
5. Did I keep the consequential decision/caveat visible in chat without duplicating the artifact?
```

Any `NO` on 1, 2, 4, or 5 is a delivery defect that should be repaired before ending the turn.
