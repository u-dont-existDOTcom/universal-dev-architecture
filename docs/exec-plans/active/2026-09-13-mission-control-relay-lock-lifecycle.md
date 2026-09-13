# PRIMARY relay-lock lifecycle repair

Status: active. Owner requirement: ../requirements/2026-09-13-mission-control-relay-lock-lifecycle.owner-requirement.json

## Authority and scope

Fresh canonical universal main: 5533aaa474d9e25c78406197ea4f57dabd995b22. Incident checkpoint: joel-articles/task/somatic-intro-progress-controller-20260831 at 6986ff4b0478092cf85d62df1ffd39d7ce9c8a06, work/SOMATIC-HUMANIZATION-MISSION-CONTROL-CHECKPOINT-132-20260912.json. Isolated branch task/mission-control-relay-lock-lifecycle-20260912. No humanization, provider send, session/profile/registration changes, failover, pacing reset, runtime redesign or dashboard redeploy.

## Active controls

- Owner-outcome invariant + task-time activation (scoped AGENTS): preserve all four requirement outcomes; tests/absence alone cannot terminalize. Enforced by requirement validator and evidence closeout.
- Multi-host submission scheduling: keep PRIMARY epoch and SECONDARY standby; no admission/send during maintenance; compare queue/ledger and private state hashes. Any ambiguity stops live mutation.
- Exact process ownership: never kill a live authorized task or unlink its lock. Historical process already exited; descriptors at incident are unavailable, not fabricated.
- Test efficiency: telemetry task relay-lock-lifecycle-20260912 started before code edits. Focused lifecycle regressions, adjacent state suite, full relay/repository checks once for release.
- Private browser ownership: SSH only, no workstation browser/clipboard, no conversation content or private locators in evidence.

## Evidence so far

Helper PID 317145, sudo parent 317143, command /home/cloudbrowser/.local/bin/node /tmp/chatgpt-direct-cadence-test.mjs. Journal launch 2026-09-12T22:47:36.214832Z; sudo session close 22:51:45.395821Z; health success 22:52:20.648Z. Separate task source proves explicit owner-authorized direct cadence test, finally release, seven accepted then cleanup failure. It was active at checkpoint, not conclusively orphaned. No termination/unlink by repair task. Current helper and original lock absent.

Another authorized direct test overlapped read-only diagnosis; do not claim whole-task zero sends from scheduler's unchanged lastSubmissionAt. Coordinate quiet boundary before install; preserve exact last direct click and no-send window.

## Work sequence

Research-before-reinvention applicability: not_applicable to this narrow lifecycle repair; disposition: compose. Reuse the installed Linux util-linux flock primitive and OS descriptor lifecycle, not a new locking protocol. No novel-method claim. The project-specific remainder is compatibility metadata, exact-owner watchdog/cleanup, and existing CLI integration. Existing health projection has no rendered detail field, so owner visibility is provided through lock-status/status and health journal without a web-app redeploy.

1. Complete forensic record and quiet-window baseline (both hosts, queue/ledger, private state hashes).
2. Small library/CLI correction: process-owned kernel guard plus PID/start/boot/task/deadline metadata, fail-closed legacy/malformed handling, identity-checked release, out-of-process finite-helper watchdog, finally cleanup and read-only lock status. Persistent relay service modes remain explicit.
3. Regress success/error/TERM/KILL/frozen deadline, live owner exclusion, PID reuse, malformed state, concurrent stale recovery, non-owner/double release, CLI error cleanup.
4. Preimage-checked relay-file-only live install with backup; no web app deployment, browser restart or env/pacing changes. Verify both doctors, no-send evidence and unchanged protected state.
5. Durable branch/evidence and checkpoint rerun assessment; do not start experiment.

Preinstall verification: 24 focused/adjacent tests, 200 complete relay tests, 299 canonical repository tests pass; deterministic audit has no findings. The first focused run had one fixture that exited naturally before simulating watchdog-loss liveness; the corrected fixture keeps the helper running and proves exit 70, while the added uncaught-error case proves normal exit cleanup. Preinstall live baseline: ../evidence/2026-09-13-relay-lock-preinstall.json. Other task reserved PRIMARY at 00:07:37.965Z after last direct send 00:01:43.997Z. Both protected-state hashes stable during doctors; ledger 79 records, valid, queue empty, epoch 3 PRIMARY.

## Dashboard visibility consideration

Expose safe owner/task/deadline through CLI status and contention errors (health journal). Do not redeploy the dashboard for this lock-only repair. Assess whether the existing health-detail route can carry bounded owner information without topology changes; document exact supported surface and limits.
