# Prior-work scan — UDA rule dependency graph

Date: 2026-09-22

## Independent conception

Problem: UDA is already conceptually a graph, but most individual rule dependencies, inheritance, supersession, conflicts, and enforcement phases are represented only in prose and indexes. That makes it easy to select one rule while missing a required companion rule.

Candidate mechanism: keep prose as canonical meaning and add a lightweight machine-readable graph with stable rule IDs, triggers, dependency relations, and enforcement phases. Resolve only the selected rule closure rather than loading the whole graph.

Constraints:
- current owner/project authority remains highest;
- prose remains normative;
- graph metadata cannot prove runtime activation/application;
- no giant graph database or mandatory loading of every UDA rule;
- preserve current lesson-index/task-time activation model.

## Existing-work scan

### Policy-as-code / admission control
Open Policy Agent separates policy decision logic from policy enforcement and accepts structured policy/data inputs. This supports UDA's existing separation between durable rules, activation/decision logic, and enforcement points.

Reference: https://www.openpolicyagent.org/docs

### Dependency DAGs
Bazel models declared dependencies as a directed acyclic graph and distinguishes declared dependencies from actual execution dependencies. That distinction maps well to UDA: graph edges are declared routing metadata, while activation/application evidence remains a separate runtime question.

Reference: https://bazel.build/versions/8.0.0/concepts/dependencies

### Existing UDA architecture
- `scripts/instruction-layering-profile.json` already encodes role-level inheritance.
- `patterns/task-time-lesson-activation.md` already separates lesson store, activation/compiler, enforcement, and closeout.
- `LESSON-INDEX.md` already acts as the trigger-routing catalog.

## Existing-work map

- Already solved: general policy decision/enforcement separation; dependency-DAG mechanics.
- Partially solved internally: role inheritance and task-time activation.
- Composable: existing lesson index + role layering + dependency graph + active lesson contract.
- Novel remainder: UDA-specific relation semantics and enforcement-phase binding.
- Uncertain: whether every current pattern benefits from explicit edges; avoid artificial density.

## Disposition

**adapt + compose**

Use established DAG/policy-separation ideas, preserve UDA prose as authority, and add a small dependency resolver. Do not invent a separate rule engine.

## External baseline

A useful graph should at minimum match a normal dependency DAG's guarantees:
- stable node identity;
- explicit directed dependency edges;
- cycle rejection;
- transitive closure;
- deterministic dependency-before-dependent ordering;
- clear distinction between declared graph structure and actual execution/application.

The UDA extension additionally needs supersession, explicit conflict metadata, and lifecycle enforcement phases.
