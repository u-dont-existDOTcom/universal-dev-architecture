# Rule graph activation and dependency resolution

## Purpose

UDA prose remains the canonical meaning and authority of every rule. This pattern adds a machine-readable **routing and dependency graph** so a selected rule can mechanically expand the other rules it depends on, detect declared supersession/conflict, and expose the phases where obligations must remain live.

The graph is **not** a replacement for `AGENTS.md`, `LESSON-INDEX.md`, canonical patterns, current owner/project authority, or task-time semantic judgment. A graph edge cannot create authority that the canonical source does not contain.

## Why a graph

UDA already behaves like a graph:

`root/bootstrap → routing index → triggered rule → dependency expansion → task-time activation → enforcement boundary`.

The current prose/index architecture is good at meaning and retrieval, but weaker at mechanically answering:

- which companion rules must also be active;
- which rule is a scoped specialization of another;
- which historical rule is superseded;
- which combinations have an unresolved declared conflict;
- which lifecycle phases must carry the obligation.

The graph makes those relations explicit without turning prose into a graph database.

## Existing-work disposition

This is an **adapt/compose** change, not a new policy-engine theory.

- Policy-as-code systems such as Open Policy Agent separate policy management/decision logic from enforcement. UDA keeps the same separation: canonical prose owns meaning; task-time activation and admission gates own enforcement.
- Build systems such as Bazel represent declared dependencies as a DAG and distinguish declared dependency structure from what actually happens at execution time. UDA uses the graph as declared routing metadata and still requires activation/application evidence before claiming a rule affected a task.

The UDA-specific remainder is the relation vocabulary and its binding to lesson activation, authority, handoff, and owner-delivery phases.

## Canonical graph

Machine-readable source:

`rules/UDA-RULE-GRAPH.json`

Every node has:

- `rule_id` — stable machine identity;
- `canonical_path` — normative prose owner;
- `trigger` — compact routing condition, subordinate to canonical prose;
- `requires` — rules that must join the active set;
- `inherits` — parent rules whose applicable obligations carry into the specialization;
- `supersedes` — historical rule IDs replaced for current use;
- `conflicts_with` — rules that need explicit authority resolution before co-activation;
- `enforcement_phase` — one or more of retrieval, reasoning, action, handoff, persistence, delivery, release;
- `status` — active or superseded.

The graph may initially cover only high-leverage relationships. A rule absent from the graph still routes through `LESSON-INDEX.md` and its canonical prose. **Absence from the graph never means the rule is inapplicable.**

## Resolution algorithm

After ordinary task classification selects one or more graph-covered rule IDs:

1. resolve a selected superseded ID to its active successor;
2. recursively expand `requires` and `inherits`;
3. reject unknown relation targets or dependency cycles;
4. reject an active-set pair declared in `conflicts_with` until current authority resolves it;
5. topologically order dependencies before dependents;
6. load each canonical path once;
7. compile only task-relevant obligations into the Active Lesson Contract;
8. carry each open obligation to its declared enforcement phase and actual destination.

Mechanical resolver:

`python3 scripts/uda_rule_graph.py resolve --rule <rule-id> [--rule <rule-id> ...]`

Validator:

`python3 scripts/uda_rule_graph.py validate`

The resolver output is routing evidence, not application evidence.

## Authority and conflicts

Authority order remains unchanged. The graph cannot:

- override a current owner instruction;
- make a project adopt a universal rule it has not actually activated when activation is required;
- turn a historical/superseded rule back into current authority;
- resolve a semantic conflict by file order;
- claim that a rule was followed because its node was present.

If canonical prose and graph metadata disagree, canonical prose wins and the graph is stale. Repair the graph before relying on it again.

## Task-time activation

When graph expansion materially affects a task, the Active Lesson Contract records:

- selected rule IDs;
- graph ref/commit;
- resolved dependency closure;
- supersession redirects;
- unresolved conflicts, if any;
- enforcement phases that create open obligations.

Then apply the existing task-time activation rule. `graph resolved` is not `rule activated`; `rule activated` is not `rule applied`; `rule applied` is not `outcome satisfied`.

## Maintenance

When adding or materially changing a graph-covered rule:

1. preserve its canonical prose owner;
2. update graph metadata only for real semantic/operational dependencies;
3. prefer `requires` over `inherits` unless the child truly carries the parent's applicable constraints;
4. add `supersedes` only when current authority actually replaced the older rule;
5. add `conflicts_with` only for a genuine co-activation conflict, not mere overlap;
6. keep triggers compact and use the canonical pattern for nuance;
7. validate the graph and its resolver;
8. do not force every independent rule to have an artificial edge.

Do not optimize for a densely connected graph. The goal is correct activation, not graph complexity.

## Limits

The graph models **declared** rule relationships. It does not prove:

- the actor loaded the graph;
- the canonical rule reached the reasoning path;
- a semantic obligation was interpreted correctly;
- the action/delivery satisfied the rule;
- the owner outcome advanced.

Those remain activation, enforcement, and outcome-evidence questions owned by the existing UDA patterns.
