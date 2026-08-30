# Critique: shared Codex/Pro supervision bootstrap for long-range research

Date: 2026-08-30
Reviewed source:

- branch `architecture/codex-pro-supervision-mission-control-20260830`
- `templates/CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md`
- companion owner-outcome, Mission Control, intelligence-routing, context-lifecycle, account-failover, and `ACTIVE-TASK.json` records

Disposition: **strong core; adopt without weakening the owner-outcome invariant; add a research-mission extension rather than forcing months-long evidence work into the coding-centric active-task shape**

## What the bootstrap gets right

### 1. It prevents contract laundering

The strongest contribution is the immutable owner-outcome epoch/hash and the explicit rule that a branch, PR, passing test, checkpoint, or supervisor approval cannot silently replace the actual requested outcome. This directly addresses the common failure in which a worker completes a narrowed artifact and declares the whole mission complete.

Keep this rule unchanged.

### 2. It distinguishes terminal completion from local success

The distinction between root completion and `SUBTASK_COMPLETE_PARENT_OPEN` is necessary for parallel research, where a literature search, study audit, synthesis, UI, or deployment can be locally complete while the larger evidence mission remains open.

### 3. It routes intelligence by role

Codex for implementation, Extra High for repository-aware reasoning/research, and scarce persistent Pro supervision for consequential decisions is sound. It avoids wasting Pro on mechanical work while preserving a stronger review lane for health interpretation, conflicting evidence, and release decisions.

### 4. It distrusts self-reported progress

Requiring deterministic evidence rather than accepting worker claims is correct. For research, this should extend to source identities, search receipts, coverage windows, source hashes, audit locators, synthesis inputs, and release receipts.

### 5. It preserves continuation and account/browser hygiene

Persistent supervision chats, context rollover, account failover, and browser-tab hygiene solve real operational failure modes during long tasks. The instruction to continue unless an owner decision is genuinely needed is compatible with autonomous long-range work.

## Where the current bootstrap is too coding-centric

### 1. `ACTIVE-TASK.json` assumes one implementation task

Fields such as required branch, preflight commands, completion commands, PR state, and proposed terminal state fit software implementation. They do not fully represent:

- a research question that evolves through explicit amendments;
- many parallel source/audit/synthesis lanes;
- living surveillance with no permanent terminal frontier;
- future evidence not yet available;
- source access blocks;
- interim evidence releases;
- patient-consent authority;
- disagreement that should remain unresolved rather than merged away.

Do not overload every one of these into optional ad hoc fields. Add a `RESEARCH-MISSION.json` parent contract.

### 2. `exclusive: true` is unsafe if interpreted as one worker

One authoritative root mission is correct. One exclusive worker is not. Research requires parallel independent discovery, blinded screening, duplicate audit, contradiction challenge, and separate privacy/release review.

The correct invariant is:

- one canonical mission authority;
- many child work packages with explicit read/write sets, independence requirements, leases, and commit fences;
- no child may redefine or close the root mission.

### 3. Percent complete is not meaningful for open evidence frontiers

A software checklist may permit a completion percentage. Research usually does not. A study can reveal a new trail; a database can become available; a guideline can change; a living topic can never be exhausted forever.

Mission Control should show:

- source classes searched/pending;
- exact confirmed date windows;
- candidates screened/included/deferred;
- full-text and audit coverage;
- outcome syntheses complete/pending;
- contradictions and unresolved questions;
- access/budget/consent blocks;
- current release version and refresh state.

If a percentage is displayed, it may cover only a fixed declared work package, never the whole scientific frontier.

### 4. The lifecycle lacks long-range research states

Add explicit states for:

- scheduled surveillance;
- waiting for a future result;
- paused by user;
- paused by budget;
- blocked source access;
- blocked owner decision;
- interim snapshot;
- release candidate;
- released but mission still living;
- stale refresh failure;
- correction pending;
- cancelled/superseded/closed.

A released version is not equivalent to permanent mission completion.

### 5. The owner-outcome invariant needs an amendable hypothesis layer

The invariant outcome should protect purpose, not freeze a mistaken initial hypothesis forever. Scientific work must be able to learn that the useful question is different from the opening formulation.

Use three layers:

1. immutable owner/user purpose and non-negotiable constraints;
2. versioned amendable research questions/hypotheses;
3. child work packages.

Every amendment states why the evidence warrants it and whether it expands, narrows, or redirects the inquiry. It cannot retroactively alter the original purpose or conceal abandoned questions.

### 6. Consent and data-governance authority are missing

For patient stories or other sensitive data, owner outcome is not the only authority. The participant's specific consent, withdrawal, privacy notice, data-use limits, and legal/provider boundaries are independent higher-priority constraints for that data.

No owner request, worker goal, Pro decision, or mission checkpoint may override participant consent or transform private data into a public artifact.

### 7. Research release requires a publication firewall

A supervisor verdict may approve the next work step without authorizing publication. Add a separate immutable release object binding:

- exact claims and wording;
- source/audit/synthesis versions;
- freshness and coverage;
- dissent and limitations;
- privacy/consent/licensing checks;
- release approver and rubric versions.

Only this object may move a public current pointer.

### 8. Independent disagreement should not be forced into consensus

Parallel health-research workers should sometimes disagree. The architecture should preserve:

- independent judgments;
- source and rationale;
- adjudication where possible;
- unresolved disagreement where evidence is genuinely ambiguous.

A supervisor must not choose a tidy answer merely to increase alignment percentage.

### 9. Long-range cost and user control need first-class treatment

A months-long mission requires:

- budget ceilings by provider/worker class;
- pause/resume/cancel;
- interim snapshots;
- update cadence;
- subscriptions/notifications;
- explicit owner-decision thresholds;
- no background promise outside an executing automation system;
- fail-closed behavior when budget or credentials end.

### 10. The bootstrap is operationally dense

The detail is valuable, but the file is long enough that workers can miss the mandatory core. Split conceptually into:

- a compact non-negotiable bootstrap core;
- implementation-task module;
- long-range-research module;
- sensitive-data/consent module;
- browser/account-resource module.

The current bootstrap may remain the generated combined entry point. The source modules make review and evolution safer.

## Required extension

Add a reusable long-range research mission pattern and template with:

- root mission purpose and hash;
- amendable research questions;
- source/coverage frontier;
- work packages and independence constraints;
- leases/fence tokens;
- research-specific lifecycle;
- budgets/cadence;
- interim/releases;
- consent and public-release authority;
- conflict preservation;
- evidence-based progress fields.

This extension supplements the current bootstrap. It must not loosen the existing owner-outcome or anti-contract-laundering rules.

## AskRigor application

For AskRigor, the root mission may own:

- formal literature discovery;
- study identity and full-text access;
- independent study/review audits;
- synthesis and sensitivity analysis;
- community/patient-experience evidence as a distinct lane;
- prediction collection;
- contradiction/integrity review;
- public explanation;
- release review;
- living refresh cycles.

A worker that completes one of these lanes reports `SUBTASK_COMPLETE_PARENT_OPEN` unless the root mission's full release or closure criteria are independently satisfied.

## Overall verdict

The updated bootstrap is materially better than a conventional task handoff and should become the shared core. Its owner-outcome invariant, role routing, deterministic evidence requirement, and subtask/root distinction are exactly right.

It is not yet sufficient as the sole contract for long-range scientific research. The missing solution is not to weaken it or make `ACTIVE-TASK.json` infinitely permissive. The correct composition is:

`shared supervision bootstrap + ACTIVE-TASK for implementation work + RESEARCH-MISSION parent contract + sensitive-data consent authority + release firewall`
