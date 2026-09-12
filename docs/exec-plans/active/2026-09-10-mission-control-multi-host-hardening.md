# Mission Control multi-host infrastructure hardening

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT**
The controls promoted to `patterns/mission-control-multi-host-submission-scheduling.md`
are portable. Provider choices, RAM sizes, revisions and live topology below are
evidence for one owner only.

Status: CORRECTION_IMPLEMENTATION_IN_PROGRESS_LIVE_ACCESS_BLOCKED
Assurance lane: RELEASE (code, merge, two-host installation)
Owner requirement: `docs/requirements/2026-09-10-mission-control-dual-vps-global-send-queue.owner-requirement.json`

## Active lesson contract

| Trigger | Required behavior | Enforcement point |
|---|---|---|
| Owner-visible Mission Control behavior | Trace every change and terminal claim to RO-MCHOST-001 through RO-MCHOST-009; proxies cannot satisfy the requirement. | requirement validator, focused tests, completion matrix |
| Any ChatGPT browser send | One shared authority in Mission Control's existing single-writer control plane issues a single-use admission before browser mutation and records the crossed boundary; no direct or host-local authority path exists. | Mission Control daemon/BFF, relay client, exhaustive send-path test |
| Two execution hosts | Exactly one active lease/epoch; secondary stays fail closed; uncertain quiescence or state transfer blocks takeover, and takeover waits the full post-quiescence safety interval. | config parser, scheduler admission, failover tests, installed status |
| Supervisor chat selection | Require explicit `MISSION_CONTROL_ONLY` conversation ownership and registration provenance in addition to exact automation-owned target/window proof. | registry validation and pre-send admission |
| Browser automation | Preserve exact owned window/target isolation, loopback CDP, native sandbox and bounded provider rate-limit recovery. | existing browser tests plus affected regressions |
| Owner computer boundary | Remote execution hosts only; no local browser window/tab and no clipboard API or command. | source scan, deployment receipt, runtime process evidence |
| Public repository portability | Portable role aliases and parameters in patterns/templates; isolate and label all one-owner facts `NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT`; never commit secrets or private locators. | repository audit, secret/privacy diff review |
| Deployment | Exact reviewed commit only, rollback preserved, no production or third-host mutation. | package hash/commit parity and host receipts |
| Execution workers | Routine Mission Control work execution, not only browser relay transport, runs on the authorized remote host; absent a supported remote worker runtime, this remains an explicit blocker rather than an inferred success. | installed worker-runtime process/config evidence |

## Execution sequence

1. Freeze pre-change Hostinger timestamp/queue evidence and two-host inventory.
2. Correct the PR #91 host-local schedulers by moving the validated algorithm into Mission Control's existing single-writer SQLite control plane; retain only a host-local defense-in-depth pacer on each VPS.
3. Add portable architecture guidance and explicitly isolated owner-deployment evidence.
4. Run focused tests, full relay/app/repository gates, privacy scan and independent diff review.
5. Open PR, follow hosted checks, merge when green, and verify canonical commit.
6. Install the exact merged relay/controller candidate on Netcup primary and Hostinger standby with rollback.
7. Run no-send health plus deterministic scheduler/ownership proofs on both hosts; keep standby and persistent send gates disabled unless a separately admitted live send is required.
8. Update requirement/current state with exact evidence and remaining real blockers only.

## Recovery ledger

