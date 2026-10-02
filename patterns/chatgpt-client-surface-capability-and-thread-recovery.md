# ChatGPT client-surface capability and thread recovery

**Status:** REQUIRED OWNER CORRECTION  
**Date:** 2026-09-19  
**Scope:** Consumer ChatGPT web/desktop/Work recovery and routing.

## Problem

ChatGPT web, desktop app, ordinary Chat, Work, and branch/thread surfaces can expose overlapping but non-identical capabilities. A conversation visible or launchable in one client may be hard to find, slow to load, represented differently, or unavailable through another surface. Product search can also be weaker than the local metadata already present on the owner's machine.

Treating these surfaces as interchangeable creates two failure modes:

1. routing a task to the wrong client because another client was assumed equivalent; and
2. declaring a prior Chat or Work thread missing after searching only one product UI.

## Core rule

**Model ChatGPT clients as version-sensitive execution/recovery surfaces, not as one interchangeable interface.**

For every capability or recovery claim, bind the observation to:

- surface/client;
- observed version or date when available;
- account/project context when materially relevant;
- evidence source (OWNER_REPORTED, LOCAL_METADATA_VERIFIED, LIVE_UI_VERIFIED, or official product documentation);
- known limits.

Do not promote a transient UI quirk into permanent architecture.

## Claims about the system itself

ChatGPT is a system of models, modes, tools, memory and context sources, sensory inputs, permissions, and interfaces, and the component that is answering is one part of it. Claude and Codex surfaces are built the same way. Before saying what the system can or cannot do, or what it did:

- **Name the layer.** Say whether the claim is about the current component, the current session, another available component or tool, documented product behavior, or the product as a whole. A limit of the current model, voice layer, mode, interface, or tool is not a limit of the whole product. A capability documented for another plan, mode, platform, or interface is not available here until this session shows it.
- **Check the routes this session has.** Before declaring something impossible, check the models, tools, connectors, modes, and modalities the session actually offers. Do not hunt for routes it does not have.
- **Rank evidence about what happened.** Prefer, in order: a returned tool or system result; direct sensory or file input; explicit session state; current product documentation; a transcript, summary, or other intermediate representation; inference from behavior. A weaker source never overrides a stronger one.
- **Treat internal routing as unknown unless shown.** Which model, reasoning level, tool, sensory stream, or handoff handled a request is unknown unless this interaction or current documentation shows it. Response quality, latency, and wording are not evidence of routing. Label each claim about system behavior as observed (in this interaction), documented (in current product documentation), or inferred, and never phrase an inference as observed or documented. When the system does not show what happened inside it, say what is known and leave the rest open instead of supplying a tidy explanation.
- **Tie sensory claims to the sensory input.** Pronunciation, accent, emotion, prosody, emphasis, background sound, and visual detail need the audio, image, or video. A transcript, summary, or description cannot support them. Keep apart what the transcript says, what the person says they actually said, and what the original audio would be needed to settle. Understanding a transcript is not hearing the audio.
- **Separate intent from outcome.** Distinguish an intended action from an attempted one and an attempted action from a confirmed one, capability from actual use, requested from granted permission, and a successful handoff from completion of the underlying task.
- **Recheck after a change.** After a correction, a model, reasoning-level, or mode change, lost or restored context, a failed handoff or tool, a new permission or connection, or new input, reassess the available routes and every conclusion that rested on the changed premise; do not patch only the local wording. The person's correction of what they said, meant, saw, or selected is strong evidence unless direct evidence contradicts it.
- **Judge the whole chain; locate errors narrowly.** Judge an interaction by whether the person's meaning and goal survived every step, from transcription through reasoning, tools, and memory to output, not by whether each step looked plausible alone. Attribute a failure to the narrowest layer the evidence supports (speech recognition, transcript interpretation, reasoning, stale context, tool selection, tool execution, or presentation), and to no layer without evidence.
- **Bring in architecture only when it matters.** Explain internal architecture only when it bears on the answer's correctness, a claim's reliability, a capability or limit, an error's explanation, or a choice the person has to make. Scope the wording to the evidence: "this session has that tool" or "I have no confirmation that the handoff happened", rather than "I can't hear" or "ChatGPT can't do that".

Before stating a capability or architecture claim, sort what is known directly, what is secondhand, and what is inferred, and make the narrowest claim the strongest available evidence supports. These checks apply to claims about the system; they are not a preamble for every task.

Choosing the smallest sufficient configuration, preserving state across handoffs, and checking live state before reporting it are governed elsewhere: `patterns/reasoning-selection.md` (reasoning selection, capability edges, and the observed-state check) and `patterns/context-compaction-resilience.md`. Origin: `docs/requirements/2026-09-30-system-capability-claims.owner-requirement.json`.

## Recovery order

When the owner asks to find, reopen, recover, or continue a prior Chat or Work thread:

