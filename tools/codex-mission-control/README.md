# Codex Mission Control — adapted source bundle

This directory preserves the current, tested Mission Control dashboard adaptation built from the existing PR #41 application. It is an explanation-first local supervision dashboard, not a worker orchestrator.

The adaptation baseline is `744c477`; the current revision adds ledger-first owner↔worker messaging, authenticated local/VPS polling, persistent direction-bound queues, structured blockers/proposals, and bounded Hermes/n8n evaluation scaffolding. The source archive is a lossless ZIP split into ASCII base64 parts for repository-safe transfer.

## Restore and run

```bash
bash restore-source.sh
cd restored/codex-mission-control
npm install
npm test
npm run typecheck
npm run build
npm start
```

Open `http://localhost:3000` or `http://127.0.0.1:3000`.

The restore script reconstructs `codex-mission-control.zip`, verifies it against `SOURCE-ARCHIVE.sha256`, and extracts the application. Current archive identity:

```text
eff48a38dd9aa9211e97b7c6cdf668c26b7cac2e2675348b907710eef13e7920
```

The checked archive contains 138 source files in 59 base64 parts. A fresh reconstruction is checksum-verified, passes `unzip -t`, and matches the current restored application byte-for-byte after excluding generated dependencies, build output, runtime databases, and local design-workbench files.

## Current operator model

The default page is the all-worker attention queue. Every RED, YELLOW, or UNKNOWN worker exposes:

- the exact problem and why it matters;
- durable evidence and reason codes;
- the bounded directive or required response;
- separately derived issued, delivered, acknowledged, started, evidenced, and verified states;
- the current scoped continuation policy;
- the next review trigger;
- whether owner action is required.

The Test cleanup fixture plainly says the worker is changing the forbidden production scheduler and callers for a test-only task. It directs the worker to stop, revert, return to `tests/**` or `test-support/**`, and rerun focused tests. Its actual state is `REDIRECT DELIVERED — AWAITING ACKNOWLEDGEMENT`; a `REDIRECT` verdict alone never implies correction activity.

Numeric alignment remains secondary diagnostic metadata. Owner choices carry the complete Pro decision packet—question, context, options, benefits, drawbacks, consequences, recommendation, reasoning, and default if unanswered—rather than a compressed summary.

Outcome advancement and strategy efficacy are independent planes. Numeric direction and deltas are validated and derived; a supplied `ADVANCING` label cannot mask regressing bytes. Nonnumeric `ADVANCING` requires current and best same-worker durable direct-outcome or validated-leading-indicator receipts; supporting work and placeholder/future prose cannot make a worker GREEN. Chat reasoning and Codex execution are separate: substantive Codex work requires a reasoning decision bound to the exact current owner-outcome ID, epoch, and hash plus a current versioned chat-authored directive; an execution-only receipt cannot populate supervisory verdicts, and a fresh reasoning review is required before another directive.

## Runtime boundary

`npm run dev` and `npm start` launch:

- a daemon at `127.0.0.1:4100`, which exclusively owns SQLite mutation, hash-chain validation, append-only event checks, and SSE notifications;
- the Next.js dashboard at `127.0.0.1:3000`, whose route handlers proxy the daemon and never open SQLite.

External ingestion is disabled unless per-producer credentials with explicit worker and task scopes are configured. Producer ID, producer kind, both scopes, event class/status, and embedded actor/producer identity must agree at both the BFF and daemon boundary.

The stock Symphony adapter is read-only. Mission Control does not dispatch, retry, stop, resume, schedule, reconcile, mutate tracker state, own workspaces, or replace Symphony orchestration.

## Owner↔worker channel and queued experiments

The live slice now records owner messages and directions before delivery,
maintains an event-backed outbound queue, exposes authenticated polling and
worker-event APIs for local or VPS/cloud workers, and projects recorded,
queued, delivered, acknowledged, and incorporated states independently. Each
worker can publish a direction-bound persistent queue plus structured blockers
and change proposals; the fleet dashboard aggregates and filters those items.

Hermes completed its bounded provider-independent official-runtime comparison
and failed the automatic adoption gate, so the baseline remains controlling.
n8n remains queued behind a real recurring adapter burden. Neither is adopted,
authoritative, or allowed to change Symphony's role. See the
[owner↔worker messaging and adapter experiment plan](../../docs/exec-plans/active/2026-08-31-mission-control-owner-worker-messaging-and-adapter-experiments.md).

## Verification receipt

At the current execution receipt boundary:

- 173 deterministic application tests passed;
- TypeScript passed;
- the Next.js production build passed;
- daemon health and global hash chain passed;
- unauthenticated daemon and external ingestion mutations were denied;
- same-origin UI mutations succeeded for both localhost spellings while cross-origin mutations were denied;
- the owner queue and Human Design worker channel were exercised in the embedded browser at desktop and an actual 375 CSS-pixel compact viewport;
- compact root/client/body scroll widths all measured exactly 375, with no horizontal overflow;
- the AstroHD direction, composer, delivery lifecycle, direction-bound queue, blocker, and proposal were visible at the compact viewport;
- a distinct stdio MCP client called the live HTTP service and authenticated MCP initialize/list/read calls returned the same worker projection, while an unauthenticated read was denied;
- hostile live owner-auth checks denied absent/wrong credentials, missing CSRF, and foreign origins while allowing a correctly authenticated same-origin mutation;
- the actual Human Design repository adapter completed ledger-first direction delivery, acknowledgement, real queue publication, blocker/proposal surfacing, and reconciliation;
- the 18-run Hermes matrix failed its preregistered gate and automatically retained the baseline;
- 255 repository tests and the repository audit passed;
- 63 relay tests and the relay JavaScript/shell syntax checks passed;
- stack shutdown released the daemon writer lock;
- the source archive restored with exact checksum and tree equality.

See the application [README](restored/codex-mission-control/README.md), the frozen [gap audit](../../docs/audits/2026-08-30-mission-control-pr41-gap-audit.md), and [adaptation evidence](../../docs/evidence/mission-control-adaptation/).
