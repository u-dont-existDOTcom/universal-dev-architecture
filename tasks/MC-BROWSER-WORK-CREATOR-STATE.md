# Managed browser Work creator recovery

Authority: owner task `Restore Mission Control Browser Task Launch as Trusted Work Creator`, 2026-09-14.
Baseline: live main `58c4c86`; branch `task/mc-browser-work-creator-20260914`.

Reuse `tools/codex-mission-control/vps-browser-relay/src/provision-mc-only-chat.mjs`,
`automation-owned-browser.mjs`, `cdp.mjs`, and the central submission scheduler.
Keep native evidence support, strict SYSTEM provenance, exact source/profile binding,
provider observations null, and private managed-tab ownership. No merge/deployment.

Observed: launcher exists, but its consumer controls enforce Sol Extra High rather
than the source-authorized Work profile. Primary managed browser service is running.
The owner subsequently approved dedicated-account access and it succeeded. There
is one managed tab. The expanded picker offers Latest, GPT-5.6 Sol and GPT-5.5.
Owner correction: Latest is Astra; literal-name absence was a false blocker.
The scheduler reports LEASE_STALE, not ready, zero queued items,
and no unresolved admission. No model invocation occurred. See
`MC-BROWSER-LIVE-CALIBRATION-20260914.json`.

Test observer started before implementation: `mc-browser-work-creator-20260914`.
Implemented: SYSTEM/registered-relay durable authority lookup, reused provision-work path,
source-authorized selection/readback, browser evidence schema and trusted durable
consumer validation, no worker forgery, null provider/Fast observations, replay guard.
Local verification: 34 profile tests, 4 focused relay tests, 270 full Mission Control
tests, 188 full relay tests, 321 repository tests, typecheck/build, deterministic
audit and owner-integrity validation passed. Archive: 165 files, 78 parts,
`738a6bf7f7ea33388855b00f4b8fe682c7fe326540ee68e3a181955be3d862db`;
reconstruction matches source byte-for-byte.

Published draft PR #120. Follow-up corrects the existing COLLECTOR credential to
server-side SYSTEM bridge mapping; workers/unbound collectors/wrong target/window
remain rejected. Clean model-picker screenshot captured privately. Failed
off-target crops are discarded, not used as evidence. No new real chat was created.
Remaining: finish follow-up verification/publication, then the two calibration
launches after the renewal repair is reviewed and activated. The deployed code
only activates a static lease at daemon initialization. Candidate now renews the
same active owner via the existing healthy one-minute report: ten-minute lifetime,
renew at five minutes remaining; stale/standby/superseded reports cannot renew.
Restart restores durable same-owner expiry rather than old bootstrap expiry.
No production
deployment/configuration/account changes were made.
Classification: `LEASE_RENEWAL_REPAIR_PENDING_ACTIVATION`.
Do not claim active runtime or completed calibration from synthetic tests.
