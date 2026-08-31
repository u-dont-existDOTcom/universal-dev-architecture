# Codex Mission Control — adapted source bundle

This directory preserves the current, tested Mission Control dashboard adaptation built from the existing PR #41 application. It is an explanation-first local supervision dashboard, not a worker orchestrator.

The adaptation baseline is `744c477`; the current revision adds the epoch-4 progress and chat-led-execution controls required by the fresh Extra High directive. The source archive is a lossless ZIP split into ASCII base64 parts for repository-safe transfer.

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
d3dc55415d57954ef469c44e2a5bc58a613394d3272ddb2153f23bb0f581a0ec
```

The checked archive contains 45 source files in 23 base64 parts. A fresh reconstruction is checksum-verified, passes `unzip -t`, and matches the current restored application byte-for-byte after excluding generated dependencies, build output, and runtime databases.

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

Outcome advancement and strategy efficacy are independent planes. Numeric direction and deltas are validated and derived; a supplied `ADVANCING` label cannot mask regressing bytes. Chat reasoning and Codex execution are separate: substantive Codex work requires a current versioned chat-authored directive, an execution-only receipt cannot populate supervisory verdicts, and a fresh reasoning review is required before another directive.

## Runtime boundary

`npm run dev` and `npm start` launch:

- a daemon at `127.0.0.1:4100`, which exclusively owns SQLite mutation, hash-chain validation, append-only event checks, and SSE notifications;
- the Next.js dashboard at `127.0.0.1:3000`, whose route handlers proxy the daemon and never open SQLite.

External ingestion is disabled unless per-producer credentials with explicit worker and task scopes are configured. Producer ID, producer kind, both scopes, event class/status, and embedded actor/producer identity must agree at both the BFF and daemon boundary.

The stock Symphony adapter is read-only. Mission Control does not dispatch, retry, stop, resume, schedule, reconcile, mutate tracker state, own workspaces, or replace Symphony orchestration.

## Verification receipt

At the current execution receipt boundary:

- 66 deterministic tests passed;
- TypeScript passed;
- the Next.js production build passed;
- daemon health and global hash chain passed;
- unauthenticated daemon and external ingestion mutations were denied;
- same-origin UI mutations succeeded for both localhost spellings while cross-origin mutations were denied;
- desktop 1440 px and mobile 390 px screenshots were inspected;
- mobile detail overflow was measured and eliminated;
- stack shutdown released the daemon writer lock;
- the source archive restored with exact checksum and tree equality.

See the application [README](restored/codex-mission-control/README.md), the frozen [gap audit](../../docs/audits/2026-08-30-mission-control-pr41-gap-audit.md), and [adaptation evidence](../../docs/evidence/mission-control-adaptation/).
