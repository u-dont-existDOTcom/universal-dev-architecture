# `.github/` Agent Instructions

These instructions apply to workflows, templates, ownership, dependency automation, and repository-policy files under `.github/`.

- Treat every workflow change as a privileged security change.
- Declare explicit least-privilege `permissions`; begin with `contents: read` and add write scopes only to the smallest job that needs them.
- Pin remote actions and reusable workflows to reviewed full 40-character commit SHAs. Keep the human-readable release tag in a comment and update pins through reviewed dependency automation.
- Never check out or execute untrusted pull-request code in a privileged `pull_request_target` context.
- Separate untrusted validation from release/deploy/publish jobs. Use protected environments and short-lived/OIDC credentials where external cloud access is required.
- Never add credentials, tokens, private data, or secret values to workflows, examples, logs, artifacts, prompts, or state files.
- Use timeouts for jobs that can hang and concurrency controls for consequential deploy/release jobs.
- PR templates must request exact verification commands/results, risk, rollback, final-diff review, continuity updates, and residual uncertainty.
- CODEOWNERS routes review but does not prove branch protection; do not claim a ruleset, required review, secret scanning, push protection, code scanning, or Actions default permission is enabled without GitHub settings/API evidence.
- Preserve existing release semantics and required checks. Do not rename checks used by branch rules without verifying and updating the ruleset atomically.
- Run the repository-declared audit and applicable CI before reporting changes complete.
