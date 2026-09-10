# Shared provider submission queue

## Problem

A process-local mutex, promise tail, or `lastSubmissionAt` timestamp can serialize one relay process while still allowing another process, machine, worker, or failover host to submit at the same time. Once several execution surfaces share one provider/account rate limit, **local pacing is not global pacing**.

A configured minimum interval is also not evidence that every actual send obeyed it. Completion requires observable send-boundary history, not only a current cooldown value.

## Rule

When multiple workers, processes, browser controllers, or hosts can submit to the same externally rate-limited provider/account, use one shared authoritative submission queue in the control plane.

Every submission must satisfy both:

1. **semantic/task authority** — an existing source-bound directive, task, or other accepted authorization permits the message; and
2. **mechanical send admission** — the shared queue grants an exclusive lease after global pacing, host, route, and destination checks pass.

Do not make the queue a new semantic reasoner. Routine authorized transport should not require repeated owner or supervisor approval merely to acquire a send slot.

## Global lease

Before any provider send, atomically establish a lease that includes at least:

- opaque queue item ID;
- authorization/task reference;
- provider/account pacing domain;
- executing worker/process/host identity;
- lease issue and expiry times;
- earliest permitted send time derived from the shared last accepted submission boundary;
- intended destination identity or route class.

For a single pacing domain, only one unexpired send lease may authorize a boundary-crossing send at a time unless the provider has independently verified parallel quotas that justify a wider concurrency model.

The lease owner may perform the send only after the earliest permitted time and all destination/browser ownership checks pass.

## Submission boundary

The global pacing clock advances at the earliest reliably observed boundary showing that the provider may have accepted a request, normally the actual send/click boundary rather than generation completion.

If a click/send may have occurred but persistence fails, fail closed and conservatively advance or reserve the pacing boundary. Do not replay merely because the acknowledgement was lost.

The shared state must survive process and host restart.

## Defense in depth

Each execution host should retain a local pacer with the same or stronger interval. The local guard protects against controller bugs and accidental direct calls, but it does not replace the shared lease.

Direct browser-send methods should either require a valid lease token/capability or remain private behind the queue-owned path. Tests should prove that an unleased caller cannot reach the actual provider submission primitive.

## Rate limits

When the provider reports a request-rate limit:

1. mark the pacing domain rate-limited in shared state;
2. prevent new leases while the condition is active;
3. preserve the exact already-authorized queue item rather than creating a parallel retry;
4. obey the provider's requested delay and any stronger global minimum;
5. allow only the bounded retry policy already authorized for that provider;
6. a repeated or ambiguous rate-limit condition fails closed.

Multiple hosts must see the same rate-limit state. A secondary host is not a workaround for an account-level provider rate limit.

## Failover and fencing

For primary/secondary execution hosts:

- host health determines which host may claim new work, but global queue state determines whether any host may send;
- failover must fence or expire the primary host's outstanding send lease before a secondary can cross the provider boundary;
- recovery of the primary must not create active-active duplicate sends;
- browser ownership may remain host-local while send authority is global.

## Dedicated destination registries

For automated reasoning/supervision systems, queue admission should also bind the intended destination to an exact registered automation surface. Do not route to an active, newest, first, or merely URL-matching user conversation.

Human-readable titles are useful labels but are not authority. Exact private conversation/route identity plus automation-owned browser target identity is the admission boundary.

## Evidence and telemetry

Preserve a privacy-safe append-only send ledger with enough information to audit every real interval:

- queue item ID;
- authorization reference;
- queue/lease admission time;
- executing host/process role;
- previous global boundary;
- actual observed submission boundary;
- computed inter-send interval;
- configured minimum interval;
- rate-limit state and bounded retry state;
- terminal delivery/recovery state.

Report both the configured rule and observed minimum/median/recent intervals. Never claim global pacing from a configuration value alone.

## Failure tests

At minimum prove:

- two hosts request a lease concurrently -> only one can send;
- second host cannot send before global interval elapses;
- process restart cannot erase the last global boundary;
- stale lease is safely fenced before failover;
- direct/unleased submission fails before browser mutation;
- provider rate-limit state blocks all hosts in the same pacing domain;
- retry preserves the same queue item and cannot fan out;
- foreign/user destination cannot acquire a supervisor-route send lease.

## Portability

The mechanism is universal. Concrete provider accounts, VPS vendors, hostnames, service IDs, browser profile paths, and registered conversation locators are owner/project deployment data and must be kept in explicitly non-universal state outside this pattern.
