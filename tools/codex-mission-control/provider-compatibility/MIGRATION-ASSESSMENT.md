# GPT → Claude migration assessment

`NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT` · 2026-09-24 · branch `chat/claude-acceptance-resume-20260924-0305`

**Evidence level.** This draws on the repository, the Claude Code documentation, the Claude CLI 2.1.281 help text, connector state observed on 2026-09-24, and a live acceptance on the owner laptop. That acceptance ran Claude Opus 5.5 at low effort, logged in through `claude.ai` Max, and passed 12/12 checks on its second run. It covered:

- exact owner-bound directive and binding;
- a new session with the exact ID returned;
- an approved read and a denied write;
- one exact connector tool (Railway);
- exact-ID resume;
- cancellation with the process tree stopped;
- sanitized receipts in the real Mission Control store.

Details are in `evidence/2026-09-24-live-acceptance-owner-laptop.json`.

## Bottom line

Most of what makes the current setup GPT-specific is machinery built to drive ChatGPT's consumer surfaces: the chatgpt.com browser relay, the Work-cloud desktop-app driver, and scraping threads to copy receipts. Claude has headless and cloud routes on the same subscription, so that machinery doesn't need a Claude port. For Claude-routed work it simply has no job.

Four things do need attention:

- **Usage.** Claude's subscription allowance is finite and has not been measured on real tasks.
- **Governance-following.** A 2026-09-17 owner record says Claude "can't follow this map", so the trial below includes a direct check.
- **AskRigor.** It is not connected to Claude.
- **Pushing from Claude sessions.** Repositories must be added to the Claude environment's sources first. This session could not push for that reason.

## 1. Moves to Claude unchanged

- **UDA governance files.**
  - Claude Code 2.1.277+ reads `AGENTS.md` natively when no `CLAUDE.md` is present.
  - One case silently dropped the root rules: a session started inside the Mission Control app folder. That is fixed on this branch (commit `b2e27dc`).
  - Source: https://code.claude.com/docs/en/memory
- **GitHub as the message bus.** Issues, receipts and branches are provider-neutral.
- **The Mission Control and AskRigor MCP servers.** Both use the standard MCP SDK and Streamable HTTP, so they are compatible in principle with Claude's remote connectors. Not yet tested.
- **Repository test and audit commands.** The contents of `.github/codex-repository.json` are provider-neutral; only the name says Codex.
- **Railway, Gmail, Google Drive.** All are connected on the Claude side. A read-only Railway call (`list-projects`) returned the `mission-control` project.
- **Scholarly discovery.** Consensus and Elicit are connected. SciSpace did not appear in the registry search, so these two take its role.
- **The Venice and OpenRouter gateway scripts.** The transport is provider-neutral; only the default model is GPT.

## 2. Tied to ChatGPT-only product surfaces — retire for Claude work, don't port

| Workflow | Why it is ChatGPT-only | Claude route instead |
|---|---|---|
| Browser relay driving chatgpt.com (`vps-browser-relay`) | CDP automation of the consumer UI, pinned to "GPT-5.6 Sol Extra High", with 60 s pacing and tab limits | Headless `claude --print` on the subscription (this adapter), or a Claude cloud session. No UI automation. |
| Native ChatGPT Work-cloud dispatch | ChatGPT desktop app `create_thread(chatgptWorkCloud)` reached through a Codex driver task | Claude cloud sessions (`claude --cloud`, `--bg`) or scheduled tasks |
| Supervisor receipt copier | Reads ChatGPT threads through `read_thread`, then posts with `gh` | The Claude executor writes its own receipt to GitHub |
| Thread recovery script | Reads Brave history and `~/.codex` sqlite/rollouts | Claude's own session list and past-chat search |
| Two-account failover and allowance routing | ChatGPT account switcher and Codex usage page | None needed at this stage |
| Private MCP route through OpenAI Secure MCP Tunnel | OpenAI-specific tunnel | A reachable HTTPS endpoint registered as a Claude custom connector |

## 3. Moves through existing connector/plugin equivalents

| Owner integration | Claude state observed 2026-09-24 | Action |
|---|---|---|
| Railway | Connected; read verified | None |
| Gmail, Google Drive | Connected | None |
| Google Calendar | Installed, **not connected** | Owner connects it in claude.ai if needed (OAuth, owner-only) |
| GitHub | No connector. Claude sessions reach GitHub through repository sources, and `universal-dev-architecture` is **not** in this session's sources | Owner adds the repositories to the Claude environment's sources |
| SciSpace | Not in the registry | Use Consensus or Elicit |
| Remote Desktop Commander | Claude's linked-computer bridge reached the laptop (file tools only). No shell tool in this session; no local MCP server is running on the laptop. | Enable a shell route on the linked computer if Claude should run commands there |
| AskRigor MCP | **Not connected to Claude** | Owner adds it as a custom connector (OAuth, owner-only), then reruns the harness with `--mcp-tool <exact AskRigor read tool>` |

## 4. Small compatibility shims

Done on this branch:

- **Exact-ID resume was impossible.** A resume directive's digest covers the previous binding's digest, so it could never equal it. Resume is now "same task, strictly newer revision, exact previous binding inside the new authorized bytes". The directive id may change, because the store records each id once per worker. It would have failed the live acceptance on any host.
- **Claude receipts skipped the "reasoning review between executions" invariant.** The store only recognised Codex and Work receipts. Fixed, with a regression test that fails without the fix.
- **Host-transport tests were not hermetic.** They inherited the ambient `ANTHROPIC_BASE_URL` and failed on hosts that set it (commit `96e0540`).
- **One-command live acceptance harness** with an offline self-test (commit `7a9eaa6`).
- **Shadowing app `CLAUDE.md` removed** (commit `b2e27dc`).

