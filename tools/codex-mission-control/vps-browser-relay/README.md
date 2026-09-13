# Mission Control VPS ChatGPT Browser Relay

Status: portable active/passive VPS browser relay implementation.

The relay moves persistent ChatGPT supervision tabs off the owner's interactive workstation while preserving the controlling authority split:

```text
Chat = reasoning / supervision
Work or Codex = bounded execution only
Mission Control = admission, durable state, provenance, and routing
VPS browser relay = no-content UI orchestration only
GitHub = durable supervisor decision receipt bus
```

The accepted Personal Pro paths use one reusable browser tab and a new provider
conversation for every mandatory external-tool stage:

```text
ordinary:
MC binding preload -> fresh GPT-5.6 Sol / Extra High 4-of-5 GitHub read/decision/write -> Mission Control

escalated, durable stage bus:
MC binding preload -> fresh GPT-5.6 Sol / Extra High 4-of-5 GitHub reader -> #61 reader receipt
                   -> fresh GPT-5.6 Sol / Extra High 4-of-5 semantic reasoner -> #61 decision receipt
                   -> fresh GPT-5.6 Sol / Extra High 4-of-5 exact writer -> #59 -> Mission Control

controller-mediated Project Manager return:
completed MC binding preload -> exact origin target -> #61 exact OWNER-byte artifact
                             -> permanent PM exact target -> #61 exact PM artifact
                             -> exact prior origin target, fresh decision chat -> #59 -> Mission Control
```

GitHub is the handoff between stages. Conversation history is never required for
an external-tool operation. The relay never reads, copies, hashes, parses,
summarizes, or transports assistant response text.

The controller-mediated route is an explicit, one-cycle command path. It uses
GitHub as the only semantic mailbox. Its owner-only restart ledger stores exact
target/window/session identities, send boundaries, immutable comment identities,
and content digests, but no prompt or assistant-output bodies. The origin and Project Manager reasoning chats
perform their own ordinary GitHub reads and writes; the controller never reads
assistant output. A completed browser generation is transport evidence only and
cannot advance an artifact state or complete a cycle.

## Browser-relay invariants

### Relay-lock lifecycle and temporary helpers

Linux Node.js 22+ and `/usr/bin/flock` (util-linux) are required. The relay holds
a kernel lock on the persistent `relay.lock.guard` inode; **never delete that
guard file**. The accompanying `relay.lock` is owner metadata, not permission to
send. Kernel ownership is released by process/file-descriptor lifecycle, including
SIGKILL. Stale JSON is reclaimed only under the kernel guard and only when the
recorded PID is dead or its boot-ID/start-ticks identity no longer matches.
Legacy live PIDs, unreadable owners, and malformed metadata fail closed. Stop all
old-version relay/helper processes before upgrading; do not run mixed lock versions.

Use `mc-chatgpt-relay.mjs lock-status` for a current read-only lock-owner check,
even while another command holds the relay. `status` also refreshes this field.
Both expose PID, parent PID, exact Linux start ticks/boot ID, task, acquisition
time, and deadline, without arguments, environment, tokens or private chat IDs.
Contention errors include these fields in the existing health-service journal.
The web dashboard still exposes its existing unavailable/degraded health state;
this relay-only change does not add a new dashboard panel or deploy the web app.
Operators must use the lock diagnostics to distinguish authorized busy work from
an orphan; an unavailable health tick alone is not grounds to kill a helper.

Library users automatically receive a 30-minute finite lifetime. Temporary tests
should bind an explicit non-secret task ID and the shortest adequate budget:

```js
await stateStore.acquireLock({ taskId: 'cadence:authorized-task-id', maxLifetimeMs: 600_000 });
try {
  // Only the already-authorized test. This example grants no send authority.
} finally {
  await stateStore.releaseLock();
}
```