1. use an exact receipt/source backlink or durable thread locator if one exists;
2. search every locally available authorized surface index that could contain the thread;
3. rank exact IDs/URLs/native URIs and durable locators above title-only matches;
4. open the recovered thread in its native client when that action is reversible and authorized;
5. only then fall back to product UI search/manual owner navigation.

Do not declare the thread missing after checking only web search, only desktop search, or only one browser profile.

### Continue means recover the latest complete exchange

Finding the thread is only the locator step. When the owner asks to **continue** a prior conversation, person-specific thread, or ongoing project discussion, recovery is incomplete until the worker reconstructs the latest relevant conversational edge needed for the next reply.

At minimum, recover and order chronologically:

1. the latest relevant incoming user/participant turn;
2. the exact assistant/outgoing reply to that turn, when one existed; and
3. any subsequent incoming turn that answers or reacts to that reply.

Do not resume from the last incoming message while silently omitting the assistant's own intervening reply. The outgoing reply may contain the active question, intervention, promise, interpretation, or constraint that gives the next incoming message its meaning.

If the exact outgoing text cannot be recovered, mark that edge as unavailable and continue from the strongest remaining evidence. Do not reconstruct an "exact" prior reply from a later response, a summary, or what would have been plausible to say.

When sources disagree on recency, compare their actual timestamps and scope. A private handoff, case bundle, checkpoint, or summary that ends before a verified thread/project transcript is **stale for conversation recency**. It may still supply older longitudinal context, but it must not be described as the latest conversational state. Prefer exact transcript text over summaries or remembered paraphrases for the recovered edge.

## Web/browser recovery

For browser-owned ChatGPT surfaces, local Chromium-family History is a useful direct URL index when available.

Prefer read-only metadata such as:

- conversation/branch URL;
- title;
- visit timestamp;
- browser profile;
- surface=work or equivalent route markers.

Browser titles can change when a thread is reopened. Preserve and search exact URLs/branch IDs rather than relying on a historical title remaining stable.

## Desktop ordinary Chat recovery

Ordinary Chat recovery is not limited to a desktop-local conversation database.

When a durable Work receipt, execution receipt, handoff artifact, or task record carries an exact `sourceChat` object with:

- source Chat title;
- exact ChatGPT conversation URL;

treat that pair as a durable ordinary-Chat locator.

Index those bounded source-chat fields together with the artifact filename/path and other non-message task metadata needed to find the right supervisor. This allows a query such as a task/version label to resolve its supervising Chat without searching arbitrary conversation bodies.

The exact HTTPS conversation URL is an **identity locator**, not automatically a native-desktop navigation mechanism. Preserve it exactly; do not rewrite it from an ID guess.

On the tested ChatGPT desktop build, passing an ordinary Chat HTTPS URL to the desktop launcher opens that URL in the app's embedded browser panel rather than navigating the native Chat surface. Do not use launcher acceptance or a successful process exit as completion evidence.

For a version-calibrated native ordinary-Chat recovery path:

1. resolve the target from durable `sourceChat` metadata first;
2. open the app's native Chat-search surface rather than the embedded browser;
3. use the exact title only when it is unambiguous;
4. when multiple conversations share the same logical title, use a discriminating task/message token already present in bounded durable evidence, or fail closed rather than select arbitrarily;
5. select the matching native Chat result;
6. verify the search/result transition completed on the native Chat surface and that embedded-browser address chrome is absent before reporting success.

This proves ordinary-Chat recovery **when a durable sourceChat locator exists and the native navigation result is independently bound to the intended surface**. It does not establish that every arbitrary desktop Chat has a locally searchable app index or a supported external direct-by-ID deep link.

## Desktop Work/Codex recovery

When the desktop client exposes a structured local Work/Codex thread index, prefer that index over UI search. When an authorized live app-tools surface also exposes a current `list_threads`-style metadata index, query that live index before declaring a fresh cloud Chat/Work thread missing; local SQLite/catalog state and browser history can lag newly created cloud tasks.

Treat the provider-returned stable thread ID as the primary Work identity. A requested creation title is owner-facing lineage metadata, not durable identity: the provider may normalize or replace it after creation. Recovery therefore must not require the requested title to survive unchanged.

Useful metadata can include:

- thread ID;
- title/name;
- created/updated time;
- project ID;
- source/thread type;
- archived/pinned state;
- parent/child thread relationships;
- durable Work-thread locator records;
- native thread URI.

When a native thread URI is available, use the registered desktop handler to open that exact Work thread instead of asking the owner to browse the app manually.

## Native ChatGPT Work cloud dispatch

When the owner explicitly asks for **ChatGPT Work**, apply `patterns/chatgpt-work-cloud-dispatch.md`.

