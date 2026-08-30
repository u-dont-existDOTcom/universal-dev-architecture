# Codex Mission Control MVP

This directory preserves the complete, tested source tree for the local Codex Mission Control dashboard requested on 2026-08-30.

The source is stored as a lossless ZIP archive split into ASCII base64 parts so it can be recovered without binary-transfer support. The extracted project is a standalone Next.js / React / TypeScript application with SQLite persistence, SSE live updates, append-only worker/supervisor events, immutable objective contracts, deterministic drift scoring, seeded demo data, worker details, schemas, curl examples, and tests.

## Restore the source

From this directory:

```bash
bash restore-source.sh
cd restored/codex-mission-control
cp .env.example .env.local
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

Open `http://127.0.0.1:3000`.

## Integrity

`restore-source.sh` verifies the reconstructed ZIP against `SOURCE-ARCHIVE.sha256` before extracting it.

Source archive SHA-256:

```text
93454988d7d103718e43c44602386ba09566c5ca12f11bb7004f3c7085d387c1
```

Local source commit recorded before packaging:

```text
ea59bab build: add Codex Mission Control MVP
```

## Validation receipt

- 17/17 deterministic Node tests passed.
- SQLite persistence across restart passed.
- Append-only enforcement, idempotency, immutable objectives, global hash-chain verification, drift scoring, immediate escalation, warning resolution, and mark-viewed behavior passed.
- A strict framework-stubbed TypeScript check passed; 33 TypeScript/TSX files had zero parser errors.
- Dashboard and worker-detail layouts were rendered and inspected at 1440 px and 390 px.
- The actual installed Next.js typecheck/build remains required because this build container could not resolve the npm registry.

## Architecture boundary

Mission Control is an audit and observability layer. It does not autonomously supervise or redirect workers. SQLite events remain authoritative, the UI renders derived state, supervisor estimates cannot erase deterministic violations, and SSE is only an invalidation signal.