An independent watchdog terminates the exact expired owner with SIGTERM, then
SIGKILL after five seconds only if the same PID/start/boot identity remains.
It also covers a frozen/blocked event loop. Losing the watchdog fails the helper
closed. Success, error, normal process exit, SIGINT, SIGTERM and SIGHUP clean only
the exact owner's metadata; failed acquisition/double release cannot unlink a
successor. CLI one-shots release in `finally`; only explicit `run` and
`controller-run` service modes use unbounded ownership. A one-shot can set
`MC_RELAY_LOCK_MAX_MS` (1..86400000 ms) when its authorized operation requires a
different bounded lifetime. It never shortens global pacing or clears ambiguous
send intents; after interruption the normal doctor/ledger gates still apply.

For a historical incident, first establish exact process/task ownership and
current activity. Do not terminate an active authorized test to unblock another
task. If it has already exited, do not reconstruct missing descriptors or invent
a kill. For an actual abandoned owner, verify PID/start/task evidence, prefer
SIGTERM, and use stronger termination only after proven failure and orphanhood.
Never manually unlink an actively held lock or fail over to bypass it. A stale
metadata recovery is not permission to replay any interrupted send.

- One persistent Brave/Chrome/Chromium profile, not one browser per supervisor.
- Chrome DevTools Protocol is loopback-only (`127.0.0.1`).
- A dedicated non-default browser profile is mandatory.
- Only registered exact `https://chatgpt.com/c/<conversation-id>` URLs are managed.
- Chat configuration registers identity, worker binding, challenge ID, and the fixed visible consumer controls: model `GPT-5.6 Sol`, `Thinking effort` = `Extra High` (`4 of 5`). `Pro` is account-plan provenance only and is never treated as a reasoning-mode control. Configuration cannot self-declare capability PASS.
- Live capability evidence must prove Mission Control read, GitHub read, GitHub write, and exact visible model-label switching.
- Model switching and generation state are observed only through non-content controls/UI state.
- A generation turn cannot become COMPLETE unless a real post-submit generation-start transition was observed first.
- No transcript/message selectors are used after submission. A clicked-but-unverified submission remains ambiguous and blocks replay.
- Browser control does not claim hidden backend model identity; it records only the exact visible UI label.
- Binding preload selects and verifies Mission Control. Downstream route-v4 decision messages reference the connected GitHub tool without selecting a composer chip (`APP_SELECTION_NOT_ATTEMPTED`); this is the accepted backend receipt policy. The two-source capability probe selects Mission Control and references GitHub. App-chip state never supplies semantic authority.
- Before Send, the relay compares the exact prepared input, including paragraph and line breaks, against the queued prompt. Only known plain-text composer structures are accepted; unsupported markup or a different body fails before submission. This check reads only the input composer, never assistant output.
- Prompt bodies, cookies, tokens, and assistant output are never stored in relay logs/state.
- Mission Control reads are restricted to worker IDs explicitly bound in `chats.json`; the relay does not request all-worker fleet authority.
- Every actual ChatGPT message send requires a durable, single-use admission from
  the loopback central scheduler. The default and minimum interval is 60 seconds,
  configurable through 600 seconds.
- Capability prompts, binding preloads, every fresh reasoning/GitHub stage,
  controller sends, and stuck-turn recovery use the same durable FIFO queue.
  Host-local state remains recovery evidence but is not the pacing authority.
- Cooldown checks never sleep inside the state machine. They return `GLOBAL_SUBMISSION_COOLDOWN` with `retryAfterMs` and `nextSubmissionAt`, and no click or route-authority mutation occurs.
- Controller cycles bind every browser operation to one persisted target ID,
  automation-window ID, and expected current URL. They never select a target by
  active/latest/first position or matching URL. Same-URL collisions and unowned
  targets fail closed.
- Before any controller send is replayed after restart, the relay reconciles the
  exact cycle/kind/nonce GitHub artifact across the complete issue history and
  re-reads the immutable comment by ID. A post-intent send with no exact artifact
  remains ambiguous and is never replayed automatically.
