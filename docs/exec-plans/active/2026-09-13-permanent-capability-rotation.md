# Permanent capability-challenge rotation

Status: IMPLEMENTED_NOT_LIVE_VERIFIED — owner approved a bounded 24-hour renewal of the same PRIMARY deployment lease. Resume the retained rollout with saved 60000 ms pacing values; no live rotation completion claimed.

Lease-renewal approval captured at 2026-09-13T20:18:50Z: `yes and why does it have only a 24hr lease? taht seems like another gate of extra work`, replying to the exact same-lease/24-hour renewal question. Change expiresAt only; no host, epoch, lease ID, issued-at, ownership or takeover change. Explain that deployment duration separately from capability-challenge TTL; do not silently introduce an automatic renewal controller.

Owner approval captured at 2026-09-13T19:38:06Z: `yes`, responding to the exact question about raising both PRIMARY pacing minimums from 20 to 60 seconds. This authorizes only the two named pacing settings. Source-sent timestamp is unavailable; the timestamp is Work capture/check time. Fresh read-only PRIMARY health reports LEASE_STALE; do not bypass or silently extend its expiry gate.

19:43 UTC continuation: the app's private configuration file was already 60000 ms although its running container retained 20000 ms. The relay file was changed from 20000 to 60000, with every unrelated byte and original ownership/mode verified unchanged. A root-only rollback copy was captured on PRIMARY. No service was restarted. Login remains reachable and unauthenticated API access remains 401; chain and ledger are valid, but send authority is blocked by lease expiry at 2026-09-13T16:21:43.570597Z.

Read-only code and service checks found no active renewal service or relay-facing renewal operation. Existing same-lease renewal is an operator configuration/startup transaction and can extend only expiresAt while preserving lease ID, epoch 3, PRIMARY identity, issued-at and takeover evidence. Ask the owner for a bounded 24-hour same-lease renewal; do not substitute a new epoch, change SECONDARY, weaken health/expiry validation, or restart with the known-invalid lease. Both sending flags remain disabled and this continuation sent zero provider messages or nonce comments. Retained branch and existing implementation remain unchanged apart from requirement records and the approved relay configuration value.

Controlling architecture: `docs/requirements/MISSION-CONTROL-PERMANENT-CAPABILITY-ROTATION-DIRECTIVE-20260913.md`, preserved byte-for-byte with SHA-256 `86d900d9b2e433460e4a2f1c74b25c59a2ae44f4e5d224cb36b0d8b9f0207ccf`.

The owner's direct instruction to retain the current branch overrides the attachment's preferred branch name. Work continues on `task/mission-control-current-work-observability-20260913`. Earlier observability drafts remain retained and are not part of this capability-rotation deployment.

PRIMARY identity was directly verified: existing `mission-control-issue90-live`, loopback BFF/daemon, existing persistent single-writer SQLite volume. There is no current static receipt-policy environment value; materialize only the owner-approved repository, issues 59/60/61, writer `u-dont-existDOTcom`, and an initially empty legacy challenge list. No historical policy is inferred.

## Enforcement / activated lessons

20:32 UTC reconciliation checkpoint: the pre-stop guard detected a competing deployment from task “Continue issue #90 implementation”, source `9ee081a01362132bd728d77f8e5332c9de1c1c42` / PR #108. That task explicitly confirmed quiescence and handed PRIMARY reconciliation to this task and its later owner-adopted publisher/socket architecture. It reports three issue-60 nonce fixtures and zero provider sends, no canonical preflight/capability acceptance. Retain its fixtures and additive SQLite `capability_challenges` history as historical, not current authority. The current app contains a newly introduced receipt policy and daemon writer-token delivery; these were absent at this task's earlier inspection. Compose the approved static channels, remove only that superseded daemon credential delivery (no token rotation/readback), and restore the isolated publisher service. Its container recreation dropped five prior hardening settings; restore the exact protected baseline while preserving every unrelated current setting. Renew only the same epoch-3 PRIMARY lease expiry per the owner approval above. Restore the exact approved relay-lock repair plus this branch's discovery delta. Do not touch the other task's source branch, SECONDARY or Somatic.

The original EventStore initialization unconditionally reset `user_version` to 2. Additive reconciliation now preserves any higher schema version and untouched retained tables/triggers. A focused restart/history regression must pass before creating the new exact app build. This migration does not import historical capability PASS into the new current-challenge authority.

| Trigger | Enforcement | Failure prevented |
| --- | --- | --- |
| Expiry / missing challenge | Durable candidate, exact publication verification, transactional current pointer | Double-active or unpublished authority |
| Restart or ambiguous network | Reuse immutable candidate; publication lookup before retry; fail closed on uncertainty | Duplicate issuance or false publication proof |
| New challenge | Exact current challenge in receipt and decision gates | Old PASS silently carries forward |
| Public nonce fixture | Four-field allowlist and fixed bus writer interface | MC nonce, locators or broad GitHub authority leak |
| Legacy config | One-way migration; dynamic state outranks old configured ID | Manual ID edits remain necessary |
| Live deployment | Preserve private config/queue/lease/pacing/browser and installed lock correction, reversible rollout | Unrelated runtime or credential change |
| Completion | Requirement matrix + live evidence, independent review | Unit tests substitute for owner outcome |

