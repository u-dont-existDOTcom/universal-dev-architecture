# Opaque target identity and access-route recovery promotion

## Status

Promoted universal correction, 2026-10-07.

## Incident

A monitoring task named a required remote device only by an opaque machine-generated label. The direct device connector temporarily had no live command channel. The assistant prematurely treated that transport failure as an owner blocker and told the owner to access/restart the named device even though the owner did not know what the label referred to.

The task already had a healthy authorized local execution endpoint. Its existing SSH configuration contained a semantic alias for the remote host. A bounded read-only SSH probe through that endpoint returned a hostname matching the opaque device label, and the exact required task artifacts were present and readable. The work could therefore continue without any owner action.

## Failure classification

This was not fundamentally a missing-permission failure. It combined:

- an **identity-resolution failure**: a machine identifier was treated as if it were meaningful to the owner;
- an **access-graph failure**: one failed connector edge was mistaken for target-wide inaccessibility; and
- an **owner-interruption failure**: an alternate already-authorized route was not exhausted before manual instructions were surfaced.

The existing self-remediation rule covered worker-local configuration and alternate transports in principle, but did not make opaque-target identity recovery and multi-edge topology probing explicit enough.

## Universal repair

Extend `patterns/worker-self-remediation-before-owner-interruption.md` and its root/template projections so that, before owner escalation for an opaque target, the worker must:

1. recover the target's plain-language identity from task-relevant authorized topology evidence;
2. distinguish a route-specific connector failure from target-wide unavailability;
3. inspect existing mappings such as SSH aliases, durable task state, process/service metadata, and recent authorized execution history;
4. test plausible already-authorized alternate routes with bounded read-only probes;
5. establish target equivalence from concrete evidence such as hostname plus expected artifact/path; and
6. ask the owner only for a genuinely irreducible human action after those routes are exhausted.

No rule authorizes credential disclosure, broader access, destructive changes, spending, publication, or bypass of a security gate.

## Transfer rationale

The failure mode is cross-project: cloud VMs, local machines, containers, services, browser sessions, CI runners, and MCP/connector devices commonly expose opaque IDs while the same underlying target may be reachable through several authorized edges. The invariant is therefore about capability topology, not one provider or one machine.

## Mechanical enforcement

`tests/test_worker_self_remediation_before_owner_interruption.py` now requires the opaque-target recovery behavior in the canonical pattern, root agreement, reusable agent templates, and the human-readable operational-reference rule.
