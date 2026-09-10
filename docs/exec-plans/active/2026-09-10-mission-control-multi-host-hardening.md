# Mission Control multi-host infrastructure hardening

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT**
The controls promoted to `patterns/mission-control-multi-host-submission-scheduling.md`
are portable. Provider choices, RAM sizes, revisions and live topology below are
evidence for one owner only.

Status: ACTIVE_BLOCKED
Assurance lane: RELEASE (code, merge, two-host installation)
Owner requirement: `docs/requirements/2026-09-10-mission-control-multi-host-hardening.owner-requirement.json`

## Active lesson contract

| Trigger | Required behavior | Enforcement point |
|---|---|---|
| Owner-visible Mission Control behavior | Trace every change and terminal claim to RO-MCHOST-001 through RO-MCHOST-009; proxies cannot satisfy the requirement. | requirement validator, focused tests, completion matrix |
| Any ChatGPT browser send | One central scheduler queue issues a single-use admission before browser mutation and records the crossed boundary; no direct send path exists. | relay scheduler, exhaustive send-path test |
| Two execution hosts | Exactly one active lease/epoch; secondary stays fail closed; uncertain quiescence or state transfer blocks takeover, and takeover waits the full post-quiescence safety interval. | config parser, scheduler admission, failover tests, installed status |
| Supervisor chat selection | Require explicit `MISSION_CONTROL_ONLY` conversation ownership and registration provenance in addition to exact automation-owned target/window proof. | registry validation and pre-send admission |
| Browser automation | Preserve exact owned window/target isolation, loopback CDP, native sandbox and bounded provider rate-limit recovery. | existing browser tests plus affected regressions |
| Owner computer boundary | Remote execution hosts only; no local browser window/tab and no clipboard API or command. | source scan, deployment receipt, runtime process evidence |
| Public repository portability | Portable role aliases and parameters in patterns/templates; isolate and label all one-owner facts `NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT`; never commit secrets or private locators. | repository audit, secret/privacy diff review |
| Deployment | Exact reviewed commit only, rollback preserved, no production or third-host mutation. | package hash/commit parity and host receipts |
| Execution workers | Routine Mission Control work execution, not only browser relay transport, runs on the authorized remote host; absent a supported remote worker runtime, this remains an explicit blocker rather than an inferred success. | installed worker-runtime process/config evidence |

## Execution sequence

1. Freeze pre-change Hostinger timestamp/queue evidence and two-host inventory.
2. Implement the smallest centralized active/passive scheduler, per-send admission ledger, deployment lease and MC-only chat ownership validation.
3. Add portable architecture guidance and explicitly isolated owner-deployment evidence.
4. Run focused tests, full relay/app/repository gates, privacy scan and independent diff review.
5. Open PR, follow hosted checks, merge when green, and verify canonical commit.
6. Install the exact merged relay/controller candidate on Netcup primary and Hostinger standby with rollback.
7. Run no-send health plus deterministic scheduler/ownership proofs on both hosts; keep standby and persistent send gates disabled unless a separately admitted live send is required.
8. Update requirement/current state with exact evidence and remaining real blockers only.

## Recovery ledger

- Fresh canonical base: `2c6f4da5a49487e77665f25d58a65957b26cd130`.
- Latest integrated `origin/main` during the task: `6369412b3259b3caa8bb03361776940432fd25b1`.
- Task branch: `task/mission-control-netcup-primary-20260910`.
- Existing Hostinger installed revision before this task: `eb5e12880933ebab89081141b60f410a1ab00888`.
- Hostinger pre-change browser service: active; relay service: inactive/disabled; persistent normal and capability gates: disabled.
- Hostinger retained exact click-boundary history currently contains 24 unique sends from 2026-09-03 through 2026-09-09; minimum retained interval is 92,928 ms and zero retained intervals are below 60,000 ms.
- Pre-change architecture gap: the 60-second pacer, promise queue and state lock are host-local; there is no cross-host lease or fresh central admission record for every send.
- Reviewed deployed candidate: commit `23f732be374cae7ee21c391bc6fabb6a65e06531`, relay tree `91aa2901715fd205611d8d47cd5c5cf1b66e0c73`, package SHA-256 `953ebfc0f7542d803f50fef6c115e97e4eefd440c9cc336201ce3c354a8437f3`.
- The same exact candidate is installed on both hosts and passed 155/155 relay tests on each. Netcup browser health is green; Hostinger browser remains disabled/fail-closed at the service-sandbox boundary. Both schedulers and relays are disabled.
- PR #91 was independently reviewed with no remaining release blocker and all hosted checks were green at the reviewed candidate. Final evidence changes require the normal check rerun before merge.
- Durable evidence: `docs/evidence/2026-09-10-owner-deployment-multi-host-hardening.json`.
- Production remains untouched and unauthorized.

## Genuine remaining blockers

1. Netcup needs one owner-completed remote ChatGPT login/MFA and creation/registration of real MC-only supervisor chats. Copying browser authentication from Hostinger is forbidden.
2. The available Codex host inventory has no supported arbitrary-VPS execution-worker host. The browser relay/controller is not evidence that Mission Control workers themselves moved off the local host.
3. Hostinger's systemd service sandbox blocks Brave. A direct native-sandbox launch succeeds, but changing the protected `LockPersonality` control is an owner security tradeoff and was not authorized.

Do not enable a scheduler or relay, claim completion, or promote outside the two authorized VPS hosts until these are resolved.
