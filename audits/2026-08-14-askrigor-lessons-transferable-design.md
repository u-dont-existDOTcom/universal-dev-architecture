# AskRigor Lessons Transferable Repository-Design Lessons

Status: `promoted`

Review date: 2026-08-14

Source repository: `u-dont-existDOTcom/AskRigor-lessons`

Source ref: `dd9305a39c50251fa8858ecbf45aedb16a407f64`

Source CI: `AskRigor lesson integrity` run `31777936617`, job/check `Lesson integrity` (`94697224159`), conclusion `success`

Supersedes: none

Superseded by: none

These lessons transfer to lesson, policy-incubator, research-method, decision-record, and evidence-derived guidance repositories. AskRigor's health/research protocol wording and the provisional community-comparator lesson remain project-specific.

## Provenance

- Design specification: `docs/superpowers/specs/2026-08-14-lesson-integrity-system-design.md`, SHA-256 `30a8de3f3ee612e7e2cf1504e7c90af5eb6e59fbf7bb9cc0df6a03fccee3cbc0`.
- Machine-readable schema: `schemas/lesson-ledger.schema.json`, SHA-256 `6cbabbf9a271c48287ebf52079ccc97baffb1280e5712e44da829298845a515f`.
- Integrity validator: `scripts/validate_lessons.py`, SHA-256 `f3e671107aa22159fa915f239f044b821a40255ce4cad26026c80f4a1db67fde`.
- Regression suite: `tests/test_validate_lessons.py`, SHA-256 `77c1565c0c45af1e41a20f0d2a805120624ef2ec809057a03391052748e32195`.
- Intake/closeout workflow: `docs/LESSON-INTAKE.md`, SHA-256 `6d140900812454030dfd3429d4b0f02ab971d3c748e8f2d1f92e439c46a15e1a`.
- Compliance evidence: `docs/audits/2026-08-14-codex-github-compliance.md`, SHA-256 `0a1dc881884107ac694c9bb41baef4fa8fcc2ada2d07dd75db52291f090f19b1`.

All hashes name exact bytes at the source ref. Ordinary source validation uses local Git objects; external private sources are recorded and verified separately rather than fetched by untrusted hermetic CI.

## UDA-ARL-2026-08-14-001 — Separate lesson integrity from source authority

- **Incident:** the existing lesson artifact had useful methodological content but no machine ledger, originating AskRigor incident/test, or safe basis for treating it as validated policy.
- **Lesson:** a lesson repository needs an explicit authority order and a machine field that makes every lesson non-authoritative relative to current owner correction, canonical source material, and current project evidence. Structural integrity can be active while every substantive lesson remains provisional.
- **Transfer rationale:** repositories derived from policies, standards, datasets, or primary evidence otherwise tend to become silent competing authorities merely because their summaries are easier to retrieve.
- **Scope and limits:** applies when lessons are downstream interpretations. It does not require one universal authority order, prove that an upstream source is correct, or prohibit a repository from becoming authoritative through an explicit owner/governance decision.
- **Regression evidence:** the source suite rejects a lesson that claims protocol authority or lacks exact required references.

## UDA-ARL-2026-08-14-002 — Bind provenance to immutable bytes and state what CI did not verify

- **Incident:** a current path can drift after a lesson is recorded, while a commit label or narrative citation alone does not prove the bytes used to derive the lesson.
- **Lesson:** record source repository, full commit, safe path/artifact, byte SHA-256, capture date, and originating incident/experiment/test. Verify same-repository historical bytes with local Git objects. Mark external evidence as externally recorded and preserve separate authenticated verification; do not make ordinary CI fetch private sources or claim verification it did not perform.
- **Transfer rationale:** immutable byte provenance permits later re-evaluation without copying raw protected evidence or trusting a moving branch/path.
- **Scope and limits:** a matching hash proves identity, not quality, legality, scientific validity, or current relevance. Binary/large-data systems may need signed manifests or approved object-store receipts instead of Git blobs.
- **Regression evidence:** malformed commits/hashes/dates, missing provenance, unavailable paths, and mismatched local historical hashes fail the source validator.

## UDA-ARL-2026-08-14-003 — Make scope, limits, counterexamples, verification, and supersession executable

- **Incident:** a list of attractive lesson statements cannot distinguish provisional candidates from validated, rejected, promoted, or superseded records and encourages silent historical rewrites.
- **Lesson:** require stable IDs, explicit disposition, transfer rationale, scope, limits, counterexamples, regression references, review/update triggers, and reciprocal supersession links. Reject duplicate IDs, impossible status, missing constraints, dangling/nonreciprocal links, status/link disagreement, and cycles.
- **Transfer rationale:** explicit counterevidence and graph integrity make reuse and later correction safer than a flat chronological memory file.
- **Scope and limits:** dispositions and fields may differ by domain. A passing schema/graph test does not substantively validate the lesson; domain review still gates activation.
- **Regression evidence:** the source suite contains positive and negative tests for every listed invariant and passed 13/13 at the source ref.

## UDA-ARL-2026-08-14-004 — Assign freshness ownership and keep sensitive evidence at its source

- **Incident:** a downstream status file could be mistaken for proof that upstream canonical protocols were current, and copying research evidence into a lesson repository would widen privacy/copyright/credential exposure.
- **Lesson:** name the system that owns freshness checks, record downstream applicability as known/unknown/stale without certifying freshness, and re-review on source/authority/test change. Keep raw sensitive or copyrighted evidence in its approved originating system; promote only bounded statements and exact provenance. Cross-project lessons move to the universal repository with rationale/limits rather than creating conflicting canonical copies.
- **Transfer rationale:** this minimizes data duplication and makes stale applicability visible while retaining an auditable learning path.
- **Scope and limits:** some approved evidence vaults legitimately centralize material; the control is explicit ownership/access, not Git-only storage. Legal, privacy, and domain policy may require stricter handling.
- **Regression/process evidence:** the source validator requires `freshness: not_certified`, exact applicability references for governed lessons, and nonempty limits/counterexamples; the intake workflow defines privacy and promotion boundaries.

## Anti-patterns

- Treating a lesson index, hash receipt, status file, or convenient summary as the canonical source it describes.
- Inventing missing incident/test provenance to move a record out of provisional status.
- Calling a schema-valid record scientifically or operationally validated.
- Checking only the current working-tree path instead of the recorded historical object.
- Fetching private evidence or using provider credentials in ordinary pull-request CI.
- Copying raw sensitive evidence into a broadly accessible lesson repository.
- Replacing a record silently instead of preserving reciprocal, acyclic supersession history.
- Maintaining project-local and universal copies as competing canonical lessons.

## Update and supersession rule

Re-review when the source schema/validator, authority model, evidence store, freshness mechanism, dispositions, or privacy boundary changes. A successor must name its source ref/hashes, compatibility and migration impact, tests, limits, and reciprocal supersession links. Project-specific content does not become universal merely because the repository design transfers.