- The controller persists its global pacing boundary and cycle-specific click
  boundary from the immediate post-click browser callback. If the process stops
  before generation returns, it recovers only through the already-bound exact
  target/window identity and a causal root-to-conversation transition; it does
  not select a replacement target.
- GitHub artifact waits use a durable 90-second polling lease and a lower-bound
  `since` filter. Rapid controller polling does not amplify unauthenticated API
  reads, and a global submission cooldown is checked before consumed-artifact
  revalidation.

## Model-agnostic stuck-chat recovery

Long ChatGPT turns can stop making progress after extended reasoning or many tool calls even though the admitted objective is not finished. Recovery is a transport concern and applies to **any current model or registered supervisor chat**, including Extra High, Pro, Project Manager, and specialist turns.

The relay uses two non-content UI signals:

1. **active generation stall** — the turn remains continuously in generation state for the full `MC_RELAY_GENERATION_TIMEOUT_MS` interval (default 15 minutes). The relay safely invokes the visible Stop-generation control, waits for the composer to become idle, then sends exactly `continue` in the same conversation and current model;
2. **recoverable idle control** — the turn returns to an idle composer but a visible control is exactly labeled `Continue`, `Continue generating`, `Resume`, `Retry`, or `Try again`. The relay treats that as unfinished and sends `continue` without changing model.

The relay never searches transcript text to make this determination. It examines only composer/generation controls and exact known recovery-control labels.

Recovery is capped by `MC_RELAY_STUCK_RECOVERY_MAX_NUDGES` (default 3, configurable 1–20) for one continuously stalled turn. This prevents an unbounded quota-burning loop. A failed or ambiguous recovery send is not automatically replayed.

Mandatory external-tool stages opt out of same-chat recovery. If their normal UI
turn ends without the expected durable #59/#61 receipt, the state machine waits
for the reconciliation grace period and may replay the immutable stage only as a
new first message in a fresh provider conversation. The bounded attempt ceiling
still applies.

These `continue` messages are transport recovery, **not** Mission Control guard verdicts. They never grant execution authority or bypass owner decisions, admission gates, spend/access boundaries, release/safety gates, or ambiguity states.

All recovery nudges pass through the same global submission cooldown as normal supervision and capability testing. A relay restart retains the last successful click/generation-start boundary in `state.json`, so restart cannot create an immediate burst.

### Operator recovery before a direct decision was sent

A failed mandatory route-v4 decision never retries automatically. For an explicit
`resolve <route-key> retry`, a `FAILED_RETRYABLE` decision may reuse its completed
binding only when its failure is mechanically `PREPARING`: the failed session has
no assigned conversation URL or STARTED/COMPLETE evidence, the global pacer is
older than the attempt, and the current server-observed route, tool receipt and
binding envelope all match. The operator recovery preserves the failed attempt,
restores the existing completed-binding state, and lets the normal relay create
one new decision conversation. It does not repeat the preload or reset pacing.
Unknown, expired, mismatched or possibly submitted decision evidence fails closed
before changing state. This is not an automatic retry of missing semantic output.

### Remaining semantic-liveness boundary

A visually normal idle turn with no recovery control can still be semantically incomplete. Browser UI state cannot prove otherwise without reading assistant content, which this relay deliberately does not do. Mission Control therefore must not equate `GENERATION_COMPLETE` with semantic task completion. Durable #59/#61 receipts are the completion signal.

## Capability proof

A chat starts UNVERIFIED. The capability challenge is intentionally two-source:

- the ChatGPT custom app named `Mission Control` exposes an MC nonce plus the
  SHA-256 and source location of a GitHub nonce through the exact-bound
  `get_capability_challenge` MCP tool;
- the raw GitHub nonce exists only in the configured GitHub capability issue;
- Extra High must read both systems and write one canonical capability receipt back to GitHub;
- Mission Control validates the two nonces, exact chat/challenge binding, authorized GitHub writer, and expiry;
- the relay separately proves the fixed model selector and thinking slider immediately before each send; there is no Pro-mode selection or mode round trip.

