# Effective stack inventory summary

## Snapshot boundaries

| Surface | Frozen pre-removal | Current post-removal | Effective interpretation |
| --- | ---: | ---: | --- |
| Cached plugin manifests | 14 | 10 | Process Jobs, Empire, Coordinator, Guardrails, and Security are absent from the current cache; Visual Truth appeared during the audit; Superpowers remains cached after owner-reported removal. |
| Plugin skill files | 68 | 40 | Current cache includes 20 Default Templates, 14 stale Superpowers files, four GitHub skills, Plugin Management, and Visual Truth; cache presence is not activation. |
| Standalone/system skill files | 17 | 17 | Six system skills and eleven Cloudflare-family standalone skills. |
| Lifecycle-hook plugins | 2 | 0 | Current cached manifests expose no lifecycle hooks; pre-removal Process Jobs and Coordinator hook evidence remains frozen. |
| Session-frozen callable tool schemas | 293 | 293 | 280 MCP tools and 13 native functions were frozen when the audit session started; removals may not change this schema until a new session. Visibility is not authorization or post-removal activation. |
| Standalone configured MCP servers | 0 | 0 | Codex Security and app tools arrive through plugin/app surfaces. |

## Current cached plugins and app packages

| Package/display name | Version | Skills | Hooks or dependency surface | Effective state |
| --- | --- | ---: | --- | --- |
| Parallels (`dev-6a82627…`) | 1.0.0 | 0 | app | Schema-visible; authorization unverified; redundant retrieval. |
| Exa (`dev-6a82638…`) | 1.0.0 | 0 | app | Schema-visible; authorization unverified; redundant retrieval. |
| Nansen (`dev-6a8263c…`) | 1.0.0 | 0 | app | Schema-visible; authorization unverified; specialized on-chain data. |
| SciSpace (`app-69439…`) | 2.0.0 | 0 | app | Schema-visible; authorization unverified; specialized research. |
| Wolfram (`app-69fe0…`) | 3.0.0 | 0 | app | Schema-visible; authorization unverified; specialized computation. |
| GitHub | 0.1.8 | 4 | GitHub app | Exposed; hybrid connector/CLI workflows. |
| Default Templates | 0.1.1 | 20 | app | Cached, but template skills were unavailable in controlled prompt preflight. |
| Plugin Management | 0.1.0 | 1 | app | Exposed; permission/dependency/removal administration. |
| Superpowers | 6.2.0 | 14 | no lifecycle hooks | Cache artifact remains, but the owner reports removing the plugin after Task H froze its treatment; do not treat this as active. |
| Visual Truth | 1.3.0 | 1 | skills only | Added during the audit; unbenchmarked live editor for explicit compatible React visual-editing work. |

The collector labels cache manifests `cached-unverified` because install receipts are not a reliable activation oracle. Effective-state claims above use the current rendered skill catalog and callable tool surface in addition to cache presence.

## Removed during the audit

| Package | Version | Skills | Hooks | Reason/current consequence |
| --- | --- | ---: | --- | --- |
| Codex Process Jobs | 0.3.0 | 6 | PostToolUse, Stop, UserPromptSubmit | Owner removed it after observed turn-release harm; unique cross-client job registry is lost. |
| Empire | 1.5.1 | 7 | none | Operationally dead and now absent; no credentials/budget/provider path. |
| Codex Coordinator | 0.4.0 | 1 | SessionStart, Stop | Absent from the current cache; mixed C/H evidence leaves only an uncertain reevaluation path, not a reason to reinstall. |
| Codex Engineering Guardrails | 1.1.1 | 2 | none | Absent from the current cache; benchmark recommendation is remove as harmful. |
| Codex Security | 0.1.19 | 13 | local MCP + app | Absent from the current cache; formal scan value remains uncertain/specialized rather than an ordinary-stack reason to reinstall. |
| Superpowers | 6.2.0 | 14 | none | Owner removed it after repeated approval gates, artifact growth, and Task H nontermination; a stale cache copy remained at the final snapshot. |

