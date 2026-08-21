# Coverage-before-depth promotion plan

**Goal:** Promote a domain-neutral control that prevents a broad comparison or
landscape synthesis from treating a deeply audited but narrow, redundant
selection as adequate coverage.

**Baseline:** live `main` at
`129ac00bccaf7c45f388d7db8b4b61bbd4baf71b`; current lesson index, whole-source
reconstruction, candidate ranking, research-before-reinvention, durable
learning, repository profile, tests, and canonical state.

## Research-before-reinvention gate

- **Applicability:** `required`
- **Independent conception snapshot:** define a material class inventory before
  deep selection; distinguish candidates through decision-relevant
  fingerprints; preserve missing detail; track uncovered classes and new
  hypotheses; block broad synthesis while selection omissions could change the
  conclusion.
- **Existing-work scan:** Cochrane guidance distinguishes clinically meaningful
  intervention groups, components, delivery, dose, duration, context, and
  insufficiently described interventions; PRISMA-ScR maps a topic's evidence
  scope and source selection; maximal marginal relevance combines relevance
  with novelty to reduce redundancy; theoretical sampling expands collection
  when conceptual gaps emerge; NIST combinatorial coverage demonstrates that
  test-set size alone is not a coverage criterion.
- **Existing-work map:**
  - already solved/reusable: domain-specific grouping, evidence mapping,
    nonredundant selection, iterative gap-driven collection, and explicit test
    coverage criteria;
  - partially solved/adaptable: applying those controls to agent-driven broad
    comparison and synthesis workflows;
  - incompatible: fixed universal item quotas or a claim of statistical
    representativeness for purposive, provider-bounded discovery;
  - unresolved remainder: one domain-neutral selection-coverage ledger and a
    fail-closed synthesis contract that projects into domain tools.
- **Disposition:** `compose`
- **Novel remainder:** the cross-domain orchestration and mechanical synthesis
  boundary, not the underlying sampling, review, ranking, or testing concepts.
- **External baseline:** Cochrane Handbook chapters 3 and 17, PRISMA-ScR,
  Goldstein and Carbonell's MMR work, Bradley et al. on theoretical sampling,
  and NIST combinatorial coverage guidance.
- **Research debt:** none. AskRigor PR #49 supplies the exact merge commit,
  source-artifact digest, and causal-test receipts required for promotion.

## Acceptance criteria

- [x] One domain-neutral pattern makes selection coverage and audit depth
  independent gates.
- [x] A material-class inventory, candidate fingerprints, explicit unknowns,
  uncovered classes, iterative discovery, and an auditable synthesis lock are
  required.
- [x] Selection coverage and per-item depth have separate locks, composed into
  the overall synthesis boundary.
- [x] Structured fields, literal receipts, valid-record counters, reconciled
  access boundaries, capability-aware fallback, and causal isolated
  regressions prevent optimistic caller summaries from manufacturing a pass.
- [x] Normalized program signatures, stable receipt-linked source IDs,
  reciprocal discovery/candidate records, omission-impact thresholds,
  deterministic receipt projections, retryability/recovery state, invalid-
  record exclusion, and transport bounds close the adversarial bypasses found
  in the originating implementation review.
- [x] Repeated one/two-fingerprint concentration, unsupported relevance
  waivers, live continuation override, per-fingerprint/all-batch follow-up,
  production-surface receipt emission, and worst-case accepted transport have
  separate causal regressions.
- [x] Continuation completeness requires authenticated opaque or server-held
  chain state, contiguous first-to-terminal provenance, and truthful cumulative
  receipts; skipped pages, forged offsets, and lone continued pages fail.
- [x] Caller-supplied corpus-size or scope labels cannot deactivate hard
  structural coverage; applicability derives from valid ledger state or the
  invariant applies unconditionally.
- [x] Raw counts remain planning heuristics rather than quotas or proof.
- [x] Regression cases reject many redundant items and a two-item broad
  audit; access-boundary and positive-control cases preserve bounded synthesis.
- [x] Lesson and documentation indexes route the pattern and provenance audit.
- [x] Exact AskRigor PR #49 merge evidence replaces every provisional field.
- [x] Canonical current state identifies the merged Universal boundary, exact
  AskRigor provenance, protected checks, and completed recovery record.
- [x] `python3 -m unittest discover -s tests -v` passes.
- [x] `python3 scripts/audit_codex_github.py --root . --fail-on error` passes.

## Non-goals

- Do not copy health, treatment, YouTube, or AskRigor-specific class lists into
  universal guidance.
- Do not impose universal candidate or deep-audit counts.
- Do not claim that diversity establishes credibility, efficacy,
  representativeness, or completeness.
- Do not claim more than the exact AskRigor merge evidence establishes.

## Progress

| Date | State | Evidence | Next action |
| --- | --- | --- | --- |
| 2026-08-21 | Existing patterns and outside baselines reconciled; disposition `compose` | live `main` plus cited primary/official methods | Add failing regression, pattern, routes, provisional provenance audit, and recovery state |
| 2026-08-21 | Test-first contract added; pattern, routes, provisional audit, and recovery state implemented | focused test initially failed with 3 failures and 5 missing-file errors; implementation then passed 6/6 focused tests | Run complete declared gates and review diff |
| 2026-08-21 | Initial local verification passed | 8/8 focused tests; 105/105 unit tests; repository audit `PASS: no findings`; `git diff --check` clean | Project the later adversarial findings without weakening the provisional provenance gate |
| 2026-08-21 | Second AskRigor adversarial findings projected into the Universal pattern | concentration, relevance-waiver, continuation, per-fingerprint/all-batch, production-receipt, and worst-case-transport controls added | Re-run complete declared gates; keep promotion provisional until AskRigor merge receipts exist |
| 2026-08-21 | Third AskRigor adversarial findings reproduced test-first | focused regression failed on 29 missing chain-integrity and caller-label assertions | Add authenticated/server-held continuation, cumulative-receipt, and ledger-derived applicability controls; re-run every gate |
| 2026-08-21 | Third adversarial controls implemented and fully verified | authenticated/server-held continuation, first-to-terminal chain proof, truthful cumulative receipts, and ledger-derived applicability added; 10/10 focused and 107/107 full tests pass; repository audit reports `PASS: no findings` | Keep promotion provisional until exact AskRigor merge receipts exist |
| 2026-08-21 | Exact AskRigor provenance reconciled and promotion completed | AskRigor PR #49 merged as `458190ab1be0849fba3f5193d59321a9c7f0d8df`; sanitized source audit SHA-256 `a6999861fd00c3047cbd0556d04e3c8ff2b8f93d1a9d0660f4e29ec985bcffd6`; causal regressions named in the promotion audit | Run final Universal gates, review, PR, merge, and closeout |
| 2026-08-21 | Universal promotion merged, verified, and closed | Universal PR #30 merged as `2e81fefcca500265cad0e1209bab5e8fa2306743`; PR deterministic run `32538077171` and CodeQL run `32538075438` passed; merged-main compliance run `32538146652` and CodeQL run `32538146322` passed; durable state and this completed plan preserve the receipts | Return to normal maintenance |
