# Mission Control Codex preview-readiness privileged handoff

Status: BLOCKED ONLY ON EXECUTION-SURFACE PRIVILEGE  
Classification: NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT  
Recorded: 2026-09-19

## Owner authorization already in force

The owner already approved:
- reversible NON-PRODUCTION installation on the authorized SECONDARY;
- scoped Codex preview enablement for the intended worker(s);
- first naturally occurring harmless local filesystem/terminal task as the first CODEX_LOCAL pilot.

Do not ask again for those approvals merely because prior attempts stopped at compatibility, lease, or execution-surface failures.

Still unauthorized:
- production mutation;
- PRIMARY/browser-fence release/bypass/weakening;
- paid API inference or API-key fallback;
- synthetic/fabricated "natural" pilot or model smoke;
- broadening browser/MCP capability.

## Canonical state at this checkpoint

Fresh-read default-branch AGENTS.md and current task-relevant patterns before acting.

Current main at capture:
`48eb5422a23574c2895daf3eb21eaa04f65e7200`

Installed Mission Control central image on the authorized SECONDARY:
`sha256:20b46fc34e471db6eb779844ea35fb915813437c9b320d6d9756ea2aa293f64e`

Central scheduler live read from the SECONDARY at this checkpoint:
- schedulerState: ACTIVE_LEASE
- active epoch: 5
- active role: SECONDARY
- lease: `lease:issue90-secondary-epoch5:b93b09c5-d3cc-493a-9e82-9cb7de1b1140`
- split-brain: SINGLE_ACTIVE_CONFIRMED
- queueDepth: 0
- activeAdmission: null
- unresolvedAdmission: null
- relayTargetTransition: CLEAR
- safetyHalt: null
- lastSubmissionAt: `2026-09-17T21:55:26.258Z`

The central event chain and scheduler ledger had already passed exact historical-byte verification before this checkpoint.

## New factual finding: relay installation is incomplete

Direct live inspection of the authorized SECONDARY showed:

1. The central Mission Control container is current and healthy.
2. The live relay package under:
   `/home/cloudbrowser/.local/share/mission-control-chatgpt-relay/app`
   predates the accepted Codex execution integration:
   - `src/codex-exec-candidate.mjs` is absent;
   - `MC_CODEX_EXEC_PREVIEW_ENABLED` support is absent.
3. The current relay env under:
   `/home/cloudbrowser/.config/mission-control-chatgpt-relay/env`
   is dormant historical PRIMARY/epoch-3 configuration, not epoch-5 SECONDARY configuration.
4. Registered worker identity already exists:
   `mission-control-live-slice`
   from current relay registries.
5. The operator account has Codex CLI 0.154.0 and subscription auth, but the dedicated `cloudbrowser` service account cannot currently access either.
6. The current `cloudbrowser` relay/browser service instances were inactive at this inspection. Re-read exact live state before mutation; do not rely on the earlier statement that browser service was active.

These findings mean preview cannot be enabled safely by flipping one flag. The relay package/config/service-account runtime must first be brought to the accepted current-main implementation.

## Exact current-main relay package staging proof

An exact package was staged from current main using:
`git archive 48eb5422a23574c2895daf3eb21eaa04f65e7200 tools/codex-mission-control/vps-browser-relay`

Observed archive SHA-256:
`4f8b5f17e81742167cbe23c77b5160e88ebd7c437e8d5e04f2617ed68b031e51`

The staged package contains:
- `src/codex-exec-candidate.mjs`;
- `MC_CODEX_EXEC_PREVIEW_ENABLED` configuration support.

The temporary staging path used by Chat was:
`/tmp/mc-relay-preview.BfMtnV`

Treat that path as disposable. Recreate from exact current main if absent.

## Why Chat stopped

The connected Remote Desktop Commander currently lists `sudo` as a blocked command. Cross-user operations into `cloudbrowser` are therefore rejected.

Chat deliberately did NOT:
- modify Remote Desktop Commander security settings;
- bypass the command block;
- mutate the `cloudbrowser` relay tree;
- copy subscription credentials;
- extract worker tokens;
- start browser/relay services;
- enable preview;
- cross a provider boundary.

