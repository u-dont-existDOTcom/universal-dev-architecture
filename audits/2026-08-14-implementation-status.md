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

### Recovered repository evidence

- `main` was fetched cleanly at `d1948c504687503f771c02dc4140f99bc66d2e0d`.
- No open pull request or open issue titled `Codex + GitHub hardening audit` existed at recovery.
- Three old remote compliance branches were 24 commits behind `main`, had no open PR, and were preserved as superseded alternatives rather than reused.
- The two profile-declared gates both failed at import on the recovered commit because `PULL_REQUEST_TARGET_RE` used a second inline regex flag after an alternation.
- Current work is isolated on `codex/github-compliance-2026-08-14` under `docs/superpowers/plans/2026-08-14-universal-dev-architecture-compliance.md`.
- Commit `c1c96cb` repairs the Python 3.12 import defect with a red/green privileged-event regression.
- Commit `5d599a0` expands the standard-library audit through red/green tests. All 30 unit tests passed immediately before that commit.
- Current OpenAI Learn and GitHub Docs registry targets were opened from primary sources on 2026-08-14. The recorded interpretation now distinguishes the 32 KiB combined instruction chain and GitHub's unique required-check-name warning.

### Hosted GitHub evidence

- `HOSTED-VERIFIED`: repository is private; default branch is `main`; the sole collaborator is `u-dont-existDOTcom` with admin; zero environments exist.
- `PLAN-LIMITED`: rulesets endpoint returned `403` with “Upgrade to GitHub Pro or make this repository public.”
- `UNVERIFIED` because of integration-scope `403`: branch protection, Actions policy/default token permission, secret scanning, push protection, vulnerability alerts/security updates, and webhooks.
- `DISABLED`: code-scanning endpoint explicitly reported that code scanning is not enabled.
- `UNVERIFIED`: private-vulnerability-reporting endpoint returned `404`.
- Latest `main` commit had no connector-visible status or PR workflow run evidence; no CI success is claimed.
- Local `gh` authentication is invalid. SSH Git transport works but cannot inspect hosted settings.

### Current completion boundary

- Reconcile canonical indexes/state, add the compliance-worker templates, consolidate CI, and make scheduled drift reporting idempotent.
- Run both declared gates against the final branch commit and inspect the final diff.
- Open one focused PR, capture final-head workflow run IDs/links and conclusions, and merge only if policy permits.
- Create one durable hardening issue for controls that remain plan/permission blocked.

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
