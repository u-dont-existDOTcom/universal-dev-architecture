# Effective stack inventory summary

## Snapshot boundaries

| Surface | Frozen pre-removal | Current post-removal | Effective interpretation |
| --- | ---: | ---: | --- |
| Cached plugin manifests | 14 | 12 | Process Jobs and Empire are absent now; frozen hashes retain provenance. |
| Plugin skill files | 68 | 55 | Current session exposes 35 workflow/security/GitHub/management skills; 20 Default Template files were unavailable in controlled preflight. |
| Standalone/system skill files | 17 | 17 | Six system skills and eleven Cloudflare-family standalone skills. |
| Lifecycle-hook plugins | 2 | 1 | Coordinator retains SessionStart and Stop; removed Process Jobs had PostToolUse, Stop, and UserPromptSubmit. |
| Callable tool schemas | 293 | 293 | 280 MCP tools and 13 native functions; visibility is not authorization. |
| Standalone configured MCP servers | 0 | 0 | Codex Security and app tools arrive through plugin/app surfaces. |

## Current cached plugins and app packages

| Package/display name | Version | Skills | Hooks or dependency surface | Effective state |
| --- | --- | ---: | --- | --- |
| Parallels (`dev-6a82627…`) | 1.0.0 | 0 | app | Schema-visible; authorization unverified; redundant retrieval. |
| Exa (`dev-6a82638…`) | 1.0.0 | 0 | app | Schema-visible; authorization unverified; redundant retrieval. |
| Nansen (`dev-6a8263c…`) | 1.0.0 | 0 | app | Schema-visible; authorization unverified; specialized on-chain data. |
| SciSpace (`app-69439…`) | 2.0.0 | 0 | app | Schema-visible; authorization unverified; specialized research. |
| Wolfram (`app-69fe0…`) | 3.0.0 | 0 | app | Schema-visible; authorization unverified; specialized computation. |
| Codex Coordinator | 0.4.0 | 1 | SessionStart, Stop | Exposed; shared-checkout claim workflow. |
| Codex Engineering Guardrails | 1.1.1 | 2 | skills only | Exposed; implementation and verification methodology. |
| Codex Security | 0.1.19 | 13 | local MCP + GitHub app | Exposed; formal security workflows. |
| GitHub | 0.1.8 | 4 | GitHub app | Exposed; hybrid connector/CLI workflows. |
| Default Templates | 0.1.1 | 20 | app | Cached, but template skills were unavailable in controlled prompt preflight. |
| Plugin Management | 0.1.0 | 1 | app | Exposed; permission/dependency/removal administration. |
| Superpowers | 6.2.0 | 14 | no lifecycle hooks | Exposed; prescriptive development methodology. |

The collector labels cache manifests `cached-unverified` because install receipts are not a reliable activation oracle. Effective-state claims above use the current rendered skill catalog and callable tool surface in addition to cache presence.

## Removed during the audit

| Package | Version | Skills | Hooks | Reason/current consequence |
| --- | --- | ---: | --- | --- |
| Codex Process Jobs | 0.3.0 | 6 | PostToolUse, Stop, UserPromptSubmit | Owner removed it after observed turn-release harm; unique cross-client job registry is lost. |
| Empire | 1.5.1 | 7 | none | Operationally dead and now absent; no credentials/budget/provider path. |

Neither is restored or used by the benchmark.

## Current plugin-provided skills

- Coordinator: `codex-coordinator`.
- Engineering Guardrails: `code-work`, `code-verification`.
- Security: `security-scan`, `deep-security-scan`, `security-diff-scan`, `define-security-policy`, `finding-discovery`, `threat-model`, `validation`, `attack-path-analysis`, `fix-finding`, `propose-security-hardening`, `track-findings`, `triage-finding`, `vulnerability-writeup`.
- GitHub: `github`, `gh-address-comments`, `gh-fix-ci`, `yeet`.
- Plugin Management: `plugin-management`.
- Superpowers: `using-superpowers`, `brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`, `dispatching-parallel-agents`, `using-git-worktrees`, `test-driven-development`, `systematic-debugging`, `requesting-code-review`, `receiving-code-review`, `verification-before-completion`, `finishing-a-development-branch`, `writing-skills`.
- Default Templates: twenty named artifact templates listed in `effective-stack.json`; not available in the controlled prompt rendering.

## Standalone and system skills

- System: `imagegen`, `openai-docs`, `plugin-creator`, `review-agent`, `skill-creator`, `skill-installer`. `review-agent` exists on disk but was unavailable to the controlled prompt surface.
- Cloudflare family: `cloudflare`, `agents-sdk`, `cloudflare-email-service`, `cloudflare-one`, `cloudflare-one-migrations`, `durable-objects`, `sandbox-sdk`, `turnstile-spin`, `web-perf`, `workers-best-practices`, `wrangler`.
- Broken `ai-check` and `humanize` symlinks found during the initial survey expose no effective skill and receive no capability credit.

## Callable app/tool integrations

`runtime-tool-surface.json` is the authoritative count. The app server exposes GitHub (89), Linear (59), Nansen (38), Atlassian Rovo (31), Sites (22), Safety Settings (5), Plugin Management (4), Document Control (3), Wolfram (3), Exa (2), Parallels (2), SciSpace (2), and Hotline (1). Codex Security exposes 19 tools through its separate server.

These schemas include consequential external writes. They do not imply connection health, authorization, or authority to mutate external state.

## Persistent behavioral instructions

| Instruction source | Material behavior | Audit disposition |
| --- | --- | --- |
| Native system/developer policy | Tool safety, autonomy, skill invocation, verification, communication, Git safety | Unavoidable baseline; B0 is labeled honestly rather than “instruction free.” |
| `~/.codex/AGENTS.md` reversible merges | Permits verified reversible local merges | Keep. |
| `~/.codex/AGENTS.md` automatic coordination | Prefers worktrees, durable plans/ledgers, delegation, independent review | Narrow/replace with proportional evidence-triggered coordination. |
| `~/.codex/AGENTS.md` GitHub auth boundary | Prevents false sandbox logout diagnosis and credential exposure | Keep. |
| Repository `AGENTS.md` | Authority, exact commands, one durable plan/state, safe continuation | Keep for this repository. |
| `.github/AGENTS.md` | Least privilege, pinned Actions, untrusted-code isolation, hosted-evidence discipline | Keep for GitHub files. |
| `state/AGENTS.md` | Concise evidence-backed recovery state | Keep; it prevents chat from becoming the only memory. |

No `/home/joel/AGENTS.md` file exists. The global agreements are loaded from `~/.codex/AGENTS.md` and were also supplied to this session by the host.

## GitHub repository workflow/tooling

- `.github/workflows/universal-architecture-tests.yml`: pull-request/main unit tests and deterministic audit; read-only contents permission, pinned checkout, 10-minute bound.
- `.github/workflows/weekly-codex-github-audit.yml`: scheduled deterministic drift audit plus narrowly scoped issue reconciliation.
- `.github/codex-repository.json`: exact local commands and dated hosted-control evidence.
- `.github/CODEOWNERS`, Dependabot configuration, and the PR template: ownership/update/review scaffolding, not agent methodology.

These repository components are retained. They provide independent deterministic enforcement and durable evidence rather than duplicating in-turn reasoning.
