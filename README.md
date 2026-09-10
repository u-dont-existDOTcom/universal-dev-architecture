# Universal Development Architecture

Canonical cross-project store for reusable development, Codex/GitHub, and agent-workflow lessons.

This public repository is owner-maintained. Public visibility permits reading
but does not grant write access or a public reuse license; see `LICENSE.md` and
`CONTRIBUTING.md`.

## Purpose

Project repositories keep their own exact evidence, incident notes, experiments, local decisions, current state, and project-specific instructions. This repository primarily receives lessons and operating patterns that are genuinely transferable across projects. When owner-specific deployment continuity must live here, it is explicitly isolated and marked `NON_UNIVERSAL_OWNER_DEPLOYMENT` so a copied repository does not mistake one owner's infrastructure for reusable architecture.

## Portability boundary

This repository is intended to remain structurally useful when copied to another environment. Reusable patterns, templates, schemas, tests, and invariants must not depend on the current owner's concrete hosts, service IDs, machine paths, accounts, or private chat locators.

Owner-specific operational state may be retained only when needed for continuity or live evidence. Such artifacts must be plainly marked `NON_UNIVERSAL_OWNER_DEPLOYMENT`, contain no secrets, and be replaceable or ignorable by another owner. See `patterns/portable-vs-owner-specific-deployment-data.md`.

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
- Project-specific evidence stays local by default; any necessary owner-specific continuity retained here is clearly non-universal, while transferable lessons are generalized with provenance and limits.
- GitHub-hosted controls are never marked verified merely because they are recommended; settings/API evidence is required.

## Authority

1. Current explicit project-owner correction and requirements
2. Current project repository state and exact evidence
3. Current project-specific instructions and accepted specifications
4. Current universal lessons in this repository
5. Older summaries, packages, generated bundles, and remembered chat context

A universal pattern never overrides a project's explicit current requirement.

## Audit boundary

The portable audit detects repository-visible failures such as missing instructions/profiles/state, missing software verification commands or CI, unsafe workflow permissions, floating Action references, dangerous privileged pull-request execution, likely committed secret filenames/material, and unsafe cross-platform paths.

It cannot prove hosted settings such as rulesets, branch protection, secret scanning, push protection, code scanning, GitHub App permissions, or repository Actions defaults. Those must be checked through GitHub and recorded as verified only after inspection.

`patterns/codex-github-operating-standard.md` and root `CURRENT-STATE.md` remain compatibility/provenance pointers only. They are not competing current authorities.
