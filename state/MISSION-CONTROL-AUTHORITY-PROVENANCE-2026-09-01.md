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
- Third-review transition repair replaces caller-supplied predecessor trust
  with a relying-party-supplied immutable transition registry. Each current
  transition binds the registry identity/digest, its previous digest must equal
  the trusted head, and that exact head member must terminate at the current
  `fromClaimRef`; schema-complete caller-manufactured history has no weight.
- Reproduction receipts bind an external immutable independence registry and
  exact admission digest. Its admitted producer/reproducer identities and
  trust domains must be distinct, the basis cannot assert the same producer or
  process, and the admitting relying party is distinct from both identities.
- Mission Control timestamps now use a strict RFC3339 profile with explicit
  timezone and reject ISO week dates, ordinal dates, space separators, and
  missing timezones in transition, reproduction, and verified-observation
  evaluation paths.
- Payload transforms are canonical declarative spec bytes interpreted only by
  an evaluator-owned fixed implementation and reproduced twice. Arbitrary or
  stateful callables cannot enter the admission path.
- Reasoning receipt, verdict, and durable consumption event bind a canonical
  externally supplied non-anonymous signed-in account reference; a receipt
  cannot self-select `ANONYMOUS_OR_UNKNOWN` as satisfying signed-in evidence.
- Fourth-review registry hardening seals authority, transition,
  reproduction-independence, and browser-ownership runtime types. Public
  constructors fail, evaluators require the exact concrete type, and subclasses
  are prohibited.
- Fifth-review registry hardening removes the transferable private construction
  capability and its module helper as a trust mechanism. Every evaluator and
  `resolve` boundary decodes the complete canonical immutable record sequence,
  reruns exact record and chain semantics through the validated factory,
  recomputes registry identity/digest/head/order, and requires exact rebuilt
  state equality. Helper-minted partial authority, transition,
  reproduction-independence, and browser-ownership objects fail closed.
- Payload-transform subclasses are prohibited. Admission requires the exact
  transform type and invokes the evaluator-owned declarative implementation
  directly, so overriding virtual `apply` dispatch cannot substitute unrelated
  submitted bytes.
- The repository schema validator now executes `format: date-time` using the
  same strict RFC3339 real-calendar check as runtime evaluation. Regex-shaped
  impossible dates such as `2026-02-30T00:00:00Z` fail transition,
  reproduction, and reasoning-observation schemas.
- Sixth-review timestamp hardening applies that same runtime check to every
  schema-declared date-time before use: claim `createdAt`/optional `expiresAt`,
  transition `recordedAt`, reproduction `reproducedAt`, top-level reasoning
  `observedAt`, every non-null nested observation `observedAt`, verdict
  `issuedAt`/optional `admittedAt`, and top-level browser-receipt `recordedAt`.
  Invalid verdict timestamps fail before the durable consumption write. Browser
  actions have no schema-declared timestamp field.

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
- Third-review blocker regressions before repair: 6/6 failed against
  `34b2c47`, reproducing complete fabricated predecessor admission (direct and
  through claim use), ISO week-date acceptance, same-process independence
  self-assertion, stateful callable transform admission, and anonymous account
  self-selection.
- Third-review focused authority/reproduction/reasoning/browser/schema suite:
  83/83 passed; combined authority-provenance and claim-laundering affected
  suite: 89/89 passed.
- Third-review full repository unit suite: 328/328 passed.
- Third-review standalone validation: 20/20 checks passed, including execution
  of 53 hostile scenarios (18 claim, 25 reasoning, 10 browser).
- Fourth-review blocker regressions before repair: 5/5 bypasses reproduced
  against `f4d0814`: direct transition-registry construction, payload-transform
  subclass override, and invalid calendar-date acceptance in each of the three
  timestamp schemas.
- Fourth-review focused sealed-construction/transform/schema regressions: 26/26
  passed; combined authority-provenance and claim-laundering affected suite:
  93/93 passed.
- Fourth-review full repository unit suite: 332/332 passed.
- Fourth-review standalone validation: 20/20 checks passed, including exact
  external Git-blob extraction and execution of 58 hostile scenarios (21
  claim, 27 reasoning, 10 browser).
- Fifth-review blocker regressions before repair: 4/4 bypasses reproduced
  against `b672ae6`: the module helper could manufacture exact registry types
  carrying incomplete authority, transition, reproduction-independence, and
  browser-ownership records.
- Fifth-review focused registry-integrity and fixture suite: 30/30 passed;
  combined authority-provenance and claim-laundering affected suite: 97/97
  passed.
- Fifth-review full repository unit suite: 336/336 passed.
- Fifth-review standalone validation: 20/20 checks passed, including exact
  external Git-blob extraction and execution of 61 hostile scenarios (23
  claim, 27 reasoning, 11 browser).
- Sixth-review blocker regressions before repair reproduced six uncovered
  runtime admissions against `df2fd25`: invalid-calendar browser-receipt
  `recordedAt`, claim `createdAt`/`expiresAt`, reasoning-receipt top-level
  `observedAt`, and verdict `issuedAt`/`admittedAt`. Both invalid verdict cases
  wrote the durable receipt-consumption event.
- Sixth-review focused timestamp/schema/fixture suite: 34/34 passed; combined
  authority-provenance and claim-laundering affected suite: 101/101 passed.
- Sixth-review full repository unit suite: 340/340 passed.
- Sixth-review standalone validation: 20/20 checks passed, including exact
  external Git-blob extraction and execution of 68 hostile scenarios (25
  claim, 31 reasoning, 12 browser).
- Deterministic repository audit: `PASS: no findings.`
- `python3 -m py_compile scripts/mission_control_provenance.py scripts/validate_mission_control_provenance.py`: passed.
- `git diff --check`: passed before the final verification checkpoint.
- No browser tabs were opened, navigated, or closed by this implementation
  task.

## Remaining / next safe action

1. Report the locally committed sixth-review repair for independent review;
   do not push, merge, or deploy from this execution lane.
2. Parent execution must separately finish and verify the authorized Human
   Design draft changes. Owner-authority, merge, release, and deployment remain
   open.