The diagnostic public HTTP challenge route remains exact-ID, GET-only,
uncached, and returns only the same disposable challenge fields. The relay
prompt requires the MCP app tool, not that HTTP route. Neither public read path
exposes worker state, timelines, credentials, owner sessions, task or decision
content, or arbitrary evidence references. The authenticated
`/api/workers/<worker>` route remains the only outer route for a worker
snapshot. Every admitted cycle gets a fresh provider conversation by using New
chat in the current verified reusable ChatGPT tab. A transport-only
`MCP_BINDING_PRELOAD` turn selects Mission Control and calls
`get_supervisory_request_binding` exactly once for the request, stable
supervisor, and provider session. Semantic direct/reader work is forbidden
until that turn completes, its server-observed current-session tool receipt is
visible in Mission Control, and the global submission interval has elapsed.
The relay then derives a bounded hashed binding capsule in transport state and
opens a new conversation in the same tab for each downstream stage. Route-v4
decision first messages reference the connected GitHub tool and copy the exact
capsule without a selected composer chip; legacy staged routes still select
GitHub. Downstream stages do not select Mission Control. `binding_provider_session_id` names the preload session,
while each `stage_provider_session_id` names one downstream conversation.
Substantive evidence and every canonical write remain in GitHub. Generic MCP
traffic, app-chip state, prose, a stale capsule, or cross-session evidence cannot
satisfy admission.

Use the dedicated harmless command while normal task sends remain disabled:

```bash
MC_RELAY_CAPABILITY_TEST_ENABLED=1 \
~/.local/share/mission-control-chatgpt-relay/app/bin/mc-chatgpt-relay.mjs mcp-preflight <chat-id>

MC_RELAY_CAPABILITY_TEST_ENABLED=1 \
~/.local/share/mission-control-chatgpt-relay/app/bin/mc-chatgpt-relay.mjs capabilities <chat-id>
```

`MC_RELAY_SUBMIT_ENABLED=0` may remain unchanged during this test.
The first command performs only the paced, Extra High, read-only MCP tool call. Verify
that call in the Mission Control access telemetry before running the second command,
which performs the distinct GitHub capability receipt proof.

For this repository the machine-readable buses are:

- harmless capability challenge/receipts: GitHub issue #60.
- canonical ordinary and escalated decisions: GitHub issue #59.
- legacy/current staged compatibility and diagnostics: GitHub issue #61.

Production policy must centrally allowlist the exact repository, those issue numbers, and authorized GitHub writer login(s). Worker-supplied GitHub destinations never grant authority.

## Mission Control decision admission

A GitHub supervisor decision becomes authoritative only when Mission Control validates all applicable bindings:

- one outstanding decision request;
- request ID and one-time nonce;
- evidence capsule ID/hash;
- current owner-outcome ID/epoch/hash;
- stable supervisor ID, distinct binding/decision provider-session IDs, exact conversation URLs, and reasoning lane;
- current Mission Control/GitHub capability receipt;
- current fixed GPT-5.6 Sol / Thinking effort Extra High, 4 of 5 receipts;
- a server-observed binding-preload MCP request-binding read in the binding provider session;
- an exact mechanically derived binding envelope recorded in Mission Control transport state;
- one direct first-message decision transport receipt with the fixed consumer-control proof, so stale or cross-session evidence cannot replay;
- ordered no-content browser-stage receipts;
- central GitHub repository/issue/writer policy;
- receipt creation time inside the admitted window;
- canonical decision digest and no-reinterpretation writer contract.

For a new escalated semantic lane, the fresh session uses the same fixed
GPT-5.6 Sol / Thinking effort Extra High, 4 of 5 controls, reads immutable
GitHub evidence, and writes canonical #59 directly in its first message.
Mission Control labels this conservative provenance
`VISIBLE_GPT_5_6_SOL_EXTRA_HIGH_4_OF_5_SESSION_GITHUB_ATTESTED`; it binds visible
UI/session transport and the GitHub receipt without claiming hidden provider-
backend model identity. The account-plan label Pro is metadata only.
Schema-v3 staged #61 flows remain supported for compatibility but are not
required by the direct route-v4 topology.

