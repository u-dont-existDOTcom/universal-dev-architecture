# Mission Control VPS ChatGPT Browser Relay

Status: draft live-acceptance implementation for the Hostinger browser VPS.

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
MC binding preload -> fresh Extra High GitHub read/decision/write -> Mission Control

escalated, durable stage bus:
MC binding preload -> fresh Extra High GitHub reader -> #61 reader receipt
                   -> fresh Pro GitHub reasoner -> #61 Pro decision receipt
                   -> fresh Extra High GitHub exact writer -> #59 -> Mission Control
```

GitHub is the handoff between stages. Conversation history is never required for
an external-tool operation. The relay never reads, copies, hashes, parses,
summarizes, or transports assistant response text.

## Browser-relay invariants

- One persistent Brave/Chrome/Chromium profile, not one browser per supervisor.
- Chrome DevTools Protocol is loopback-only (`127.0.0.1`).
- A dedicated non-default browser profile is mandatory.
- Only registered exact `https://chatgpt.com/c/<conversation-id>` URLs are managed.
- Chat configuration registers identity, worker binding, challenge ID, and configured exact visible Extra High / Pro-lane labels; configuration cannot self-declare capability PASS.
- Live capability evidence must prove Mission Control read, GitHub read, GitHub write, and exact visible model-label switching.
- Model switching and generation state are observed only through non-content controls/UI state.
- A generation turn cannot become COMPLETE unless a real post-submit generation-start transition was observed first.
- No transcript/message selectors are used after submission. A clicked-but-unverified submission remains ambiguous and blocks replay.
- Browser control does not claim hidden backend model identity; it records only the exact visible UI label.
- Every message clears any prior configured app chips, then reselects and verifies the exact app required by that first-message decision stage: Mission Control for binding preload and GitHub for every downstream mandatory GitHub read/write. The two-source capability probe retains its Mission Control selection and exact GitHub routing reference because the app picker is single-choice. App state is never treated as conversation-sticky or as semantic authority.
- Prompt bodies, cookies, tokens, and assistant output are never stored in relay logs/state.
- Mission Control reads are restricted to worker IDs explicitly bound in `chats.json`; the relay does not request all-worker fleet authority.
- Every actual ChatGPT message send shares one persisted global cooldown. The default minimum interval is 60 seconds, configurable with `MC_RELAY_MIN_SUBMISSION_INTERVAL_MS` from 15,000 through 600,000 ms.
- Capability prompts, binding preloads, and every fresh Extra High/Pro GitHub stage use the same gate. The relay-wide process lock and a narrow in-process serialized gate allow only one send path to cross at once.
- Cooldown checks never sleep inside the state machine. They return `GLOBAL_SUBMISSION_COOLDOWN` with `retryAfterMs` and `nextSubmissionAt`, and no click or route-authority mutation occurs.

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
- the relay separately proves the configured exact visible Extra High / Pro-lane labels by a mode-selection round trip.

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
opens a new conversation in the same tab for each downstream stage. Every
downstream first message selects GitHub and copies the exact capsule; it does not
select Mission Control. `binding_provider_session_id` names the preload session,
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
- current configured exact visible Extra High / Pro-lane model-label receipts;
- a server-observed binding-preload MCP request-binding read in the binding provider session;
- an exact mechanically derived binding envelope recorded in Mission Control transport state;
- one direct first-message decision transport receipt with configured exact visible Extra High or Pro-lane proof, so stale or cross-session evidence cannot replay;
- ordered no-content browser-stage receipts;
- central GitHub repository/issue/writer policy;
- receipt creation time inside the admitted window;
- canonical decision digest and no-reinterpretation writer contract.

For new Pro escalation, the fresh visible-Pro session reads immutable GitHub
evidence and writes canonical #59 directly in its first message. Mission
Control labels this conservative provenance
`VISIBLE_PRO_SESSION_GITHUB_ATTESTED`; it binds visible UI/session transport and
the GitHub receipt without claiming hidden provider-backend model identity.
Schema-v3 staged #61 flows remain supported for compatibility but are not
required by the direct route-v4 topology.

