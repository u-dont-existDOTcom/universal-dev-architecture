# ChatGPT Work cloud dispatch

**Status:** REQUIRED OWNER CORRECTION  
**Date:** 2026-09-19  
**Scope:** Chat -> visible ChatGPT Work creation/continuation and Mission Control routing.

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

## Mission Control automated handoff and return

Mission Control must implement native Work as a first-class execution surface, not as a title convention or a manual clipboard workflow. A source-bound execution directive that targets Work carries explicit `execution_surface: CHATGPT_WORK_CLOUD`; historical/default directives retain their existing Codex/default route. The automatic Codex dispatcher must ignore an explicit native-Work directive.

**No clipboard relay:** once a current source-bound native-Work directive is admitted, Mission Control derives the direct controller request from durable state and invokes the current authenticated native Work controller automatically. The owner does not create a request JSON, paste the Work prompt, or paste the completion receipt back into Chat. A genuine product-level Work Accept/approval gesture remains a human gate when ChatGPT itself requires it.

Use the current directly verified controller path. Do not interpose a supervisor Chat merely to create Work and do not downgrade `VERIFIED_NATIVE_WORK` evidence to source-attested fallback semantics when the direct app executor can verify the Work surface.

### Dispatch recovery boundary

Persist the exact source-bound request before any authenticated product mutation. Immediately before the app mutation boundary, persist one durable handoff-intent record. Recovery semantics are then mechanical:

- request exists, no handoff intent, no result -> proven unsent; the same deterministic dispatch may resume;
- handoff intent exists, no result -> ambiguous; automatic replay is prohibited absent later exact proven-unsent evidence;
- `PENDING_SETUP` -> resolve/read the already-created client task; do not create again;
- `PENDING_APPROVAL` or `READY` -> wait for new durable evidence and allow unrelated eligible routes to continue;
- terminal dispatch result -> same-dispatch replay returns the durable result without a provider mutation.

The dispatch identity binds worker, directive id/revision, task, exact directive/source provenance, originating Chat locator, and exact bounded prompt identity. Waiting or ambiguous Work must not starve unrelated Mission Control routes.

### Automatic Work completion -> reasoning return

Work returns execution facts through one privacy-safe machine receipt. The receipt may include dispatch/thread lineage, execution status, a bounded terminal code, check counts, privacy-safe blocker codes, and artifact SHA-256 values. It must not contain prompts, private source text, credentials, absolute private filesystem paths, raw logs, or model reasoning.

Mission Control accepts a Work completion receipt only when it binds the exact prior directly verified `READY` native Work thread. Accepted receipt ingestion atomically creates exactly one fresh current request-bound reasoning-review route to the original stable supervisor, bound to the current owner outcome and the exact execution receipt. Use the current V6 in-band request-binding protocol rather than inventing a second supervisor-return transport.

Work has execution-facts authority only. The reasoning supervisor decides adequacy, methodology, strategy, owner-outcome satisfaction, and the next consequential action.

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
