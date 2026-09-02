# Mission Control VPS ChatGPT Browser Relay

Status: bounded outbound implementation for a 16 GB Hostinger VPS.

This package moves the persistent ChatGPT supervision browser off the owner laptop. It reads only already-authorized `MISSION_CONTROL_INTERNAL_SUPERVISOR_ROUTE_V1` packets from Mission Control, opens the exact registered `chatgpt.com/c/...` conversation in one dedicated VPS browser profile, submits the exact queued bytes, and records a local transport receipt.

It is deliberately **outbound-browser-only**. It does not read, copy, summarize, hash, parse, or import assistant output. Mission Control remains the ledger and admission boundary; ChatGPT remains the reasoning surface; this process is only a control and transport mechanism. The return path is a direct ChatGPT-to-GitHub write followed by GitHub webhook ingestion or periodic reconciliation polling.

For an ordinary decision the relay selects Extra High once and sends one tiny read/reason/write control prompt. For an admitted escalated decision it advances a persisted same-chat state machine: Extra High reader prompt, generation-complete observation, Pro reasoner prompt, generation-complete observation, Extra High writer prompt, generation-complete observation, then Mission Control receipt polling. It never moves response text between turns because all turns share one conversation context.

## Implemented invariants

- One persistent Brave/Chrome/Chromium profile, not one browser per supervisor.
- Chrome DevTools Protocol listens on `127.0.0.1` only.
- The remote-debug browser always uses a dedicated non-default user-data directory.
- Only registered exact conversation URLs are managed.
- Only Mission Control route packets with the canonical prefix and `QUEUED_FOR_PROVIDER_RELAY` state are eligible.
- Route identity is the Mission Control request ID; body integrity is SHA-256 over the exact queued bytes.
- Before the send click, a durable `SUBMISSION_INTENT_RECORDED` journal entry is fsynced through an atomic state-file replacement.
- If the process dies after intent but before confirmation, automatic replay is blocked. The next run searches only user-authored message DOM for the exact outbound body; it never inspects assistant output.
- A composer containing unrelated text is never overwritten.
- Wrong conversation URLs, login pages, missing composer/send controls, disabled send controls, and incomplete confirmation fail closed.
- At most three registered tabs remain hot by default. Inactive managed tabs are closed least-recently-used under pressure.
- New sends stop at the hard memory boundary. The browser cgroup supplies an independent hard backstop.
- Tokens, cookies, prompt bodies, and assistant output are never written to logs. Local state stores hashes and metadata, not queued body text.
- Mission Control reads are limited to worker IDs explicitly bound in `chats.json`; the relay never requests the all-worker fleet projection.
- Every supervisor chat registers passed test receipts for Mission Control read, GitHub read, GitHub write, and model/mode switching. Missing or untested capabilities fail configuration and doctor checks closed.
- Model/mode switching and generation completion are observed only through controls and busy/stop/composer state; assistant message nodes and response text are never inspected.
- The Extra High writer is instructed to use `EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY` with no reinterpretation.

## 16 GB operating envelope

Defaults:

| Control | Default |
|---|---:|
| System available-memory soft floor | 4096 MB |
| System available-memory hard floor | 2048 MB |
| Browser RSS soft ceiling | 7168 MB |
| Browser RSS hard ceiling | 9216 MB |
| Swap soft ceiling | 512 MB |
| Swap hard ceiling | 1536 MB |
| Normal hot registered tabs | 3 |
| Browser service `MemoryHigh` | 9 GB |
| Browser service `MemoryMax` | 11 GB |
| Combined browser/relay slice `MemoryMax` | 12 GB |

`MemoryHigh` throttles first; `MemoryMax` is the last line of defense. The intent is to leave roughly 4 GB for the OS and unrelated VPS services instead of discovering the limit through swap thrashing.

## Required environment

- Linux with `/proc` and `systemd --user`.
- Node.js 22 or later. The package has no npm dependencies.
- Brave, Google Chrome, or Chromium.
- A graphical Hostinger cloud-browser/desktop session for the first ChatGPT login. `xvfb-run` is an acceptable unattended display after the profile is authenticated.
- Mission Control reachable by HTTPS.
- A dedicated machine credential registered in Mission Control's `MISSION_CONTROL_INGEST_CREDENTIALS`. Use producer kind `SYSTEM`, bind it only to the worker IDs listed in `chats.json`, and give it a distinct token. The relay calls only the existing scoped `mission_control_get_worker` MCP tool; it does not request the all-worker fleet projection.

The producer kind is a compatibility choice for the current Mission Control credential schema, not proof of a system or ChatGPT reasoning identity. The first smoke credential is scoped only to `mission-control-live-slice`; do not reuse an owner, UI, worker, or human-supervisor token.

Every chat entry used as a route source must set `workerId`. A Project Manager chat may remain pinned, but at least one entry in the directory must bind each worker whose route packets the relay is allowed to read.

## Install on the Hostinger VPS

From a checkout containing this directory:

```bash
cd tools/codex-mission-control/vps-browser-relay
./scripts/install-user-service.sh
```

The installer creates:

```text
~/.local/share/mission-control-chatgpt-relay/app
~/.config/mission-control-chatgpt-relay/env
~/.config/mission-control-chatgpt-relay/chats.json
~/.local/state/mission-control-chatgpt-relay
~/.local/share/mission-control-chatgpt-profile
```