Removed components were not restored. Historical treatment trials used only their frozen per-run surfaces; the owner removed Superpowers after Task H's replacement trial had already copied its treatment into the disposable workspace.

## Current cached plugin-provided skills

- GitHub: `github`, `gh-address-comments`, `gh-fix-ci`, `yeet`.
- Plugin Management: `plugin-management`.
- Superpowers cache artifact: fourteen audited skills; owner reports the plugin removed, so they are provenance rather than a recommended active surface.
- Visual Truth: `visual-truth`.
- Default Templates: twenty named artifact templates listed in `effective-stack.json`; not available in the controlled prompt rendering.

## Standalone and system skills

- System: `imagegen`, `openai-docs`, `plugin-creator`, `review-agent`, `skill-creator`, `skill-installer`. `review-agent` exists on disk but was unavailable to the controlled prompt surface.
- Cloudflare family: `cloudflare`, `agents-sdk`, `cloudflare-email-service`, `cloudflare-one`, `cloudflare-one-migrations`, `durable-objects`, `sandbox-sdk`, `turnstile-spin`, `web-perf`, `workers-best-practices`, `wrangler`.
- Broken `ai-check` and `humanize` symlinks found during the initial survey expose no effective skill and receive no capability credit.

## Callable app/tool integrations

`runtime-tool-surface.json` is the authoritative frozen session count. The app server exposed GitHub (89), Linear (59), Nansen (38), Atlassian Rovo (31), Sites (22), Safety Settings (5), Plugin Management (4), Document Control (3), Wolfram (3), Exa (2), Parallels (2), SciSpace (2), and Hotline (1). Codex Security exposed 19 tools through its separate server before removal; a new session is required to establish the actual post-removal callable schema.

These schemas include consequential external writes. They do not imply connection health, authorization, or authority to mutate external state.

## Persistent behavioral instructions

| Instruction source | Material behavior | Audit disposition |
| --- | --- | --- |
| Native system/developer policy | Tool safety, autonomy, skill invocation, verification, communication, Git safety | Unavoidable baseline; B0 is labeled honestly rather than “instruction free.” |
| `~/.codex/AGENTS.md` reversible merges | Permits verified reversible local merges | Keep. |
| `~/.codex/AGENTS.md` automatic coordination | Defaults small/tightly coupled work to one agent/no durable artifact; permits one proportionate plan/ledger, isolated workspace, and genuinely independent delegation | Keep the narrowed owner policy; replacement occurred after trials and is not credited with causal lift. |
| `~/.codex/AGENTS.md` continuous autonomous completion | Continue routine safe work, ask only for material tradeoffs, and prefer complete verified outcomes over shortcuts | Keep as an explicit owner policy; added after trials and not credited with causal lift. |
| `~/.codex/AGENTS.md` GitHub auth boundary | Prevents false sandbox logout diagnosis and credential exposure | Keep. |
| Repository `AGENTS.md` | Authority, exact commands, one durable plan/state, safe continuation | Keep for this repository. |
| `.github/AGENTS.md` | Least privilege, pinned Actions, untrusted-code isolation, hosted-evidence discipline | Keep for GitHub files. |
| `state/AGENTS.md` | Concise evidence-backed recovery state | Keep; it prevents chat from becoming the only memory. |

No home-directory `AGENTS.md` file exists. The global agreements are loaded from the Codex configuration-root `AGENTS.md` and were also supplied to this session by the host.

## GitHub repository workflow/tooling

- `.github/workflows/universal-architecture-tests.yml`: pull-request/main unit tests and deterministic audit; read-only contents permission, pinned checkout, 10-minute bound.
- `.github/workflows/weekly-codex-github-audit.yml`: scheduled deterministic drift audit plus narrowly scoped issue reconciliation.
- `.github/codex-repository.json`: exact local commands and dated hosted-control evidence.
- `.github/CODEOWNERS`, Dependabot configuration, and the PR template: ownership/update/review scaffolding, not agent methodology.

These repository components are retained. They provide independent deterministic enforcement and durable evidence rather than duplicating in-turn reasoning.
