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

The accepted Personal Pro paths are:

```text
ordinary:
Extra High read -> reason -> GitHub decision write -> Mission Control

escalated, same conversation:
Extra High reader -> Pro reasoner -> Extra High exact writer
                  -> GitHub decision write -> Mission Control
```

The conversation history is the handoff between Extra High and Pro. The relay never reads, copies, hashes, parses, summarizes, or transports assistant response text.

## Browser-relay invariants

- One persistent Brave/Chrome/Chromium profile, not one browser per supervisor.
- Chrome DevTools Protocol is loopback-only (`127.0.0.1`).
- A dedicated non-default browser profile is mandatory.
- Only registered exact `https://chatgpt.com/c/<conversation-id>` URLs are managed.
- Chat configuration registers identity, worker binding, challenge ID, and expected visible Extra High/Pro labels; configuration cannot self-declare capability PASS.
- Live capability evidence must prove Mission Control read, GitHub read, GitHub write, and exact visible model-label switching.
- Model switching and generation state are observed only through non-content controls/UI state.
- A generation turn cannot become COMPLETE unless a real post-submit generation-start transition was observed first.
- No transcript/message selectors are used after submission. A clicked-but-unverified submission remains ambiguous and blocks replay.
- Browser control does not claim hidden backend model identity; it records only the exact visible UI label.
- Every message clears any prior configured app chips, then reselects and verifies the exact Mission Control chip when fresh MCP data is required. The current ChatGPT Tools catalog exposes app choices as one radio selection, so GitHub is kept as an exact configured label and explicitly referenced in GitHub-reading/writing prompts rather than replacing the required Mission Control chip. App state is never treated as conversation-sticky or as semantic authority.
- Prompt bodies, cookies, tokens, and assistant output are never stored in relay logs/state.
- Mission Control reads are restricted to worker IDs explicitly bound in `chats.json`; the relay does not request all-worker fleet authority.
- Every actual ChatGPT message send shares one persisted global cooldown. The default minimum interval is 60 seconds, configurable with `MC_RELAY_MIN_SUBMISSION_INTERVAL_MS` from 15,000 through 600,000 ms.
- Capability prompts, Extra High reader/direct/writer prompts, Pro reasoner prompts, liveness-check prompts, and every automatic `continue` use the same gate. The relay-wide process lock and a narrow in-process serialized gate allow only one send path to cross at once.
- Cooldown checks never sleep inside the state machine. They return `GLOBAL_SUBMISSION_COOLDOWN` with `retryAfterMs` and `nextSubmissionAt`, and no click or route-authority mutation occurs.

## Model-agnostic stuck-chat recovery

Long ChatGPT turns can stop making progress after extended reasoning or many tool calls even though the admitted objective is not finished. Recovery is a transport concern and applies to **any current model or registered supervisor chat**, including Extra High, Pro, Project Manager, and specialist turns.

The relay uses two non-content UI signals:

1. **active generation stall** — the turn remains continuously in generation state for the full `MC_RELAY_GENERATION_TIMEOUT_MS` interval (default 15 minutes). The relay safely invokes the visible Stop-generation control, waits for the composer to become idle, then sends exactly `continue` in the same conversation and current model;
2. **recoverable idle control** — the turn returns to an idle composer but a visible control is exactly labeled `Continue`, `Continue generating`, `Resume`, `Retry`, or `Try again`. The relay treats that as unfinished and sends `continue` without changing model.

The relay never searches transcript text to make this determination. It examines only composer/generation controls and exact known recovery-control labels.

Recovery is capped by `MC_RELAY_STUCK_RECOVERY_MAX_NUDGES` (default 3, configurable 1–20) for one continuously stalled turn. This prevents an unbounded quota-burning loop. A failed or ambiguous recovery send is not automatically replayed.

Separately, the two Extra High decision-writing steps (`EXTRA_HIGH_DIRECT` and `EXTRA_HIGH_WRITER`) have an objective durable completion signal: the canonical GitHub decision receipt. If their normal UI turn ends but that receipt is still absent after five minutes, the same-chat state machine may issue its one bounded `continue` fallback.