Do not infer Work surface identity from a title, project, filesystem, allowance pool, or local thread record alone. In particular, a backing `kind: codex` thread renamed with a `Work —` prefix remains Codex.

On the currently tested desktop app, the bundled authenticated app executor exposes a native Work-cloud target through `create_thread(target.type="chatgptWorkCloud")` and supports follow-up through `send_message_to_thread`. That capability is distinct from Codex CLI/TUI routes such as `codex queue` and `codex exec resume`.

If visible/steerable Work is part of the owner's request, native Work-surface execution is part of completion. A successful headless Codex run may be useful evidence but does not satisfy the surface requirement.

This capability is version-sensitive. Revalidate it after a material desktop/app-tools update and preserve any product-level approval gate.

## Native-surface completion proof

A thread locator and a navigation mechanism are separate facts.

Do not mark recovery complete from any of these alone:

- the launcher process exited successfully;
- the client printed that it was opening in an existing session;
- an HTTP URL appeared somewhere inside the desktop app;
- the target project's page became visible;
- the search command returned without error.

Completion requires evidence that the **intended native surface** opened. The exact proof is surface-specific. For a browser-owned thread, a verified exact conversation URL can be sufficient. For a native Work thread, a verified native Work URI plus the resulting Work surface can be sufficient. For tested native ordinary-Chat UI recovery, require the native search/result transition and absence of the embedded-browser address layer after selection.

If the expected native surface cannot be distinguished from an embedded browser or another app panel, classify the result as `WRONG_SURFACE_OR_UNVERIFIED` and continue recovery rather than reporting success.

## Metadata-first privacy boundary

Thread location does not normally require message contents.

Before reading any conversation body, use:

- IDs;
- titles/names;
- timestamps;
- project IDs;
- branch/URL/native-URI locators;
- source type;
- parent-child relations;
- receipt/handoff paths.

Do not inspect cookies, browser auth state, password stores, tokens, local/session-storage secrets, or arbitrary message bodies merely to locate a thread.

If metadata is insufficient and message-content search would materially improve recovery, narrow the query to the minimum necessary and preserve the project's privacy boundary.

## Cross-surface routing

When a task can run on more than one ChatGPT surface, choose by the capability actually needed now, not by a generic preference for web or desktop.

Examples of capability dimensions that must remain empirical:

- ability to load very large/old conversations;
- ability to create or open Work branches/threads;
- browser/computer control available to Work;
- file/local-machine integration;
- source-chat/Work-thread backlink behavior;
- cross-client conversation visibility;
- recovery/search quality.

A current observation may guide routing, but it must remain revalidatable after client or account changes.

## Durable lineage

The originating-Chat backlink and Work-thread naming rules remain primary prevention.

For Work execution, preserve when available:

- originating Chat title + exact conversation URL;
- Work title;
- exact Work URL or native Work-thread URI;
- durable receipt/handoff locator.

A missing backlink should trigger recovery; it should not force the owner to reconstruct lineage manually.

## Owner-specific deployment evidence

Owner-specific local paths, conversation IDs, project IDs, private locators, and account identifiers must remain outside portable public guidance.

A deployment may maintain a local helper that searches browser-history metadata, durable ordinary-Chat `sourceChat` locators, plus desktop Work-thread metadata. The helper must keep identity lookup separate from surface-specific navigation: browser URLs may open in the browser, native Work URIs may open directly, and ordinary Chat must use a tested native-Chat path rather than assuming its HTTPS identity URL is a desktop deep link. Record only the existence/capability of that helper in portable guidance, not private thread identifiers.

## Revalidation

Revalidate this capability map after any material ChatGPT desktop/web update, authentication/account migration, profile reset, database/schema change, or observed behavior change.

If a previously reliable path fails:

1. classify whether the failure is locator loss, client visibility, schema/version drift, auth/account mismatch, or launch-handler failure;
2. try the other authorized surface index before asking the owner to search manually;
3. update the dated capability evidence rather than layering permanent exceptions.

## Limits

- Browser History is not guaranteed to contain every ChatGPT thread.
- Desktop Work/Codex metadata does not prove arbitrary ordinary desktop Chat conversations are locally indexed; ordinary-Chat recovery is separately valid when an exact durable `sourceChat` locator exists.
- A native Work-thread URI is a locator, not proof that the remote conversation still exists.
- An ordinary Chat HTTPS URL is an identity locator; on the tested desktop build it is not a native Chat deep link and instead opens the embedded browser panel.
- Cross-surface visibility can depend on account/project state and must not be inferred from one client.
- This pattern improves recovery/routing; it does not bypass access controls or create new Chat/Work authority.

## Transfer rationale

The general lesson is portable: when one product exposes multiple clients and execution surfaces, capability parity is an empirical property, and recovery should search the native indexes of all authorized surfaces before declaring state lost. The tested owner deployment is only evidence for the pattern, not the universal implementation.