- Fresh canonical base: `2c6f4da5a49487e77665f25d58a65957b26cd130`.
- Latest inspected live `origin/main` during the correction: `e8c1279bdb77f4f81f2c9c0f5e2ba6295f7d3696`.
- Task branch: `task/mission-control-netcup-primary-20260910`.
- Existing Hostinger installed revision before this task: `eb5e12880933ebab89081141b60f410a1ab00888`.
- Hostinger pre-change browser service: active; relay service: inactive/disabled; persistent normal and capability gates: disabled.
- Hostinger retained exact click-boundary history currently contains 24 unique sends from 2026-09-03 through 2026-09-09; minimum retained interval is 92,928 ms and zero retained intervals are below 60,000 ms.
- Pre-change architecture gap: the 60-second pacer, promise queue and state lock are host-local; there is no cross-host lease or fresh central admission record for every send.
- Reviewed deployed candidate: commit `23f732be374cae7ee21c391bc6fabb6a65e06531`, relay tree `91aa2901715fd205611d8d47cd5c5cf1b66e0c73`, package SHA-256 `953ebfc0f7542d803f50fef6c115e97e4eefd440c9cc336201ce3c354a8437f3`.
- The same exact candidate is installed on both hosts and passed 155/155 relay tests on each. Netcup browser health is green; Hostinger browser remains disabled/fail-closed at the service-sandbox boundary. Both schedulers and relays are disabled.
- PR #91 was independently reviewed with no remaining release blocker and all hosted checks were green at the reviewed candidate. Final evidence changes require the normal check rerun before merge.
- Canonical `main` at correction start is merge commit `0ac26e4e2f06271c3acad9cc6ad60421ebde1cf9`; correction branch is `task/mission-control-shared-global-send-authority-20260911`.
- Correction trigger: PR #91 installed a separate loopback scheduler and durable state file on each host. Manual ledger transfer plus active/passive service discipline did not satisfy the frozen requirement for one shared live Mission Control authority seen identically by both hosts.
- Current correction candidate relocates the scheduler algorithm into the Mission Control package, stores current authority state plus a hash-chained append-only ledger in the Mission Control SQLite writer, exposes authenticated `/api/submission-authority` routes, reuses one queue item for the bounded rate-limit retry, and removes the deployable VPS scheduler service/binary.
- Current reviewed correction revision: `7c990cd1aa440a23a73df8621186c63c92e0ffa5`; relay tree `897005453ede967fa573f29ab7c6ed9e44702776`; Mission Control tree `a47cc7d5fd0e83c9ee5b495bea62f0f1d90d3a9d`.
- Exact inert relay packages and Mission Control images from that revision are installed on both authorized VPS hosts with rollback preserved, no relay process, no host-local scheduler process, and no active Mission Control container.
- Exact-head hosted checks passed independently on both hosts: 266 repository tests plus audit, 177 source-relay tests, 147 installed-relay tests, relay syntax, 228 Mission Control tests, TypeScript, and production build.
- The refreshed Hostinger owner-only state still has the same 24 click boundaries, 23 intervals, 92,928 ms minimum, zero intervals below 60 seconds, and the same privacy-safe state digest.
- Netcup's dedicated native-sandbox browser is loopback-only and has one reusable ChatGPT tab, but its session is not authenticated. Hostinger has no active browser. Both hosts have zero live MC-only owner registrations and no configured target-binding attestor; Netcup also lacks its PRIMARY config binding.
- No local or remote clipboard process was observed, and this correction used only GitHub APIs/CLI plus the authorized SSH/direct-transfer wrappers. The workstation browser was not invoked.
- Durable evidence: `docs/evidence/2026-09-10-owner-deployment-multi-host-hardening.json`.
- Production remains untouched and unauthorized.

## Genuine remaining blockers

1. Netcup needs one owner-completed remote ChatGPT login/MFA and creation/registration of real MC-only supervisor chats. Copying browser authentication from Hostinger is forbidden. Until that exists, exact automation-owned target bindings and the real central producer/attestor map cannot be completed.
2. The available Codex host inventory exposes only the local desktop host, and neither VPS relay owner has a Codex CLI or worker process. The browser relay/controller is not evidence that Mission Control workers themselves moved off the local host.
3. Hostinger's systemd service sandbox blocks Brave. A direct native-sandbox launch previously succeeded, but changing the protected `LockPersonality` control is an owner security tradeoff and was not authorized.
4. Consequently the real central authority cannot yet be activated and the required live cross-host claim race, restart pacing, failover fencing, provider-boundary interval, and secondary browser cases remain blocked. Deterministic or synthetic fixtures are not live acceptance substitutes.

Do not enable a scheduler or relay, claim completion, or promote outside the two authorized VPS hosts until these are resolved.