Webhook ingestion is the fast path. Periodic GitHub issue polling is reconciliation for missed webhooks. Public repositories can use low-frequency reconciliation without a GitHub token.

## Mission Control submission authority and failover

The Mission Control daemon is the only global provider-send authority. Its
single-writer SQLite store persists the FIFO queue, single-use admissions,
actual browser boundaries, account-wide provider rate-limit state, exact target
bindings, active deployment lease/epoch, and hash-chained append-only ledger.
Both VPS relays call the authenticated `/api/submission-authority` route on the
same Mission Control origin. No host-local scheduler service or scheduler
credential exists. The relay fails closed when Mission Control is absent,
unreachable, stale, bound to another host/epoch, rate-limit paused, or carrying
unresolved ambiguity.

Keep the standby relay disabled during ordinary operation. A controlled
takeover is an operator transaction, never a network-partition guess:

1. stop and disable the old relay, prove it and its browser are quiescent, and
   leave both disabled through the whole takeover;
2. reconcile open/ambiguous admissions;
3. read the last boundary and lease from Mission Control without copying or
   forking that ledger;
4. activate a successor lease in Mission Control at exactly the prior epoch
   plus one, binding the prior lease/host and proven quiescence;
5. bind the takeover record to the exact old `expiresAt`, wait until that old
   lease has expired, preserve the exact `lastBoundaryAt`, and wait a full minimum interval after
   the later of that boundary and the quiescence proof, even when pacing state
   transferred successfully;
6. verify the shared no-send status from the successor, then start its relay.

Takeover durably cancels every unadmitted `QUEUED` or
`PRECLICK_RETRY_PENDING` item. The successor may re-enqueue only the same
logical request with its new host-owned target; changed request bytes or target
ownership fail closed. An admitted-but-unresolved item remains an ambiguity and
blocks takeover.

Do not perform automatic failover when the prior host cannot be proven stopped.
A successor rejects activation before the exact prior lease expiry even when
quiescence and pacing transfer are otherwise proven. This makes an accidental
restart of the disabled old relay fail closed on its stale lease.
A same-lease renewal may only extend `expiresAt`; changing host, epoch, issue
time, or takeover evidence requires a new fenced lease.

## Memory policy

The relay detects host memory and does not assume a particular VPS size.

`MC_RELAY_MEMORY_PROFILE=AUTO` selects:

- `< 12 GB total RAM` -> conservative 8 GB profile;
- `>= 12 GB total RAM` -> 16 GB profile.

Approximate 8 GB relay boundaries:

| Control | 8 GB profile |
|---|---:|
| Available-memory soft floor | 2048 MB |
| Available-memory hard floor | 1024 MB |
| Browser RSS soft ceiling | 4096 MB |
| Browser RSS hard ceiling | 5120 MB |
| Swap soft ceiling | 256 MB |
| Swap hard ceiling | 768 MB |

Systemd templates use RAM-relative limits; a deployment-specific system-manager
browser wrapper may remain stricter. Never add `--no-sandbox`.

## Required environment

- Linux with `/proc` and systemd.
- Node.js 22+.
- Brave, Google Chrome, or Chromium.
- A graphical session on the remote execution host for the initial ChatGPT login.
- Mission Control reachable by HTTPS, or by loopback HTTP carried entirely
  inside a host-to-host authenticated SSH tunnel. Plain remote HTTP is invalid.
- A dedicated Mission Control machine credential with producer kind `COLLECTOR`, scoped only to the registered worker IDs and required evidence task scope.

Do not reuse owner, UI, worker, or human-supervisor credentials for the relay.

## Install

From a checkout containing this directory:

```bash
cd tools/codex-mission-control/vps-browser-relay
./scripts/install-user-service.sh
```

