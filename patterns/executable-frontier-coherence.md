# Executable Frontier Coherence

## Problem

A workflow can correctly refuse completion and still strand its client. The
authoritative state may say work is unfinished while exposing no executable
next step, or a transport adapter may translate that contradiction into a
finalization attempt. Repeatedly telling the client to “continue” does not
repair the controller that lost or contradicted its own work frontier.

The same failure appears when a later provider error overwrites useful earlier
discovery, one optional lane suppresses independent required lanes, a retryable
failure is treated as terminal, or a compact integration wrapper quietly
weakens the specialist contract it wraps.

## Activation

Use this pattern for server-controlled, agentic, resumable, multi-provider, or
multi-stage workflows where authoritative state determines whether work may
continue, block, produce a bounded result, or finalize.

It applies to research controllers, deployment coordinators, ingestion
pipelines, migration runners, evaluation harnesses, and other systems in which
clients or workers must not self-certify completion.

## Core invariant

**Every authoritative nonfinal state must expose a coherent executable frontier
or an explicit terminal boundary.**

A controller-owned view must be in exactly one of these states:

1. executable work exists and the server names the next capability;
2. retryable work remains and the same authoritative capability remains
   executable after its retry condition clears; or
3. no work remains executable because a recognized terminal boundary permits
   only an explicit blocked or bounded output.

Never emit an ordinary continue state with no server-directed work. Never map absence of a next capability to finalization. A finalization denial is not a
substitute for a coherent continuation or terminal projection.

## 1. Keep operation, frontier, and product projection aligned

Distinguish:

- the operation state that records what the controller attempted;
- the retained frontier containing valid queries, candidates, receipts, or
  partial outputs;
- the product projection that tells a client what it may do next.

Reconcile these layers after restore and after every boundary transition. A
later failure must not leave the operation terminal while the retained frontier
still claims retryable, or vice versa. Preserve valid earlier results and exact
provenance unless their own integrity failed.

Do not make a whole operation look successful merely because one provider call
returned. Likewise, do not erase useful earlier work merely because a later
attempt failed.

## 2. Preserve retryability and lane independence

A retryable failure remains executable. A client, worker, or wrapper cannot
relabel it terminal to avoid the work.

A terminal boundary in one provider or optional lane does not automatically
terminate independent required lanes. Continue any still-authorized native,
fallback, or alternative execution path. Preserve the failed lane as a
limitation; do not convert it into negative evidence or global completion.

Whether a terminal lane permits a bounded answer is domain policy. The
controller must derive that boundary explicitly rather than infer it from the
mere absence of a next item.

## 3. Make transition receipts truthful

Transition evidence describes the resulting authoritative state, not the fact
that a function returned.

At minimum distinguish:

- progress recorded while the operation remains in progress;
- operation complete;
- blocked retryable;
- blocked terminal;
- semantic work recorded; and
- protocol or authority drift.

Do not sign or persist a transition as complete when the resulting operation is
blocked or still in progress. Downstream acceptance, recovery, and audit logic
must be able to trust the transition vocabulary literally.

## 4. Test the composition boundary, not only each component

Always test the composition boundary, not only each component.

A high-level transport prompt, wrapper, adapter, default, or resource limit can
silently weaken a strong specialist skill or worker contract. The composed
system is the product.

A compact integration wrapper quietly weakens the specialist contract whenever
the wrapper narrows a material requirement without explicit authority.

For every material wrapper, test that it preserves the specialist contract's
minimum breadth, quality, safety, reasoning effort, provenance, and terminal
semantics. A compact overlay must not invite fewer alternatives, less checking,
or weaker evidence than the underlying worker requires unless the reduction is
an explicit, authorized product boundary.

The composed product preserves the specialist contract's minimum breadth, and
wrapper-plus-worker tests enforce that invariant.

## 5. Diagnose recurring execution failures architecturally

When the owner has repeatedly corrected the same observable failure and local
instruction repairs do not change the product result, treat recurrence as
evidence of a state-machine, projection, integration, or verification defect.

Inspect the authoritative checkpoint, operation/frontier divergence,
server-derived next capabilities, wrapper composition, and signed receipts.
Do not blindly add another prose reminder or retry the same product path.

## Hostile regression cases

### Continue with no next capability

Authoritative output says continue, but there is no semantic package and no
next capability. Fail the invariant. Produce a stable terminal blocked/bounded
state if a real terminal boundary exists; otherwise repair the missing
executable frontier.

### Finalize because next is absent

A client adapter maps `next = null` to finalization while the server still says
research or work is incomplete. Reject the mapping. Only an explicit
server-authorized final boundary may produce finalization.

### Later retry erases useful earlier frontier

An earlier attempt retained valid queries and candidates; a later provider
response is invalid. Preserve the validated earlier records, reconcile the
operation/frontier boundary, and continue independent lanes. Do not reset the
frontier to empty.

### Terminal optional provider suppresses native work

An external scout is terminally unavailable while a native search remains
authorized. Keep the limitation and execute the native lane.

### Retryable failure labeled terminal

A rate limit or transient provider error is relabeled terminal to unlock a
fallback or bounded answer. Reject the transition and retain the retryable
capability.

### Blocked operation recorded complete

A deterministic call returns a state whose operation is blocked, but the audit
trace says complete. Reject the receipt and derive its result from the resulting
operation state.

### Wrapper weakens specialist breadth

The specialist worker requires broad nonredundant discovery, but the compact
transport asks for only a few results or forces insufficient reasoning. Fail
the composition test even if each component passes independently.

## Verification checklist

- Every nonfinal state has semantic work, a named executable capability, or a
  modeled terminal blocked/bounded projection.
- `next = null` cannot authorize finalization.
- Retryable and terminal states are distinct and monotonic where required.
- Restore reconciliation preserves valid earlier frontier data.
- One terminal lane cannot suppress unrelated executable lanes.
- Signed transition results match the resulting operation state.
- Wrapper-plus-worker tests preserve the specialist contract.
- Public routes test liveness and stable terminal output, not only internal
  helper behavior.
- A mutation that removes the next-capability or terminal-boundary check fails.

## Reference implementation evidence

This pattern was promoted from the AskRigor Phase K terminal-discovery repair on
2026-08-25. The source candidate is commit
`0f706fcb07c37eea14267688715d091ccba72f1f` on PR #98, merged as
`ab2433c5d774081dff4fecb2f78600b213b250a2`. Exact hosted verification is
recorded in the accompanying promotion audit.

## Limits

- This pattern does not decide which providers or modules are optional; domain
  policy owns applicability.
- A terminal provider boundary does not automatically authorize even a bounded
  answer. Required evidence and report gates still apply.
- Preserving earlier records is safe only when their own source identity and
  integrity remain valid.
- A coherent frontier proves liveness and truthful control state, not semantic
  correctness or evidence quality.
- Wrapper fidelity does not require identical implementation details; it
  requires preservation of the material contract.
