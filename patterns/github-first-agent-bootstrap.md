# GitHub-First Agent / Project Bootstrap

## Problem

Long-lived AI projects often duplicate canonical instructions and source files into a chat/project/custom-agent UI. Those copies age independently from the real repository. New chats may then read stale snapshots, miss newer lessons, lose fine-grained state after context compaction, or accidentally overwrite newer Git state when an old bundle is reinstalled.

## Pattern

### Keep the UI bootstrap small

When the agent can access GitHub directly, keep only the irreducible bootstrap material in the UI:

- compact behavioral/authority instructions that must exist before repository access;
- one bootstrap source identifying canonical repositories, entry-point files, current-state checkpoint, and failure behavior;
- optionally one clearly dated emergency fallback snapshot for connector outages.

Do not mirror the full repository into project sources unless there is a specific offline requirement.

### Fetch canonical state at task start

A fresh worker should:

1. identify the canonical project repository;
2. read its current entry-point/index file first;
3. read the current-state recovery checkpoint for long-running or multi-session work;
4. inspect recent relevant commits/artifacts and reconcile the checkpoint against actual Git state;
5. resolve task mode and authoritative baseline from current repo state;
6. open only the task-relevant protocols/evidence;
7. use specialized evidence repositories only when the task needs them;
8. resume from the latest verified durable boundary without repeating completed work.

This makes one Git commit immediately visible to future chats instead of requiring manual source replacement, and makes a fresh conversation safe even when earlier context was compacted or lost.

### Treat conversation as disposable working memory

Conversation/context is working RAM, not durable project memory. Automatic context compaction can extend a run, but it cannot be assumed to preserve every fine-grained decision.

For long-running work, the repository should contain one obvious concise recovery file such as `CURRENT-STATE.md`, `state/CURRENT-STATE.md`, or an equivalent machine-readable checkpoint. It should capture the goal, important decisions/constraints, completed work, current step, remaining work, blockers, evidence/tests/branches/commits, and next safe action.

Update it at meaningful durable boundaries and before handoffs or completion. If it conflicts with newer owner instructions or verified repository state, repair the checkpoint; do not let stale state outrank Git.

### Separate canonical project state from specialist evidence when useful

A project may use:

- one canonical project repo for instructions, article/product state, protocols, promoted lessons, and current recovery state;
- one specialist repo for raw experiments, caches, large evidence, or tooling state.

The canonical repo/index should point to specialist evidence when needed. Do not dump every evidence artifact into the main project state solely so fresh chats can find it.

### Repository state outranks packages and UI snapshots

Generated bundles are distribution snapshots, not authorities. An installer updating an existing repo must not overwrite current same-path files without comparison and explicit migration semantics.

Default safe behavior:

- create missing files;
- preserve newer repository files;
- compare conflicts;
- require an intentional merge for competing versions.

### Update bootstrap entry points, not hard-coded inventories

If the lesson/protocol structure evolves, update the repository's index and the tiny UI bootstrap to say "start from the index." Avoid embedding a fixed list of lesson files in Work/Project instructions; that list will become stale.

The same applies to recovery state: point to one stable current-state entry point rather than scattering resume notes across chats or handoff documents.

## Origin / evidence

This pattern was generalized from the Joel Articles / Pangram Humanization setup in August 2026, where newer lesson summaries were safely preserved because Git history remained canonical, and `state/LESSON-INDEX.md` became the stable retrieval entry point. Subsequent long-running Codex/ChatGPT workflows showed that repository-first learning was not enough by itself: context compaction still required an explicit concise recovery checkpoint so a fresh worker could resume without replaying the old transcript. The experience also exposed a package-installer risk: an older snapshot must never overwrite a newer canonical repository.

## Limits

- If GitHub/connector access is unavailable, a dated fallback may be necessary.
- Some security/compliance environments may intentionally require pinned snapshots; in that case, make the pin explicit and versioned rather than pretending it is current.
- The bootstrap must still contain enough authority/safety rules to avoid harmful work before GitHub is read.
- Small one-shot tasks do not need a dedicated current-state file.
