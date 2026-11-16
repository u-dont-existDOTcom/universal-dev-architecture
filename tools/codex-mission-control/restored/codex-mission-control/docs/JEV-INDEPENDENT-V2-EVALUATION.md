# Jev independent-value evaluation v2 (source-only)

Status: IMPLEMENTED_NOT_LIVE_VERIFIED. The V2 question set, exporter, runner and scorer are
offline tools: they are not wired into the supervisor loop and do not change owner decisions.
The live shadow observer gains the breaker, HTTP status capture and automatic version
selection described under **Runtime quality and cost controls** once this is deployed.

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
- A circuit breaker: after three consecutive provider failures (`HTTP_ERROR`,
  `TRANSPORT_ERROR`, `TIMEOUT`, `INVALID_RESPONSE` — an unusable reply may still be
  billed — or `HOOK_TIMEOUT`, a call that did not settle in time), suppress
  **additional** provider calls for 24 hours and permit one half-open retry
  afterward; a failed retry pauses another full day. A success resets the breaker.
  `STATE_BUILD_ERROR` and `HOOK_ERROR` are Mission Control's own faults, never reach
  the provider and don't count. Opening and recovery are logged as
  `jev_shadow_provider_paused` (failure count, end of the pause, error code, numeric
  HTTP status, model) and `jev_shadow_provider_resumed`. The breaker is
  process-local, so restarts reset it. It cannot affect deterministic decisions.
- Version selection (owner, 15 November 2026: "switch versions yeah that should be
  automatically checked"): the default is now `typesafe/jev-1.14`. Unless
  `MISSION_CONTROL_JEV_SHADOW_MODEL` pins a model (any value but `auto`), the daemon
  reads the public Decisions catalog (no key, no cost) at most once a day while the
  shadow is enabled, and uses the newest pinned `typesafe/jev-<major>.<minor>`
  whose input price is within USD 0.042 per million tokens and whose every other
  price is zero; aliases such as `~typesafe/jev-latest` never qualify. An unreadable
  catalog keeps the current version (retried hourly); if no version passes the
  price guard, the shadow makes no call until one does. Startup logs
  `jev_shadow_model` (model, `PINNED` or `AUTOMATIC`); a change logs
  `jev_shadow_model_selected`. Observations record the exact model, so versions
  never mix in the telemetry, and the same-state sampler treats a new version as a
  new sample.
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
npx tsx --test tests/jev-independent-eval.test.ts tests/jev-shadow-sampling.test.ts tests/jev-shadow-telemetry.test.ts tests/jev-shadow.test.ts \
  tests/jev-shadow-breaker-and-version.test.ts tests/jev-decisions-forward.test.ts tests/jev-v2-export-score.test.ts
```

The test transport is faked in memory; it never contacts OpenRouter.
For an authorized **read-only export** of an already persisted telemetry database,
use the separate source exporter from a private working directory:

```sh
python3 -m unittest -v tests/test_jev_independent_export.py tests/test_jev_budgeted_evaluator.py tests/test_jev_budgeted_evaluator_routes.py
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

## 16 November 2026: running the capped evaluation end to end

Owner request, 16 November 2026: "implement" this work
(`docs/requirements/2026-11-16-implement-jev-evaluation.owner-requirement.json`).
The pieces that were missing for a real run are now here:

- `scripts/jev-v2-export.ts` (run with `tsx`): reads the live database **read-only**
  next to the running daemon and prints one JSON line per case and kind: `blind`
  (the 15 facts, cohort, frozen prompt version), `packet` (the V2 request) and
  `reconciliation` (deterministic triggers and actions, historical V1 counts),
  plus a count-only `summary`. No project identifier, prompt, answer body or
  per-observation time. Every case is `CONFIRMATION`: the V2 questions are frozen
  at `jev-independent-v2-20261115` and no case is used to tune them. A state whose
  recorded triggers map to two deterministic actions has no single baseline and
  is reported apart.
- `scripts/jev-budgeted-evaluator.py run` now: keeps the API's documented answer
  shape (`type`, `choice`, `confidence`, `probabilities`); settles a reply without
  `usage.cost` at its conservative reservation instead of stopping; takes
  `--max-calls N` (default 2, at most 60; the run still stops at the first
  failure); refuses any catalog version with a non-zero output, per-request or
  other price; and has two key routes, neither of which prints or stores the key:
  `--key-file PATH` (an owner-only file, mode 600) or
  `--via-mission-control HOST:CONTAINER`, which forwards each request through
  `scripts/jev-decisions-forward.mjs` inside Mission Control's container so it is
  signed with the key already configured there. The USD 1.00 ledger stays with the
  runner either way.
- `scripts/jev-v2-score.ts`: joins the frozen gold labels, the reconciliation
  lines, the runner's ledger and an optional blinded stronger-model file, and prints
  `scoreJevIndependentValue` per Jev version, now including the deterministic
  table's own false owner interruptions and missed owner actions.
- The Python tool tests run in the repository suite
  (`tests/test_mission_control_jev_python_tools.py`); the app's CI job runs only
  `npm test`.

Order of a run: export; freeze the gold labels from the `blind` lines only (an
adjudicator who has not seen the reconciliation lines or any Jev answer); one
canary call; the full capped run for the Mission Control packets and the AskRigor
packets, latest version first and `--compare-legacy`; then score.

### What this test can and cannot show

Jev sees the same 15 facts the deterministic table uses. On Mission Control's
states it can therefore show only whether Jev's reading of those facts beats the
table's on the states that actually occurred (about a dozen distinct states so
far, far short of the 25/100/500 checkpoints). A careful one-time review of those
states would find the same table errors. Labels adjudicated from the recorded facts
are weaker than labels from what actually happened next; outcome-based labels
need each state's later history and are a separate, more private step. The
AskRigor pilot (deidentified research cases with documented omissions and
negative controls) is the part where an independent reading of free text can
plausibly add something.
