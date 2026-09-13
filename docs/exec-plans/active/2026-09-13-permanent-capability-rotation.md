# Permanent capability-challenge rotation

Status: BLOCKED_EXACT_REASON; owner pacing decision required. Credential provisioning succeeded. No live rotation completion claimed.

Controlling architecture: `docs/requirements/MISSION-CONTROL-PERMANENT-CAPABILITY-ROTATION-DIRECTIVE-20260913.md`, preserved byte-for-byte with SHA-256 `86d900d9b2e433460e4a2f1c74b25c59a2ae44f4e5d224cb36b0d8b9f0207ccf`.

The owner's direct instruction to retain the current branch overrides the attachment's preferred branch name. Work continues on `task/mission-control-current-work-observability-20260913`. Earlier observability drafts remain retained and are not part of this capability-rotation deployment.

PRIMARY identity was directly verified: existing `mission-control-issue90-live`, loopback BFF/daemon, existing persistent single-writer SQLite volume. There is no current static receipt-policy environment value; materialize only the owner-approved repository, issues 59/60/61, writer `u-dont-existDOTcom`, and an initially empty legacy challenge list. No historical policy is inferred.

## Enforcement / activated lessons

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

## Retained implementation / current boundary

Daemon-owned immutable candidates, lifecycle, atomic activation, 24-hour TTL / 4-hour renewal, effective-policy lookup and exact relay discovery are implemented. Rotation never grants PASS. Static receipt channels are materialized from the owner directive, not a claimed historical runtime value. Legacy IDs cannot outrank durable state, including after accidental feature disablement.

The narrow broker permits only issue-60 nonce-comment creation; no credential is passed to the daemon or relay. Owner provisioning source is `/etc/mission-control/capability-nonce-publisher/github-token` (root:root 0600; parent 0700). The unit provides `MISSION_CONTROL_CAPABILITY_GITHUB_TOKEN_FILE` as a path to its private systemd copy. Never ask for the PAT in chat or commands.

Independent review corrections: reserve canonical challenge/tool proof for the receipt ingester; require authenticated producer and exact worker binding for tool/mode consumption; derive mode producers from the existing relay registry; reject static fallback; limit publication search to the admissible lifetime window; mount a stable socket parent; enforce effective dump protection before credential access. No blocking source findings remained after the narrow final review. Source review is not live acceptance.

PRIMARY publisher is enabled/active after Joel manually provisioned its protected source credential. Writer authentication succeeded; no credential value was returned to Work. The same network-disabled diagnostic container reconnected after publisher restart through the stable parent mount, using only a rejected invalid request and zero GitHub mutations. Node v22.23.2, effective dump protection, and exact service-private credential-copy compatibility remain verified; no diagnostic override remains.

The exact d683877 app image built successfully on PRIMARY's pinned Node 22 runtime. Reversible rollout retained the old container/image, private configuration and consistent stopped-writer volume backup in a root-only PRIMARY rollback directory. Startup rejected the existing 20000 ms global pacing value because the approved source enforces 60000–600000 ms. The guard restored the original app and exact private configuration automatically. No pacing value or unrelated credential changed. Database history was retained rather than replaced; schema initialization may have occurred before the startup error, but challenge reconciliation was not reached. The old app is healthy, login returns 200, unauthenticated worker API 401, chain and submission ledger are valid, and the lease is ACTIVE_LEASE. The failed replacement is stopped with unless-stopped policy; no simultaneous database writer remains.

The relay environment also contains MC_RELAY_MIN_SUBMISSION_INTERVAL_MS=20000. Neither value was changed. Owner action: authorize restoring both PRIMARY minimums to 60000 ms, or explicitly resolve the conflict between preserving the live 20-second configuration and the controlling directive/source's 60-second gate. Work must not weaken the source gate to make rollout pass. After that decision continue this branch with successor/publication/discovery/preflight/capability/old-receipt acceptance. No ordinary provider work, Somatic, SECONDARY activation, or merge is authorized. This run's provider sends and nonce publications remain zero.

A separate pre-install check found the accepted four-file relay-lock repair had been dropped by a package replacement at 00:58 UTC, before this rollout. Its retained PRIMARY rollback copy matches all four exact source hashes at approved commit 5be4d444041c8e1681d56a5b7256a01b3090f690. The identical lock/state/CLI correction and regression tests are now composed into this branch, preserving the three rotation-discovery changes. No live relay files were installed in this blocked rollout. Restore that exact repair with the future relay deployment; do not overwrite it with an older full package.

Verification checkpoint: Mission Control 380/380, repository 299/299; production build/typecheck and deterministic repository audit passed. Combined rotation/lock-repair relay source passed 215/215 full tests, followed by 12/12 focused state/client tests including the additionally preserved CLI cleanup regression. Exact publisher bundle SHA-256 on PRIMARY: `5b7fa2ad34924fd928ae23092e503a1e76f0f9aae66022d49ef344876cc7eac5`. Bounded operator-script review caught a retained-container restart-policy hazard; an explicit unless-stopped prerequisite closed it before rollout. A new pre-stop pacing prerequisite prevents repeating the observed outage. No remaining blocking source-review finding; the live pacing decision remains owner-only.
