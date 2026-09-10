# NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT — Mission Control topology

Updated: 2026-09-10

This file is **specific to the current repository owner**. It is operational continuity data, not a universal recommendation. A person copying this repository should replace or ignore this file and use the portable architecture in `patterns/portable-vs-owner-specific-deployment-data.md`.

No credentials, private keys, tokens, cookies, browser-profile contents, or private ChatGPT locators belong in this file.

## Owner-requested host roles

- **Primary Mission Control execution host:** Netcup VPS, approximately 16 GB RAM.
- **Secondary/failover Mission Control execution host:** Hostinger VPS, approximately 8 GB RAM.
- The existing Mission Control/browser-relay deployment is currently established on Hostinger and is to be copied/installed on Netcup through the authorized execution surface.
- Routine Mission Control worker/supervisor browser execution must not use the owner's local workstation browser windows, local clipboard, or personal ChatGPT tabs once a healthy VPS execution host is available.

The provider names and RAM sizes above are owner deployment choices. They are not universal architecture.

## Required portable control-plane behavior

Both owner VPS hosts must participate in **one authoritative Mission Control submission queue**. Per-host process-local pacing is defense in depth only and cannot be the global authority once more than one host can submit.

Every ChatGPT submission requires, before browser send:

1. a durable source-bound task/directive/route authorization;
2. an authoritative global queue admission/lease issued by Mission Control;
3. confirmation that no unexpired send lease exists for another host;
4. confirmation that the global minimum provider interval since the last accepted/clicked submission boundary has elapsed;
5. exact automation-owned host/browser/window/target ownership;
6. exact dedicated Mission-Control supervisor-chat registry membership where the destination is a supervisor surface.

A host-local pacer must still enforce the same or stronger delay, but a local timestamp cannot substitute for the shared lease.

## Pacing evidence requirement

Do not claim pacing is fixed merely because `MC_RELAY_MIN_SUBMISSION_INTERVAL_MS` is configured or unit tests pass.

Live closeout must preserve a privacy-safe send ledger containing at minimum:

- queue item / opaque request identity;
- authorizing directive/task identity;
- executing host role (`PRIMARY` or `SECONDARY`);
- queue-admission timestamp;
- actual click/submission-boundary timestamp when observed;
- prior global submission-boundary timestamp;
- computed inter-send interval;
- configured global minimum interval;
- rate-limit occurrence/recovery state;
- final delivery status.

The log must make cross-host interval violations mechanically detectable.

## Dedicated MC supervisor surfaces

Workers and controller processes must never choose a supervisor destination because a ChatGPT tab is active, recent, user-owned, URL-similar, or merely available.

A supervisor surface is eligible only when its exact conversation identity is registered as an MC-only supervisor chat and the browser target is automation-owned on the selected VPS host.

Recommended owner-facing naming convention for newly created supervisor conversations:

`MC · <project or role> · <supervisor purpose>`

The visible title is for human recognition only. Authorization comes from the private exact registry identity, not the title string.

Personal/non-MC chats are never fallback supervisor surfaces. If no eligible MC supervisor chat exists, fail closed and create/register a fresh MC-only supervisor conversation through the authorized automation route rather than adopting an owner chat.

## Host selection and failover

Desired state:

1. Netcup PRIMARY handles routine MC controller/browser worker/supervisor traffic.
2. Hostinger SECONDARY remains warm or recoverable for bounded failover.
3. Only one host may hold the authoritative global send lease at a time.
4. Secondary failover is allowed only after primary-health failure is established and stale primary leases have expired or been safely fenced.
5. Recovery of the primary must not create active-active duplicate sends.
6. Browser ownership registries are host-specific; queue/send authority is shared globally.

## Local-workstation exclusion

For routine MC automation, the owner's workstation is not an execution host. Specifically forbid:

- opening or reusing the owner's normal browser tabs;
- interacting with the owner's browser tab groups;
- reading or writing the owner's clipboard;
- selecting the latest/active user conversation as a supervisor;
- using local GUI automation as an implicit fallback when both VPS routes are unavailable.

A future explicitly owner-authorized local recovery operation may override this only for that bounded recovery and must not silently re-enable local execution as normal behavior.

## Current verified boundary

The privacy-safe receipt is `docs/evidence/2026-09-10-owner-deployment-multi-host-hardening.json`.

- The existing Hostinger ledger contained 24 exact retained click boundaries and 23 exact intervals. The minimum was 92,928 ms, with zero intervals below the 60,000 ms floor. Before this change, there was no central cross-host queue, lease, or fresh single-use admission before every send.
- One reviewed relay tree and package are installed exactly on both authorized VPS hosts. Each host passes 155 relay tests with zero failures.
- Netcup's dedicated browser service is active and healthy through loopback-only control; relay and scheduler sends remain disabled.
- Hostinger is retained fail closed: the reviewed code is healthy, but its browser, relay, and scheduler remain disabled because the service sandbox blocks Brave without an owner-approved security relaxation.
- All six concrete browser-send call sites are mechanically routed through the central durable scheduler. The scheduler persists FIFO queue state, exact single-use admission, final pre-click validation, the crossed boundary and global cooldown. Lease expiry, epoch, quiescence, pacing transfer and split-brain rejection are deterministic tests.
- Registry validation rejects personal, ambiguous, legacy-unclassified, missing-provenance, duplicate and wrong-target conversations before send. Netcup's placeholder registry and Hostinger's legacy registry both fail closed in live doctor probes; no private chat locators are in Git.
- This work used SSH/direct file transfer only. No local browser automation or clipboard action occurred; remote clipboard-process counts were zero.

The owner deployment is not complete. It still needs:

- one remote ChatGPT login/MFA on Netcup plus creation and private registration of real dedicated MC-only supervisor conversations;
- a supported way to run the Mission Control execution workers themselves on the VPS rather than the owner's local Codex/Work host;
- an owner decision on the Hostinger service-sandbox tradeoff, or a compatible replacement browser runtime.

Until those boundaries are resolved, both schedulers and both relays stay disabled. Hostinger's browser also stays disabled. No production or third host was changed.
