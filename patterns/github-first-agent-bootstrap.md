# GitHub-First Agent / Project Bootstrap

## Problem

Long-lived AI projects often duplicate canonical instructions and source files into a chat/project/custom-agent UI. Those copies age independently from the real repository. New chats may then read stale snapshots, miss newer lessons, or accidentally overwrite newer Git state when an old bundle is reinstalled.

## Pattern

### Keep the UI bootstrap small

When the agent can access GitHub directly, keep only the irreducible bootstrap material in the UI:

- compact behavioral/authority instructions that must exist before repository access;
- one bootstrap source identifying canonical repositories, entry-point files, and failure behavior;
- optionally one clearly dated emergency fallback snapshot for connector outages.

Do not mirror the full repository into project sources unless there is a specific offline requirement.

### Fetch canonical state at task start

A fresh worker should:

1. identify the canonical project repository;
2. read its current entry-point/index file first;
3. resolve task mode and authoritative baseline from current repo state;
4. open only the task-relevant protocols/evidence;
5. use specialized evidence repositories only when the task needs them.

This makes one Git commit immediately visible to future chats instead of requiring manual source replacement.

### Separate canonical project state from specialist evidence when useful

A project may use:

- one canonical project repo for instructions, article/product state, protocols, and promoted lessons;
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

## Origin / evidence

This pattern was generalized from the Joel Articles / Pangram Humanization setup in August 2026, where newer lesson summaries were safely preserved because Git history remained canonical, and `state/LESSON-INDEX.md` became the stable retrieval entry point. The experience also exposed a package-installer risk: an older snapshot must never overwrite a newer canonical repository.

## Limits

- If GitHub/connector access is unavailable, a dated fallback may be necessary.
- Some security/compliance environments may intentionally require pinned snapshots; in that case, make the pin explicit and versioned rather than pretending it is current.
- The bootstrap must still contain enough authority/safety rules to avoid harmful work before GitHub is read.
