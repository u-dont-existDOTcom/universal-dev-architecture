# ChatGPT Work cloud dispatch

**Status:** REQUIRED OWNER CORRECTION  
**Date:** 2026-09-19  
**Scope:** Chat -> visible ChatGPT Work creation/continuation and Mission Control routing.
**Owner automation requirement:** `docs/requirements/2026-09-19-mission-control-native-work-autodispatch.owner-requirement.json`.

## Purpose

Prevent a Codex execution from being mislabeled as ChatGPT Work merely because it shares a project, title, filesystem, or allowance pool.

The governing rule is:

> **When the owner explicitly asks for ChatGPT Work, dispatch to the native ChatGPT Work cloud surface when that capability is available. A Codex thread, including one renamed with a `Work —` prefix, is not a substitute.**

## Surface identity

Treat these as distinct execution surfaces:

- **ChatGPT Work cloud** — a ChatGPT task created through the desktop/app executor's Work-cloud target, currently exposed as `create_thread(target.type="chatgptWorkCloud")`.
- **Codex** — a Codex-backed thread or task, including local CLI/TUI execution such as `codex exec`, `codex resume`, or a thread whose backing kind is `codex`.
- **Ordinary Chat** — a normal ChatGPT conversation.

Title, project membership, shared local state, or shared billing/allowance does not prove surface identity.

## Creation

Use native Work-cloud creation when all are true:

1. the owner explicitly requested Work or an existing authorized workflow specifically requires visible ChatGPT Work;
2. the current app executor exposes the native Work-cloud target;
3. the requested task is otherwise admitted by the Chat/Work routing rules.

For the currently observed desktop app schema:

- call `create_thread` with `target.type = "chatgptWorkCloud"`;
- pass the ChatGPT project id only when the Work task should belong to that project;
- omit Codex-only `model` and `thinking` overrides for Work-cloud creation;
- preserve the deterministic owner-facing title `Work — <originating Chat title>`;
- put the exact source Chat title and URL in the Work directive and require the receipt backlink.

If creation returns a pending `clientThreadId` rather than a ready `threadId`, treat setup as incomplete and recover/wait for the ready thread before calling tools that require `threadId`.

## Continuation

When the intended Work task already exists:

1. recover it from exact durable lineage first;
2. verify that the destination is the intended ChatGPT Work surface rather than a Codex thread with a similar title;
3. use the app executor's `send_message_to_thread` capability for the follow-up;
4. preserve current Work settings unless the Work surface itself exposes an authorized setting change.

Do not use `codex queue`, `codex exec resume`, or another Codex-only route to claim that a Work task was continued.

## Visibility and steering

If the owner asks for Work because they want to see, inspect, or steer execution in the Work UI, **visible native-surface execution is part of the requested outcome**.

A headless Codex run that edits the same files can still be useful execution evidence, but it does not satisfy a request for visible Work execution.

Before reporting that Work has started, require evidence that the native Work task was created/continued on the Work surface. A queued message, renamed Codex thread, started Codex process, or shared project path is insufficient.

## Approval boundary

An explicit owner request for Work supplies the semantic authorization to attempt Work dispatch. It does not bypass any product-level approval prompt.

If the app executor requires an approval/accept gesture, preserve that gate. Do not silently fall back to Codex merely to avoid it.

If native Work dispatch is unavailable, classify `WORK_CLOUD_DISPATCH_UNAVAILABLE` and either:

- return the exact minimum owner action needed to launch Work; or
- use Codex only when the owner already authorized Codex or explicitly accepts it as the substitute.

## Mission Control durable adapter

Mission Control should implement Work dispatch as a first-class surface adapter rather than a title convention.

Persist, when available:

- requested surface = `chatgptWorkCloud`;
- source Chat title + exact URL;
- requested Work title;
- ChatGPT project id;
- returned `threadId` or temporary `clientThreadId`;
- creation/continuation timestamp;
- native surface verification state;
- tool/app version or capability evidence used for dispatch;
- approval state if a human gate was required.

Follow-ups use the persisted Work thread locator plus `send_message_to_thread`; they must not rediscover by title alone.

Mission Control must keep Codex and Work task identifiers in separate typed fields even if both appear in one project.

The current reference adapter is documented in
`tools/codex-mission-control/restored/codex-mission-control/docs/CHATGPT-WORK-CLOUD-DISPATCH.md`.
It persists the source-bound request before crossing the authenticated app-executor boundary, persists the normalized result afterward, and requires explicit native-surface evidence before a dispatch may become `READY`. A raw Mission Control daemon call is not equivalent to the authenticated desktop/app executor and must remain unavailable rather than falling back to Codex.

## Mission Control automated handoff and return

When an admitted Mission Control execution directive explicitly selects `CHATGPT_WORK_CLOUD`, **manual owner copy/paste is not the normal transport.** Mission Control must carry the exact bounded directive through the native Work handoff automatically.

