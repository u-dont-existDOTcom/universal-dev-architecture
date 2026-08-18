# Instruction-source evidence

The audit read the installed files, not marketplace descriptions. Paths are the 2026-08-17 host locations; `effective-stack*.json` records content hashes so later reruns can detect changes.

## Coordinator 0.4.0

- `skills/codex-coordinator/SKILL.md:25-54`: default to one normal task; durable coordination is for two or three substantial verticals; all writers share one checkout/branch.
- `skills/codex-coordinator/SKILL.md:64-74`: active claims are boundary metadata, not a second progress ledger.
- `references/execution.md:21-53`: rejects tiny durable lanes and worktree/branch switches after coordination begins.
- `references/execution.md:88-113`: integrated checks, reports, and claim release before completion.
- `references/recovery.md:3-20`: silence/age is not proof that another owner is stale.
- `.codex-plugin/plugin.json` and `hooks/hooks.json`: SessionStart and Stop hooks, five-second hook timeouts, no background manager or polling loop.

Audited root at trial time: `${CODEX_AUDIT_ROOT}/plugins/cache/openai-curated-remote/codex-coordinator/0.4.0/`; absent from the final current-cache snapshot.

## Engineering Guardrails 1.1.1

- `skills/code-work/SKILL.md:12-31`: clarify only material ambiguity, define acceptance/scope/risk, and keep plans short unless work is complex.
- `skills/code-work/SKILL.md:43-69`: failing tests when practical, root-cause changes, adaptive parallelism only for independent surfaces.
- `skills/code-work/SKILL.md:71-96`: narrow-to-broad fresh verification and final-diff inspection.
- `skills/code-verification/SKILL.md:10-19`: review/diagnosis is read-only by default.
- `skills/code-verification/SKILL.md:68-126`: risk-proportionate checks and evidence-backed release judgment.

Audited root at trial time: `${CODEX_AUDIT_ROOT}/plugins/cache/openai-curated-remote/codex-engineering-guardrails/1.1.1/`; absent from the final current-cache snapshot.

## Superpowers 6.2.0

- `skills/using-superpowers/SKILL.md:10-24`: invoke a skill before any response/action at a very low applicability threshold.
- `skills/brainstorming/SKILL.md:10-32,103-132`: no implementation before design approval; sequential questions, persisted spec, review, and commit.
- `skills/writing-plans/SKILL.md:38-61,138-168`: comprehensive two-to-five-minute steps, plan file, commit, and execution-mode handoff.
- `skills/test-driven-development/SKILL.md:16-45`: mandatory test-first workflow and delete/restart instruction for code written first.
- `skills/subagent-driven-development/SKILL.md:8-17,117-140,194-230,302-423`: fresh implementer/reviewer graph, ignored recovery ledger, repeated review/fix loops, final review, and workspace deletion.
- `skills/using-git-worktrees/SKILL.md:8-14,41-112`: isolation/worktree workflow, including consent when no preference exists.
- `skills/verification-before-completion/SKILL.md:14-48,100-114`: fresh same-message verification before completion.
- `skills/finishing-a-development-branch/SKILL.md:53-126`: fixed merge/push/keep menu and cleanup workflow.

Audited root at trial time: `${CODEX_AUDIT_ROOT}/plugins/cache/openai-curated-remote/superpowers/6.2.0/`. The owner removed Superpowers after the final treatment had frozen its copy; a stale cache directory remained in the final snapshot.

## Codex Security 0.1.19

- `skills/security-scan/SKILL.md`: formal threat mapping, independent discovery, validation, canonical JSON completion, and generated report.
- `skills/deep-security-scan/SKILL.md`: repeated discovery with a worker pool; default budgets can span days and headless preflight may apply helper-proposed persistent configuration.
- `skills/fix-finding/SKILL.md`: reachability/root cause, exploit regression, smallest remediation, and narrow-to-broad verification—overlapping general implementation methodology.
- `skills/attack-path-analysis`, `validation`, `threat-model`, and `vulnerability-writeup`: distinct specialized analysis/report contracts.
- `skills/track-findings`: external Linear/Jira/GitHub/advisory writes with preview/approval/readback gates.
- `.mcp.json` and bundled runtime: one proprietary local MCP server; tool surface recorded in `runtime-tool-surface.json`.

Audited root at trial time: `${CODEX_AUDIT_ROOT}/plugins/cache/openai-curated-remote/codex-security/0.1.19/`; absent from the final current-cache snapshot.

## GitHub 0.1.8

- `skills/gh-address-comments/SKILL.md`: assumes flat connector review comments and routes thread state through a bundled GraphQL script.
- `skills/gh-fix-ci/SKILL.md`: assumes incomplete connector Actions coverage and stops for approval after diagnosis even on a requested fix.
- `skills/yeet/SKILL.md`: owns scope confirmation, checks, commit, push, and draft PR; permits missing dependency/tool installation.
- Auth instructions in several skills treat failed sandbox `gh auth status` as logout, conflicting with the host's keyring/D-Bus agreement.

Installed root: `${CODEX_AUDIT_ROOT}/plugins/cache/openai-curated-remote/github/0.1.8-2841cf9749ae/`.

## Visual Truth 1.3.0

- `.codex-plugin/plugin.json`: one MIT-licensed Read/Write productivity skill for compatible React applications; no hook or MCP declaration.
- `skills/visual-truth/SKILL.md`: installs a development-only editor bridge, requires local-only mounting, and translates captured responsive values into durable source rather than deployment.
- The installer makes a best-effort anonymous version/event request unless `VISUAL_TRUTH_ANALYTICS=0`; the skill says project paths, source, page content, accounts, cookies, device identifiers, and editor activity are excluded.
- The instruction body is unusually large and irrelevant to ordinary coding, so activation must remain restricted to explicit visual/WYSIWYG work. It appeared after controlled trials and has no empirical outcome credit.

Current cached root: `${CODEX_AUDIT_ROOT}/plugins/cache/openai-curated-remote/visual-truth/1.3.0/`.

## Removed Process Jobs 0.3.0

Before removal, the audit read all six skills, hooks, scripts, and manifest. Its start workflow deliberately detached work, released the turn, and allowed at most one wait instead of polling the assigning task to terminal. Hooks intercepted UserPromptSubmit, PostToolUse, and Stop. The frozen inventory and `results/normalized/process-jobs-pre-removal.json` preserve hashes and measurements; the source directory is no longer present.

## Persistent instructions

- `${CODEX_AUDIT_ROOT}/AGENTS.md`: reversible merge authority, the post-trial proportional-coordination replacement, continuous-autonomous-completion policy, and the GitHub keyring execution-boundary rule. The original broader coordination wording was constant during controlled trials and therefore was not independently ablated.
- repository `AGENTS.md`: authority ordering, exact verification commands, isolated task workspace, one durable plan/state, safe continuation, and lesson closeout.
- `.github/AGENTS.md`: least privilege, pinned Actions, untrusted-code isolation, evidence for hosted controls.
- `state/AGENTS.md`: concise evidence-backed recovery state, not a transcript.

The conflict matrix paraphrases these instructions rather than copying them wholesale. Current owner instructions and repository-specific rules remain authoritative over generic plugin methodology.
