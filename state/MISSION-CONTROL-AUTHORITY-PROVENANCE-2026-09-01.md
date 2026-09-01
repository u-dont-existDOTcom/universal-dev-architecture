# Mission Control authority-provenance repair — 2026-09-01

Status: `TESTS_PASS` (draft branch only; not merged or pushed by this execution)

## Goal and authority

- Implement the admitted Pro `REVISE` directive for scope
  `supervision-architecture/a40d413-authority-provenance-v1`.
- Exact external directive evidence is bound through sanitized receipt
  `feedback/mission-control/PRO-META-A40D413-SANITIZED-EVIDENCE-RECEIPT-20260901.json`
  to `u-dont-existDOTcom/humandesign@bf8fa12bb133faa042e20a7408a0990aadf72eb6:state/PRO-META-REVIEW-2026-09-01.md`,
  artifact SHA-256 `c10d68a4b28112f1cf17c2b4cd830ebac98823bf7e8ed2842d645c2461ff9139`.
  Raw Chat URLs and conversation-session identifiers are excluded.
- Mission Control branch:
  `feedback/supervision-authority-laundering-20260901`.
- Pre-mutation remote/head preflight matched
  `6ec73802cf9439be7160f9ac2eea58c7bb95e683`.
- Assurance lane: iteration with targeted hard gates for authorization,
  reasoning-receipt admission, and protected browser ownership.

## Active constraints

- No authority rank; required authorizations are exact, scoped, and
  conjunctive.
- Neither 23 nor 76 nor another Human Design completeness denominator is
  authorized without `OWNER_EXPLICIT` promotion.
- Browser UI evidence is `OBSERVED_UI_RECEIPT`, never cryptographic platform
  attestation.
- GitHub/repository retrieval defaults to authenticated CLI or local Git.
- Close only same-session, same-transaction `AGENT_OPENED` tabs. Unknown,
  owner-existing, protected, and reasoning-conversation tabs fail closed.
- Do not infer who closed a stale or absent tab.
- No merge, push, deploy, participant contact, spending, session replacement,
  or browser-tab closure is authorized by this task.

## Implemented candidate

- Versioned claim record with exact scope references and conjunctive required
  authorizations.
- Append-only, digest-chained claim transitions; promotion requires a new claim
  version and new qualifying authority source.
- Exact-subject independent reproduction that verifies facts but cannot promote
  policy.
- Session/transaction-bound reasoning-surface observation receipt with exact
  visible mode, independent observation dimensions, payload binding, response
  binding, replay protection, and assurance-class honesty.
- Response-digest-bound supervision verdict admission.
- Independent browser-operation receipt with necessity/alternatives, baseline,
  one transient tab cap, ownership, protected-tab enforcement, and cleanup.
- Durable dispositions for
  `MC-BROWSER-REPO-TAB-SPRAWL-20260901-001` and
  `MC-PRO-MODE-RECEIPT-MISMATCH-20260901-001`.
- JSON Schemas, instantiable templates, deterministic evaluator/validator,
  hostile fixtures, and all Pro-required named regressions.
- Independent-review hardening requires a relying-party-supplied immutable
  authority registry and complete validated promotion transition; embedded
  claim authority and transition-type labels have no authorization weight.
- Reproduction is bound to the claim-listed receipt, exact subject, actual
  method bytes, canonical result value/bytes, and the claim's own production
  requirement.
- Reasoning admission receives the required role, subject, repository head,
  input/submitted/response bytes externally and records single use in an
  append-only fsync-backed consumption ledger.
- Browser ownership requires exact successful `OPEN` equality or a validated
  immutable prior-receipt proof, then reconciles opened, closed, and remaining
  tabs with cleanup attempted.
- Hostile fixtures are executable inputs: the repository validator runs every
  scenario through the real evaluator and compares actual outcomes.
- Second-review evidence binding uses the exact 33,847-byte contiguous suffix
  after the unique `## Complete response\n\n` marker in the bound Human Design
  Git blob, with no normalization; the validator can read the exact external
  commit and recompute both artifact and response digests without committing a
  raw Chat URL or conversation-session identifier.
- Reasoning admission now receives admission-question bytes and any payload
  transform externally. Receipt, verdict, and durable consumption event bind
  the admission-question digest; a declared transform must be executed over
  the exact input and reproduce the submitted bytes.
- Every verified UI observation requires a nonempty evidence reference and a
  valid timezone-bearing observation timestamp.
- Browser actions are evaluated in order; navigate/close requires ownership
  established by an earlier successful open or immutable prior proof, and a
  successful close removes the live tab from the cleanup reconciliation set.
- Claim transition chains validate the complete prior record and canonical
  digest and require exact prior `toClaimRef` to current `fromClaimRef`
  continuity. Reproduction evaluates all required independence fields at
  runtime, not only at schema-validation time.

## Verification

- Focused baseline before mutation: 11/11 passed.
- New authority/provenance, reasoning receipt, browser operation, schema,
  incident, and retained PR #52 regressions: 58/58 passed.
- Tightened exact-scope/digest/UI/browser regressions: 47/47 passed.
- Standalone JSON, JSON-Schema subset, template-instantiation, hostile-fixture,
  and incident validation: 13/13 checks passed.
- Initial full repository unit suite: 292/292 passed.
- Independent-review blocker regressions before repair: 7/7 failed, reproducing
  all reported trust shortcuts.
- Post-repair authority/reproduction/reasoning/browser and retained focused
  suite: 73/73 passed.
- Post-repair full repository unit suite: 307/307 passed.
- Post-repair standalone validation: 17/17 checks passed, including execution
  of 35 hostile scenarios (11 claim, 15 reasoning, 9 browser).
- Second-review blocker regressions before repair: 7/7 failed against
  `795df95` (the initial three directly in the repair worktree and the later
  four in a disposable detached worktree), reproducing the incorrect response
  slice, admission-question self-selection, close-before-open, fabricated or
  missing transition history, absent independence evidence, unexecuted payload
  transform, and empty/invalid verified-observation evidence bypasses.
- Second-review focused authority/reasoning/browser/retained suite: 83/83
  passed.
- Second-review full repository unit suite: 317/317 passed.
- Second-review standalone validation: 18/18 checks passed, including exact
  external Git-blob extraction and execution of 44 hostile scenarios (14
  claim, 20 reasoning, 10 browser).
- Deterministic repository audit: `PASS: no findings.`
- `python3 -m py_compile scripts/mission_control_provenance.py scripts/validate_mission_control_provenance.py`: passed.
- `git diff --check`: passed before the final verification checkpoint.
- No browser tabs were opened, navigated, or closed by this implementation
  task.

## Remaining / next safe action

1. Review the exact diff, commit locally on the draft PR branch, and report the
   commit without pushing.
2. Parent execution must separately finish and verify the authorized Human
   Design draft changes. Owner-authority, merge, release, and deployment remain
   open.
