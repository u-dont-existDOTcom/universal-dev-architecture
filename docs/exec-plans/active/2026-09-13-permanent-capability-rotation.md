# Permanent capability-challenge rotation

Status: IMPLEMENTING; no live completion claimed.

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
