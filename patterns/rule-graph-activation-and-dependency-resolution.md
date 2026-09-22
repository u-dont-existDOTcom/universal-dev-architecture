# Rule graph activation and dependency resolution

## Purpose

UDA prose remains the canonical meaning and authority of every rule. This pattern adds a machine-readable routing, dependency, and task-time activation graph so selected rules can expand required companions, bind exact canonical source text, compile a compact Active Lesson Contract, and reach the actor and boundary where the obligation matters.

The graph is not a replacement for `AGENTS.md`, `LESSON-INDEX.md`, canonical patterns, current owner/project authority, or task-time semantic judgment. A graph edge cannot create authority that canonical source does not contain.

The operating path is:

`live authority → trusted task facts → graph-covered candidate selection → typed dependency closure → source-bound Active Lesson Contract → existing actor delivery/admission → phase/destination checks → existing evidence and reactivation`.

A graph node, successful resolver, or smaller prompt is not evidence that a rule was applied.

The resolver output is routing evidence, not application evidence.

Absence from the graph never means the rule is inapplicable.

## Reuse boundary

This is an **adapt/compose** change, not a new policy-engine project.

- Canonical prose owns meaning.
- `rules/UDA-RULE-GRAPH.json` owns reviewed routing/activation metadata.
- `scripts/uda_rule_graph.py` is the single deterministic compiler/resolver.
- `scripts/instruction-layering-profile.json` remains the source-composition role inheritance graph; do not duplicate role inheritance in the rule graph.
- The existing Active Lesson Contract remains the task-time contract ledger.
- Existing Mission Control admission/receipt machinery remains the enforcement/evidence path.

No graph database, vector database, hosted service, paid inference, theorem prover, or second scheduler/authorization service is required.

## Incremental coverage

Machine status remains `ROUTING_METADATA_NOT_NORMATIVE_AUTHORITY`.

The graph may contain two node classes during migration:

1. **routing-only nodes** — current pattern-level dependency metadata, still activated through existing textual routing;
2. **task-time operable nodes** — obligation-level nodes with exact source selectors, structured task predicates, boundary bindings, and enforcement metadata.

Absence from the task-time operable set never means inapplicable. Unmigrated rules remain on the functioning textual/legacy route.

## Task-time metadata

A task-time operable node keeps stable `rule_id` separate from `revision` and declares:

- canonical source path plus exact source selectors;
- authority owner/domain;
- actor/role/scope/destination/action-class applicability;
- structured trigger predicate;
- one or more obligations;
- typed relations;
- provenance/review state;
- generated context cost and source lock.

Each obligation binds:

`rule/source + scope/authority + actor + trigger + due phase + destination + acceptance evidence + non-substitutes + carry-through + repair + enforcement`.

Activation time and due time are distinct. A final-output rule must be active before drafting even though its mechanical check is due at final delivery.

Use obligation-level granularity: do not pull a whole large pattern when only one independent obligation is needed, and do not fragment material conditions/exceptions into unrelated sentence nodes.

## Exact source preservation

Every task-time node must resolve to exact canonical source span(s). Exact selectors must match uniquely. Generated source locks record source revision/blob identity, selector, extracted-byte count and digest, compiler identity, and catalog identity.

Line numbers can locate text but do not establish identity. If safe extraction is unresolved, preserve the bounded canonical section through the legacy route instead of summarizing away protections.

Canonical prose wins on disagreement. Stale selectors or changed source bytes make the affected graph projection unusable until regenerated/reviewed.

## Trusted facts and trigger logic

The compiler consumes declared facts with `KNOWN`, `ABSENT`, or `UNKNOWN` state and provenance. Supported predicates are deliberately small: `all`, `any`, `not`, `eq`, `in`, `contains`, and `present`.

Three-valued logic is mandatory:

- `not UNKNOWN = UNKNOWN`;
- `all` is false if any operand is false, otherwise unknown if any operand is unknown;
- `any` is true if any operand is true, otherwise unknown if any operand is unknown.

Missing information is not silently false. Keywords may suggest candidate retrieval but cannot be the only applicability rule or manufacture owner authority, tool permission, spending authority, publication authority, or platform capability.

## Relation semantics

- **requires(A,B)**: activating A requires B's scoped supporting obligations; traverse to a fixed point.
- **inherits(child,parent)**: reserved for true rule specialization; role inheritance stays in `instruction-layering-profile.json`.
- **supersedes(new,old)**: replacement only for the explicitly declared current overlap; historical provenance remains readable.
- **conflicts_with(A,B)**: declared incompatibility requiring current authority resolution; no automatic winner.
- **related_to**: navigation only and never expands activation.

Inheritance and replacement cycles are invalid. Positive `requires` cycles may represent a finite co-required component and are included once; they are not rejected merely to force a DAG. Navigation cycles and symmetric conflict pairs are not execution cycles.

## Compilation algorithm

For a bound task envelope:

