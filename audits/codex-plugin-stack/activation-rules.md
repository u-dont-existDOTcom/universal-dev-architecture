# Recommended activation rules

These rules separate what may remain installed from what is allowed to influence an ordinary task. The ordinary path is native Codex plus the current repository's concise instructions. Optional components are dormant unless a trigger below is satisfied.

## Ordinary software work

- Do not activate a general workflow plugin merely because code will change.
- Use native inspection, a lightweight plan proportional to the task, the repository's exact checks, and native terminal polling.
- Ask the owner only when missing information would materially change behavior, authority, external state, cost, or irreversible risk.
- Add a failing regression test when practical; characterization or static evidence is acceptable when it is the more reliable proof.
- Use one independent review only for material risk, broad changes, or an explicit review request.

## Codex Security

Activate only for one of these explicit cases:

- a requested repository or diff security scan;
- formal threat modeling;
- validation or attack-path analysis of a supplied finding;
- an explicitly requested vulnerability write-up, hardening proposal, or tracked finding.

During activation:

- Security alone owns scan-worker orchestration; do not compose it with Coordinator or Superpowers coordination;
- establish a wall-time, worker, and output-artifact budget before a deep scan;
- require a terminal result or an explicit timed-out classification—never treat detached/waiting activity as completion;
- let Security define the security invariant and bypass cases, while native implementation owns the patch;
- require separate approval before writing external tickets/advisories or changing persistent configuration.

Do not activate it for ordinary code review, routine implementation, or every security-sensitive code change. A normal change can receive native adversarial reasoning without the formal scan pipeline.

## Coordinator

The evidence does not justify default activation. If it remains installed during an evaluation period, activate it only when all conditions hold:

- the owner explicitly wants multiple durable Codex windows rather than parent-local subagents;
- there are two or three substantial independent verticals;
- all writers intentionally share one already-selected checkout and branch;
- exact task/thread identifiers are available;
- the active-claim board supplies value that Git worktrees and the repository plan cannot.

Select the worktree before coordination starts. Do not create a Superpowers task graph, second progress ledger, or new worktree after claims begin. Release all claims before branch integration.

## GitHub

Prefer native `git`, `gh`, and the repository's GitHub rules. Activate a connector workflow only when structured remote data is materially easier or unavailable through the current native path, such as a large set of review threads or cross-resource triage. Publishing still requires an explicit publish request.

The global host-boundary authentication instruction remains authoritative over plugin auth advice. A sandbox-only failure is not a logout.

## Plugin Management and templates

- Plugin Management: explicit plugin permission, dependency, connection, or removal administration only.
- Default Templates: explicit creation of a named document, spreadsheet, or presentation artifact only.
- Neither belongs in the ordinary coding prompt surface.

## Research and domain apps

- Nansen: explicit on-chain or crypto intelligence task.
- SciSpace: structured academic-paper discovery, triage, or synthesis.
- Wolfram: exact symbolic/numeric computation or curated data query that benefits from the engine.
- Exa and Parallels: no activation while native search/fetch covers the task.

## Cloudflare skills

Load one routing layer and only the narrow specialist needed. Avoid simultaneously loading the broad Cloudflare umbrella and every matching specialist. External deployment, account-object creation, secret mutation, or persistent skill creation requires explicit authority beyond a repository code-change request.

Disable `web-perf` until Chrome DevTools MCP is installed and its runtime is verified.

## Components that should never auto-activate

- Superpowers global bootstrap, brainstorming, planning, TDD, SDD, review, verification, worktree, and branch-finishing workflows.
- Codex Security deep scan.
- Coordinator.
- GitHub publish workflows.
- Turnstile deployment.
- Any external tracker/advisory write.
- Removed Process Jobs and Empire components.
