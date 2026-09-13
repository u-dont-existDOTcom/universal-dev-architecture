# PRIMARY permanent capability rotation — live evidence

NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT. Checked 2026-09-13 21:20 UTC.

Status: **DEPLOYED, LIVE ACCEPTANCE BLOCKED**. Do not claim task completion or capability PASS.

## Current deployment and lease

The accepted `mission-control-issue90-live` single writer runs app source `acab661e2e8dc406a392090964b801fd273d21ea`, image `codex-mission-control:capability-rotation-acab661`, image digest `sha256:3131b5b42082cbf96cb1072b1030e5647e07ef3cdb6639bc67421eb6db389dc5`. Node v22.23.2; loopback BFF/daemon ports 3000/4100; existing SQLite volume preserved. No Railway identity requirement, task restart, new task branch, merge, SECONDARY change, or Somatic execution.

Joel approved the same PRIMARY lease renewal. Only `expiresAt` changed, to `2026-09-14T20:45:11.808Z`; epoch 3, lease identity, PRIMARY host, issued-at and ownership/takeover evidence remain unchanged. Subsequent retries retained that exact deadline rather than extending it again. Both app and relay minimums are 60000 ms under Joel's separate explicit approval.

The deployment lease has no hardcoded 24-hour maximum. The parser requires expiry after issuance; same-lease renewal permits only an expiry extension. The 24-hour duration was a deployment/operator choice. Expiry fences stale send authority after a failover; daily manual renewal is an operational gap, not a requirement of capability rotation. No automatic deployment-lease renewal controller was added or expiry check disabled. Such a controller needs separate ownership-proof and fail-closed renewal design.

## Reconciliation and preserved state

