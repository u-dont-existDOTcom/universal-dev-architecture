# Mission Control VPS ChatGPT Browser Relay

Status: bounded outbound implementation for a 16 GB Hostinger VPS.

This package moves the persistent ChatGPT supervision browser off the owner laptop. It reads only already-authorized `MISSION_CONTROL_INTERNAL_SUPERVISOR_ROUTE_V1` packets from Mission Control, opens the exact registered `chatgpt.com/c/...` conversation in one dedicated VPS browser profile, submits the exact queued bytes, and records a local transport receipt.

It is deliberately **outbound-only**. It does not read, copy, summarize, or import assistant output. Mission Control remains the ledger and admission boundary; ChatGPT remains the reasoning surface; this process is only a transport mechanism.

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
- A dedicated machine credential registered in Mission Control's `MISSION_CONTROL_INGEST_CREDENTIALS` and permitted to call the existing read-only MCP fleet tool.

The current Mission Control MCP reader class is typed as `SUPERVISOR`. For the first smoke test, scope that credential only to `mission-control-live-slice`; do not reuse a human supervisor's token. The credential type is transport access, not proof of a ChatGPT supervisor identity.

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

Set the real token and leave submission disabled:

```text
MC_RELAY_PRODUCER_ID=supervisor:chatgpt-relay-reader
MC_RELAY_TOKEN=<dedicated 32+ character token>
MC_RELAY_SUBMIT_ENABLED=0
```

### 2. Register exact chats

Edit:

```bash
nano ~/.config/mission-control-chatgpt-relay/chats.json
```

Each `chatId` must exactly match the `destinationChatId` used by Mission Control. Each URL must be a concrete `https://chatgpt.com/c/<conversation-id>` URL. The Project Manager chat is pinned; inactive specialist chats may be closed and reopened by URL.

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

## Known boundary

This implementation proves VPS-hosted **outbound** transport and resource behavior. It does not complete the full two-way Mission Control round trip. Assistant-response acquisition remains excluded from this package; the next return path must use a provider-supported source or an explicit manual/source-bound import rather than silent DOM output extraction.
