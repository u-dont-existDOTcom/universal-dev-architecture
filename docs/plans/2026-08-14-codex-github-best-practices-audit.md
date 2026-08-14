# Codex + GitHub Best-Practices Audit and Rollout Plan

Date: 2026-08-14
Owner: Joel Rosenblum
Canonical repository: `u-dont-existDOTcom/universal-dev-architecture`

## Objective

Turn the user's collection of GitHub projects from ad-hoc agent use into a repeatable, auditable Codex engineering system based on current official OpenAI Codex and GitHub guidance, without imposing unnecessary process on tiny content or archive repositories.

## Scope

Repositories currently in scope:

- `universal-dev-architecture`
- `AskRigor`
- `pangram-humanization-lab`
- `innerSignalGraph`
- `communities`
- `AskRigor-lessons`
- `innerSignalArtifact`
- `joel-articles`

## Work streams

1. **Authoritative-source review**
   - Review current official OpenAI Codex documentation for `AGENTS.md`, GitHub integration, cloud environments, internet/secrets, prompting, and code review.
   - Review current official GitHub guidance for repository rulesets, pull requests, Actions hardening, dependency/security automation, CODEOWNERS, and public-repository hygiene.
   - Record source URLs and date reviewed in the canonical pattern.

2. **Universal operating pattern**
   - Define instruction hierarchy, task contracts, branch/PR workflow, reproducible environment requirements, verification gates, GitHub governance, security controls, current-state recovery, and lesson closeout.
   - Distinguish hard requirements from conditional recommendations so research/content/artifact repositories are not forced into software-specific ceremony.

3. **Machine-checkable repository profile and audit**
   - Add a standard-library-only audit script with JSON/text output.
   - Develop tests first for missing instructions, unpinned Actions, dangerous `pull_request_target` use, likely committed secrets, and missing continuity state.
   - Add a repository profile schema declaring repository kind, commands, risk level, and applicability.

4. **Reusable templates**
   - Add templates for root `AGENTS.md`, current-state recovery, Codex task contracts, pull requests, and repository profiles.

5. **Repository audit and safe remediation**
   - Inspect every repository.
   - Apply documentation/instruction fixes directly where non-destructive.
   - Do not invent build/test commands.
   - Do not weaken or overwrite project-specific instructions.
   - Treat branch rules, security settings, and secrets as external controls that require API verification; report anything the connector cannot verify.

6. **Verification and closeout**
   - Run the audit tool's tests.
   - Re-fetch changed canonical files.
   - Record per-repository status, unresolved external settings, and exact commits.
   - Disposition transferable lessons and update the universal lesson index.

## Design constraints

- Git remains the durable source of truth; chat is disposable working memory.
- Root `AGENTS.md` stays concise and operational. More local files are used only where subtree requirements differ.
- No secret values enter repository files, prompts, logs, or current-state checkpoints.
- No direct destructive rewrite of existing repository instructions.
- No claim that a setting is enabled unless it was verified through GitHub.
- Rules are risk-adjusted: a public/high-stakes software repository has a stricter baseline than a private artifact or prose repository.

## Completion criteria

- A source-grounded universal Codex/GitHub pattern exists and is indexed.
- Reusable templates and a tested audit tool exist.
- Every accessible project has been classified and audited.
- Safe repository-local corrections are committed.
- Unverifiable or owner-dependent controls are explicitly listed rather than guessed.
- The universal lesson closeout is complete.
