# Managed browser Work creator recovery

Authority: owner task `Restore Mission Control Browser Task Launch as Trusted Work Creator`, 2026-09-14.
Baseline: live main `58c4c86`; branch `task/mc-browser-work-creator-20260914`.

Reuse `tools/codex-mission-control/vps-browser-relay/src/provision-mc-only-chat.mjs`,
`automation-owned-browser.mjs`, `cdp.mjs`, and the central submission scheduler.
Keep native evidence support, strict SYSTEM provenance, exact source/profile binding,
provider observations null, and private managed-tab ownership. No merge/deployment.

Observed: launcher exists, but its consumer controls enforce Sol Extra High rather
than the source-authorized Work profile. Primary managed browser service is running.
Dedicated browser-account configuration is inaccessible to the current SSH account.
The permission reviewer rejected a read-only account-switch check; no workaround
was attempted. Live calibration is blocked on authorized dedicated-account access.

Test observer started before implementation: `mc-browser-work-creator-20260914`.
Implemented: SYSTEM-only durable authority lookup, reused provision-work path,
source-authorized selection/readback, browser evidence schema and trusted durable
consumer validation, no worker forgery, null provider/Fast observations, replay guard.
Local verification: 34 profile tests, 4 focused relay tests, 270 full Mission Control
tests, 188 full relay tests, 321 repository tests, typecheck/build, deterministic
audit and owner-integrity validation passed. Archive: 165 files, 78 parts,
`738a6bf7f7ea33388855b00f4b8fe682c7fe326540ee68e3a181955be3d862db`;
reconstruction matches source byte-for-byte.

Remaining: publish draft PR/check hosted checks; obtain authorized dedicated-account
access; perform two real calibration launches and privacy-safe control screenshots;
validate actual live selectors and resulting locators. No new real chat was created.
Classification: `BROWSER_TASK_CREATION_CANDIDATE_CALIBRATION_ACCESS_BLOCKED`.
Do not claim active runtime or completed calibration from synthetic tests.
