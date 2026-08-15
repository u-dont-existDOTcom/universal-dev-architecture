# Repository Compliance Mandate Generation Guide

Generate a repository-specific mandate from live evidence, not from a stale inventory row or another repository's completed prompt.

## 1. Collect current inputs

Inspect the repository and GitHub for:

- default branch, visibility, archived state, activity, languages, dependencies, releases, environments, and long-lived branches;
- root and applicable nested instructions;
- README, authority/source indexes, profile, current-state path, lockfiles/runtime declarations, workflows, release docs, and security/ownership files;
- exact package/tool scripts and commands already documented;
- open PRs, recent relevant commits, workflow/check history, and the open hardening issue;
- rules/protection, Actions defaults, scanning, vulnerability, environment, collaborator, and installed-App evidence available through the current API scope.

Never retrieve or print secret values while collecting inputs.

## 2. Classify risk-adjusted posture

Choose exactly one primary kind from `software`, `research`, `content`, `policy`, `artifact`, or `archive`. Record active and long-running separately.

- Software needs reproducible execution and deterministic behavior gates.
- Research/content needs authority, provenance, evidence-state truthfulness, privacy, and loss-prevention gates; do not invent a build.
- Policy needs primary-source review, tested machine enforcement, explicit supersession, and downstream blast-radius review.
- Active artifacts need source/generator/version/hash/release authority. Inactive artifacts need a truthful activation boundary and no fake publishing pipeline.
- Archives need provenance and immutability/hand-edit rules, not active-software theater.

Increase controls for public visibility and high/critical consequence. State the concrete reason for the risk rating.

## 3. Establish exact command facts

Trace commands to current scripts, package metadata, lockfiles, CI, or accepted repository documentation. Run them on the recovered baseline and final candidate. Separate deterministic fixture/offline gates from bounded opt-in live/provider validation.

If a command cannot be established, write `unverified` and require discovery. Never fill a profile with a plausible substitute.

## 4. Extract authority and invariants

Name exact canonical sources, manifests/hashes, generated outputs, state files, release branches, privacy boundaries, and evidence-access semantics. Add repository-specific rules that prevent semantic loss, credential exposure, unsafe release, or generated/canonical confusion.

Do not paste whole universal documents into the mandate. Link the current pattern and include only local facts and decisions.

## 5. Generate required work

Start from `REPOSITORY-COMPLIANCE-WORKER.md`, then add:

- verified starting facts with commit/path evidence;
- repository-specific inspection and remediation requirements;
- exact minimum final gates;
- hosted controls that must be inspected separately;
- prohibited semantic changes;
- owner-decision boundary.

Remove inapplicable examples and every unresolved template marker before use. Keep unknowns explicit.

## 6. Review the mandate before execution

Confirm that it:

- does not claim a hosted setting from a file;
- does not invent commands, licenses, authorities, reviewers, or release semantics;
- does not require impossible independent approval for a solo owner;
- preserves owner work and dirty-tree recovery;
- requires TDD for behavioral changes and fresh final verification;
- requires one PR, one blocker issue, semantic lesson closeout, and exact terminal evidence;
- can be resumed from GitHub without the generating chat.

Record the worker-template version from `COMPLIANCE-WORKER-METADATA.json` in the generated task or issue.
