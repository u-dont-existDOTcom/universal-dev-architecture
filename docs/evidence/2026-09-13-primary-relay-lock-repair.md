# Mission Control PRIMARY relay-lock repair

As of 2026-09-13 00:37 UTC. **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT**

PRIMARY is healthy and the relay lock is free. The four-file lifecycle correction is installed and verified. SECONDARY remains unchanged on standby. The Somatic humanization experiment was neither run nor modified.

## What actually happened

The checkpoint captured a collision with an **active, owner-authorized cadence test**, not a proven abandoned helper.

| Event | UTC |
|---|---|
| Exact helper launched | 2026-09-12 22:47:36 |
| Humanization checkpoint failed closed | 2026-09-12 22:51:25 |
| Helper's sudo session closed | 2026-09-12 22:51:45.395821 |
| Health service next succeeded | 2026-09-12 22:52:20.648 |
| Lifecycle correction installed | 2026-09-13 00:31:28.137 |

The helper was PID **317145**, parent **317143** (sudo wrapper; its parent was 317142). Exact command:

`/home/cloudbrowser/.local/bin/node /tmp/chatgpt-direct-cadence-test.mjs`

It belonged to the separate task **Continue issue #90 implementation**. Its current owner instruction explicitly authorized a direct 20/30/40-second cadence test. Source evidence shows that it held the relay through generation waits, cadence intervals and a post-send safety hold. The recovered result recorded seven accepted requests and a cleanup failure; its `finally` block released the lock.

The helper had already exited before this repair task began. No original process was killed, no active lock was manually unlinked, and no failover was attempted. Its original descriptors cannot be reconstructed retrospectively. The helper omitted the detailed cleanup exception from its result, so that exact exception is also unavailable. Neither missing fact is inferred.

The source had separate lifecycle weaknesses worth correcting: no overall helper deadline, PID-only stale detection, unconditional lock deletion on release, potentially partial metadata publication, and missing CLI error-path cleanup. These are demonstrated code defects, not a claim that the historical helper was indefinitely orphaned.

## Installed correction

Only four PRIMARY relay files changed: the state store, CLI, and two focused lock/watchdog modules. The web application, browser, sessions, registrations, configuration and pacing were not redeployed or altered.

- Exclusive ownership is held by Linux on a persistent `relay.lock.guard` inode. Process death releases it automatically. **Never delete that guard file.**
- Complete owner metadata is published atomically and identifies PID, parent, process start ticks, boot ID, task, acquisition time and deadline.
- Temporary helpers default to a 30-minute bound; callers can specify a shorter authorized duration. An independent watchdog also handles a frozen event loop, using SIGTERM and then SIGKILL after five seconds only for the same expired owner identity. Explicit persistent service modes remain supported.
- Success, errors, process exit and termination signals clean up owned metadata. A failed acquisition or duplicate release cannot remove another owner's lock.
- Dead/reused owners are recovered under the kernel guard. Live legacy owners and unverifiable metadata remain fail-closed.
- Current owner diagnostics are available through `lock-status`, refreshed `status`, and contention messages in the existing health journal. The dashboard retains its existing health display; a new panel would require a separate web-app change and was not added.

Source: `u-dont-existDOTcom/universal-dev-architecture`, branch `task/mission-control-relay-lock-lifecycle-20260912`, installed code commit `5be4d444041c8e1681d56a5b7256a01b3090f690`. This branch is durable on GitHub but not merged. Preserve this delta in any future full PRIMARY release.

## Verification and preservation

All **201 relay tests**, **299 repository tests**, and **25 focused tests on PRIMARY's actual Node 22 runtime** passed. The deterministic repository audit had no findings.

A new, explicitly no-send acceptance helper acquired PRIMARY's actual installed relay lock. Its identity and open descriptors were captured; SIGTERM produced exit 143, the process disappeared, metadata was removed by owner cleanup, and the kernel guard became free. This is a new controlled acceptance case, not a substituted descriptor record for the original helper.

After installation:

- PRIMARY doctor: **READY**. SECONDARY doctor: **STANDBY_READY**.
- PRIMARY remains active at epoch 3; SECONDARY was not promoted or modified.
- Both hosts have one automation-owned ChatGPT tab and no foreign ChatGPT tabs.
- Queue: **0**; unresolved admissions: **none**; relay ambiguities: **none**.
- All **79 ledger records** have the exact same digest as the quiet-window baseline; integrity is valid.
- Hashes of relay state, browser ownership, chat/provision directories, environment files, provider sessions and pacing match the baseline. Browser-profile directory identities are unchanged.
- The health timer is restored and active; a later health run at 00:34:40 UTC exited successfully.
- The previous files, manifest and verification assets are retained in PRIMARY's private rollback directory. No rollback was required.

## Exact no-send boundary

This repair task sent **zero provider messages**. Installation and live acceptance occurred in a coordinated quiet window and sent none.

However, a separate owner-authorized cadence test overlapped the early **read-only diagnosis** and accepted 19 direct requests. Its last accepted click was **2026-09-13 00:01:43.997 UTC**; its task reserved PRIMARY at **00:07:37.965 UTC**. Therefore **zero sends is not claimed for the entire diagnosis interval**. Those direct tests bypassed the scheduler, so an unchanged Mission Control ledger alone would not establish that broader claim. Their result is not promoted into a production pacing recommendation; the normal 60-second minimum remains unchanged.

## Humanization checkpoint

The original checkpoint and its branch remain unchanged at `6986ff4b0478092cf85d62df1ffd39d7ce9c8a06`. Candidate, writer/controller, role-creation and Pangram counts are still zero.

**The original directive may be rerun from its initial fail-closed preflight.** The lock blocker is resolved; no experiment stage needs to be continued or repaired. This is not permission to skip preflight or begin mid-stage: all fresh GitHub authority, model/thinking, MC-only ownership, capability, independence, global pacing and conditional Pangram gates still apply. Current registered capability proofs/challenges were unverified or unavailable in the no-send doctor checks, and were deliberately not changed by this task.

No prose was edited, merged, published or installed; no humanization experiment or general methodological lesson was promoted.