It installs but does not automatically start the browser or relay. That prevents an unconfigured placeholder URL from becoming live.

### 1. Configure Mission Control access

Edit:

```bash
nano ~/.config/mission-control-chatgpt-relay/env
```

Set the dedicated token and leave submission disabled:

```text
MC_RELAY_PRODUCER_ID=system:chatgpt-relay-reader
MC_RELAY_TOKEN=<dedicated 32+ character token>
MC_RELAY_SUBMIT_ENABLED=0
```

### 2. Register exact chats and scoped workers

Edit:

```bash
nano ~/.config/mission-control-chatgpt-relay/chats.json
```

Each `chatId` must exactly match the `destinationChatId` used by Mission Control. Each URL must be a concrete `https://chatgpt.com/c/<conversation-id>` URL. Set `workerId` on the specialist entry for every worker to be read. Register the exact current UI labels for Extra High and Pro. Record a passed capability-test receipt for Mission Control read, GitHub read, GitHub write, and mode switching; placeholders or untested capabilities prevent startup. The Project Manager chat is pinned; inactive specialist chats may be closed and reopened by URL.

### 3. Authenticate the dedicated browser profile

From the Hostinger graphical desktop terminal:

```bash
systemctl --user stop mission-control-chatgpt-browser.service
set -a
source ~/.config/mission-control-chatgpt-relay/env
set +a
~/.local/share/mission-control-chatgpt-relay/app/scripts/launch-browser.sh
```

Sign in to the intended ChatGPT account, open the two registered chats, and close the browser. Do not copy a laptop cookie database to the VPS.

### 4. Start the persistent browser and run the no-send checks

```bash
systemctl --user enable --now mission-control-chatgpt-browser.service
set -a
source ~/.config/mission-control-chatgpt-relay/env
set +a
~/.local/share/mission-control-chatgpt-relay/app/bin/mc-chatgpt-relay.mjs doctor
~/.local/share/mission-control-chatgpt-relay/app/bin/mc-chatgpt-relay.mjs once
```

Expected pre-live state:

```text
READY
DRY_RUN_ROUTE_READY   # when a queued route exists
or
IDLE                  # when none exists
```

### 5. Enable the bounded outbound trial

After doctor passes and the destination URLs are visibly correct:

```bash
sed -i 's/^MC_RELAY_SUBMIT_ENABLED=.*/MC_RELAY_SUBMIT_ENABLED=1/' \
  ~/.config/mission-control-chatgpt-relay/env
systemctl --user enable --now mission-control-chatgpt-relay.service
```

For persistence after logout/reboot, an administrator must enable lingering once:

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

The status record reports memory, pressure state, queue counts, hashes, and ambiguity state. It does not contain the prompt body or ChatGPT output.

### Resolve an ambiguous send

A crash after the click but before exact confirmation produces `AMBIGUOUS_AFTER_RESTART`; no automatic duplicate is sent.

```bash
relay=~/.local/share/mission-control-chatgpt-relay/app/bin/mc-chatgpt-relay.mjs
set -a; source ~/.config/mission-control-chatgpt-relay/env; set +a

$relay resolve 'request:<request-id>' submitted
$relay resolve 'request:<request-id>' retry
$relay resolve 'request:<request-id>' discard
```

Use `retry` only after visibly confirming that the message was not submitted.

## Memory trial

Start with one Project Manager and two specialist tabs. Capture T0 and hourly H1-H6:

```bash
systemctl --user status mission-control-chatgpt.slice
systemctl --user show mission-control-chatgpt-browser.service \
  -p MemoryCurrent -p MemoryPeak -p MemoryHigh -p MemoryMax -p MemorySwapCurrent
cat ~/.local/state/mission-control-chatgpt-relay/status.json
```

Pass boundary:

- no sustained hard-pressure pauses;
- no swap thrashing;
- Mission Control remains responsive;
- exact outbound routes are delivered once;
- inactive registered tabs are reclaimed before the VPS becomes unstable.

A hard-pressure pause is a successful safety action, not permission to raise limits automatically.

## Security boundary

- Never expose port 9222 publicly. Anyone with DevTools access effectively controls the authenticated browser profile.
- Keep the profile, env file, chat directory, and state directory owner-only.
- Do not rotate proxy/IP identity, clone authenticated profiles, or run multiple concurrent relays.
- Do not use this package for rate-limit circumvention, account sharing, or unattended high-volume messaging.
- The relay does not infer or attest the hidden backend model. It records only the registered chat URL and its own observed transport facts.
- Keep the Machine credential scoped to exact disposable/approved worker IDs. A credential kind in Mission Control is not a semantic authority receipt.

## Return-path boundary

This package remains browser-outbound-only even though the supervisory round trip is complete. It waits for Mission Control to expose a validated `github_decision_receipt_ingested` event; it never acquires the assistant response itself. GitHub issue comments must use `MISSION_CONTROL_CANONICAL_DECISION_V1`, and Mission Control accepts them only when request, nonce, evidence capsule/hash, current owner-outcome epoch/hash, reasoning lane, repository/issue, decision hashes, time window, and no-reinterpretation writer contract all match.
