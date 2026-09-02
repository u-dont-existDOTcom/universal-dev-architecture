# Mission Control VPS browser relay implementation audit

Date: 2026-09-02
Branch: `task/mission-control-vps-browser-relay-20260902`
Base: `main` at `764be99e4c7e9a324ea497d495d274b644b4694a`
Status: OUTBOUND IMPLEMENTED; HOSTINGER LIVE ACCEPTANCE PENDING

## Owner outcome

Move persistent ChatGPT supervision tabs and exact writes off the owner's laptop so browser RAM and focus-stealing windows no longer burden the interactive workstation, while proving whether a 16 GB Hostinger VPS has adequate operating headroom.

This result must preserve the existing Mission Control authority boundary: ChatGPT reasons, Mission Control stores/adjudicates transport and provenance state, and Codex/the relay transports exact bytes without paraphrasing or acquiring semantic authority.

## Independent conception preserved

The intended mechanism was one persistent remote browser profile serving the Project Manager and specialist chats, with Mission Control selecting the exact registered destination, restricting hot tabs, measuring whole-browser memory, and suspending or closing inactive tabs before the VPS begins swapping heavily. A 32 GB VPS must not be assumed necessary before the 16 GB configuration is measured.

## Existing-work disposition

- **Reuse:** Mission Control's deployed MCP fleet read model, exact internal-supervisor route packet, chat directory, durable request IDs, provenance model, and Chat/Work admission boundary.
- **Reuse:** Chrome DevTools Protocol target activation, creation, closure, runtime evaluation, and exact input insertion rather than inventing a browser-control protocol.
- **Adapt:** systemd user services and cgroup `MemoryHigh`, `MemoryMax`, and `MemorySwapMax` limits into a 16 GB VPS operating envelope.
- **Invent narrowly:** the Mission-Control-specific route parser, exact-body send journal, ambiguity/replay guard, registered-tab lifecycle, and memory-pressure policy.
- **Do not build:** another scheduler, provider abstraction, semantic judge, browser swarm, proxy rotation layer, or full two-way DOM transcript harvester.

## Policy boundary

Current OpenAI individual-use terms prohibit automatically or programmatically extracting data or Output. Therefore this implementation sends exact owner-authorized packets but does not read, copy, summarize, or import assistant output from the ChatGPT DOM. It searches user-authored message DOM only to determine whether an ambiguous outbound message was already submitted, preventing duplication. The return leg remains manual/source-bound or requires a future provider-supported route.

## Implemented package

`tools/codex-mission-control/vps-browser-relay`

The package is dependency-free and uses Node.js 22 or later. It includes:

- exact Mission Control MCP fleet reader;
- canonical `MISSION_CONTROL_INTERNAL_SUPERVISOR_ROUTE_V1` parser;
- configured exact `https://chatgpt.com/c/<conversation-id>` allowlist;
- loopback-only Chrome DevTools transport;
- one dedicated non-default browser profile;
- exact UTF-8 body SHA-256 and request-ID deduplication;
- durable pre-click submission-intent journal;
- post-click ambiguity state with automatic replay prohibited;
- exact outbound-user-message reconciliation after restart;
- contaminated-composer refusal;
- LRU closure of inactive registered tabs;
- soft/hard system-memory, browser-RSS, and swap controls;
- systemd user slice/browser/relay units;
- installer, doctor, one-cycle, status, continuous-run, and explicit ambiguity-resolution commands;
- six-hour T0/H1-H6 memory-trial procedure.

## Default 16 GB bounds

- system available-memory soft floor: 4096 MB;
- system available-memory hard floor: 2048 MB;
- browser RSS soft ceiling: 7168 MB;
- browser RSS hard ceiling: 9216 MB;
- swap soft ceiling: 512 MB;
- swap hard ceiling: 1536 MB;
- normal registered hot tabs: three;
- browser `MemoryHigh`: 9 GB;
- browser `MemoryMax`: 11 GB;
- combined browser/relay slice `MemoryMax`: 12 GB.

Submission is disabled by default. A live send cannot begin until the Hostinger profile is authenticated, exact chat locators are configured, and doctor/dry-run checks pass.

## Verification receipts

Local deterministic verification at the implementation boundary:

```text
npm test                         PASS — 17/17
npm run check                    PASS
bash -n installer/browser        PASS
systemd-analyze --user verify    PASS after staging expected executable/config paths
```

Real protocol smoke using Chromium 144 and a dedicated temporary profile:

```text
Chrome DevTools Protocol: 1.3
/json/version: reachable on loopback
page target enumeration: PASS
target activation: PASS
```

No live ChatGPT message was submitted. The protocol smoke used `about:blank`; it verifies the transport substrate, not authenticated ChatGPT behavior or current DOM selectors.

Hosted CI now contains a separate `vps-browser-relay` job for locked install, 17 deterministic tests, JavaScript syntax, shell syntax, and required service assets.

## Acceptance still required on Hostinger

1. Install the package under a non-root VPS user.
2. Authenticate the dedicated browser profile through the Hostinger graphical desktop.
3. Register one Project Manager and one harmless specialist chat.
4. Run doctor and one dry-run cycle with submission disabled.
5. Enable one harmless exact outbound route.
6. Verify single submission, local receipt, no laptop browser involvement, and no automatic duplicate after injected interruption.
7. Run T0 and H1-H6 memory samples with one PM plus two specialist chats, then increase only if headroom remains stable.

## Current claim

`VPS_BROWSER_RELAY_OUTBOUND_IMPLEMENTED_NOT_LIVE_ACCEPTED`

The repository implementation is complete for the bounded outbound slice. It is not evidence that the Hostinger browser is installed, authenticated, connected, or within memory limits under real ChatGPT workloads. No merge, Railway redeploy, paid API inference, account upgrade, or 32 GB VPS purchase is implied.
