# Permanent capability-challenge rotation

Status: IMPLEMENTED_NOT_LIVE_VERIFIED; owner credential provisioning pending. No live completion claimed.

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

PRIMARY publisher installed disabled/inactive. Node v22.23.2, service configuration, effective dump protection, runtime-child cleanup with stable parent retention, and exact service-private credential-copy compatibility were checked with nonsecret, network-denied probes. Temporary service override removed. The source credential file remains owner-provisioned only. Mission Control daemon/relay were not deployed or restarted; private registrations, queue/lease/pacing configuration, and installed relay-lock correction were preserved. The existing database was retained without rotation migration or replacement; the bounded owner-direct task admission was recorded through its existing authenticated route.

Remaining owner action: manually populate the protected source credential file; report only that it is ready. Then continue this branch with reversible exact-build daemon/relay rollout and the directive's live successor/publication/discovery/preflight/capability/old-receipt acceptance gates. No ordinary provider work, Somatic, SECONDARY activation, or merge is authorized. Provider sends in this implementation/staging phase: zero.

Verification checkpoint: Mission Control 380/380, relay 200/200, repository 299/299; production build/typecheck and deterministic repository audit pass. Exact publisher bundle SHA-256 on PRIMARY: `5b7fa2ad34924fd928ae23092e503a1e76f0f9aae66022d49ef344876cc7eac5`. Local implementation tests are not a substitute for live acceptance. The live app process/image remains the identity-confirmed pre-rotation runtime; health still reports valid chain, valid pacing ledger and active lease.
