# Owner requirement — follow-up goal derivation and requirement accretion

Date: 2026-09-14  
Status: current owner requirement

## Owner correction

The owner reported that the system already had rules intended to prevent assistant-created goals, but a Sol/Astra routing optimization still turned into a long Mission Control proof/bridge project that was not the owner's goal. The owner then explicitly requested that this failure be fixed and merged to `main` so the repair does not remain an unmerged or forgotten side branch.

## Observed failure

The original task was to optimize model routing. After that routing policy was completed, the assistant treated runtime enforcement and provider-side proof of effective model identity as unfinished owner work.

That added requirement generated a chain of new prerequisites:

```text
routing policy
  -> runtime enforcement requirement
  -> provider identity/readback requirement
  -> trusted setter evidence requirement
  -> callable task-creation bridge requirement
  -> bridge unavailable
  -> previously working browser task creation treated as blocked
```

Several later steps were locally coherent if the added proof requirement was accepted. The failure occurred earlier: the assistant-created proof burden was never established as necessary to the owner's routing goal.

## Required behavior

Before a consequential follow-up task or new mandatory gate is created:

1. Re-bind to the current parent owner outcome and classify it as `OPEN`, `SATISFIED`, `SUPERSEDED`, `CANCELED`, or `AUTHORITY_UNRESOLVED`.
2. State the exact remaining owner gap. If there is no remaining gap, do not represent an optional improvement as unfinished owner work.
3. For every newly introduced mandatory requirement, classify its origin as owner-required, external hard requirement, empirically established requirement, assistant inference, or inherited project choice.
4. For assistant/inherited requirements, record what specifically breaks if the requirement is removed, the strongest materially simpler alternative, evidence against that alternative, and a necessity state of `ESTABLISHED`, `UNRESOLVED`, or `NOT_NECESSARY`.
5. An unresolved assistant-inferred requirement may support only a bounded reversible discriminating experiment. It may not become a fail-closed blocker, architecture prerequisite, root completion criterion, or reason to disable a working owner-aligned path.
6. Stronger assurance requirements count as new requirements. Independent readback, extra reviewers, cryptographic/provider attestations, new trust boundaries, and similar controls must prove what owner decision/outcome they materially change before becoming mandatory.
7. If a newly added control blocks or degrades a previously working owner-aligned path, immediately revalidate the original requirement rather than continuing a chain of compensating fixes.
8. Preserve useful supporting work from the overbuilt branch, but restore the simpler owner-aligned path when the added prerequisite is not established as necessary.

## Required failure classes

At minimum detect:

- `OBJECTIVE_SUBSTITUTION`
- `ASSISTANT_ADDED_MANDATORY_REQUIREMENT`
- `UNAUTHORIZED_ASSURANCE_ESCALATION`
- `MANUFACTURED_PREREQUISITE`
- `REQUIREMENT_ACCRETION`

## Owner-friction constraint

This repair must not turn routine implementation into a new approval ceremony.

When necessity is unresolved but a cheap reversible test can resolve it, the system should run the test automatically within existing authority. Ask the owner only when the unresolved point is an actual owner value/tradeoff or a mandatory platform/security/privacy/spending/publication/access/irreversible gate.

## Enforcement point

This rule must be active at **follow-up-task authoring**, not merely stored as retrospective guidance. A later worker faithfully executing an already-substituted goal is too late.

The root universal bootstrap must therefore carry the gate directly or route to it explicitly before consequential follow-up task creation.