The installer creates owner-only locations under:

```text
~/.local/share/mission-control-chatgpt-relay/app
~/.config/mission-control-chatgpt-relay
~/.local/state/mission-control-chatgpt-relay
~/.local/share/mission-control-chatgpt-profile
```

It does not enable live task submission by itself.

### Configure Mission Control access

Edit:

```bash
nano ~/.config/mission-control-chatgpt-relay/env
```

Keep normal sends disabled initially. Configure a distinct source-bound
Mission Control credential for this host and its exact host/epoch identity;
the submission-authority URL defaults to `/api/submission-authority` on this
same Mission Control origin. The same producer ID must be bound centrally to
this host role and its initial automation window/target set. Mission Control
durably advances that binding for signed ordinary target changes, observed
disappearance, or full browser-window replacement. Recovery-only changes are
allowed for a passive relay against the exact active-lease snapshot, but its
sends remain fenced. All relay bearers and target attestors must be pairwise
distinct across both hosts:

```text
MC_RELAY_PRODUCER_ID=collector:chatgpt-relay
MC_RELAY_TOKEN=<dedicated 32+ character token>
MC_RELAY_TARGET_BINDING_ATTESTOR_KEY=<different host-unique 32+ character secret>
MC_RELAY_SUBMISSION_PACING_DOMAIN=<exact Mission Control pacing domain>
MC_RELAY_HOST_ALIAS=<portable deployment alias>
MC_RELAY_HOST_ROLE=PRIMARY
MC_RELAY_DEPLOYMENT_EPOCH=1
MC_RELAY_DEPLOYMENT_LEASE_ID=<exact active lease ID>
MC_RELAY_SUBMIT_ENABLED=0
MC_RELAY_CAPABILITY_TEST_ENABLED=0
MC_RELAY_MEMORY_PROFILE=AUTO
MC_RELAY_STUCK_RECOVERY_MAX_NUDGES=3
```

### Register exact chats

When the owner has authorized creation of a new Mission Control-only chat but
no conversation locator exists yet, put a strict `registrationState:
"PROVISIONING"` entry in owner-only `provisions.json`. It must use a unique
`provider-session:provisioning:*` key and must contain no URL, chat ID, or
bootstrap capability. Put the harmless first message in an owner-only file and
run:

```bash
$relay provision <supervisor-id> <message-file>
```

The command obtains the shared Mission Control admission before browser
mutation, enforces the fixed consumer controls, observes only the send and
generation controls, and stores the resulting locator in owner-only
`provisioned-chats.json`. It does not print the locator or read assistant
output. Install the generated active registrations as `chats.json` and
`MISSION_CONTROL_SUPERVISOR_CHATS_JSON`, then remove the provisioning entries
and restart Mission Control before ordinary relay work.

For an already active registration, edit:

```bash
nano ~/.config/mission-control-chatgpt-relay/chats.json
```

Each entry must contain:

- stable `supervisorId` matching Mission Control `destinationSupervisorId`;
- unique `registrationId`, exact `ownership: "MISSION_CONTROL_ONLY"`, dedicated
  purpose, private account/workspace aliases, private-locator reference, and
  owner registration provenance;
- `bootstrapCapability.chatId`, `.url`, and `.challengeId` for the existing capability proof only;
- exact `workerId`;
- the configured exact current GPT-5.6 Sol / Thinking effort Extra High, 4 of 5 controls, with Pro recorded only as account-plan provenance.
- exact visible Mission Control and GitHub app labels under `requiredApps`.

Personal, shared-purpose, legacy-unclassified, or ambiguous chats are invalid
even when their URL is syntactically correct. Do not put PASS/FAIL capability
claims in this file; Mission Control evidence determines capability truth.

### Authenticate the browser profile

From the remote execution host's graphical desktop terminal:

```bash
systemctl --user stop mission-control-chatgpt-browser.service
set -a
source ~/.config/mission-control-chatgpt-relay/browser-env
set +a
~/.local/share/mission-control-chatgpt-relay/app/scripts/launch-browser.sh
```

