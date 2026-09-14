# Durable write checkpoints

An unverified repository mutation is unfinished work. Preserve the exact intended bytes and hash in the configured durable checkpoint store, leave a repository issue as the unfinished-work marker, and reconcile that checkpoint in a fresh session before declaring completion. Read the destination before retrying and verify the final bytes after a successful write. The workflow requires no owner file handling.
