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

## 15 November 2026: Owner-authorized budget and automatic version discovery

The owner expressly approved **USD 1.00 total additional Jev inference evaluation
spend** across Mission Control and AskRigor, using existing prepaid OpenRouter
credits. This is **not** $1 per run, per case, per model or per week. No credit
purchase/top-up, non-Jev model API, or production deployment was authorized.
The authorization is recorded in
`docs/requirements/2026-11-15-jev-one-dollar-version-cap.owner-requirement.json`.

`scripts/jev-budgeted-evaluator.py` automatically queries the *Decisions*
model catalog (`/api/v1/models?endpoints=/api/alpha/decisions`) on each
`discover` or `run` invocation. The generic OpenRouter models catalog **omits
Jev decision models** and is not a valid release monitor. On 15 November 2026,
public catalog metadata verified Jev **1.14 is newer than pinned 1.13**,
both priced at USD 0.000000042 per input token (USD 0.042/M). Newest eligible
pinned model is tried first when a real authorized evaluation can run; optional
`--compare-legacy` includes 1.13 on the same case. The old production V1
remains unchanged. The script refuses an unapproved price increase or malformed
model listing rather than selecting an alias with unknown billing semantics.

Example commands from this source directory; use an owner-private working
location, never commit ledger or patient/operational data:

```sh
python3 scripts/jev-budgeted-evaluator.py discover
python3 scripts/jev-budgeted-evaluator.py status
python3 scripts/jev-budgeted-evaluator.py run \\
  --packets /private/jev-askrigor-cases.jsonl --compare-legacy
```

The shared ledger at
`~/.local/state/mission-control/jev-eval-20261115-budget.json` has mode 0600
in a mode-0700 directory. A pre-request conservative liability is durably
reserved under a file lock; provider-reported actual `usage.cost` settles
only validated successes; failures and uncertain outcomes retain the reserve.
Duplicate case/model/payload identities are not resent. A provider error stops
the invocation immediately. At most two fresh attempts are admitted per run.
The runner also checks OpenRouter's key metadata; it cannot override the
provider/account's own limits. Provider keys, response bodies and private
prompts are never printed or copied into Git.

**Actual source execution:** Public catalog check passed and private ledger
initialized; `status` reported USD 1.00 remaining, zero paid attempts.
The test run selected 1.14 then 1.13 but returned
`BLOCKED_CREDENTIAL_UNAVAILABLE` (no `OPENROUTER_API_KEY` in the authorized
evaluation process). **Zero live inference calls** and **zero incremental cost**.
The user's reported account credit balance does not establish that this separate
evaluation runtime has permission to use its API key. Do not extract a key
from a protected Docker/service environment or bypass a denied connector.

A new standalone daily automation could not be created because the account's
active automation quota is full. Instead, the existing weekly **AI Tool Radar**
automation was updated to check the official Jev Decisions catalog on each run
and route genuinely new releases through the same budgeted evaluation process.
The separate **Jev Value Watch remains strictly read-only**, with no inference
or synthetic comparisons. The version catalog is also checked at the start of
every explicitly admitted evaluation run; any automatic production promotion
requires the existing integrator's review and independently measured benefit.
