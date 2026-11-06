# Persistent worker/probe lifetime promotion — 3 November 2026

## Owner intent and disposition

The owner requested cheap periodic checks and recovery for two existing MCP
services, following an earlier queue-stall repair. The standing owner instruction
requires transferable bug-repair lessons to reach UDA automatically.

Promote a small extension to the existing bounded-work specialist workflow:
persistent daemon ownership must be separate from short-lived checks/clients;
reset policy must classify failure and bound recovery. Retain its current
WORKFLOW_ONLY disposition. This prose is guidance, not a universal runtime
interceptor or independent semantic proof.

## Mechanism and implemented prevention

A browser-backed reader originally launched its persistent worker from clients.
A proposed one-shot scheduled checker would have inherited that same startup
path. A new process session would not establish an independent service-manager
cgroup lifetime. The prevention gives the existing private profile to a separate
persistent service and makes both reconnect code and the launcher defer to it.
The launcher guard covers old clients whose imports remain in memory and leaves
the live controller's state untouched.

The related article gateway already exposed useful queue/database health but
Docker's unhealthy label was not a tested restart mechanism. The native checker
now confirms local failures, reserves recovery durably, applies cooldown/attempt
limits, and verifies the actual service after recovery. Busy, authentication,
challenge, upstream, route and configuration states remain explicit outcomes.

This cgroup failure was prevented during watchdog development; it is not asserted
as the initiating cause of the earlier outage. The earlier queue repair and this
supervision layer solve different failure classes.

## Bounded evidence

* 50 relevant project tests passed, including real hung/output-flooding child
  containment, subsequent work, recovery budgets, failed reservation, concurrency,
  failure classification and old-launcher/controller-state protection.
* An idle article container was deliberately stopped. The installed helper
  recovered that same container and rechecked readiness. An authenticated MCP
  retrieval then verified a 411,115-byte PDF, signature/hash and zero provider
  credits. Test recovery used a separate budget; production cadence was restored.
* A browser controller was forcibly exited in its verified service cgroup. Native
  supervision restarted it; an authenticated comment check succeeded afterward,
  and the daemon remained alive after the one-shot check finished.
* The installed legacy launcher path returned a deferred outcome without
  replacing the live controller's state or starting a second browser. The real
  configured MCP transport subsequently returned a matching thread and five
  comments with its account session verified.
* Both native ten-minute timers were enabled/active and a scheduled tick on each
  host completed with healthy status. Checks use no model calls or paid article
  extraction; no credential/profile export or new public listener was introduced.

Exact project source SHA256:

* operations helper:
  `db44d2f0af62790baa2ed24e03eb8c958866b6dfd5e0b3f701ce3de83f92035c`;
* reconnect implementation:
  `55d1ff5b77848cff9cc9d62fefb22bc9ed80b593db234d7478be6f6dbbfa164f`;
* launcher implementation:
  `c03c84c44604e60a8ef763d8aec81d1e65c26be8f5f0132863df3eaeef472600`.

Private deployment locations, accounts, credentials, retrieved content and
conversation text are omitted. Detailed receipts and rollback remain with the
project's private operational source/handoff.

## Transfer limits

The service manager's actual containment and stop semantics are authoritative;
not every deployment uses systemd or requires a persistent browser. Prefer its
native supervision mechanism to a new framework. Recovery cannot guarantee host,
network or upstream availability or complete human-only authentication. Preserve
profiles and external side-effect/idempotency boundaries. Do not turn reset
budgets into permission to delete state, rotate accounts or repeat paid work.
