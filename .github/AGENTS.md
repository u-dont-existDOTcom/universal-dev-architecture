# `.github/` Agent Instructions

- Treat workflow and repository-policy changes as privileged security changes.
- Declare explicit least-privilege `permissions`; begin with `contents: read` and add write scopes only to the smallest job that needs them.
- Pin remote actions and reusable workflows to reviewed full 40-character commit SHAs; retain release tags only as comments and update through reviewed dependency automation.
- Never check out or execute untrusted pull-request code in a privileged `pull_request_target` context.
- Separate untrusted validation from release/deploy/publish jobs. Prefer protected environments and short-lived/OIDC credentials.
- Never place credentials or private data in workflows, examples, logs, artifacts, prompts, or state files.
- PR templates must request exact verification evidence, risk/rollback, final-diff review, continuity updates, and residual uncertainty.
- CODEOWNERS does not prove branch protection. Do not claim rulesets, scanning, push protection, or Actions settings are enabled without GitHub settings/API evidence.
- Do not rename checks used by branch rules without verifying and updating the ruleset atomically.
- Run the repository audit and applicable CI before reporting changes complete.
