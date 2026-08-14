# Codex + GitHub Best-Practices Rollout Status

Date: 2026-08-14

## Meaning of status labels

- `WRITE ISSUED` — a GitHub connector create/update request was issued; re-fetch or commit/workflow evidence is still required before calling it verified.
- `REPOSITORY-VISIBLE` — a file can be verified from Git content.
- `CI-VERIFIED` — the relevant workflow completed successfully against the recorded commit.
- `HOSTED-VERIFIED` — a GitHub setting was inspected through GitHub/API and its state recorded.
- `GAP` — required information/control remains absent, unknown, or intentionally unresolved.

This ledger deliberately does not convert a successful write request, a recommendation, or an expected workflow run into a verification claim.

## Universal architecture

### Write operations issued

- Canonical pattern: `patterns/codex-github-operating-system.md`
- Source registry and review date inside the canonical pattern
- Implementation plan: `docs/plans/2026-08-14-codex-github-best-practices-audit.md`
- Repository-visible audit: `scripts/audit_codex_github.py`
- Audit tests: `tests/test_audit_codex_github.py`
- Repository profile: `.github/codex-repository.json`
- Recovery state: `state/CURRENT-STATE.md`
- Root/scoped instructions: `AGENTS.md`, `.github/AGENTS.md`, `state/AGENTS.md`
- CI: `.github/workflows/universal-architecture-tests.yml`
- Scheduled audit: `.github/workflows/weekly-codex-github-audit.yml`
- CODEOWNERS, PR template, Actions Dependabot, and `.gitignore`
- Templates for root/scoped instructions, profile, task contract, recovery state, PR evidence, workflow policy, and learning policy
- Updated README and lesson index

### Verification still required

- Re-fetch every changed canonical file.
- Run `python3 -m unittest discover -s tests -v` against the resulting commit.
- Run `python3 scripts/audit_codex_github.py --root . --fail-on error` against the resulting commit.
- Inspect the resulting Actions workflow runs.
- Verify the default-branch ruleset, Actions default token permission, secret scanning, push protection, installed Apps/collaborators, and any repository security settings through GitHub.

## Cross-repository rollout

Connector write requests were issued for the following repository-visible controls:

| Repository | Profile | Recovery state | Scoped AGENTS | CODEOWNERS | PR template | Dependabot | Workflow policy |
|---|---:|---:|---:|---:|---:|---:|---:|
| AskRigor | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED |
| pangram-humanization-lab | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED |
| innerSignalGraph | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED |
| communities | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED |
| AskRigor-lessons | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED |
| joel-articles | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED |
| innerSignalArtifact | WRITE ISSUED | NOT APPLICABLE while inactive | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | WRITE ISSUED | NOT APPLICABLE while inactive |

Additional root README/AGENTS write requests were issued for sparse/new repositories where authority and role needed to be established. Existing root instructions in mature repositories were not destructively replaced without first obtaining their current content and SHA.

## Explicit unresolved gaps

### AskRigor

- Exact canonical test, lint, typecheck, build/package, protocol-integrity, and live-validation commands.
- Current root/nested instruction hierarchy audit.
- Existing workflow remediation after the workflow-policy result.
- Branch rules, Actions permissions defaults, CODEOWNERS enforcement, secret scanning, push protection, CodeQL, dependency review, security-reporting route, and release environment/settings verification.

### pangram-humanization-lab

- Exact current bootstrap/test/detector/repository-audit commands and preferred canonical current-state path.
- Reconciliation with the existing lesson-integrity workflows and required check names.
- Existing workflow remediation and hosted settings verification.

### innerSignalGraph

- Single current source/authority entry point.
- Exact bootstrap/test/build/package commands.
- Deterministic, live-model, adversarial, and psychological-safety evaluation gates.
- Existing workflow remediation and hosted settings verification.

### communities

- Current repository tree/source index, exact research-validation commands, retrieval/provenance architecture, license/copyright decision, and public contribution/security choices.
- Hosted settings verification.

### AskRigor-lessons

- Authority/lesson index, machine-readable provenance and dispositions, protocol applicability/supersession rules, update-check relationship, and lesson-integrity tests.
- Hosted settings verification.

### joel-articles

- Canonical article index/current-master routing, exact editorial/citation/detector/publication commands, license/copyright decision, and current owner-lock representation.
- Hosted settings verification.

### innerSignalArtifact

- Remains inactive until canonical source/version/generator/checksum/release verification exists.
- Hosted settings and publishing controls become applicable only when activation is deliberate.

## Ruleset recommendation for solo-owned active repositories

Use a default-branch ruleset that normally requires:

- pull requests;
- required deterministic status checks;
- resolved review conversations;
- no force pushes or branch deletion;
- branch freshness or merge queue only where concurrency requires it;
- narrowly scoped emergency bypass.

Do **not** require an independent approving review where no independent reviewer exists and then normalize bypassing the rule. Add required approving/code-owner review when a real independent reviewer is available or the change class requires one.

## Completion boundary

The architecture and file-level remediation plan are substantial, but the rollout is not fully compliant until repository contents are re-fetched, exact commands are recorded, CI results are inspected, findings are repaired, and hosted GitHub settings are verified. Any final report must preserve that distinction.
