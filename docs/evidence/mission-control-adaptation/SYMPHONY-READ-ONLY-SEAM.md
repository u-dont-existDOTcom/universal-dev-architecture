# Symphony read-only seam evidence

Date: 2026-08-31

## Audited upstream boundary

- Repository: `openai/symphony`
- Audited commit: `8001b52e3062495a16e520e4ceaf8f9de868c4d0`
- Stock observation endpoint: `GET /api/v1/state`
- Optional future detail observation: stock read-only issue/detail GET only
- Rejected as an observation seam: refresh/control POSTs

The stock state endpoint exposes `running`, `retrying`, and `blocked` arrays. Those arrays—not untrusted declared counts—drive Mission Control observations. Declared/observed mismatches produce diagnostics. Provider tracker state remains opaque where stock state does not expose it.

## Implemented adapter

- Adapter: `tools/codex-mission-control/restored/codex-mission-control/lib/symphony-adapter.ts`
- Deterministic fixture: `tools/codex-mission-control/restored/codex-mission-control/tests/fixtures/symphony-state-v1.json`
- Normalized event: `symphony_runtime_observed`
- Source binding: upstream repository, endpoint, exact commit, upstream generation time, receipt time, and canonical payload SHA-256
- Error behavior: invalid/error envelopes fail schema parsing; counts never synthesize observations

## Ownership boundary

Mission Control may observe and normalize stock Symphony state. It must not own or emulate:

- dispatch, claim, release, retry, continue, stop, or resume;
- tracker eligibility or state mutation;
- concurrency, backoff, or scheduling;
- workspace lifecycle;
- Codex App Server integration;
- `WORKFLOW.md` or workflow configuration;
- Linear/provider writes;
- orchestration recovery.

No custom scheduler or Symphony replacement was added.

## Verification

The deterministic tests prove that:

- running, retrying, and blocked arrays normalize into read-only ledger events;
- observed array lengths control the result;
- count mismatches generate explicit diagnostics;
- error envelopes are rejected;
- the upstream commit pin remains exact.

This completes the fixture-backed seam required by the slice. A live worker feed remains the next slice because live Symphony/Linear account configuration is outside this bounded implementation slice.