These `continue` messages are transport recovery, **not** Mission Control guard verdicts. They never grant execution authority or bypass owner decisions, admission gates, spend/access boundaries, release/safety gates, or ambiguity states.

All recovery nudges pass through the same global submission cooldown as normal supervision and capability testing. A relay restart retains the last successful click/generation-start boundary in `state.json`, so restart cannot create an immediate burst.

### Remaining semantic-liveness boundary

A visually normal idle turn with no recovery control can still be semantically incomplete. Browser UI state cannot prove otherwise without reading assistant content, which this relay deliberately does not do. Mission Control therefore must not equate `GENERATION_COMPLETE` with semantic task completion. Durable task/stage receipts are the correct completion signal; the next control-plane slice adds stage-completion/continue-required receipts for intermediate same-chat stages.

## Capability proof

A chat starts UNVERIFIED. The capability challenge is intentionally two-source:

- the ChatGPT custom app named `Mission Control` exposes an MC nonce plus the
  SHA-256 and source location of a GitHub nonce through the exact-bound
  `get_capability_challenge` MCP tool;
- the raw GitHub nonce exists only in the configured GitHub capability issue;
- Extra High must read both systems and write one canonical capability receipt back to GitHub;
- Mission Control validates the two nonces, exact chat/challenge binding, authorized GitHub writer, and expiry;
- the relay separately proves the exact visible Extra High and Pro labels by a mode-selection round trip.

The diagnostic public HTTP challenge route remains exact-ID, GET-only,
uncached, and returns only the same disposable challenge fields. The relay
prompt requires the MCP app tool, not that HTTP route. Neither public read path
exposes worker state, timelines, credentials, owner sessions, task or decision
content, or arbitrary evidence references. The authenticated
`/api/workers/<worker>` route remains the only outer route for a worker
snapshot. Every admitted cycle gets a fresh provider conversation. Its first
Extra High turn selects Mission Control and calls `get_supervisory_request_binding`
exactly once for the request, stable supervisor, and provider session. Later
Pro, liveness, continue, and writer turns reuse that same-chat binding and do
not select or invoke Mission Control. Substantive evidence and every canonical
write remain in GitHub.

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

- canonical decision receipts: GitHub issue #59;
- harmless capability challenge/receipts: GitHub issue #60.

Production policy must centrally allowlist the exact repository, those issue numbers, and authorized GitHub writer login(s). Worker-supplied GitHub destinations never grant authority.

## Mission Control decision admission

A GitHub supervisor decision becomes authoritative only when Mission Control validates all applicable bindings:

- one outstanding decision request;
- request ID and one-time nonce;
- evidence capsule ID/hash;
- current owner-outcome ID/epoch/hash;
- stable supervisor ID, fresh provider-session ID, exact conversation URL, and reasoning lane;
- current Mission Control/GitHub capability receipt;
- a session-local exact visible Extra High → Pro → Extra High model-switch receipt;
- a server-observed first-turn MCP request-binding read for the same provider session;
- session-bound ordered transport/stage receipts, so old-session evidence cannot replay;
- ordered no-content browser-stage receipts;
- central GitHub repository/issue/writer policy;
- receipt creation time inside the admitted window;
- canonical decision digest and no-reinterpretation writer contract.

For Pro escalation, Mission Control labels the Pro-content provenance `SAME_CHAT_WRITER_ATTESTED` with `independent_pro_observation:false`. The browser does not independently observe Pro output.

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
- exact current visible Extra High and Pro labels.
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

The status record reports hashes, queue state, browser/memory state, capability state, stuck-recovery metadata, and ambiguity state. It does not contain ChatGPT response content.

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

Start with the Project Manager plus two specialist tabs, then expand only if headroom remains stable. Capture browser/service memory and relay status during real Extra High and Pro peaks.

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
- GitHub same-chat writer attestation is not independent provider-direct proof of Pro output.
