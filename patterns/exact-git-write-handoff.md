# Exact Git write handoff

Status: experimental universal pattern.

Use `templates/EXACT-GIT-WRITE-MANIFEST.json` to freeze one repository, branch, path, base commit/blob, payload SHA-256/byte count, expected postimage SHA-256, and commit message before a bounded local Git file operation.

Keep semantic decisions in Chat and local Git execution mechanical. A local commit is not remote completion. After any push, independently read the target GitHub ref/path and verify the expected bytes before recording `VERIFIED_REMOTE`.

The reference implementation is `scripts/git_exact_write.py`; its intended checks are clean worktree, exact branch/base/blob, exact payload identity, one-path staging, `git diff --cached --check`, local commit receipt, and restoration of the preimage on a pre-commit failure.

The implementation composes ordinary Git behavior rather than defining a new source-control system. Relevant upstream documentation: `git apply`, `git format-patch`, and `git am`.