1. refresh required live authority and bind source/catalog/compiler identities;
2. normalize trusted facts, role, actor, current/imminent actions, phase, destination, owner outcome and current corrections;
3. evaluate task-time candidates as TRUE/FALSE/UNKNOWN;
4. keep unresolved mandatory applicability explicit and preserve functioning legacy coverage;
5. expand `requires` to a fixed point and apply existing role inheritance;
6. apply only documented scoped supersession and report unresolved conflicts;
7. deduplicate obligations and deterministically order dependencies before dependents where possible;
8. render exact operative source plus boundary bindings into the existing Active Lesson Contract;
9. deliver that actual contract through the existing consumer; IDs alone are not delivery;
10. recheck due obligations against the literal action/output after relevant rewrites.

The target is the least required dependency closure, not the smallest connected graph. Independent mandatory obligations need no invented edge.

## Enforcement

Every selected obligation declares one of:

- `mechanical` — the current system can inspect a real predicate at the controlled boundary;
- `semantic` — the reasoning actor must judge meaning against the source;
- `owner-evaluated` — current authority requires owner observation;
- `unobserved` — the current surface cannot establish it.

A semantic or unobserved condition must never become mechanical PASS. Unknown is not PASS. Evidence for an earlier draft does not certify a later rewritten payload.

Graph defects fail only the affected graph-derived path. A valid legacy route remains available when it still satisfies mandatory authority and safety controls; fallback is not a bypass.

## Modes

Use additive modes:

- `legacy`: existing route controls behavior;
- `shadow`: graph compiles and compares but cannot grant authority, suppress rules, block the working route, or duplicate side effects;
- `graph`: source-bound graph output is delivered through an integrated consumer after preservation/behavior checks.

Promotion is evidence-based and scoped. Do not claim universal compliance from static graph validation.

## Current vertical slice

The first task-time operable family covers:

- literal final user-visible timestamp;
- required live root refresh;
- owner-correction reactivation;
- Active Lesson Contract boundary binding;
- Chat/Work reasoning-execution separation;
- open-outcome continuation vs explicit instruction-only/diagnostic/no-change scope;
- runnable worker-directive/artifact delivery.

The Mission Control Work handoff is the first real consumer. Its default is shadow mode; graph mode injects the compiled Active Lesson Contract before the exact bounded directive, while legacy mode preserves the current prompt.

## Commands

`scripts/uda_rule_graph.py` exposes:

- `validate` — structure, exact source extraction, identities, relations, coverage and source lock;
- `resolve` — existing pattern-level dependency/supersession resolver;
- `compile` — trusted task envelope to source-bound Active Lesson Contract;
- `explain` — inclusion/exclusion and dependency paths;
- `check` — due mechanical predicates against an exact payload;
- `impact` — affected rules/consumers for source changes;
- `compare` — legacy vs flat trigger catalog vs graph closure on the same task.

Examples live under `examples/rule-graph/`.

## Consumer surface matrix

| Surface | Selection | Operative text delivery | Boundary enforcement | Current state |
|---|---|---|---|---|
| Repository compiler / CLI | graph + flat + legacy comparison | exact extracted source in Active Lesson Contract export | mechanical predicates only where implemented | IMPLEMENTED / focused exercised |
| Mission Control native Work prompt | precompiled Work-handoff profile is loaded | graph mode injects the exact compiled contract before the bounded directive | existing Work admission remains authoritative; graph cannot expand authority | CONSUMER_WIRED; default SHADOW |
| Ordinary Chat/manual attachment | CLI export available | human-readable contract artifact can be attached/delivered | no runtime interceptor claimed | IMPLEMENTED export; not globally adopted |
| Final outgoing payload | selected final-output obligations can be checked | N/A | literal timestamp predicate implemented; semantic/unobserved checks return UNKNOWN | IMPLEMENTED predicate |
| Live per-task Mission Control recompilation | task facts would need binding at dispatch time | not yet active | not yet active | NOT YET ADOPTED |

The current generated Mission Control Work contract is a representative Work-handoff profile used to exercise the real prompt adapter. It is not evidence that arbitrary live tasks are dynamically recompiled. Keep Mission Control in shadow mode until per-task trusted facts are bound to compilation; graph mode remains an explicit test/experimental mode.

## Maintenance and measurement

Canonical source changes come first. Then update reviewed metadata, regenerate source locks/contracts, run affected fixtures, and invalidate affected consumers. Generated locks/indexes are not hand-edited authority.

Measure selection preservation, source-loading/contract bytes, dependency completeness, application at the correct actor/phase/destination, false denials, and maintenance cost separately. Include graph/compiler/root overhead; a token-saving target must never justify omitting a mandatory obligation.

Track separately: `STRUCTURE_VALIDATED`, `PRESERVATION_REVIEWED`, `CONSUMER_WIRED`, `BEHAVIOR_OBSERVED`, and `LIVE_SCOPE_VERIFIED`.

## Limits

The graph models declared relationships and source-bound activation. It does not prove that semantic reasoning was correct, that an uncontrolled provider rendered an unseen payload unchanged, that a rule absent from the graph is irrelevant, or that the owner outcome advanced. Those remain owned by current UDA authority, task-time enforcement, and direct outcome evidence.
