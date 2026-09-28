# Durable write checkpoints

An unverified repository mutation is unfinished work. Preserve the exact intended bytes and hash in the configured durable checkpoint store, leave a repository issue as the unfinished-work marker, and reconcile that checkpoint in a fresh session before declaring completion. Read the destination before retrying and verify the final bytes after a successful write. The workflow requires no owner file handling.

For integration-bound worker output, a commit that exists only inside an isolated or disposable worktree is not a durable handoff merely because `git status` is clean. If the coordinator cannot retrieve the commit/ref/artifact through an authorized durable surface, classify it as `LOCAL_COMPLETE_REMOTE_UNPUBLISHED` under `patterns/worker-github-publication-and-recovery.md` and continue publication/recovery. A reported local SHA is provenance, not delivery.

When publication is recreated through an API/connector rather than by pushing the original commit, preserve both identities: the original local HEAD/hash and the remote publication commit/hash. Verify exact intended content or equivalent declared diff before closing the checkpoint.

Owner-specific checkpoint-store discovery belongs in a file classified `NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT`; the current owner deployment uses `state/NON-UNIVERSAL-OWNER-GITHUB-WRITE-RECOVERY-REGISTRY.txt`.