The current control-plane route is controller-mediated because the Mission Control server cannot impersonate the authenticated client-side ChatGPT app-executor boundary:

```text
accepted source-bound CHATGPT_WORK_CLOUD directive
-> Mission Control persists one deterministic Work dispatch request
-> relay wakes the exact bound source supervisor with a transport-only handoff
-> that ChatGPT supervisor invokes native Work with the exact persisted prompt
-> any real product Accept gate remains owner-controlled
-> source supervisor publishes a bound dispatch receipt
-> Work publishes a privacy-safe completion receipt
-> Mission Control ingests both and resumes reasoning/control flow
```

Hard requirements:

1. **No clipboard relay.** Do not ask the owner to download/copy a directive into Work or copy Work output back to Chat merely because the controller failed to automate the bridge. Manual copy/paste is recovery-only after a concrete automation/capability failure has been identified.
2. **Exact source binding.** The Work prompt must be derived server-side from the current active source-bound execution directive and canonical accepted decision. A relay or browser worker may not replace the task body.
3. **Explicit surface authority.** Native Work auto-dispatch is admitted only when the execution directive says `CHATGPT_WORK_CLOUD`. Historical/directives without the field retain their existing Codex/default meaning; title heuristics cannot upgrade them.
4. **Deterministic lineage.** Use one dispatch id derived from worker + directive + revision + task + exact Work prompt; preserve `Work — <originating Chat title>` and the source-chat backlink. Persist the ChatGPT project id when the owner-only registration knows it so the Work task stays associated with the intended project.
5. **Approval preservation.** A ChatGPT product-level Accept/approval prompt remains a genuine owner gate. The automation may prepare everything around it, but may not bypass it or silently substitute Codex.
6. **Evidence honesty.** A native Work result returned directly by the trusted app executor may be `VERIFIED_NATIVE_WORK`. A result reported through the bound ChatGPT supervisor is `SOURCE_ATTESTED_NATIVE_WORK`; do not relabel it as independent server-side observation.
7. **Durable return path.** Dispatch and Work completion receipts return through the configured Mission Control control channel. Keep those receipts privacy-safe: status, lineage, hashes, check counts, terminal state, blocker codes, and artifact counts are allowed; prompts, private source text, credentials, absolute local paths, raw logs, and model reasoning are not.
8. **No ambiguous replay.** Persist the dispatch request before provider mutation. A durable server-side request with no local provider-boundary handoff intent is mechanical proof that the Work handoff was not sent and may resume. Once local handoff intent exists, recovery requires a source-bound receipt or exact proven-unsent evidence; otherwise fail closed as ambiguous rather than creating a second Work task.
9. **Queue fairness.** `PENDING_OWNER_ACCEPT`, Work execution, or receipt wait states for one dispatch must not monopolize Mission Control. Other eligible routes continue; the Work route becomes eligible again only when new durable evidence arrives.
10. **Receipt-driven continuation.** A privacy-safe machine receipt is sufficient to wake the control plane. Work-completion ingestion atomically creates one `reasoning_review_route_recorded` event carrying a fresh V5 request-bound supervisory route to the original stable supervisor, bound to the current owner outcome and exact Work receipt; one Work receipt may create only one such route. The reasoning Chat may then inspect the actual Git/GitHub/local artifacts using its own authorized tools; the owner should not serve as a transport bus.

If the automated handoff path is unavailable, record the exact capability/transport blocker. Do not normalize the fallback into a permanent owner copy/paste workflow.

## Current observed capability

As of 2026-09-19, the tested ChatGPT Linux desktop app's bundled app-executor schema exposes:

- `create_thread` with target type `chatgptWorkCloud`, described as creating a cloud ChatGPT Work task;
- `send_message_to_thread` for existing threads/chats;
- Codex-only model/thinking fields that explicitly should be omitted for Work-cloud threads.

This is version-sensitive capability evidence, not a permanent API guarantee. Revalidate after a material ChatGPT desktop/app-tools update.

## Privacy and portability

Portable guidance must not contain owner-specific thread ids, project ids, filesystem paths, account identifiers, socket paths, or credentials.

Owner deployments may persist those locators locally as `NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT` evidence.

## Failure regression

Given:

- the owner asks Chat to send a prepared directive to a visible Work chat;
- local metadata contains a Codex thread titled `Work — <source title>`;
- `codex queue` or `codex exec resume` can send/run the directive there;
- the desktop app also exposes native `chatgptWorkCloud` creation;

then:

- do **not** claim the Codex route is Work;
- do **not** treat the title as surface proof;
- use native Work-cloud dispatch, subject to the real approval gate;
- if Codex was accidentally started, label it Codex and preserve its evidence separately.

Expected findings:

```text
surface_requested: CHATGPT_WORK
codex_title_match: NOT_SURFACE_PROOF
native_work_target_available: true
required_route: chatgptWorkCloud
```
