# Codex + GitHub Best-Practices Rollout Status

Date: 2026-08-15

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

The final fleet reconciliation re-fetched repositories, exact PR heads and
merge commits, workflow runs/jobs, rulesets, Actions/security settings, alert
counts, and hardening issues through authenticated GitHub REST on 2026-08-15.

| Repository | Repository-visible candidate | Exact-head CI | Hosted boundary | Terminal status |
| --- | --- | --- | --- | --- |
| universal-dev-architecture | PR [#4](https://github.com/u-dont-existDOTcom/universal-dev-architecture/pull/4); current-main boundary `385fb120...`; verified pre-final-ledger head `1c53752c...`; this ledger update creates the final external PR head | Run [31863152348](https://github.com/u-dont-existDOTcom/universal-dev-architecture/actions/runs/31863152348), `Deterministic repository audit` job `94959848417`: success at `1c53752c...`; the final replacement run belongs in PR #4 | Public; active ruleset `20882387`; selected exact-SHA Actions/read-only defaults; secret/push/dependency/private-reporting/CodeQL enabled; zero alerts; issue [#3](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/3) ready to close after final-head merge evidence | `COMPLIANT` candidate; final required run/merge pending |
| AskRigor | PR [#7](https://github.com/u-dont-existDOTcom/AskRigor/pull/7), final head `43e5b9442c5456bcfaba9b76194bf6474f74346d`; merged as `9134e22784e4d26dcf3c6d24a299bb5f783455ad` | Runs [31863157368](https://github.com/u-dont-existDOTcom/AskRigor/actions/runs/31863157368) / job `94959860545`, [31863157376](https://github.com/u-dont-existDOTcom/AskRigor/actions/runs/31863157376) / job `94959860566`, and CodeQL `31863154078`: success; merged-main gates also succeeded | Public; active ruleset `20882388`; selected exact-SHA Actions/read-only defaults; secret/push/dependency/private-reporting/CodeQL enabled; zero open alerts; issue #6 closed | `COMPLIANT` / merged |
| AskRigor-lessons | PR [#3](https://github.com/u-dont-existDOTcom/AskRigor-lessons/pull/3), final head `c99a02492efa34d23bb836791aef00e08ce535ff`; merged as `8e894ea73b1d589444fd5a059c517177eb4eb5d8` | Run [31863369692](https://github.com/u-dont-existDOTcom/AskRigor-lessons/actions/runs/31863369692), `Lesson integrity` job `94960380007`, and CodeQL `31863367948`: success; merged-main integrity/CodeQL also succeeded | Public; active ruleset `20882389`; selected exact-SHA Actions/read-only defaults; secret/push/dependency/private-reporting/CodeQL enabled; zero alerts | `COMPLIANT_WITH_DECLARED_EXCEPTIONS` / merged |

### Evidence-backed interpretation

- Universal repository-visible tests/audit, worker/final-auditor architecture,
  source registry, immutable Action enforcement, bounded drift reporting, current
  `main`, and all hosted controls are integrated. The self-referential final
  ledger head receives its replacement required run and merge evidence in PR #4.
- AskRigor's exact commands, authority/protocol hashes, source-access states,
  MCP/release boundaries, scoped AGPL, CodeQL repair, required checks, hosted
  controls, and merged-main alert closure are verified. The separate public
  submission gates remain blocked without affecting repository compliance.
- AskRigor-lessons has one canonical ledger/schema, dependency-free integrity
  policy, current AskRigor byte evidence, safe intake/closeout, and verified
  hosted controls. Its sole lesson remains inactive/provisional because its
  originating incident/test was not preserved; that is the declared exception.

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

- Publish this final fleet/current-main integration, capture the exact PR head
  and replacement `Deterministic repository audit` run in PR #4, merge, verify
  protected `main`, and close issue #3.

### AskRigor

- No repository-baseline gap remains. V0.1.0 public submission stays separately
  blocked by its existing product/release gates.

### AskRigor-lessons

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

AskRigor is merged and `COMPLIANT`. AskRigor-lessons is merged and
`COMPLIANT_WITH_DECLARED_EXCEPTIONS` for its inactive lesson's unavailable
historical origin evidence. Universal is repository/hosted compliant and awaits
only the self-referential final-ledger head's required run/merge evidence in PR
#4. Five additional fleet repositories retain `WRITE ISSUED`/`GAP` because no
independent final repository/CI/hosted audit was performed in this run.
