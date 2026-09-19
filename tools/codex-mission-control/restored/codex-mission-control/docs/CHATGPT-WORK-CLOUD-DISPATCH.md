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

The requested event binds the current exact active version-3 execution directive, source Chat title and URI, deterministic Work title, ChatGPT project, prompt digest, capability evidence, approval state, and authenticated app-executor producer.

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

The controller connects to the authenticated desktop app's bundled executor with explicit private deployment configuration. Static MCP tool discovery establishes versioned capability evidence. The durable request is then recorded before the first app-owned `create_thread`, `read_thread`, `list_threads`, or `send_message_to_thread` call for that dispatch.

The app executor resolves a temporary `clientThreadId` only through exact app-owned identity fields returned by `read_thread` or `list_threads`; it never uses a title match. It reads back the exact stable ChatGPT thread before reporting `READY`, and continuation reads, sends to, and re-reads the exact persisted stable ID.

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
```

The executable/module paths, pipe path, executor thread ID, provider thread IDs, credentials, and owner-specific locators must remain private deployment state.

## Capability revalidation

The app-tool schema is version-sensitive. Revalidate after a material ChatGPT desktop/app-tools update and record:

- desktop/app version;
- availability of `create_thread` with target `chatgptWorkCloud`;
- availability of `send_message_to_thread`;
- availability of trustworthy destination-surface verification.

Do not infer capability from a remembered schema, a thread title, a shared project, or a shared allowance pool.
