# Project Learning Policy Template

Use/adapt this block in project instructions when the project should preserve transferable learning automatically.

## Canonical learning state

GitHub is the canonical durable store for project lessons. Chat context and model memory are not sufficient persistence.

At the start of substantive work, read the project's current lesson index first. Follow its current read order, authority rules, and branch/evidence routing rather than relying on remembered file names.

## Learning closeout gate

Before reporting any substantive implementation, debugging, editorial, research, detector, reconstruction, or automation pass complete:

1. identify the actual new findings from the pass;
2. disposition each as `promoted`, `provisional`, `project-specific`, `superseded`, or `no-new-lesson`;
3. give a reason for every non-promoted substantive finding;
4. update the project's current lesson summary/index for every promoted local lesson;
5. if a lesson is genuinely transferable across projects, promote the generalized rule with provenance into `u-dont-existDOTcom/universal-dev-architecture`;
6. run the repository lesson-integrity check/audit;
7. verify it passes before claiming completion.

Do not ask the owner to remind you to do this.

## Evidence and provenance

Bind dispositions to exact source evidence (content hash plus repo/ref/path when possible). If source evidence changes, review it again; stale dispositions do not carry forward automatically.

Keep project-specific experiments/logs/incidents in the project repo. Universal promotion should preserve the generalized principle, originating repo, evidence pointer, rationale, and limits—not duplicate all raw evidence.

## Repository safety

Existing canonical Git state outranks generated/install snapshots. Never blindly overwrite same-path current repository files with an older bundle. Create missing files or perform an explicit compared merge.

## Backstop

Repositories with substantial ongoing work should enforce the closeout invariant in CI on push/PR and run a periodic orphan audit that surfaces undispositioned findings automatically.