Sign in manually to the intended ChatGPT account and open the registered chats. Do not copy a laptop cookie database to the VPS.

### Start browser and inspect without sending

```bash
systemctl --user enable --now mission-control-chatgpt-browser.service
set -a
source ~/.config/mission-control-chatgpt-relay/env
set +a
relay=~/.local/share/mission-control-chatgpt-relay/app/bin/mc-chatgpt-relay.mjs
$relay doctor
$relay once
```

For one explicitly admitted controller-mediated PM cycle, create an owner-only
JSON spec that pins the cycle/task/request, worker/origin/PM identities, exact
route event and body digest, #61 artifact channel, two unique artifact nonces,
and authorized GitHub writer login(s). Then use the dedicated commands:

```bash
$relay controller-init /owner-only/path/exact-cycle-spec.json
$relay controller-once <cycle-id>
# or poll the same durable cycle until exact GitHub/Mission Control completion:
$relay controller-run <cycle-id>
```

`controller-init` requires an already completed binding preload. While any
controller cycle is nonfinal, ordinary `once`/`run` refuses to advance that
route. Keep the normal service disabled and use a narrow one-shot
`MC_RELAY_SUBMIT_ENABLED=1` override for live acceptance.

Normal pre-live outcomes include `READY`, `IDLE`, `CAPABILITY_NOT_VERIFIED`, and `DRY_RUN_ROUTE_READY`. These are informative fail-closed states, not reasons to enable submission prematurely.

### Run harmless capability verification

After the central Mission Control challenge is configured:

```bash
sed -i 's/^MC_RELAY_CAPABILITY_TEST_ENABLED=.*/MC_RELAY_CAPABILITY_TEST_ENABLED=1/' \
  ~/.config/mission-control-chatgpt-relay/env
$relay capabilities <chat-id>
```

Confirm the GitHub capability receipt was ingested and Mission Control reports current read/read/write + mode-switch capabilities. Then disable capability-test sending again if desired.

### Enable bounded task sending

Only after capability proof and exact destination verification:

```bash
sed -i 's/^MC_RELAY_SUBMIT_ENABLED=.*/MC_RELAY_SUBMIT_ENABLED=1/' \
  ~/.config/mission-control-chatgpt-relay/env
systemctl --user enable --now mission-control-chatgpt-relay.service
```

For persistence after logout/reboot:

```bash
sudo loginctl enable-linger "$USER"
```

If a host disables unprivileged user namespaces and Chromium therefore cannot
start under the user unit with its SUID sandbox, keep
`MC_RELAY_BROWSER_DISABLE_SETUID_SANDBOX=0`. After the same user has run the
installer above, an administrator can install the supplied system-manager
compatibility units:

```bash
sudo ~/.local/share/mission-control-chatgpt-relay/app/scripts/install-system-services.sh "$USER"
sudo systemctl enable --now "mission-control-chatgpt-browser@$USER.service"
sudo systemctl enable --now "mission-control-chatgpt-health@$USER.timer"
```

The system-service installer resolves the selected account through the local
passwd database and pins that exact home directory in per-instance drop-ins.
This is required because `%h` in a system-manager template names the manager's
home, not the home of `User=%i`. It also pins one validated Node.js 22+ runtime
instead of relying on an interactive-shell PATH. If automatic runtime discovery
is not unique, set `MC_RELAY_NODE_BIN` to the exact executable for the install.
The browser's writable path is likewise taken from the browser-only environment
file and must resolve to a non-symlinked dedicated profile beneath that account.

This mode still runs Chromium and the relay as the dedicated unprivileged user.
It sets `NoNewPrivileges=false` only for the browser so Chromium's owned,
setuid-root sandbox helper can perform its required transition; the relay keeps
`NoNewPrivileges=true`, and both units retain strict filesystem, kernel,
resource, and namespace protections. Do not add `--no-sandbox` or
`--disable-setuid-sandbox` in this mode. Keep the relay unit stopped until the
central lease and live no-send checks pass.

