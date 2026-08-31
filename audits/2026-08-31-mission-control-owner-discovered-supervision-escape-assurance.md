# Mission Control owner-discovered supervision-escape assurance — conception snapshot and bounded existing-work scan

**Date:** 2026-08-31  
**Status:** Chat-authored architecture evidence  
**Parent:** `u-dont-existDOTcom/universal-dev-architecture#42`  
**Owner source:** `I feel like i need a mission control FOR the mission control` → `Implement that`  
**Owner-source SHA-256:** `00f603491b437005fe0044aea96968639d941a3cb8005087cd8252e45da5f1f3`

## 1. Independent conception snapshot — preserved before the existing-work scan

### Problem

Mission Control can be locally coherent, emit worker findings, run reasoning reviews, and maintain correction state while still failing at its own root purpose: reducing the need for the owner to discover important supervision failures manually.

The existing Mission Control control planes are predominantly **white-box**: worker-to-contract alignment, contract-to-owner alignment, outcome advancement, strategy efficacy, correction lifecycle, reasoning-review freshness, delivery frontier, evidence capability, and execution state. Those signals can all be internally well formed while the supervisory organization still misses the important thing the owner notices from outside.

The missing question is:

> **During the review window, what important problem did the owner discover before Mission Control or its reasoning supervisors did?**

### Candidate mechanism

Add one thin independent **Mission Control Assurance Plane** that consumes existing durable events and owner-intervention evidence. It records a **supervision escape** when all of the following are established by a reasoning authority:

1. a material problem already existed;
2. evidence sufficient to make the problem reasonably detectable was already available to the supervised system;
3. Mission Control / the assigned reasoning supervisor had not already surfaced the problem with a current finding, correction, hold, strategy replacement, or owner-decision request;
4. the owner identified the problem first.

The assurance plane is not a scheduler, worker controller, strategy selector, or second Mission Control. It observes, evaluates, and routes architecture defects through the existing supervision-design feedback/correction machinery.

### Constraints

- Do not create a second task scheduler, second dashboard product, second event ledger, or parallel correction system.
- Do not create recursive `Mission Control -> meta Mission Control -> meta-meta Mission Control` topology.
- Reuse the existing shared supervision-design feedback lane and the existing governance/supervision-recursion budgets.
- Extra High remains the default semantic reasoning authority; Pro is used only under the existing Pro-admission gate.
- Deterministic code may validate records, timestamps, identities, set membership, ordering, counts, repeated families, and lifecycle consistency. It must not decide whether an owner statement is semantically a material supervision escape.
- Owner interventions that add a new requirement, provide new external facts, make a reserved subjective judgment, or exercise a genuinely owner-only decision are **not** supervision escapes.
- A system finding that preceded the owner’s later comment is **not** an escape merely because the owner mentions the same problem.
- If this assurance plane itself repeatedly needs owner correction, redesign this plane; do not add another supervisory layer.

### Candidate insight

`owner_discovered_before_system` is an external black-box failure signal for the supervisory organization. A count or rate is useful diagnostic metadata, but the primary operator output is the concrete escape: what was missed, when it became detectable, who detected it first, what correction is underway, and whether the repair subsequently prevented recurrence.

**Conception snapshot SHA-256:** `534f034af79028221cb74f2b9e47f4b498fd19737c532b9ac3912ae26139b28c`

---

## 2. Bounded existing-work scan

The scan was intentionally bounded to strong established analogues and the repository’s own mature controls. The goal is not to claim a novel monitoring theory.

### 2.1 Google SRE: white-box plus black-box monitoring

Source: Google SRE, *Monitoring Distributed Systems*  
https://sre.google/sre-book/monitoring-distributed-systems/

Reusable principle:

- internal instrumentation and external behavior answer different questions;
- user-visible or external tests can reveal failures that internal health metrics miss;
- monitoring should detect important problems before users have to report them;
- monitoring architecture should remain simple enough to trust and maintain.

Applicability here:

Mission Control’s existing worker/task state is analogous to white-box telemetry. Owner-discovered supervision escapes provide the missing external/black-box signal. The owner is not treated as a monitoring component that should keep doing manual QA; an owner-first detection is evidence that the automated supervisory organization failed to surface a condition in time.

### 2.2 Google SRE: hierarchical aggregation

Source: Google SRE, *Practical Alerting from Time-Series Data*  
https://sre.google/sre-book/practical-alerting/

Reusable principle:

- large systems aggregate signals hierarchically rather than presenting every component equally;
- monitoring exists to measure alignment with higher-level service/business goals;
- a higher-level monitor may consume summaries from lower-level monitors.

Applicability here:

A higher assurance projection over Mission Control is legitimate **only as aggregation/evaluation**, not as another orchestration hierarchy. It should consume the existing event ledger and correction state, then summarize whether the supervision system is actually catching owner-relevant failures.

### 2.3 Google SRE: monitoring simplicity

Source: Google SRE, *Monitoring Distributed Systems — As Simple as Possible, No Simpler*  
https://sre.google/sre-book/monitoring-distributed-systems/#xref_monitoring_as-simple-as-possible

