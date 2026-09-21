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

## Automated supervisor-mediated mode

When a canonical GitHub decision materializes an active execution directive with `execution_surface: "CHATGPT_WORK_CLOUD"`, Mission Control can now route the handoff without making the owner copy/paste the directive.

The mediated path is:

1. Mission Control derives the Work prompt from the exact active directive and its validated canonical decision; the relay never supplies task semantics.
2. `chatgpt_work_cloud_dispatch_requested` is persisted before any provider mutation.
3. The relay asks the Mission Control `work-cloud-dispatch` endpoint for the exact source-bound handoff, wakes the already-bound source supervisor chat, verifies the fixed visible consumer controls, selects the GitHub app for the return receipt, and submits the handoff exactly once.
4. The ChatGPT supervisor invokes native Work through its authenticated product capability. The prompt prohibits Codex substitution and preserves a real product Accept gate when one exists. The relay cannot inspect that client-side capability directly, so mediated requests record capability state as unverified until the supervisor publishes the actual native-Work tool result.
5. The supervisor publishes `MISSION_CONTROL_WORK_CLOUD_DISPATCH_RECEIPT_V1` to the configured diagnostic/stage GitHub channel. Mission Control admits it only if dispatch id, worker, task, directive revision, and exact Work-prompt SHA match.
6. A READY mediated result is recorded as `SOURCE_ATTESTED_NATIVE_WORK` with evidence `CHATGPT_SUPERVISOR_NATIVE_WORK_TOOL_RESULT`. This is intentionally distinct from direct app-executor `VERIFIED_NATIVE_WORK`.
7. The Work task publishes `MISSION_CONTROL_WORK_CLOUD_EXECUTION_RECEIPT_V1` on completion, partial completion, block, or failure. That receipt carries only control-plane state: terminal state, check counts, blocker codes, artifact count, lineage, and server-computed comment hash.
8. Work-completion ingestion and reasoning wake-up are atomic: Mission Control appends the execution receipt and exactly one `reasoning_review_route_recorded` event containing a fresh V5 request-bound route to the original stable supervisor, current owner outcome, and exact privacy-safe Work receipt. The relay discovers that SYSTEM route through the normal request-bound queue and resumes the supervisor automatically. The reasoning Chat retrieves actual repository/local artifacts with its own authorized tools rather than asking the owner to relay Work prose.

### Idempotency and restart safety

A deterministic dispatch id binds worker + directive + revision + task + exact Work prompt. The request is persisted first. If recovery sees that server-side request but no local handoff intent, no provider mutation could yet have occurred, so the relay may resume the one handoff. Once local handoff intent exists, a missing dispatch result requires exact proven-unsent evidence; otherwise the relay records `WORK_CLOUD_REQUEST_ONLY_RECOVERY_AMBIGUOUS` and refuses to replay.

Once the relay has a verified handoff start, it waits for the GitHub dispatch receipt rather than waiting synchronously for the supervisor turn to finish. This preserves an owner Accept prompt without duplicating the Work task. Waiting Work states are removed from ordinary route eligibility until new durable evidence arrives, so unrelated Mission Control routes continue normally.

### Privacy boundary

The authenticated Mission Control API may carry the exact private Work prompt to the trusted relay/supervisor. Public GitHub control receipts must not contain that prompt, private source text, credentials, absolute local paths, raw logs, or model reasoning.

Manual owner copy/paste is therefore a recovery path only after a concrete capability/transport failure, not the expected Work dispatch or return mechanism.

## Capability revalidation

The app-tool schema is version-sensitive. Revalidate after a material ChatGPT desktop/app-tools update and record:

- desktop/app version;
- availability of `create_thread` with target `chatgptWorkCloud`;
- availability of `send_message_to_thread`;
- availability of trustworthy destination-surface verification.

Do not infer capability from a remembered schema, a thread title, a shared project, or a shared allowance pool.
