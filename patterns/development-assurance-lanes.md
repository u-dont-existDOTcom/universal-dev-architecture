# Development assurance lanes

## Status

Current universal pattern.

## Purpose

Prevent autonomous development from turning an ordinary product question, exploratory repair, or reversible experiment into a release-certification campaign.

The governing principle is **assurance proportional to the decision being made now**. Development should optimize for fast learning until the owner actually asks to release, merge, publish, install, deploy, migrate, or otherwise cross a consequential boundary.

A question such as “why is this worse?”, “try this fix”, “does this architecture work?”, or “make the app better” is **not** by itself a request for release-grade proof.

This pattern complements `patterns/test-efficiency-and-verification-budget.md`: test-efficiency controls repeated test cost inside a task; assurance lanes control how much validation, review, benchmarking, and release machinery the task should invoke in the first place.

## Default lane

Unless current owner/project requirements explicitly establish otherwise, software work starts in the **Iteration lane**.

Do not autonomously escalate from Iteration to Decision or Release merely because:

- the change is non-trivial;
- a branch or worktree exists;
- tests are green;
- a possible architecture alternative exists;
- an independent reviewer is available;
- a repository has comprehensive release gates;
- a prior project used a heavy verification process;
- the agent can gather more evidence.

Escalate only when the current decision requires the additional assurance.

## Lane 1 — Iteration

### Goal

Learn quickly whether a reversible change improves the actual product behavior.

### Default loop

1. inspect the relevant current implementation and evidence;
2. form the smallest falsifiable diagnosis;
3. make the smallest reversible candidate change;
4. run focused/affected deterministic tests needed to catch obvious regressions;
5. run a small number of representative real/product cases when behavior quality is the question;
6. surface the actual changed behavior to the owner or product evaluator as early as possible;
7. keep, adjust, or revert based on that evidence;
8. continue the product loop.

### Default assurance budget

Use only evidence that can plausibly change the next development decision.

Typical defaults:

- focused/affected tests, not the full repository suite;
- one representative real case plus a small number of targeted edge cases when needed;
- no mutation campaign;
- no publication/security scan unless the changed surface specifically requires it;
- no multi-model judge tournament;
- no repeated stochastic samples unless variability itself is blocking the decision;
- no independent exact-diff review unless the change is high-risk or review would resolve a real uncertainty;
- no PR/merge-ready evidence package merely to let the owner try a reversible local candidate.

These are defaults, not excuses to bypass a directly relevant safety invariant.

### Completion meaning

Iteration completion means **a useful reversible candidate or a falsified hypothesis**, not merge/release readiness.

A candidate may be explicitly labeled experimental and left behind a feature flag, branch, local build, preview, or rollback switch.

Do not hold owner evaluation hostage to release-grade gates when the candidate can be tried safely and reversibly first.

## Lane 2 — Decision

### Goal

Resolve a material architecture/product choice when ordinary iteration does not clearly distinguish alternatives.

Use this lane when two or more plausible approaches remain and choosing incorrectly would cause meaningful rework, lock-in, cost, or product degradation.

### Default method

- keep the comparison as small as the decision permits;
- hold unrelated variables constant;
- compare the strongest minimal alternatives directly;
- use representative cases rather than exhaustive synthetic landscapes by default;
- prefer direct owner/product evaluation when the quality criterion is inherently experiential or subjective;
- use one independent evaluator when useful; add more only when evaluator variance is itself decision-relevant;
- stop once evidence is sufficient to choose the next reversible implementation.

A decision experiment should not silently become a publication-quality benchmark.

### Simplicity rule

When a simpler candidate and a more complex candidate both improve the control, directly compare them before adopting the more complex architecture.

If they are effectively tied on decision-relevant evidence, prefer the simpler reversible candidate unless current requirements justify the added complexity.

### Completion meaning

Decision completion means **an evidence-supported direction for the next implementation**, not release readiness.

After the decision, return to Iteration unless the owner explicitly requests a release/merge/deploy boundary.

## Lane 3 — Release

### Goal

Establish the assurance required to cross a consequential production boundary.

Enter this lane when the owner or current project requirements actually call for one or more of:

- merge to a protected/canonical branch;
- stable/release promotion;
- installation or deployment;
- publication/disclosure;
- irreversible migration;
- security/auth/payment/data-integrity change;
- package/release signing;
- another explicitly release-grade acceptance boundary.

### Expected assurance

This is where full repository requirements belong:

- full relevant suites;
- required graph/integration/E2E regressions;
- release-specific mutation gates when applicable;
- security/privacy/publication audits;
- exact-model or entitlement checks when production depends on them;
- independent exact-diff review when required;
- rollback/recovery verification;
- clean-tree/ref evidence;
- required CI/hosted checks;
- release receipts and durable handoff state.