Reusable principle:

Monitoring can itself become fragile, overcomplicated, and expensive. High-value rules should remain simple, predictable, and reliable; rarely exercised complexity should be removed.

Applicability here:

Reject a second dashboard stack, second scheduler, duplicate task state, or new supervisory bureaucracy. Add two compact record types and one assurance projection over existing events.

### 2.4 Existing Universal architecture: supervision assurance and shared design feedback

Current repository pattern: `patterns/supervision-assurance-planes-and-pro-meta-review.md`

Already solved:

- worker-to-contract and contract-to-owner must be separate;
- independent owner-source receipt;
- typed completion claims;
- recurring reconciliation;
- shared supervision-design feedback lane;
- shared Pro design-review mechanism when actually warranted.

Reusable here:

A supervision escape should route through the same design-feedback and correction lifecycle. Do not invent a new architecture-change governance path.

### 2.5 Existing Universal architecture: anti-governance and anti-supervision recursion

Current directive: `docs/exec-plans/2026-08-31-mission-control-delivery-frontier-governance-recursion-and-pro-admission.md`

Already solved:

- supporting/governance/supervision cycles are budgeted;
- repeated review cannot become the work itself;
- direct delivery/evidence frontier outranks endless governance;
- Extra High is the default reasoning surface;
- Pro requires an admission basis.

Reusable here:

The Mission Control Assurance Plane must not create recurring ceremonial meta-review. It runs from event triggers and bounded review windows, produces a concrete finding only when evidence warrants one, and then uses the existing correction path.

---

## 3. Solved, partially solved, incompatible, unresolved

| Question | State | Disposition |
|---|---|---|
| Can higher-level monitoring consume lower-level monitoring? | Solved in mature SRE practice | Reuse hierarchical aggregation concept |
| Should internal state be complemented by an external/user-view signal? | Solved in mature SRE practice | Adapt white-box/black-box distinction |
| Should monitoring itself stay simple? | Solved | Hard anti-recursion constraint |
| Does Universal already have a supervision-design feedback path? | Solved | Reuse; no new governance lane |
| Does Universal already prevent supervision/governance recursion? | Partially solved | Reuse budgets; extend to meta-assurance |
| Does Universal already record owner-forced progress review? | Partially solved | Reuse as a candidate escape signal, not an automatic semantic verdict |
| Does Universal distinguish new owner requirements from failures the system should already have detected? | Not sufficiently solved for assurance | Add explicit owner-intervention disposition |
| Can the system currently answer “what did the owner catch first?” | Unresolved | Add supervision-escape record + assurance projection |
| Can deterministic code decide semantic materiality/detectability from owner prose? | Incompatible with current role boundary | Keep judgment chat-authored |
| Should a new meta-meta supervisor be created if assurance fails? | Incompatible | Redesign the existing assurance plane instead |

---

## 4. Build / adapt / reuse decision

**Decision: ADAPT + COMPOSE.**

Reuse:

- current append-only Mission Control event/evidence model;
- current owner-source identity;
- existing `OWNER_FORCED_PROGRESS_REVIEW` and related owner-forced continuation evidence;
- current finding/correction lifecycle;
- existing supervision-design feedback route;
- existing Extra-High/Pro admission rule;
- existing governance/supervision-recursion budgets.

Adapt:

- SRE black-box monitoring into an owner-view supervisory assurance signal;
- hierarchical monitoring into a read-only assurance projection;
- escape/incident thinking into typed supervision-escape records with causal timing.

Invent only the project-specific remainder:

- exact `SUPERVISION-ESCAPE` schema;
- exact `MISSION-CONTROL-ASSURANCE` schema;
- machine projection and hostile regressions for owner-first discovery;
- dashboard projection of missed detections and repair verification;
- anti-meta-recursion invariant.

No second scheduler, second service, second database, or second dashboard application is warranted.

---

## 5. Baseline against which this change must be tested

The strongest current baseline is the existing PR #42 architecture with:

- dual alignment;
- owner-outcome advancement;
- strategy efficacy and `NO_VALID_STRATEGY`;
- chat-led reasoning / Codex execution;
- delivery frontier and evidence capability;
- scoped blockers;
- correction lifecycle;
- supervision-design feedback;
- anti-governance/supervision recursion.

The new assurance plane is successful only if it detects failures that this baseline can otherwise miss **without** creating more owner burden or another supervisory bureaucracy.

Minimum benchmark cases:

1. Somatic outcome regression exists; owner has to ask whether progress occurred before the system raises the issue → escape.
2. The system raises outcome regression and starts correction before the owner comments → not an escape.
3. Owner adds a genuinely new requirement → not an escape.
4. Codex is acting as reasoning controller and the owner has to correct that after evidence was already present → escape.
5. A project-local stop is incorrectly projected to the root chain and the owner has to ask why execution stopped → escape.
6. The assurance plane itself is corrected by the owner → redesign the same plane; creation of `META_META_SUPERVISOR` must fail.