This is an execution-surface privilege limitation, not an architecture/owner-authority blocker.

## Residual privileged execution

Use an authorized privileged Work/SSH execution surface.

### 1. Revalidate before mutation

Fresh-read:
- current main;
- current epoch/lease status;
- queue/admission/transition/safety state;
- browser fence/PRIMARY state;
- exact central installed image/source parity;
- relay/browser service states.

Stop if authority is no longer epoch-5 single-active SECONDARY or any ambiguity gate is non-clean.

### 2. Install the exact current-main relay package atomically

Use the repository-supported:
`tools/codex-mission-control/vps-browser-relay/scripts/install-user-service.sh`
for user `cloudbrowser`, or an exactly equivalent atomic install.

Requirements:
- source must be exact current main at action time;
- preserve existing relay app as rollback;
- keep services stopped during the swap;
- do not alter browser fence;
- do not enable provider sending;
- verify installed app contains the accepted Codex automatic-dispatch path.

If main advanced only by unrelated instructions, current reviewed executable bytes may still be used only after exact diff review. Prefer fresh current main.

### 3. Provision Codex runtime for `cloudbrowser`

Use the already-qualified ChatGPT-subscription Codex CLI path. Do not use API keys.

The service account must have:
- an executable Codex CLI;
- a private source Codex home containing valid ChatGPT subscription auth;
- no `OPENAI_API_KEY` or `CODEX_API_KEY` fallback.

Do not print credential contents in logs/receipts.

The accepted runner itself copies only `auth.json` into an ephemeral per-attempt runtime home and deletes that runtime after execution/setup failure.

### 4. Use the existing scoped WORKER authority

Do not create a new worker identity.

Worker:
`mission-control-live-slice`

Use the already-provisioned Mission Control WORKER credential for exactly that worker. Retrieve it only through the privileged supported deployment/config path; never expose the token in terminal output, Git, or owner-facing receipts.

Expected env binding includes:
- `MC_CODEX_EXEC_WORKER_ID=mission-control-live-slice`
- producer identity scoped as the existing worker;
- existing exact WORKER token;
- current Mission Control URL;
- current Codex binary/source home.

### 5. Rebind dormant relay env to current authority

The old PRIMARY/epoch-3 values must NOT be used.

Bind the active relay env to the fresh current central lease read:
- role SECONDARY;
- current active host alias;
- current deployment epoch;
- current active lease ID;
- exact shared pacing domain;
- submit enabled = 0;
- capability-test enabled = 0;
- preview enabled = 1 only for the intended worker;
- default preview remains off elsewhere.

Preserve existing valid collector token and target-binding attestor only if they still match the current authenticated relay registration.

### 6. No-send readiness

Do not fabricate a model task.

Bring up only the minimum runtime required for automatic local directive discovery, while provider sending remains impossible.

If the standard relay service mechanically requires the browser service, re-use the already-reviewed service topology; do not weaken/remove the dependency merely to make preview work.

Before declaring ready verify:
- epoch remains current single-active SECONDARY;
- chain + scheduler ledger valid;
- queue 0;
- unresolved admission null;
- target transition CLEAR;
- safety halt null;
- provider sends 0 during this step;
- last provider boundary unchanged;
- preview on only for intended scope;
- submit/capability-test remain 0;
- subscription auth works via a non-inference `codex login status`;
- API-key fallback absent;
- rollback exact;
- PRIMARY/browser fence unchanged;
- production untouched.

### 7. Stop waiting for a natural pilot

Do not manufacture the first task.

Terminal target:
`READY_WAITING_FOR_FIRST_NATURAL_CODEX_LOCAL: YES`

Then stop and return factual receipt to Chat.

## First natural pilot evidence later

When a genuinely natural harmless local task arrives, capture:
- exact source/task/directive identity;
- selected Work profile;
- authenticated admission and mayExecute;
- trusted setter evidence;
- persisted preflight;
- CODEX_LOCAL route;
- start/terminal receipt;
- scope/stop compliance;
- absence of API-key fallback;
- ephemeral auth cleanup;
- allowance delta if observable;
- rollback/legacy fallback state.

Do not add further synthetic qualification before that.
