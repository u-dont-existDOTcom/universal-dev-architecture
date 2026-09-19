# Native ChatGPT Work cloud dispatch

## Purpose

Mission Control treats visible ChatGPT Work and Codex as different execution surfaces. A Codex thread whose title begins with `Work —` is still Codex and cannot satisfy a native-Work request.

The portable policy is `patterns/chatgpt-work-cloud-dispatch.md` at the repository root. This document describes the reference Mission Control adapter.

## Runtime contract

`lib/chatgpt-work-cloud-dispatch.ts` receives a source-bound active execution directive plus an injected authenticated desktop/app executor.

For a new task it calls only:

```text
create_thread({
  title: "Work — <originating Chat title>",
  prompt: <exact source-bound directive>,
  target: { type: "chatgptWorkCloud", projectId?: <ChatGPT project> }
})
```

For a continuation it calls only:

```text
send_message_to_thread({
  threadId: <previously verified native Work thread id>,
  prompt: <exact source-bound follow-up>
})
```

Codex-only `model` and `thinking` setters are deliberately absent from both calls.

## Durable ordering

The adapter records two append-only Mission Control events:

1. `chatgpt_work_cloud_dispatch_requested` before crossing the app-executor boundary;
2. `chatgpt_work_cloud_dispatch_recorded` after the normalized app result.

The requested event binds the current exact active version-3 execution directive, source Chat title and URI, deterministic Work title, ChatGPT project, prompt digest, capability evidence, and authenticated app-executor producer. Caller request text cannot assert accepted approval; the controller records `PENDING_OWNER_ACCEPT` until the product-authorized mutation returns successfully.

The result records one of:

- `PENDING_APPROVAL` — the product requires the owner's accept gesture;
- `PENDING_SETUP` — only a temporary client thread id exists;
- `READY` — a native Work thread id is present and the destination surface is independently identified as ChatGPT Work;
- `FAILED` — app execution or surface verification failed;
- `UNAVAILABLE` — the required app capability or trusted surface verification is unavailable.

## Fail-closed rules

Mission Control rejects:

- continuation without a previously verified native Work locator;
- title-based thread rediscovery;
- a temporary client thread id presented as ready;
- a Codex-backed or otherwise wrong-surface result;
- a continuation that substitutes a different thread id;
- a generic or mismatched SYSTEM producer claiming app-executor evidence;
- a terminal dispatch result overwritten under the same dispatch id;
- silent Codex fallback after Work dispatch fails or waits for approval.

The worker dashboard projects Work-cloud state independently from the existing Codex execution/profile state.

## Controller execution boundary

`npm run work-cloud:dispatch -- --request <controller-request.json>` is the production controller call site. The request supplies the exact active-directive binding, the matching directive artifact, and exactly one inline prompt or prompt file. The CLI verifies the directive artifact digest before dispatch.

The controller uses two deliberately separate paths. Deterministic bundled MCP is read-only here (`list_threads` and `read_thread`). `create_thread` and `send_message_to_thread` cross Codex app-server's `mcpServer/tool/call` product path, so configured automatic review or `item/tool/requestUserInput` approval remains authoritative. The controller never answers the product approval request itself, validates the exact allowed tool arguments/result, and rejects a second mutation in one invocation. If that product path is not configured, it records `PENDING_APPROVAL` and emits the exact setup/acceptance gate rather than calling bundled MCP directly.

The real create response may expose only a `local-chatgpt:` temporary id, and `list_threads` need not expose a client-to-stable mapping. Resolution therefore enumerates only app-owned ChatGPT candidates updated at or after the durable original `requested_at`, applies the exact project id when supplied, reads each candidate, and requires the first user prompt bytes to equal the original prompt. Zero matches remains `PENDING_SETUP`; multiple matches fail closed. `unavailableSources` containing ChatGPT also remains retryable `PENDING_SETUP`. A same-dispatch retry re-runs only this read-only resolver and never creates again. Titles are never identity evidence.

The resolver reads back the exact stable ChatGPT thread before reporting `READY`, and continuation reads, sends through the product path, and re-reads the exact persisted stable ID. Same-dispatch comparisons use immutable source-bound intent; later observation/request/result clocks reuse the original durable request rather than creating a conflict.

The adapter continues to own source binding, event ordering, normalization, lineage, and fail-closed semantics. If the authenticated app bridge or required tools are absent, the durable result is `WORK_CLOUD_DISPATCH_UNAVAILABLE`; Mission Control never invokes Codex as a substitute.

Private deployment environment:

```text
MISSION_CONTROL_INTERNAL_TOKEN=<existing daemon token>
MISSION_CONTROL_DAEMON_URL=http://127.0.0.1:4100
MISSION_CONTROL_CHATGPT_APP_MCP_COMMAND=<private app-executor launcher>
MISSION_CONTROL_CHATGPT_APP_MCP_SERVER=<private app-tools server module>
MISSION_CONTROL_CHATGPT_APP_TOOLS_PIPE_PATH=<current authenticated app bridge socket>
MISSION_CONTROL_CHATGPT_APP_EXECUTOR_THREAD_ID=<app-executor thread metadata>
MISSION_CONTROL_CHATGPT_APP_VERSION=<observed desktop app version>
MISSION_CONTROL_CODEX_APP_SERVER_COMMAND=<Codex app-server launcher>
MISSION_CONTROL_CODEX_APP_SERVER_ARGS_JSON=<JSON array of app-server arguments>
MISSION_CONTROL_CODEX_APP_SERVER_THREAD_ID=<product thread carrying configured approval policy>
MISSION_CONTROL_CHATGPT_APP_SERVER_NAME=<ChatGPT app connector server name>
```

The executable/module paths, pipe path, executor thread ID, provider thread IDs, credentials, and owner-specific locators must remain private deployment state.

## Capability revalidation

The app-tool schema is version-sensitive. Revalidate after a material ChatGPT desktop/app-tools update and record:

- desktop/app version;
- availability of `create_thread` with target `chatgptWorkCloud`;
- availability of `send_message_to_thread`;
- availability of trustworthy destination-surface verification.

Do not infer capability from a remembered schema, a thread title, a shared project, or a shared allowance pool.
