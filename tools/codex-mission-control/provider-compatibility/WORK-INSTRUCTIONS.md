# Next boundary — run the live Claude acceptance on the owner host

## Current checkpoint

Branch `chat/claude-acceptance-resume-20260924-0305` (child of `chat/claude-compatibility-integration-20260924-0110` at `1fc3525`).

Done here without inference:

- **Resume lineage fix.** Before it, exact-ID resume could never dispatch (commit `96e0540`).
- **Hermetic host-transport tests** (commit `96e0540`).
- **One-command live acceptance harness** with an offline self-test (commit `7a9eaa6`).
- **Removal of the app `CLAUDE.md`,** which hid the root/tools `AGENTS.md` chain from Claude (commit `b2e27dc`).
- **Autodiscovery decision** (not added) and **migration assessment:** `MIGRATION-ASSESSMENT.md`.

Do **not** redo the adapter, the admission design, the audit, or the assessment.

## Next action — one command on the Claude-authenticated host

Use the host where `claude auth status --json` reports `"authMethod": "claude.ai"`, `"apiProvider": "firstParty"` and a `subscriptionType`. The earlier non-inference evidence came from such a host; per `state/NON-UNIVERSAL-OWNER-MISSION-CONTROL-TOPOLOGY-2026-09-10.md` that is most likely the primary Mission Control VPS. Run it from an ordinary terminal, not from inside another Claude Code session. `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL` and the Bedrock/Vertex/Foundry switches must be unset.

```sh
# in an existing checkout of universal-dev-architecture, with this branch present
git switch chat/claude-acceptance-resume-20260924-0305
cd tools/codex-mission-control/restored/codex-mission-control
npm ci --ignore-scripts            # only if node_modules is missing
npx tsx ../../provider-compatibility/acceptance/live-acceptance.ts --model claude-opus-5-5 --effort low
```

The command makes three bound runs, each exactly once, on a disposable temp workspace:

- **A (new session):**
  - one approved `Read` of an unguessable nonce;
  - one `Write` that must be denied under `dontAsk`/no prompts;
  - one exact MCP tool, by default `mcp__claude_ai_Railway__whoami` (read-only).
- **B (resume, directive revision 2):** the same session ID, with no tools, must recall the nonce.
- **C (cancellation):** aborted 1.5 s after session start; the process group and any process carrying the session ID must be gone.

Every run passes the real Mission Control authority code:

1. owner-source-bound directive;
2. admission;
3. Claude profile authorization;
4. plan-hash preflight;
5. schema-validated receipt.

Here that code runs in memory: no live Mission Control, OAuth, account or production change.

The output is `claude-acceptance-<stamp>/acceptance-receipt.json` plus `mission-control-events.json`. It holds only identifiers, statuses, reason codes, counts and tool **names**. Exit code 0 means every check passed.

Options:

- **`--effort medium`**, if low proves insufficient.
- **`--mcp-tool <exact name>`** / **`--mcp-args '<json>'`**, for a different read-only connector tool. If the default name is wrong, the receipt lists the visible MCP tool names so the next run can pick exactly.
- **`--no-mcp`**, to skip the MCP step.

## Interpreting failures — do not retry automatically

- `HOST_PREFLIGHT:*` means an auth-route or CLI-contract problem, not model quality. A `CLAUDE_SUBSCRIPTION_AUTH_UNVERIFIED` on a headless host set up with `claude setup-token` is the open question in `MIGRATION-ASSESSMENT.md` §4. Record what `claude auth status --json` reports (fields `loggedIn`, `authMethod`, `apiProvider`, `subscriptionType` only) before changing the predicate.
- A `mcpExactTool` failure classified `CONNECTOR_OR_AUTH_NOT_MODEL` means a connector name or auth problem, not model quality.
- `MODEL_MISMATCH` means the CLI reported a model ID different from the requested one; record the reported ID.
- There is no automatic retry, model or provider fallback, API route or subagent. Don't change OAuth or account state to rescue a run.

## After a pass

1. Record the receipt summary in `TASK-STATE.json` and `TEST-RESULTS.json`.
2. Follow the sequence in `MIGRATION-ASSESSMENT.md` §7.

Claude autodiscovery belongs at the execution-surface routing, and only after the owner chooses Claude as an automatic executor.

Merge, deploy, restart and routing switches stay outside this packet.
