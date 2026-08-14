# Connected Repository Codex + GitHub Baseline

Audit date: 2026-08-14

## Status vocabulary

- `IMPLEMENTED` — changed and committed during this audit.
- `OBSERVED` — directly visible in repository content/metadata.
- `UNVERIFIED` — hosted setting or exact behavior not proven; no inference allowed.
- `GAP` — required/recommended control is absent or not yet defined.
- `NOT APPLICABLE` — deliberately excluded by repository type.

## Cross-repository status

### Implemented centrally

- Canonical risk-adjusted Codex/GitHub operating pattern.
- Concise `AGENTS.md`, current-state, task-contract, PR, and profile templates.
- Machine-checkable repository-visible audit with tests.
- Universal repository CI, CODEOWNERS, PR evidence template, and GitHub Actions Dependabot configuration.
- Universal lesson index routing to the new operating pattern.

### Still requires repository-specific proof

No repository is marked compliant merely because a universal document exists. Each active repository still needs:

- a truthful repository profile with exact commands;
- a root/local `AGENTS.md` hierarchy audit;
- current-state checkpoint if long-running;
- workflow permissions/action-pin review;
- successful local/CI audit evidence;
- hosted GitHub controls verified through settings/API.

## Repository inventory

### `u-dont-existDOTcom/universal-dev-architecture`

Classification: private, active, long-running policy/tooling repository; high consequence because all projects inherit from it.

- `IMPLEMENTED`: repository profile, recovery state, audit tests/tool, CI, CODEOWNERS, PR template, Actions Dependabot, canonical pattern and templates.
- `UNVERIFIED`: latest workflow run result; default-branch ruleset; secret scanning; push protection; repository Actions default token permission.
- Required next proof: test/CI result and hosted-settings verification.

### `u-dont-existDOTcom/AskRigor`

Classification: public, active, long-running software/research system; critical consequence because health-research behavior and public distribution are involved.

Previously observed repository foundations include package/lock files, runtime declaration, redacted environment example, Docker configuration, `.github`, tests/tooling directories, and project documentation.

- `UNVERIFIED`: exact canonical bootstrap/test/lint/typecheck/build commands; current root/nested `AGENTS.md` content; workflow permissions and immutable action pins; current-state path; branch rules; CODEOWNERS; Dependabot; CodeQL; dependency review; secret scanning/push protection; security policy; release controls.
- Required remediation standard: strongest software/public/high-risk baseline in `patterns/codex-github-operating-system.md`.

### `u-dont-existDOTcom/pangram-humanization-lab`

Classification: private, active, long-running software/research laboratory; high consequence for lossless editorial state and learned detector/reconstruction behavior.

Previously observed foundations include `.github`, tests, Python packaging, runner/install scripts, state and lesson indexes, release manifests, and an enforced lesson-closeout system.

- `OBSERVED`: unusually strong durable-learning architecture relative to the other projects.
- `UNVERIFIED`: exact current root/nested `AGENTS.md`; canonical test/bootstrap commands; current-state checkpoint; workflow least privilege and action pinning; branch rules; secret scanning; PR template/CODEOWNERS; successful current audit.
- Required remediation: preserve existing lesson architecture; add only missing Codex/GitHub controls without flattening passage-specific evidence into universal rules.

### `u-dont-existDOTcom/innerSignalGraph`

Classification: private, active, long-running software system; critical consequence because it generates/adjudicates psychologically sensitive guidance.

Previously observed foundations include environment examples, automation instructions, build/implementation reports, model/runtime configuration, and test/result artifacts.

- `UNVERIFIED`: authoritative source/entry point among many reports; exact bootstrap/test/build commands; root/nested `AGENTS.md`; current-state path; CI and workflow hardening; branch rules; dependency/security automation; separation of generated artifacts from source; release evidence.
- Required remediation: software/high-risk baseline plus explicit domain-safety and model-evaluation gates.

### `u-dont-existDOTcom/communities`

Classification: public, active, long-running research/content repository.

An earlier connector listing exposed only `.gitignore`; the owner subsequently reported adding community material. That stale observation must not be treated as current repository state.

- `UNVERIFIED`: present file inventory, authority/source index, root `AGENTS.md`, provenance structure, current-state checkpoint, license, contributing expectations, data/link validation, and branch rules.
- Required remediation: re-list current repository before editing; apply research/content baseline rather than software ceremony.

### `u-dont-existDOTcom/AskRigor-lessons`

Classification: private cross-project/domain lesson repository; high consequence if it can supersede protocol behavior.

Earlier metadata described the repository as empty.

- `GAP` unless subsequently populated: README/authority model, `AGENTS.md`, lesson index, provenance/supersession policy, profile, and current state.
- Required remediation: explicitly separate AskRigor-local lessons from canonical HRP/Universal protocol authority and from general development lessons.

### `u-dont-existDOTcom/innerSignalArtifact`

Classification: private artifact/distribution repository.

Earlier metadata described the repository as empty.

- `GAP` unless subsequently populated: README explaining generated/canonical status, provenance/version/hash policy, `AGENTS.md` preventing hand edits, and profile.
- Hosted software controls are `NOT APPLICABLE` until source code or automation is added.

### `u-dont-existDOTcom/joel-articles`

Classification: public, active content repository.

Earlier metadata described the repository as empty.

- `GAP` unless subsequently populated: README, article/source authority index, editorial `AGENTS.md`, current-state checkpoint for long-running articles, provenance/owner-lock rules, license decision, and content validation.
- Software CI is `NOT APPLICABLE` unless repository tooling is added.

## Hosted-control verification checklist

For every active software repository, verify through GitHub rather than files alone:

- default branch and ruleset/protection target;
- PR requirement and required status checks;
- force-push/deletion restrictions;
- Actions default token permission and fork-PR behavior;
- installed GitHub Apps and collaborator permissions;
- secret scanning and push protection;
- code scanning/default setup where applicable;
- Dependabot security/version updates;
- environment protection for release/deploy secrets;
- tag/release protection where releases are distributed.

## Current audit boundary

This document records the baseline and prevents false claims. It is not a substitute for the repository-local audits. A repository becomes compliant only when its profile, files, commands, CI result, and hosted settings have been individually verified and the evidence is recorded.
