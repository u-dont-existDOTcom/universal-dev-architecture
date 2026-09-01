# Runtime Chat/Work authority admission and automatic internal routing

Status: current universal supervision pattern.

## Purpose

This pattern converts the Chat-to-Work authority boundary from a documented expectation into a pre-action admission control. ChatGPT Chat/Pro owns reasoning, proposals, methodology, prioritization, spending design, consequential tradeoffs, adequacy judgments, and strategy. Codex/Work owns only bounded execution that the current Chat-authored directive establishes cannot be completed reliably in Chat.

## Required order of operations

1. Before a worker forms or acts on a proposal, methodology, priority, spending design, consequential tradeoff, or execution plan, it submits an authenticated admission request to Mission Control.
2. Mission Control derives the permissible actor class from the authenticated producer. A worker cannot claim that its own text originated in Chat.
3. The authority gate evaluates the action against the exact source receipt, owner zero-spend policy, bounded-execution status, and internal-routing authorization.
4. Work may begin only when the response contains `mayExecute: true`. That state is reserved for a bounded execution task with a verified or owner-attested Chat-authored source receipt and an allowed spending boundary.
5. A denied Chat-owned action causes the exact factual packet to be durably queued to the configured Project Manager or specialist supervisor. The denied worker action remains stopped.

## Owner-relay prohibition

Routine internal supervisor routing is an already-authorized control-plane operation. Codex/Work must not ask the owner to paste a prompt, carry a packet, approve transmission, or say “send it.” A generic browser rule for representational communication cannot override the narrower standing authorization for exact internal supervisor routing. External messages to third parties remain representational actions and retain their applicable confirmation boundary.

## Delivery truth

These states are distinct:

- `QUEUED_FOR_PROVIDER_RELAY`: Mission Control durably holds the packet; the destination has not been proven to receive it.
- provider delivery attempted: a configured relay attempted the exact destination and packet.
- provider delivered: the relay returned a source-bound message or delivery receipt.
- supervisor response ingested: Mission Control recorded the exact response body or immutable provider locator with provenance.

A configured chat URL is a locator, not delivery evidence. A queue record is not a ChatGPT message. The interface must expose both while labeling each accurately.

## Spending invariant

When an active owner decision sets paid model inference to zero, neither Codex nor Chat may authorize a nonzero API inference run without a later explicit owner-approved spend manifest. ChatGPT consumer Extra High is the default reasoning/evaluation resource when it can perform the work without API spend.

## Failure behavior

If the admission service or internal route configuration is unavailable, fail closed for the semantic action, record the exact control-plane blocker, and continue unrelated safe work. Do not convert infrastructure failure into owner relay. Do not claim automatic routing is complete while the provider relay is absent.

## Mechanical implementation

The canonical Mission Control runtime provides:

- `POST /api/worker-channel/{worker}/admission` for authenticated pre-action decisions;
- `npm run supervision:admit:runtime` as a fail-closed worker client;
- durable `MISSION_CONTROL_INTERNAL_SUPERVISOR_ROUTE_V1` packets for denied or explicit internal routes;
- a configured supervisor-chat directory that distinguishes owner-configured locators from provider-verified transcripts;
- regression tests for the $30 and approximately $175 paid-API proposal failures, false Chat attribution, owner-relay requests, generic browser confirmation conflicts, and source-bound bounded execution.

## Acceptance criteria

The control is active only when all of the following are demonstrated:

- an authenticated worker cannot impersonate Chat;
- a worker-authored semantic or spend action returns `mayExecute: false` before execution;
- the exact factual packet is queued automatically when a valid internal route exists;
- no response requires owner relay;
- a missing provider relay remains visibly queued, not delivered;
- only an exact bounded Chat-authored directive can return `mayExecute: true`;
- deployed code, tests, and production revision identify the same commit.
