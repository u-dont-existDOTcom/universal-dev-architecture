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

## Recovery order

When the owner asks to find, reopen, recover, or continue a prior Chat or Work thread:

1. use an exact receipt/source backlink or durable thread locator if one exists;
2. search every locally available authorized surface index that could contain the thread;
3. rank exact IDs/URLs/native URIs and durable locators above title-only matches;
4. open the recovered thread in its native client when that action is reversible and authorized;
5. only then fall back to product UI search/manual owner navigation.

Do not declare the thread missing after checking only web search, only desktop search, or only one browser profile.

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

If the exact HTTPS conversation URL is recovered, the desktop ChatGPT launcher may be used to open that ordinary Chat directly when the current client accepts the URL. Preserve the exact URL; do not rewrite it from an ID guess.

This proves ordinary-Chat recovery **when a durable sourceChat locator exists**. It does not establish that every arbitrary desktop Chat has a locally searchable app index.

## Desktop Work/Codex recovery

When the desktop client exposes a structured local Work/Codex thread index, prefer that index over UI search.

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

A deployment may maintain a local helper that searches browser-history metadata, durable ordinary-Chat `sourceChat` locators, plus desktop Work-thread metadata and opens the selected exact locator. Record only the existence/capability of that helper in portable guidance, not private thread identifiers.

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
- Cross-surface visibility can depend on account/project state and must not be inferred from one client.
- This pattern improves recovery/routing; it does not bypass access controls or create new Chat/Work authority.

## Transfer rationale

The general lesson is portable: when one product exposes multiple clients and execution surfaces, capability parity is an empirical property, and recovery should search the native indexes of all authorized surfaces before declaring state lost. The tested owner deployment is only evidence for the pattern, not the universal implementation.