The independent health timer is safe to run while provider sending stays
disabled. Once per minute it authenticates to Mission Control with that host's
existing scoped collector credential and reports only browser, relay, exact
authority-binding, host-role, and epoch status. It sends no ChatGPT message and
includes no target ID, conversation locator, cookie, token, or private host
address in its output.

## Operations

```bash
systemctl --user status mission-control-chatgpt-browser.service
systemctl --user status mission-control-chatgpt-relay.service
journalctl --user -u mission-control-chatgpt-relay.service -f
cat ~/.local/state/mission-control-chatgpt-relay/status.json
```

For a system-manager installation, inspect the independent health reporter with:

```bash
sudo systemctl status "mission-control-chatgpt-health@$USER.timer"
sudo systemctl status "mission-control-chatgpt-health@$USER.service"
```

The status record reports hashes, queue state, browser/memory state, capability state, stuck-recovery metadata, ambiguity state, and `browserTabs.managedChatGptTabCount` with the 1/2/3 steady/transition/hard limits. It does not contain ChatGPT response content.

`centralScheduler` and `submissionPacing` appear in doctor/status output with the
active host/epoch, durable queue head/depth, unresolved admission, safety halt,
minimum interval, persisted last-submission time, remaining delay, and next
eligible submission time. `GLOBAL_SUBMISSION_COOLDOWN` is a normal fail-safe
retry state. The shared authority ledger additionally reports recent/minimum/
median observed intervals, violations, rate-limit/retry state, and terminal
delivery/recovery status. The outer relay loop retries the same immutable queue
item on its next poll instead of creating a second queue identity.

### Ambiguous submissions

A click without a durable observed generation-start transition becomes ambiguous. Automatic replay is prohibited.

```bash
$relay resolve 'request:<request-id>' submitted
$relay resolve 'request:<request-id>' retry
$relay resolve 'request:<request-id>' discard
```

Use `retry` only after an operator has independently established that re-submission is safe.

## Memory trial

Keep one managed ChatGPT tab in steady state. New provider conversations use New chat in that current verified reusable tab. A bounded transition or replacement recovery may temporarily use two tabs; three is the absolute hard ceiling, and the relay fails closed before opening a fourth. Verify a replacement before immediately closing the superseded automation-owned tab, never fan out duplicate tabs for one task, and clean completed sessions back toward one. Capture browser/service memory and relay status during representative fixed-control peaks.

PASS requires:

- no sustained hard-pressure pauses;
- no swap thrashing;
- Mission Control remains responsive;
- exact outbound prompts are delivered at most once unless explicitly resolved;
- inactive registered tabs are reclaimed before the VPS destabilizes.

A hard-pressure pause is successful safety behavior, not automatic permission to raise limits.

## Security boundary

- Never expose CDP port 9222 publicly.
- Keep the browser profile, env, chat directory, and relay state owner-only.
- Do not rotate proxy/IP identity, clone authenticated profiles, or run concurrent relays against one profile.
- Do not use this package for rate-limit circumvention, account sharing, or high-volume unattended messaging.
- Browser UI evidence is transport evidence, not backend-model attestation.
- Durable GitHub stage-receipt attestation is not independent browser observation of Pro output.

### Current exact-label policy (2026-09-05)

Current live registries must use `consumerControls` exactly as shown in `chats.example.json`: `GPT-5.6 Sol`, `Thinking effort`, `Extra High`, `4 of 5`, and account-plan `Pro` as `PROVENANCE_METADATA_ONLY` with `accountPlanIsReasoningMode=false`. The internal `PRO_ESCALATED` lane is a semantic policy lane, not a selectable UI mode. Old `modelLabels` / `expectedModels`, `6 Pro`, and Pro-mode round-trip records remain historical evidence only and are not live-send eligible. A missing or ambiguous exact control fails closed; another live surface change requires a new source-bound disposition before sending.
