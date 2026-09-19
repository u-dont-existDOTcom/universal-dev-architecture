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

## Current execution boundary

The Mission Control daemon does not directly call the desktop app's bundled executor. The bundled app tool requires authenticated executor thread metadata; a raw server-side MCP call is rejected.

The controller therefore injects a trusted `WorkCloudAppExecutor` into `dispatchAndRecordChatGptWorkCloud`. The adapter owns source binding, event ordering, normalization, lineage, and fail-closed semantics. The authenticated desktop/app executor owns the actual `create_thread(target.type="chatgptWorkCloud")` or `send_message_to_thread` call and supplies explicit native-surface evidence.

If that executor is absent, the durable result is `WORK_CLOUD_DISPATCH_UNAVAILABLE`; Mission Control must not invoke Codex as a substitute unless the owner separately authorizes Codex.

## Capability revalidation

The app-tool schema is version-sensitive. Revalidate after a material ChatGPT desktop/app-tools update and record:

- desktop/app version;
- availability of `create_thread` with target `chatgptWorkCloud`;
- availability of `send_message_to_thread`;
- availability of trustworthy destination-surface verification.

Do not infer capability from a remembered schema, a thread title, a shared project, or a shared allowance pool.