An independent review found the directive-id problem in the first item and led to the second. The first version of the resume fix passed a simplified in-memory harness, but the real store would have rejected it. The harness now runs on the real store.

Not done, and why:

- **Resumed-session provenance and single-use directives.** Mission Control does not check that a resumed session ID was recorded under the previous binding, and it can admit the same active directive more than once. The owner-source-bound directive author is the current control. Add server-side checks only if Claude becomes an automatic executor.
- **Reasoning-message schema has no Claude or owner-direct surface.** `provider_surface` allows only ChatGPT, OpenAI API or `UNKNOWN`. That is fine while reasoning stays on ChatGPT, and it needs a value if the supervisor moves to Claude.
- **Automatic no-argument Claude discovery.** Not added. The no-argument path it would extend is the Codex headless route, and that route is off unless `MC_CODEX_EXEC_PREVIEW_ENABLED=1`. The live automatic chain is the native-Work autodispatch (issue #178). Adding Claude there is a routing switch, and that switch needs the acceptance result plus an owner choice first. Build it only once Claude is chosen as an automatic executor; a reference design sits on the closed parallel lane (`task/claude-compatibility-chat-20260924-0045`, commit `3992f93`).
- **Auth-route predicate.** The preflight accepts only `authMethod: "claude.ai"` with a `subscriptionType`. That matched the host that produced the earlier evidence. This cloud workspace reports `oauth_token` with no subscription type and a set `ANTHROPIC_BASE_URL`, so it is correctly refused. How a long-lived token (`claude setup-token`) reports itself on a headless VPS is **unverified**. Check `claude auth status --json` on the target host before widening anything.
- **Claude row in the model/effort ladder.** The governance text hard-codes GPT-5.6 Sol/Astra (`patterns/work-model-and-effort-routing.md`, root `AGENTS.md`). A separate Claude profile already exists in code. The policy row should wait for real usage numbers and an owner choice of models.
- **The "Chat reasons, Work executes" wording.** It assumes two different products. In Claude one session can reason and execute. The authority separation (owner-source binding, no self-authored proposals) still holds, but moving work to "a different surface" needs reinterpreting. That is an owner decision, not an edit to make unilaterally.

## 5. Stay on GPT / ChatGPT for now

- **Primary reasoning-supervisor chats (Extra High / Pro).** The owner's recorded reason is cost. The 2026-09-01 record says "Do not pay for API model inference when the owner has essentially unlimited Extra High ChatGPT use", and the 2026-09-17 record says "chat is free". Claude allowances are finite and unmeasured.
- **The native-Work automatic chain (issue #178).** It was satisfied on 2026-09-21. Don't switch it mid-stream.
- **YouTube transcription.** It is a paid OpenAI API call (`gpt-4o-mini-transcribe`), independent of the chat migration. No Claude replacement was identified in this pass.
- **Pangram runners.** They live in another repository, and their GPT involvement is uncertain.

## 6. Friction and usage

- **Measured usage.** The CLI's own estimates for the acceptance were:
  - **Plain run** (read, denied write, report): about $0.05.
  - **Resume:** about $0.05 more.
  - **With all connectors visible:** about $0.85. That is roughly 16× more, because all 168 tools from your 8 connectors entered the session.
  - **With only the approved connector (fixed, run 3):** about $0.30. The adapter now denies every connector except the one a task needs, through `deniedMcpServers` in `--settings`. What remains is that connector's own 65 tool definitions. Runs that approve no connector load none.

  These are notional API-equivalent figures, not invoices or allowance percentages.

- **Allowance accounting.** The adapter records only a per-session CLI cost estimate; it is neither an invoice nor a weekly-allowance percentage. The acceptance run gives the first real per-run figure. Keep execution effort at low or medium until the numbers exist.
- **Instruction weight.** The root `AGENTS.md` is 219 lines, and the full chain is 32,756 bytes, 12 bytes under Codex's 32 KiB cap. Claude has no such cap (it skips files over 4 MiB), but its docs target under 200 lines per file for adherence. The per-turn rule "re-fetch live default-branch AGENTS.md" costs a fetch every turn in a Claude session. Test adherence directly: the first-line timestamp invariant is an easy, mechanical probe.
- **Pushing.** Claude cloud sessions push only to repositories in their sources. Until those are added, work has to come back as bundles or patches.
- **Where Claude execution runs.** The adapter is built for a Claude-authenticated host (today the owner's laptop), not a nested Claude inside a Claude cloud session. A VPS would need its own Claude login before Mission Control could launch Claude there. The cloud workspace's safety layer blocks probing its credentials, and the adapter refuses its route.
- **Nesting.** Run the harness from an ordinary terminal, not from inside another Claude Code session.

## 7. Recommended sequence

1. **Live acceptance.** Done on 2026-09-24, and it passed on the second run after two fixes. The run exposed a connector-cost issue. The narrowing fix was verified live in run 3. That run also showed the CLI can exit 143 on cancellation instead of dying by signal, which the adapter mislabelled; that is fixed and verified offline.
2. **Add the repositories to the Claude environment's sources.** This takes about a minute and unblocks pushes from Claude sessions.
3. **Trial Claude on 2–3 real bounded execution tasks** that currently go to Codex or Work, using Claude cloud sessions directly. No Mission Control change is needed. Compare them against Work on the same tasks, with a governance-adherence check. This is the Decision lane.
4. **Connect AskRigor as a custom connector** and rerun the harness with one exact AskRigor read tool. Connect Google Calendar too if you use it.
5. **Then decide** whether Mission Control should route automatic execution to Claude. Only at that point add Claude discovery at the execution-surface routing.
6. **Migrate the reasoning supervisor last**, once usage is measured against the cost reason recorded in 2026-09.
