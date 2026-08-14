# Codex + GitHub Best-Practices Rollout Status

Date: 2026-08-14

## Meaning of status labels

- `WRITE ISSUED` — an earlier connector write request exists; it is not verified repository or CI evidence.
- `REPOSITORY-VISIBLE` — exact content/ref was inspected from GitHub or an authenticated Git object.
- `CI-VERIFIED` — the named workflow/job completed successfully against the exact recorded commit.
- `HOSTED-VERIFIED` — the setting was inspected through GitHub/API and its state recorded.
- `PLAN-LIMITED` — GitHub reported that the private-repository plan does not provide the control.
- `UNVERIFIED` — access was denied/unavailable or no independent settings evidence exists.
- `GAP` — applicable work/evidence remains absent, unknown, or deliberately unresolved.

No successful write request, worker report, CODEOWNERS file, workflow YAML, or profile claim is converted into hosted or CI evidence.

## Independently reconciled compliance candidates

The final fleet reconciliation re-fetched open PRs, exact-head workflow runs/jobs, and exact-title hardening issues through the connected GitHub App on 2026-08-14.

| Repository | Repository-visible candidate | Exact-head CI | Hosted boundary | Terminal status |
| --- | --- | --- | --- | --- |
| universal-dev-architecture | PR [#4](https://github.com/u-dont-existDOTcom/universal-dev-architecture/pull/4); independently verified pre-reconciliation head `7870cd2e649c8a09b0b09f96e0411c546e5f1782`; this ledger/promotion produces a newer PR head whose exact run belongs in the PR | `Universal repository compliance` run [31775698854](https://github.com/u-dont-existDOTcom/universal-dev-architecture/actions/runs/31775698854), `Deterministic repository audit` job `94690572217`: success at `7870cd2...` | private plan-limited rulesets; admin/security endpoints inaccessible; code scanning disabled; issue [#3](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/3) | `BLOCKED` |
| AskRigor | PR [#7](https://github.com/u-dont-existDOTcom/AskRigor/pull/7), head `9d9dc78294abbed06cf3acabe9e764ece0f57be8` | deterministic run [31776458050](https://github.com/u-dont-existDOTcom/AskRigor/actions/runs/31776458050), job `94692793122`: success; workflow-policy run [31776458058](https://github.com/u-dont-existDOTcom/AskRigor/actions/runs/31776458058), job `94692793204`: success | public rulesets empty; classic protection and security/Actions endpoints inaccessible; private reporting disabled; issue [#6](https://github.com/u-dont-existDOTcom/AskRigor/issues/6) | `BLOCKED` |
| AskRigor-lessons | PR [#3](https://github.com/u-dont-existDOTcom/AskRigor-lessons/pull/3), head `dd9305a39c50251fa8858ecbf45aedb16a407f64` | `AskRigor lesson integrity` run [31777936617](https://github.com/u-dont-existDOTcom/AskRigor-lessons/actions/runs/31777936617), `Lesson integrity` job `94697224159`: success | private plan-limited rulesets; admin/security endpoints inaccessible; code scanning disabled; issue [#2](https://github.com/u-dont-existDOTcom/AskRigor-lessons/issues/2) | `BLOCKED` |

### Evidence-backed interpretation

- Universal repository-visible tests/audit, worker/final-auditor architecture, primary-source registry, immutable Action pins, and scheduled bounded drift issue reconciliation are implemented. Its newest self-referential final head must receive a replacement green `Deterministic repository audit` run after the fleet update is published.
- AskRigor's exact bootstrap/deterministic/site/deployment commands, authority chain, complete-protocol byte/hash behavior, source-access truth states, public MCP boundary, release distinction, and final CI are verified on PR #7. Live provider smoke was explicitly not run and is not CI evidence. Protocol/research policy and production state did not change.
- AskRigor-lessons now has one canonical ledger/schema, dependency-free integrity/workflow policy tests, exact source-byte provenance, safe intake/closeout, authority/freshness boundaries, and final CI on PR #3. Its sole lesson remains provisional/unverified because its originating AskRigor incident/experiment/test was not preserved.
- None of the three candidates is merged or called compliant. Applicable hosted governance remains unverified, unavailable, disabled, or plan-limited.

## Historical connector bootstrap not yet independently audited

Earlier connector write requests exist for the following repositories. Their rows remain historical evidence only; this compliance run did not execute repository-specific final gates or reclassify them from worker prose.

| Repository | Historical repository writes | Current evidence state |
| --- | --- | --- |
| pangram-humanization-lab | profile, recovery state, scoped instructions, CODEOWNERS, PR template, Dependabot, workflow policy | `WRITE ISSUED` / `GAP` |
| innerSignalGraph | profile, recovery state, scoped instructions, CODEOWNERS, PR template, Dependabot, workflow policy | `WRITE ISSUED` / `GAP` |
| communities | profile, recovery state, scoped instructions, CODEOWNERS, PR template, Dependabot, workflow policy | `WRITE ISSUED` / `GAP` |
| joel-articles | profile, recovery state, scoped instructions, CODEOWNERS, PR template, Dependabot, workflow policy | `WRITE ISSUED` / `GAP` |
| innerSignalArtifact | profile, scoped instructions, CODEOWNERS, PR template, Dependabot; state/workflow were recorded not applicable while inactive | `WRITE ISSUED` / `GAP` |

Existing root instructions in mature repositories were not destructively replaced during the bootstrap. No row above is a compliance claim.

## Remaining repository-specific gaps

### universal-dev-architecture

- Publish this final promotion/fleet update, capture the exact new PR head and replacement successful `Deterministic repository audit` run, and retain them in PR #4.
- Verify/configure main PR enforcement, required check, force-push/deletion prevention, solo-maintainer bypass, Actions defaults, scanning, alerts, and private reporting through an authenticated admin/security context and supported private plan—or record an explicit owner-accepted exception.

### AskRigor

- Verify/configure `main` with pull requests and stable required `Deterministic verification`, no force push/deletion, and usable solo-maintainer bypass.
- Verify Actions defaults and enable/verify vulnerability alerts, security updates, code/secret scanning, push protection, and private vulnerability reporting where supported.
- Owner decision: public reuse license. The candidate preserves the current no-license-grant posture.

### AskRigor-lessons

- Verify/configure `main` with pull requests and stable required `Lesson integrity`, no force push/deletion, and usable solo-maintainer bypass; verify Actions/security controls where supported.
- Supply exact originating AskRigor incident/experiment/test plus substantive verification before changing `askrigor.community-narrative-comparator.v1` from provisional/unverified.

### Repositories not independently audited in this run

- pangram-humanization-lab: exact current commands/current-state route, lesson-integrity workflow reconciliation, and hosted settings.
- innerSignalGraph: current source/authority entry point, exact commands, deterministic/live/adversarial/psychological-safety gates, workflows, and hosted settings.
- communities: current source index, exact research validation, retrieval/provenance, license/copyright/contribution/security posture, and hosted settings.
- joel-articles: canonical article/master routing, exact editorial/citation/detector/publication commands, license/copyright, owner lock, and hosted settings.
- innerSignalArtifact: inactive until source/version/generator/checksum/release verification and deliberate activation; hosted publishing controls become applicable on activation.

## Solo-maintainer governance rule

For active canonical branches, require pull requests, unique deterministic checks, no force pushes/deletion, and a narrowly scoped emergency/solo-maintainer bypass. Do not require independent approval where no independent reviewer exists and then normalize bypassing the rule.

## Completion boundary

The three mandated repository candidates are repository-visible and exact-head CI-verified at the revisions named above, subject to the universal self-update run still required after publication. They remain `BLOCKED`, not compliant, because applicable hosted controls are not verified/effective. Five additional fleet repositories retain `WRITE ISSUED`/`GAP` status because no independent final repository/CI/hosted audit was performed in this run.