Webhook ingestion is the fast path. Periodic GitHub issue polling is reconciliation for missed webhooks. Public repositories can use low-frequency reconciliation without a GitHub token.

## Memory policy

The actual Hostinger browser VPS was observed at roughly 7.9 GB total RAM, so the relay no longer assumes 16 GB.

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

Systemd templates use RAM-relative limits; the live Hostinger system-manager browser wrapper may remain stricter. Never add `--no-sandbox`.

## Required environment

- Linux with `/proc` and systemd.
- Node.js 22+.
- Brave, Google Chrome, or Chromium.
- A graphical Hostinger desktop session for the initial ChatGPT login.
- Mission Control reachable by HTTPS.
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

Keep normal sends disabled initially:

```text
MC_RELAY_PRODUCER_ID=collector:chatgpt-relay
MC_RELAY_TOKEN=<dedicated 32+ character token>
MC_RELAY_SUBMIT_ENABLED=0
MC_RELAY_CAPABILITY_TEST_ENABLED=0
MC_RELAY_MEMORY_PROFILE=AUTO
MC_RELAY_STUCK_RECOVERY_MAX_NUDGES=3
```

### Register exact chats

Edit:

```bash
nano ~/.config/mission-control-chatgpt-relay/chats.json
```

Each entry must contain:

- stable `supervisorId` matching Mission Control `destinationSupervisorId`;
- `bootstrapCapability.chatId`, `.url`, and `.challengeId` for the existing capability proof only;
- exact `workerId`;
- configured exact current visible Extra High / Pro-lane labels.
- exact visible Mission Control and GitHub app labels under `requiredApps`.

Do not put PASS/FAIL capability claims in this file; Mission Control evidence determines capability truth.

### Authenticate the browser profile

From the Hostinger graphical desktop terminal:

```bash
systemctl --user stop mission-control-chatgpt-browser.service
set -a
source ~/.config/mission-control-chatgpt-relay/env
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

## Operations

```bash
systemctl --user status mission-control-chatgpt-browser.service
systemctl --user status mission-control-chatgpt-relay.service
journalctl --user -u mission-control-chatgpt-relay.service -f
cat ~/.local/state/mission-control-chatgpt-relay/status.json
```

The status record reports hashes, queue state, browser/memory state, capability state, stuck-recovery metadata, ambiguity state, and `browserTabs.managedChatGptTabCount` with the 1/2/3 steady/transition/hard limits. It does not contain ChatGPT response content.

`submissionPacing` appears in doctor/status output with the configured minimum interval, persisted last-submission time, remaining delay, and next eligible submission time. `GLOBAL_SUBMISSION_COOLDOWN` is a normal fail-safe retry state; the outer relay loop retries on its next poll instead of blocking inside a send.

### Ambiguous submissions

A click without a durable observed generation-start transition becomes ambiguous. Automatic replay is prohibited.

```bash
$relay resolve 'request:<request-id>' submitted
$relay resolve 'request:<request-id>' retry
$relay resolve 'request:<request-id>' discard
```

Use `retry` only after an operator has independently established that re-submission is safe.

## Memory trial

Keep one managed ChatGPT tab in steady state. New provider conversations use New chat in that current verified reusable tab. A bounded transition or replacement recovery may temporarily use two tabs; three is the absolute hard ceiling, and the relay fails closed before opening a fourth. Verify a replacement before immediately closing the superseded automation-owned tab, never fan out duplicate tabs for one task, and clean completed sessions back toward one. Capture browser/service memory and relay status during real Extra High and Pro peaks.

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

For `mc-hotfix-specialist`, explicitly configure `modelLabels.extraHigh` as `Extra High` and `modelLabels.pro` as `6 Pro`; coordinate any independent hotfix `expectedModels` policy for that same supervisor. The internal lane remains `PRO_ESCALATED` and provenance remains conservative visible-UI/session provenance. `Pro` and `6 Pro` are not aliases, and neither proves a hidden/backend model identity. A missing or ambiguous exact label fails closed; another live label change during this acceptance run stops the run without another policy rotation. The superseding record is `docs/requirements/2026-09-05-current-exact-pro-label.owner-requirement.json`. The 2026-09-03 owner requirement and old `Pro` receipts remain unchanged historical evidence.
