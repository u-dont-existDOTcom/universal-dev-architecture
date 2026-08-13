# Context-Compaction-Resilient Agent Work

## Problem

Long-running AI work has a finite active context even when the host product supports automatic compaction, summarization, or continuation across multiple context windows. Compaction reduces hard context exhaustion, but it can still discard fine-grained decisions, exact constraints, intermediate discoveries, and the precise point at which work should resume.

A project must therefore be designed so that losing old chat detail does not mean losing project state.

## Universal pattern

### 1. Treat conversation as working RAM, not project memory

Use this hierarchy:

- **conversation/context = working RAM**;
- **canonical repository = durable project memory**;
- **Git history = durable audit trail and rollback path**;
- **current-state/checkpoint file = recovery entry point**;
- **exact project artifacts/evidence = authority for factual implementation state**.

Automatic model-context compaction is an efficiency mechanism, not a persistence mechanism.

Any decision, constraint, discovery, architecture choice, completed step, or unresolved blocker that would matter after a new thread or context compaction must be written into the canonical repository rather than left only in chat.

### 2. Make long-running work resumable from the repository alone

For any project with multi-step, multi-session, or long autonomous work, maintain a concise canonical recovery file such as `CURRENT-STATE.md`, `state/CURRENT-STATE.md`, or an equivalent machine-readable state file chosen by the project.

The exact filename may vary, but there must be one obvious current recovery entry point referenced by the project's main index/bootstrap.

At minimum, the state checkpoint should record:

- current goal / task;
- authoritative baseline or relevant commit/ref;
- important active decisions and owner constraints;
- completed work that must not be repeated;
- current step / last durable checkpoint;
- remaining work;
- blockers or unresolved questions;
- relevant artifacts, evidence, tests, logs, branches, and commits;
- uncommitted/dirty-working-tree status when relevant;
- the next safe resume action or command.

Keep this file concise and operational. It is a recovery map, not a transcript dump.

### 3. Update the checkpoint at durable boundaries

Update the current-state file whenever losing the current chat would otherwise create ambiguity or rework, especially:

- after a meaningful implementation/research/editorial milestone;
- after a consequential owner decision or constraint change;
- after discovering a blocker or falsifying an approach;
- before/after risky migrations or long autonomous runs;
- before handing work to another agent/thread;
- before claiming a multi-step task complete.

Do not wait for the model to detect that compaction is imminent. Context limits are implementation details and may not be visible to the worker.

### 4. Resume by reconciling state, not blindly trusting it

After interruption, a new thread, a model switch, or suspected context loss:

1. inspect the canonical repository and working tree;
2. read the project bootstrap/index and current-state checkpoint;
3. inspect recent relevant Git commits and durable artifacts;
4. reconcile the checkpoint against actual repository state;
5. identify exactly what survived and what remains;
6. update stale checkpoint data before continuing;
7. resume from the latest verified durable boundary without repeating completed work.

The checkpoint is a routing document, not higher authority than the repository itself. If it conflicts with exact Git state, current artifacts, tests, or newer owner instructions, the newer verified evidence wins and the checkpoint must be repaired.

### 5. Persist important reasoning outcomes, not hidden chain-of-thought

Do not attempt to preserve private model reasoning or every exploratory thought. Persist the user-relevant engineering/research outcomes needed for continuity:

- decisions and why they were chosen;
- rejected approaches when repeating them would waste time or recreate a known failure;
- invariants and constraints;
- evidence pointers;
- test/validation results;
- unresolved uncertainty;
- next action.

This yields durable continuity without turning the repository into a chat archive.

### 6. Prefer disposable conversations

A robust project should tolerate starting a completely fresh agent conversation at any time.

The test is:

> Could a competent new worker, with repository access but without the old chat transcript, recover the correct current state and continue without repeating completed work or silently losing important constraints?

If not, project state is insufficiently durable.

### 7. Integrate with completion and learning closeout

For substantive long-running work, completion requires both:

- the project's normal implementation/test/research gates; and
- a current durable checkpoint or final state that accurately records what was completed, remaining follow-up, and relevant evidence/commits.

Transferable lessons discovered during the work must still pass the normal lesson-closeout/disposition process. The current-state file is not a substitute for durable lesson promotion.

## Recommended project instruction

Use or adapt this invariant:

> Treat chat context as disposable working memory. Maintain project continuity in Git. For long-running or multi-session work, keep one canonical current-state checkpoint containing goal, decisions, completed work, current step, remaining work, blockers, evidence/commits, and next safe action. Update it at meaningful durable boundaries. On any new thread, interruption, context compaction, or model switch, reconcile it against actual repository state and resume from the latest verified checkpoint without repeating completed work.

## Origin / evidence

Generalized in August 2026 from repeated long-running Codex/ChatGPT project workflows where automatic context compaction could prevent a hard stop but could not guarantee preservation of every fine-grained decision. The repository-first workflow already prevented many losses; the missing layer was an explicit concise recovery checkpoint maintained as part of normal work.

## Limits

- Do not treat a stale `CURRENT-STATE` file as more authoritative than actual Git state or newer owner instructions.
- Do not store secrets, credentials, tokens, or private chain-of-thought in recovery files.
- Do not duplicate large logs or raw evidence into the checkpoint; link to their canonical locations.
- Tiny one-shot tasks do not need a dedicated current-state file.
- Projects may use a machine-readable ledger/database instead of Markdown if it provides the same recovery guarantees.