A competing task had deployed source `9ee081a` (PR #108). It explicitly handed over a quiescent PRIMARY to this task's later owner-adopted isolated-publisher/socket architecture. Its branch and three public fixtures remain historical; PR #108 was not merged or closed.

The actual protected Docker environment source for that deployment was `/etc/mission-control/issue90-caprot-9ee081a01362132bd728d77f8e5332c9de1c1c42.env`, root:root 0600. The earlier home-directory environment file is not the current source and was left untouched. Private/live values were compared inside PRIMARY without returning them. All unrelated owner/session/internal/ingest/relay/browser credentials and stable supervisor registrations were preserved. Only the superseded daemon GitHub writer-token delivery was removed; the protected publisher credential itself was not rotated or read back to Work.

Original hardening is restored: read-only root filesystem; all capabilities dropped; no-new-privileges; PID limit 256; `/tmp` tmpfs `rw,noexec,nosuid,size=64m`; host networking with loopback-only listeners; user `node`; restart policy `unless-stopped`. No second container writes the shared database.

The exact four-file approved relay-lock correction was restored alongside the three rotation-discovery files. Private relay configuration, browser environment, and chat registration files were hash-verified unchanged during installation. The ordinary relay service remains inactive; persistent ordinary-send and capability-test flags are both false. Capability-test flags were enabled only for bounded canonical CLI subprocesses.

Forty-eight rows from the prior deployment's `capability_challenges` table, its immutability protections, and SQLite schema version 3 were retained. A stopped-writer copy and subsequent restart-check copy proved the historical rows' complete serialized hash unchanged. The new lifecycle uses separate immutable candidates/lifecycle tables and current/pending slots. Three current slots, three candidates, no pending candidate; no legacy capability PASS is imported.

## Publisher and actual automatic successors

The root-protected credential source remains `/etc/mission-control/capability-nonce-publisher/github-token` (parent 0700, file 0600). The isolated service receives its private systemd credential copy through `MISSION_CONTROL_CAPABILITY_GITHUB_TOKEN_FILE`; the app and relay receive only the Unix socket, never the PAT. The broker remains hard-locked to nonce-comment creation on this repository's issue #60. No decision/stage/source/update/delete mutation interface was added.

Publisher service: `mission-control-capability-nonce-publisher.service`, enabled/active. Bundle SHA-256: `ab217c67bbc65313aecee1e22613e259d9c5f7b77ce0ee2b8a8c34b1fd2dc26e`. The generated-bundle delta from the reviewed earlier bundle was exactly the bounded public-alias validator. All three existing namespaced aliases were independently verified in pre-existing issue-60 comments before accepting nonempty colon-separated identifier segments. URLs, malformed segments and excessive length remain rejected. No registry rewrite occurred.

The following missing-current successors were generated automatically, published, independently verified, then activated:

| Supervisor | Challenge | Issued / expires UTC | Exact issue-60 fixture |
| --- | --- | --- | --- |
| specialist-relay-smoke | `mc-capability-64d72265-5bbd-4ec4-a67b-9a6dfb8fce58` | Sep 13 20:54:33.633 / Sep 14 20:54:33.633 | [5656069466](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/60#issuecomment-5656069466) |
| mc-project-manager | `mc-capability-79ebc3ad-59c6-4c78-8353-81b2c9ede786` | Sep 13 20:54:53.399 / Sep 14 20:54:53.399 | [5656072260](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/60#issuecomment-5656072260) |
| specialist-failover-probe | `mc-capability-2a37cf10-1be2-4279-b7a8-c20915de7779` | Sep 13 20:55:16.817 / Sep 14 20:55:16.817 | [5656074123](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/60#issuecomment-5656074123) |

Public GitHub GETs independently verified exact body shape, repository/issue, writer and binding, and absence of the MC nonce. Exact challenge GETs returned the expected eight-field projection. No nonce values appear in this evidence. All three prior deployment current IDs return 404 from effective-current public lookup. A real daemon restart reused the exact same three challenges without further publication. The same live app container reconnected after actual publisher restart through its stable parent mount; the connectivity probe used only a rejected invalid request and made zero GitHub mutations.

Rotation itself granted no capability PASS. Relay discovery showed all three new current challenges with mission-control-read/GitHub-read/GitHub-write false until fresh receipt proof. Stable private registrations were unchanged.

## Tests and independent review

- Exact final app image: **388/388 full tests passed** on PRIMARY Node 22 in a network-disabled diagnostic container. Production protections were not changed for tests. Initial archive-only test runs failed because Git/state fixtures were absent and unconstrained test concurrency hit the diagnostic PID cap; exact public read-only Git/state fixtures, explicit test work-tree context and bounded concurrency corrected the harness. Failed runs are retained in test-efficiency telemetry, not represented as passes.
- New schema/history and public-alias checks: 16 focused, then 146 affected tests passed. The namespace regression first reproduced the old rejection before the completed fix.
- Combined relay source: prior 215/215 full plus 12/12 affected; this continuation also ran 60/60 affected tests on PRIMARY Node 22 before installation.
- Production TypeScript/build passed for exact final image. Prior repository full suite 299/299; current final audit is recorded in the task requirement/plan.
- Independent security review: no remaining blocking source findings after canonical provenance, cross-worker binding, stale fallback, ambiguous publication, credential protection, restart, namespace compatibility and guarded rollback corrections. Review of actual restart verification found no blocker. Source review is not a substitute for live capability acceptance.

## Canonical live tests and exact remaining blocker

Canonical doctor initially returned READY with all three challenges discoverable and normal memory pressure. Initial `mcp-preflight` and `capabilities` stopped on model-menu readiness before any send. A guarded check proved the exact owned page was signed in, idle, with empty composer and correct URL; one same-page reload changed no target/registration and sent nothing. The subsequent canonical path verified the fixed consumer controls. Fresh mode-switching evidence is true for the smoke supervisor; backend model identity is not claimed.

The retried preflight failed at `ChatGPT did not expose or select exact app label Mission Control` (21:16:52.432 UTC), before `submitExactMessage`/message composition. The app-selection error did not carry a specific pre-click stage through the existing pacer, so the reservation lacked a durable pre-click abort. A later canonical admission attempt marked the expired reservation `AMBIGUOUS_AFTER_RESTART`. At 21:20 UTC the lease is ACTIVE_LEASE and ledger valid, but send readiness is false, queue depth is zero, and that ambiguous admission remains unresolved. No direct database edit, fabricated abort, forced clearance, lease/epoch change, or replay was attempted.

**This acceptance run caused that unresolved test reservation.** Rotation is deployed, but end-to-end acceptance and restoration of send readiness are not complete. The existing abort operation accepts only an open ADMITTED reservation; the outcome operation accepts only a boundary-recorded or proven-aborted reservation. No existing reviewed recovery route for this already-ambiguous state was found. Resolving it requires a narrowly authorized, evidence-preserving reconciliation—not weakening the ambiguity gate. The app-selection path also needs a bounded repair/reconnection before canonical preflight/capability proof can succeed. Do not select another app, relax fixed controls, manufacture a receipt, or bypass MC-only ownership.

Provider messages from this task/continuation: **0**; send timestamps: **none**. The source failure precedes message composition and the live ledger records zero new submission boundaries in the 2026-09-13T20:18:50Z-onward window. This task published exactly **3 nonce fixtures** above; the competing task's three earlier fixtures are separate retained history. No ordinary provider work, Somatic, SECONDARY, owner-workstation browser/clipboard, or live workstation worker was executed.

PRIMARY login returns 200; unauthenticated worker API returns 401. Event chain and submission ledger are valid. The owner workstation tunnel was not listening at the check (HTTP 000), so through-tunnel login is not claimed verified in this continuation. The normal owner command is `ssh -N mission-control-primary` (remaining open silently is expected), then `http://127.0.0.1:13000`.

Final 21:26 UTC service check: event sequence2762 with valid chain/ledger, ACTIVE_LEASE and three CURRENT registrations; exact original hardening flags remain set. Publisher enabled/active, browser active, health timer restored active, ordinary relay inactive. Application health does not clear or override the unresolved ambiguous admission described above. Final owner-requirement validator and deterministic repository audit passed.

## Recovery / rollback boundary

Root-only PRIMARY checkpoints retain old containers/config, consistent pre-migration data, the restart-check copy, and exact prior publisher/relay files. Main final checkpoint: `/opt/mission-control/rollback/capability-rotation-acab661`; previous guarded checkpoint: `/opt/mission-control/rollback/capability-rotation-0cd2fd9`; relay delta: `/opt/mission-control/rollback/capability-relay-cb2aaee`; broker: `/opt/mission-control/rollback/publisher-acab661`.

Do not print/export those private backups, restore an older database over current history, run two writers, resurrect daemon PAT delivery, or undo the restored hardening/lock correction. Any rollback must retain the renewed expiry and current durable history, stop the writer before replacement, preserve the exact private registry, and disable the publisher if the feature is deactivated. A rollback does **not** resolve the ambiguous test reservation and must not be presented as one. Old stopped containers with superseded credentials/hardening are historical recovery material, not approved restart commands. No merge is authorized.

After the three new challenges activated, the old `9ee081a`/`0711` runtimes are **not** an approved fallback: they do not enforce this lifecycle's effective-current authority. The earlier guarded fallback was used only before activation. Current recovery may re-create the reviewed `acab661` runtime from its protected `replacement-create.json`, with the same current database/config and one writer, or use another separately validated lifecycle-compatible build. Do not restore an old receipt policy or turn off durable-current enforcement. Temporarily stopping the publisher must leave current/expiry/receipt validation fail-closed; it is not permission to revert challenge authority.
