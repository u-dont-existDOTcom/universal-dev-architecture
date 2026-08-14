# Universal Development Architecture

Canonical cross-project store for reusable development, Codex/GitHub, and agent-workflow lessons.

## Purpose

Project repositories keep their own exact evidence, incident notes, experiments, local decisions, current state, and project-specific instructions. This repository receives only lessons and operating patterns that are genuinely transferable across projects.

## Start here

Fresh agents should read `LESSON-INDEX.md` before substantial implementation, debugging, automation, repository governance, or agentic workflow work. Do not rely on remembered lesson lists from prior chats.

For Codex + GitHub work, the canonical current pattern is:

- `patterns/codex-github-operating-system.md`

The canonical recovery checkpoint is:

- `state/CURRENT-STATE.md`

Reusable files are indexed in:

- `templates/README.md`

The repository-visible audit is:

```bash
python3 scripts/audit_codex_github.py --root . --fail-on error
```

Unit tests are:

```bash
python3 -m unittest discover -s tests -v
```

## Core invariants

- Chat/context is disposable working memory, not durable project state.
- Git repositories are durable project memory; Git history is the audit/rollback trail.
- Active long-running projects maintain a concise current-state recovery checkpoint.
- A fresh worker must reconcile checkpoints against actual Git state before resuming.
- Every substantive finding receives a semantic lesson disposition before completion.
- Project-specific evidence stays local; transferable lessons are generalized here with provenance and limits.
- GitHub-hosted controls are never marked verified merely because they are recommended; settings/API evidence is required.

## Authority

1. Current explicit project-owner correction and requirements
2. Current project repository state and exact evidence
3. Current project-specific instructions and accepted specifications
4. Current universal lessons in this repository
5. Older summaries, packages, generated bundles, and remembered chat context

A universal pattern never overrides a project's explicit current requirement.

## Audit boundary

The portable audit detects repository-visible failures such as missing instructions/profiles/state, missing software verification commands or CI, unsafe workflow permissions, floating Action references, dangerous privileged pull-request execution, and likely committed secret filenames.

It cannot prove hosted settings such as rulesets, branch protection, secret scanning, push protection, code scanning, GitHub App permissions, or repository Actions defaults. Those must be checked through GitHub and recorded as verified only after inspection.

`patterns/codex-github-operating-standard.md` and root `CURRENT-STATE.md` remain compatibility/provenance pointers only. They are not competing current authorities.
