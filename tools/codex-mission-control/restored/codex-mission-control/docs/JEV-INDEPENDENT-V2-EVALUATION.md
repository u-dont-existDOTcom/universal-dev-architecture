# Jev independent-value evaluation v2 (source-only)

Status: IMPLEMENTED_NOT_LIVE_VERIFIED. These modules are not wired into the deployed
Mission Control supervisor and do not change owner decisions.

## What is measured

- V1 `next_action` explicitly supplies the deterministic routing answer key. Its
  99.97% exact-policy agreement is **not** evidence of independent judgment.
- V2 asks for an independent recommendation from the **same 15 allowlisted
  control-state facts**, without the ordered deterministic policy or the
  deterministic trigger. `buildIndependentJevRequest` constructs the proposal;
  it makes **no** network request.
- The external evaluator first adjudicates each real historical state using
  source-bound evidence about its actual owner/work outcome, without seeing
  deterministic or Jev answers. The adjudication must not be inferred from the
  deterministic trigger, source prompt or Jev response.
- Score by **distinct real fingerprint**, not number of repeat provider responses.
  Report 25/100/500 distinct states, unique provider response IDs/fallback error
  identities, by-type judgments, missed real owner gates, false owner interruptions,
  extra correct judgments versus the existing deterministic system, new errors,
  stability on repeated observations, latency and provider spend. Compare a
  separately blinded stronger model on the same state and evidence.
- Only the first valid Jev classification per fingerprint is the primary value
  judgment; repeats measure stability rather than independent evidence.
  Classify the input cases as DEVELOPMENT or CONFIRMATION *before* observing
  decisions. A case used to tune v2 cannot validate generalization.

## Runtime quality and cost controls

- Existing state-change sampling (PR #315) still suppresses unchanged states for
  one hour; its state is in process memory and resets when the daemon restarts.
- The source-only change here adds a circuit breaker: after three consecutive
  HTTP, transport or provider timeout errors, suppress **additional** provider
  calls for 24 hours and permit one half-open retry afterward. A success resets
  the breaker. The breaker is process-local, so restarts currently reset it.
  It deliberately cannot affect deterministic Mission Control decisions.
- An HTTP failure records **only the integer HTTP status** (100–599), not its
  response body, authorization header or account information. Existing SQLite
  files gain a nullable `http_status` column without losing older observations;
  summary exposes counts per status so 401/403 auth, 429 quota, and 5xx outages can
  be distinguished in future telemetry. This does not retroactively diagnose
  historical errors that discarded their status.
- No extra Jev request is sent for a skipped sample; the observer returns null.
  Production deployment is separate from this source-only implementation.

## Repeatable local verification (no provider calls)

From `tools/codex-mission-control/restored/codex-mission-control`:

```sh
npm run typecheck
npx tsx --test tests/jev-independent-eval.test.ts tests/jev-shadow-sampling.test.ts tests/jev-shadow-telemetry.test.ts tests/jev-shadow.test.ts
```

The test transport is faked in memory; it never contacts OpenRouter.
For an authorized **read-only export** of an already persisted telemetry database,
use the separate source exporter from a private working directory:

```sh
python3 -m unittest -v tests/test_jev_independent_export.py
python3 scripts/export-jev-independent-cases.py --database /private/jev.sqlite \
  --blind-out /private/jev-blind.jsonl \
  --comparison-out /private/jev-reconciliation.jsonl
```

The exporter reads the existing SQLite database with `mode=ro` and a 15-field
privacy allowlist. Its BLIND file has no deterministic trigger, Jev prediction,
or invented gold verdict; the separate reconciliation file contains historical
V1 answers for analysis **only after the independent gold labels are frozen**.
Both files are created mode 0600 and must remain private/uncommitted. Historic
response-ID/fallback dedup counts are descriptive, not new Jev calls. States
without a successful Jev response still count toward the distinct-state frontier.

For an actual V2 comparison, an authorized supervisor must create a source-bound
case ledger and blind labels, separately approve any provider cost if not already
authorized, and run the requests outside the authoritative fleet loop. There is
**no auto-launch, paid inference, automatic owner notification or deployment**
in this candidate. Existing MC shadow telemetry alone does not contain an
independently adjudicated ground truth; retroactively relabeling it from
deterministic triggers would defeat this experiment.

## Evidence as of source preparation

Previously reported live telemetry (15 November 2026):
12 distinct fingerprints, 10 with successful v1 comparisons; 12,540 successful
provider responses, exact-action agreement 12,536/12,540; 29 consecutive recent
failures, and cumulative cost approximately USD 0.63674. These are *historical
v1 observations* and **not** results from v2. No novel real v2 judgment or
cross-model comparison has been performed here.

## Access and authority boundaries

No raw prompts, conversations, project identifiers, credentials, thread IDs,
source-private evidence or patient data may be included in published examples
or sent to Jev. Remain shadow-only. A research-quality evaluator is a diagnostic,
not an owner, release, scientific or clinical authority. Do not run paid
Jev/stronger-model inference under a zero-spend rule or restart a failing provider
to circumvent the breaker. No duplicate shared-runtime writer or deployment.