## Work sequence

1. Preserve directive and requirement; runtime-admit this bounded owner-direct implementation.
2. Add daemon-owned durable lifecycle and fixed-bus publication interface, plus expiry/concurrency/crash tests.
3. Integrate effective current policy through exact public challenge lookup, receipt reconciliation and decision admission. Add authenticated pair-specific relay discovery; keep old IDs migration-only.
4. Independent security review; focused/affected tests then applicable full release gates.
5. Discover/provision only an already-authorized narrow publisher path. Never copy broad account credentials to PRIMARY. If no compliant path exists, report that boundary without activating unpublished candidates.
6. Reversible exact-build PRIMARY rollout, genuine successor/publication/discovery/receipt acceptance. No Somatic, SECONDARY activation, merge, or ordinary provider work.

Test telemetry: `mc-capability-rotation-20260913`. Iteration lane until release verification.

## 03:44 UTC retained checkpoint (historical; superseded by continuation above)

Daemon-owned immutable candidates, lifecycle, atomic activation, 24-hour TTL / 4-hour renewal, effective-policy lookup and exact relay discovery are implemented. Rotation never grants PASS. Static receipt channels are materialized from the owner directive, not a claimed historical runtime value. Legacy IDs cannot outrank durable state, including after accidental feature disablement.

The narrow broker permits only issue-60 nonce-comment creation; no credential is passed to the daemon or relay. Owner provisioning source is `/etc/mission-control/capability-nonce-publisher/github-token` (root:root 0600; parent 0700). The unit provides `MISSION_CONTROL_CAPABILITY_GITHUB_TOKEN_FILE` as a path to its private systemd copy. Never ask for the PAT in chat or commands.

Independent review corrections: reserve canonical challenge/tool proof for the receipt ingester; require authenticated producer and exact worker binding for tool/mode consumption; derive mode producers from the existing relay registry; reject static fallback; limit publication search to the admissible lifetime window; mount a stable socket parent; enforce effective dump protection before credential access. No blocking source findings remained after the narrow final review. Source review is not live acceptance.

PRIMARY publisher is enabled/active after Joel manually provisioned its protected source credential. Writer authentication succeeded; no credential value was returned to Work. The same network-disabled diagnostic container reconnected after publisher restart through the stable parent mount, using only a rejected invalid request and zero GitHub mutations. Node v22.23.2, effective dump protection, and exact service-private credential-copy compatibility remain verified; no diagnostic override remains.

The exact d683877 app image built successfully on PRIMARY's pinned Node 22 runtime. Reversible rollout retained the old container/image, private configuration and consistent stopped-writer volume backup in a root-only PRIMARY rollback directory. Startup rejected the existing 20000 ms global pacing value because the approved source enforces 60000–600000 ms. The guard restored the original app and exact private configuration automatically. No pacing value or unrelated credential changed. Database history was retained rather than replaced; schema initialization may have occurred before the startup error, but challenge reconciliation was not reached. The old app is healthy, login returns 200, unauthenticated worker API 401, chain and submission ledger are valid, and the lease is ACTIVE_LEASE. The failed replacement is stopped with unless-stopped policy; no simultaneous database writer remains.

The relay environment also contains MC_RELAY_MIN_SUBMISSION_INTERVAL_MS=20000. Neither value was changed. Owner action: authorize restoring both PRIMARY minimums to 60000 ms, or explicitly resolve the conflict between preserving the live 20-second configuration and the controlling directive/source's 60-second gate. Work must not weaken the source gate to make rollout pass. After that decision continue this branch with successor/publication/discovery/preflight/capability/old-receipt acceptance. No ordinary provider work, Somatic, SECONDARY activation, or merge is authorized. This run's provider sends and nonce publications remain zero.

A separate pre-install check found the accepted four-file relay-lock repair had been dropped by a package replacement at 00:58 UTC, before this rollout. Its retained PRIMARY rollback copy matches all four exact source hashes at approved commit 5be4d444041c8e1681d56a5b7256a01b3090f690. The identical lock/state/CLI correction and regression tests are now composed into this branch, preserving the three rotation-discovery changes. No live relay files were installed in this blocked rollout. Restore that exact repair with the future relay deployment; do not overwrite it with an older full package.

Verification checkpoint: Mission Control 380/380, repository 299/299; production build/typecheck and deterministic repository audit passed. Combined rotation/lock-repair relay source passed 215/215 full tests, followed by 12/12 focused state/client tests including the additionally preserved CLI cleanup regression. Exact publisher bundle SHA-256 on PRIMARY: `5b7fa2ad34924fd928ae23092e503a1e76f0f9aae66022d49ef344876cc7eac5`. Bounded operator-script review caught a retained-container restart-policy hazard; an explicit unless-stopped prerequisite closed it before rollout. A new pre-stop pacing prerequisite prevents repeating the observed outage. No remaining blocking source-review finding; the live pacing decision remains owner-only.
