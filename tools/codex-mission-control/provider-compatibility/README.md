# Provider compatibility — isolated iteration candidate

**Status: offline implementation, not a live launcher or a production migration.**

This dependency-free Node.js module supplies the first bounded interface between
Mission Control and Claude Code. It does not change any existing routing, actor
permissions, model policy, deployment, AskRigor server, or source archive.

## What works in this candidate

`validateRequest` validates an exact run/directive binding, explicit session,
model/effort, resource limits, working directory, and tool configuration.
`prepareClaudeCode` creates a non-interactive CLI argument vector and private stdin
payload; it does not start a process. New sessions and exact-ID resumes are
represented separately. Resume across a different directive requires a later
explicit integration design; it is not silently accepted here.

`createClaudeCollector` accepts NDJSON byte chunks and produces a bounded receipt.
It checks session/directive identity, primary-model changes, duplicate terminal
results, malformed output, output limits, termination, and the final worker report.
It discards assistant text, thinking, raw errors, tool inputs, and unrecognized
provider fields. The validated final report can still contain private task content:
**do not publish receipts without the destination's normal privacy check.**

`delegateExistingOpenAI` calls the injected existing dispatcher with its exact
original argument object and returns the exact result. `describeExistingOpenAIProfile`
is only a read-only projection of known current profile names. Neither is a new
validator or an alternative admission path.

## Run the offline tests

From this directory, with Node.js 22 or newer:

```sh
node --test tests/compatibility.test.mjs
```

No npm installation, credentials, API calls, Claude executable, or paid inference
are required. All model names, sessions, tasks and MCP addresses in tests are
synthetic. They are not production configuration.

Inside UDA, use its current measurement wrapper:

```sh
python3 scripts/test_efficiency.py start --task-id claude-compatibility-20260923
python3 scripts/test_efficiency.py run --task-id claude-compatibility-20260923 \
  --scope focused --reason "provider boundary candidate" -- \
  node --test tools/codex-mission-control/provider-compatibility/tests/compatibility.test.mjs
python3 scripts/test_efficiency.py summary --task-id claude-compatibility-20260923
```

Do not restart an already-started telemetry task just to rerun a failed test.

## Actual contract and limits

The module exports the immutable `WORKER_REPORT_SCHEMA`, capability descriptions,
and request/report validators. Required request fields are explicit in
`validateRequest`; the test fixture is a complete, runnable example.

The prepared plan always says `launchAuthorized: false`. This is intentional:
planning cannot mint authenticated Mission Control authority. The caller must use
the existing admission, exact source binding and trusted setter machinery, with a
reviewed Claude extension, before starting anything. The candidate only implements
execution; representing reasoning/review as future roles does not authorize them.

Plans use a caller-specified pinned model and effort. Extra-high/max require an
explicit input; no model selection, retries or fallback are automatic. A supplied
approval flag is not proof of owner permission: the authenticated controller must
bind it to the source-authorized directive. No subagents are requested.

Subscription is the only billing route represented here. The module does not read
credentials or prove the active login. The host must inspect effective authentication,
environment and managed configuration; a requested subscription route is not proof
that an inference will be subscription-billed. Do not add API fallback to fix a login
failure. Do not use `--bare` with this route.

The tool list constrains built-ins, while the explicit MCP configuration names
remote HTTP servers using existing OAuth. It does not contain tokens. Auto-approval
rules are not a complete authorization boundary. Managed policy, MCP server-side
authorization, read/write semantics, and tool-catalog drift need direct acceptance
at integration. A successful plan is not proof of working MCP access.

The collector labels model identity as **client-reported**, not independently
attested. Effort remains **requested, unobserved**. The provider's cost estimate is
not an invoice, a per-run delta, or a percentage of a weekly subscription limit.
Recovered permission denials remain visible without automatically invalidating an
otherwise completed alternative. Execution reports never authorize merging or
prove the owner's project outcome.

## Existing-source mapping

Inspected baseline: `eaeacee9c187d943e036cb7b299388f3094a1e64`.

| Existing source under `tools/codex-mission-control/` | Retained responsibility |
| --- | --- |
| `restored/codex-mission-control/scripts/run-codex-execution.mjs` | Current OpenAI dispatch and exact legacy fallback binding |
| `restored/codex-mission-control/lib/chat-work-authority-gate.ts` | Authenticated actor/source authority and spending boundaries |
| `restored/codex-mission-control/lib/work-execution-profile.ts` | Current GPT model/effort profile validation and setter evidence |
| `vps-browser-relay/src/codex-exec-candidate.mjs` | Existing dispatcher implementation referenced by the entrypoint; do not replace from this candidate |

The current profile validator accepts GPT identifiers and the authority gate names
ChatGPT surfaces. Do not relabel Claude as GPT to pass either. A deliberate,
backwards-compatible extension belongs to the current integration owner.

The candidate lives outside `restored/` and `source-archive/`. No packaging or
restoration script needs to run for these files.

## Evidence and reuse decision

The owner supplied a detailed Claude compatibility audit. It was used as a
requirements/discovery input, not as proof of local live capability. Implementation
flags and result semantics were checked against current primary documentation:

- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/headless

Disposition: **adapt**, using the existing Claude CLI and current Mission Control
admission/dispatch rather than building another scheduler or replacing the MCP SDK.
The only new piece is the small plan/receipt translation boundary. The simpler
baseline is direct CLI use plus the unchanged OpenAI dispatcher. No performance,
model-quality or production-compatibility claim follows from the fixture tests.

For remaining integration, read `WORK-INSTRUCTIONS.md`. `TASK-STATE.json` and
`WRITER-LEASE.json` describe this isolated lane, not shared runtime ownership.
