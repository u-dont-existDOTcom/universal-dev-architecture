# Mission Control Codex preview readiness — SECONDARY fence blocker

Status: `SUPERSEDED_BY_AUTHORIZED_SECONDARY_FENCE_RELEASE`

Superseded by
`docs/handoffs/2026-09-19-mc-codex-preview-readiness-ready-waiting.md`
after the owner explicitly authorized release of the SECONDARY
`cloudbrowser` fence with both send-capable flags disabled.

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT**

Recorded: 2026-09-19

## Authority preserved

The owner authorization for a reversible non-production SECONDARY relay install,
scoped Codex preview enablement, and the first naturally occurring harmless
`CODEX_LOCAL` pilot remains in force.

Still unauthorized and unchanged:

- production mutation;
- PRIMARY mutation or browser-fence change;
- any browser-fence release, bypass, or weakening under the current instruction;
- paid API inference or API-key fallback;
- synthetic pilot/model tasks; and
- permission or browser/MCP-capability broadening.

No natural pilot has executed.

## Canonical source and executable parity

Current default-branch tip at final refresh:
`7eb393d6894c6c5dd921dc78beeb0b4ebac03d0d`.

The install action began from then-current main:
`a4dd25aadab33a9f02cd0930880a0ae398c232da`.

Main advanced once during execution only in root/routing policy, requirement,
and policy-test files. The relay subtree object is identical at both commits:
`23af6a63f06a61543d7fe7621b79f3caae15a901`.

Exact relay archive SHA-256:
`4dea352f80e8094176b9310f6dc16602497e4ebce1e371212917f515b7ac60a5`.

Installed relay content receipt:

- source receipt: `a4dd25aadab33a9f02cd0930880a0ae398c232da`;
- installed files: 56;
- relative file-manifest SHA-256:
  `9716a3eea39b81cb7decc3b8fad4a2ecbade439f4771dda352a4a7121e0aa3f8`;
- the two repository-only scheduler shim/test files are absent as required by
  the repository installer; and
- all deployed relay JavaScript syntax checks pass under Node 22.

The non-production central container is healthy with image revision
`a4dd25aadab33a9f02cd0930880a0ae398c232da` and image digest
`sha256:2aaa5e8b28594379a511bace06ae16b30b7c41f28fdddf569d1eebac23ecd98c`.
The one later main commit changes no Mission Control executable file.

## Completed reversible SECONDARY work

- Used the repository-supported atomic user-service installer while relay and
  browser services were stopped.
- Preserved the pre-install relay symlink exactly. Its target remains the
  accepted `48eb5422a23574c2895daf3eb21eaa04f65e7200` release.
- Preserved a second root-only package/config/state/unit snapshot with manifest
  SHA-256
  `f0ef251fb9c3cee3aa68a9e87ed12d9ddadc861ac3ac88f565d559f9c6337384`.
- Installed checksum-verified private Node `v22.23.2` for the dedicated service
  account only. Official archive SHA-256:
  `d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307`.
- Installed Codex CLI `0.154.0` for the dedicated service account.
- Provisioned private ChatGPT-subscription authentication without printing or
  committing credential content. `codex login status` reports
  `Logged in using ChatGPT`.
- Bound only the existing WORKER identity `mission-control-live-slice` to its
  existing authenticated WORKER credential.
- Enabled preview only in this stopped SECONDARY relay configuration.
- Kept `MC_RELAY_SUBMIT_ENABLED=0` and
  `MC_RELAY_CAPABILITY_TEST_ENABLED=0`.
- Confirmed `OPENAI_API_KEY` and `CODEX_API_KEY` assignments are absent.
- Confirmed the authenticated WORKER read path succeeds and there are zero
  execution directives, hence no active uncompleted candidate.
- Confirmed the preview disable override resolves to `false` without changing
  the intended stored preview state.

## Live authority readback

At the final read:

- central event chain: valid, sequence 14146;
- scheduler ledger: valid;
- scheduler state: `ACTIVE_LEASE`;
- epoch: 5;
- active role: `SECONDARY`;
- split-brain state: `SINGLE_ACTIVE_CONFIRMED`;
- queue depth: 0;
- unresolved admission: null;
- relay target transition: `CLEAR`;
- safety halt: null;
- last provider boundary:
  `2026-09-19T06:22:25.685Z`.

That provider boundary predates this privileged continuation and remained
unchanged throughout it. Therefore provider sends during this work: zero. It is
newer than the boundary recorded in the incoming handoff and is preserved as a
factual external-state deviation, not attributed to this execution.

## Exact blocker

The SECONDARY now has a root-owned durable browser fence engaged at
`2026-09-19T06:30:48Z` with the release condition:

`controlled_takeover_complete_and_browser_explicitly_released`

Mechanical readback:

- SECONDARY fence SHA-256:
  `d67cc94966cf3e90297bb430ec4c51b159bd0417996553905cb3d0cae37b1351`;
- system browser instance: masked/inactive;
- user browser instance: inactive;
- relay instance: inactive; and
- no CDP listener or browser process exists.

The exact relay service mechanically requires the browser service. The
controlling handoff forbids removing that dependency, and the current owner
instruction forbids a browser-fence release/bypass/weakening. Starting the
relay would therefore either fail or require an unauthorized fence change.

PRIMARY remains fenced, masked, and inactive. Its fence SHA-256 is
`04c29c5efcec900bd7e621296010792e10dc20698f1dae15f84bd433eee511d2`.
PRIMARY preview is absent/default-off. Production was not accessed or mutated.

## Required new authority

The only remaining consequential action requires explicit authorization to
run the reviewed fence `release` transition for the SECONDARY `cloudbrowser`
instance only, followed by the already-approved no-send user browser/relay
activation. PRIMARY must remain fenced, and submit/capability-test must remain
zero.

After such authority is supplied, revalidate the current epoch/lease, event
chain, scheduler ledger, zero queue/admission/transition/safety ambiguity,
unchanged provider boundary, and zero pending execution directives immediately
before release. Then start the reviewed service topology, verify stable health
for at least two relay cycles, and stop in the waiting state without creating a
task.

`READY_WAITING_FOR_FIRST_NATURAL_CODEX_LOCAL: NO`

`MC_CODEX_EXEC_RELEASE_INSTALL: BLOCKED`