Repository-declared mandatory release/CI gates remain mandatory at this boundary.

## High-risk exception

A development task may require a **targeted hard gate** even while remaining in Iteration or Decision.

Examples include:

- authentication/authorization;
- money movement;
- destructive data operations;
- migration correctness;
- user-safety blocks;
- secrets/privacy boundaries;
- executable untrusted input;
- installer/updater rollback;
- irreversible external writes.

Run the smallest hard gate needed to keep experimentation safe. Do not use the existence of one high-risk invariant to import every unrelated release gate into the inner loop.

Example: a therapy-app experiment may need deterministic prevention of unsafe deepening while still deferring full repository publication scans, multi-model evaluation, and release verification until release time.

## Evidence proportionality rule

Before launching any expensive validation action, ask:

> What current decision can this result change?

If there is no concrete answer, defer the action.

Examples of expensive actions requiring a decision-relevant reason in Iteration/Decision:

- full repository verification;
- whole-repository mutation testing;
- multi-model repeated judging;
- broad synthetic benchmark generation;
- exhaustive provenance audits;
- publication/secret scans unrelated to the changed surface;
- multiple independent reviews of an experimental candidate;
- hosted CI campaigns;
- repeated exact-model probes after an unchanged valid result.

Preserve deferred obligations as release debt rather than pretending they do not exist.

## External-provider blocking rule

Optional evaluation infrastructure must not stall product development.

If an optional judge, benchmark model, hosted CI service, or other external evaluator is rate-limited or unavailable:

1. preserve completed evidence and the blocker truthfully;
2. continue all safe work that does not depend on that result;
3. prefer owner evaluation or a smaller local comparison when sufficient for the current iteration decision;
4. defer the optional evidence to the appropriate later checkpoint.

Do not substitute an unauthorized model or weaken a hard safety check merely to bypass a provider limit.

If the blocked evidence is genuinely required for the current decision, mark only that decision blocked; do not freeze unrelated development.

## Owner-feedback priority

When the owner can directly experience the product behavior, get that feedback early.

For subjective product quality—writing, therapy conversation quality, UI feel, recommendation usefulness, interaction flow, creative output—the owner’s actual use of a safe experimental candidate is often more decision-relevant than another layer of model judging.

Model judges can diagnose and compare; they must not automatically become a prerequisite for showing the owner a reversible candidate.

## No assurance ratchet

A project must not permanently inherit release-grade ceremony merely because one difficult investigation once needed it.

After a high-rigor experiment or release:

- return ordinary development to Iteration;
- keep expensive harnesses available on demand;
- do not run them automatically on every later change;
- preserve explicit triggers for when they become necessary again.

One architecture study does not redefine every bugfix as an architecture study. One security release does not redefine every UI tweak as a security release.

## Lane declaration and escalation

For non-trivial work, record the active lane in the task plan/checkpoint when doing so is useful for recovery:

- `iteration`
- `decision`
- `release`

Record any temporary targeted hard gates separately.

Escalation should state the reason, for example:

- `iteration → decision: two scaffold alternatives remain materially indistinguishable`;
- `decision → release: owner requested merge/install of selected candidate`.

De-escalate after the boundary is crossed or the decision is resolved.

Do not make the owner repeatedly approve ordinary lane changes when current task requirements make them obvious.

## Anti-patterns

- Treating “fix this” as “prepare a release.”
- Treating “which approach is better?” as an invitation to run an exhaustive benchmark before trying either approach.
- Requiring a PR, complete repository audit, multiple independent reviewers, and full CI before the owner can try a reversible local candidate.
- Letting an optional model judge’s rate limit freeze unrelated product work.
- Adding more evaluators because existing evaluators disagree before asking whether the disagreement changes the next decision.
- Running synthetic case families until they outnumber the real evidence and then calling the result real-world generalization.
- Using release completion semantics for an exploratory branch.
- Preserving every experimental architecture in production code before the experiment has selected one.
- Conflating “not release-verified” with “not useful to test.”
- Conflating “green tests” with a requirement to launch more tests.

## Recovery rule

A fresh worker should recover:

1. the owner’s current goal;
2. the current assurance lane;
3. the smallest unresolved product/engineering decision;
4. completed decision-relevant evidence;
5. deferred release obligations;
6. the next smallest safe action.

Do not resume an old release-style campaign merely because its harness and checkpoints exist if the owner has since returned the project to ordinary iteration.

## Relationship to completion contracts

A repository may define strict completion rules for release, protected merge, deployment, publication, or another final boundary. Preserve them.

But bind those rules to the boundary they protect. Do not reinterpret them as prerequisites for every intermediate development response.

If an exclusive active-task lock currently encodes release-grade completion while the owner explicitly changes the goal back to rapid experimentation, update/supersede the task lock so a fresh worker does not keep pursuing stale assurance work.