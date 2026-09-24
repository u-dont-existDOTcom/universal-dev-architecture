# Provider compatibility — Claude Code integration candidate

**Status: isolated Iteration candidate integrated into the real admission/runner seams; not merged, deployed, or live-inference validated.**

Implementation checkpoint: `1b14c87b876aeb9c0c41c0e4966575d3c7f3582c` on `chat/claude-compatibility-integration-20260924-0110`.

Continuation (`chat/claude-acceptance-resume-20260924-0305`):

- **Exact-ID resume is now dispatchable.** Before this fix it never was. Resume requires the same task and directive at a strictly newer revision, with the exact previous binding inside the newly authorized bytes.
- **The host-transport tests are hermetic.**
- **`acceptance/live-acceptance.ts`** runs the full live acceptance with one command on the Claude-authenticated host.
- **The app `CLAUDE.md` is gone.** It hid the root `AGENTS.md` chain from Claude sessions started inside the app.

See `WORK-INSTRUCTIONS.md` for the next action and `MIGRATION-ASSESSMENT.md` for the GPT → Claude migration path.

## What is implemented

The existing OpenAI/Codex path remains the default. `provider-dispatch.mjs` sends directives with no explicit provider binding to the existing dispatcher with the exact original argument object and returns its exact result. Unknown provider bindings fail closed. Only the exact `ANTHROPIC / CLAUDE_CODE_CLI / EXECUTION` binding selects Claude.

Claude gets a separate execution profile; it is not relabeled as GPT. The authenticated authority gate binds provider, profile, source message, task, directive revision, and directive artifact digest. The entire Claude request—prompt, session, model/effort, tools/MCP configuration, limits and workspace—is included in that digest before dispatch.

`host-transport.mjs` performs a non-inference host preflight before every launch: current Claude Code version/required flags, `claude.ai` first-party subscription authentication, and absence of API/Bedrock/Vertex/base-URL overrides. Mission Control must persist the exact profile authorization and a preflight containing the exact prepared-plan hash before the subprocess can start.

The subprocess uses a direct argv vector with `shell: false`. Stdout streams into `createClaudeCollector`; stderr content is not persisted. Wall-clock timeout, abort handling, graceful SIGTERM, bounded SIGKILL fallback and process-group cleanup are enforced. No retry, fallback model, API route or subagent is automatic. The terminal result is normalized into a privacy-bounded Mission Control receipt; assistant text, thinking, prompts, tool inputs and raw errors are not persisted there.

## MCP / plugin compatibility

`--strict-mcp-config` does not remove authenticated `claude.ai` connectors on the tested host. With an empty explicit MCP config, existing Claude connectors remained health-visible. MCP is denied by default by this adapter. A source-bound exact `mcp__...` tool approval can expose a requested connector/tool without copying OAuth tokens or connector URLs into the directive. Custom remote servers remain explicit HTTPS-only configuration with no embedded credentials.

This is not yet proof of every connector's tool catalog or read/write semantics. A real MCP tool call has not been made in this iteration. Server-side OAuth and permission enforcement remain authoritative.

## Current CLI limitation

Claude Code `2.1.281` does not expose the prior `--max-turns` flag. The adapter therefore does not send that unsupported option. `maxTurns` is checked retrospectively against terminal `num_turns`; exceeding it produces `LIMIT_REACHED`. The wall-clock limit remains a hard host-side termination boundary. Do not represent the turn limit as preventive enforcement on this CLI version.

## Tests

No model inference is required for the candidate suites.

```sh
node --test tools/codex-mission-control/provider-compatibility/tests/*.test.mjs

cd tools/codex-mission-control/restored/codex-mission-control
npx tsx --test   tests/chat-work-authority-gate.test.ts   tests/supervision-admission-runtime.test.ts   tests/claude-execution-runtime.test.ts
```

Current focused result: 55/55 Node tests and 35/35 TypeScript tests. `git diff --check` passes. Repository typecheck still reports one inherited `WorkerDetail.tsx` TS2366 error; that file is byte-identical to current `main`, and the Claude candidate introduces no additional typecheck error.

Use `scripts/test_efficiency.py` for measured reruns. The current task telemetry is recorded in `TEST-RESULTS.json`.

## Real host evidence without inference

`NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT`: current Claude Code version and subscription authentication were verified without sending a prompt. Required launcher flags were present; checked provider override variables were absent. Seven existing `claude.ai` MCP integrations were connected and one required authentication. An empty strict MCP config preserved those connector health entries. No connector tool, model inference, OAuth mutation or account change occurred.

## What is not implemented or proven

The no-`--directive` automatic Mission Control discovery path remains the existing Codex path; the integrated Claude path is available through an explicit source-bound provider directive. Claude autodiscovery was deliberately not added. That path is the preview-gated Codex headless route, and the live automatic chain is native-Work autodispatch, so the addition would be a routing switch. It belongs at execution-surface routing once the owner chooses Claude as an automatic executor. No real Claude task, MCP tool invocation, AskRigor production change, merge, deployment, restart or routing switch has occurred.

The next live acceptance is intentionally resource-gated: one bounded low/medium subscription run should verify exact session/result, one permitted read, one denied operation, resume, cancellation and one exact MCP tool identity. Do not retry a provider failure automatically. After that evidence, decide whether automatic Claude autodiscovery is necessary before any merge.

## Security / authority invariants

- provider text or `expensiveEffortApproved` alone never grants authority;
- GPT/Codex profiles and setters remain unchanged;
- Claude xhigh/max requires an explicit source-bound approval;
- API/provider overrides fail closed rather than becoming fallback routes;
- the prepared plan itself never grants launch authority;
- exact plan preflight must be durably persisted before spawn;
- consequential external actions and server-side MCP authorization keep their existing human/control-plane gates;
- execution receipts never claim supervisory approval or owner-outcome completion.

For the next boundary, read `WORK-INSTRUCTIONS.md`, `TASK-STATE.json`, `TEST-RESULTS.json`, and the current writer/integration state. Do not redo the completed compatibility audit.
