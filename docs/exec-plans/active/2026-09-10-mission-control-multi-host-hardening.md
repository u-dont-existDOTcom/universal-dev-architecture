# Mission Control multi-host infrastructure hardening

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT**
The controls promoted to `patterns/mission-control-multi-host-submission-scheduling.md`
are portable. Provider choices, RAM sizes, revisions and live topology below are
evidence for one owner only.

Status: LIVE_ACCEPTANCE_PASSED_RELEASE_CLOSEOUT_PENDING
Assurance lane: RELEASE (code, merge, two-host installation)
Owner requirement: `docs/requirements/2026-09-10-mission-control-dual-vps-global-send-queue.owner-requirement.json`

## Active lesson contract

| Trigger | Required behavior | Enforcement point |
|---|---|---|
| Owner-visible Mission Control behavior | Trace every change and terminal claim to RO-MCHOST-001 through RO-MCHOST-009; proxies cannot satisfy the requirement. | requirement validator, focused tests, completion matrix |
| Any ChatGPT browser send | One shared authority in Mission Control's existing single-writer control plane issues a single-use admission before browser mutation and records the crossed boundary; no direct or host-local authority path exists. | Mission Control daemon/BFF, relay client, exhaustive send-path test |
| Two execution hosts | Exactly one active lease/epoch; secondary stays fail closed; uncertain quiescence or state transfer blocks takeover, and takeover waits the full post-quiescence safety interval. | config parser, scheduler admission, failover tests, installed status |
| Supervisor chat selection | Require explicit `MISSION_CONTROL_ONLY` conversation ownership and registration provenance in addition to exact automation-owned target/window proof. | registry validation and pre-send admission |
| Standing conversation-creation authority | Create and privately register required dedicated MC-only supervisor conversations without another owner approval; never adopt a personal/user chat. | owner-specific topology, registry write, exact target binding |
| Work technical permissions | Work selects the owner-authorized broad task-scoped access level and automatic reviewer itself; ask only for a genuine tradeoff, explained plainly with a recommendation. Direct product security prompts remain a user boundary and cannot be self-approved. | root/nested instructions, permissions pattern, effective task receipt |
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
- On 2026-09-12 the owner added standing authority for automatic creation and private registration of the required MC-only conversations and for Work to select Full Access (or the broadest task-scoped equivalent) itself. This removes repeat conversational approval but does not permit a worker to self-approve a direct app security gate.
- PR #99 merged the recovered shared-authority implementation as `8635b88c605b70c2840e4528879d3a18b3a57998`; the exact historical branch remains at `cb89966b83f12db49d974de4ebf402d10d310608`.
- The post-merge live candidate is `b2a1d68057e2493d2e0135b85d2f41069727b696`. Its Mission Control sources match the active primary container, and its deployable relay contents match both hosts except for the two intentionally excluded repository-only scheduler re-export fixtures.
- Netcup now reports `READY`; Hostinger reports `STANDBY_READY`. Both have one exact automation-owned ChatGPT target, zero foreign targets, loopback-only browser control, native sandboxing, and no host-local scheduler process.
- Three exact owner-registered MC-only conversations are privately active on both hosts. The real failover epoch sequence is PRIMARY → SECONDARY → PRIMARY, with a real SECONDARY send and fresh post-recovery standby fencing.
- Concurrent admissions admitted PRIMARY once and denied SECONDARY. A real boundary followed by a Mission Control restart denied an early retry and produced the next real boundary 76,819 ms later.
- The hash-chained ledger is valid with four live intervals: 112,535 ms, 1,210,629 ms, 10,153,453 ms, and 76,819 ms; zero are below the configured or absolute 60-second floor.
- The naturally observed provider rate-limit path used one bounded retry on the same durable queue item. Personal/unregistered/wrong-registration, foreign-target, and wrong-window live probes all failed before send.
- Fresh Codex CLI tasks ran successfully as unprivileged remote workers on both VPS hosts with automatic review. No workstation browser, personal tab, or clipboard path was used.
- Fresh current-main integration gates pass locally: repository 299/299 plus audit/diff check; Mission Control 232/232 plus TypeScript/build; relay 184/184 plus syntax.
- Durable live receipt: `docs/evidence/2026-09-12-owner-deployment-multi-host-live-acceptance.json`.

## Remaining release closeout

1. Commit and publish the privacy-safe live receipt on the current-main integration branch without changing the historical recovery branch.
2. Open the pull request and require every exact-head hosted repository, Mission Control, relay, and CodeQL gate.
3. Only after those checks pass, mark the frozen requirements `LIVE_VERIFIED`, merge normally, verify `main`, post the final issue receipt, and close issue #90.

No live acceptance blocker remains. Do not claim canonical completion before the hosted-check and merge boundary, and do not promote outside the two authorized VPS hosts.
