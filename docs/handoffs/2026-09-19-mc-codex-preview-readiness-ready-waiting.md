# Mission Control Codex preview readiness — ready and waiting

Status: `READY_WAITING_FOR_FIRST_NATURAL_CODEX_LOCAL`

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT**

Recorded: 2026-09-19

## Authorized boundary

The owner explicitly authorized release of the root-owned browser fence on the
non-production SECONDARY `cloudbrowser` instance only, followed by startup of
the reviewed browser/relay topology with:

- `MC_RELAY_SUBMIT_ENABLED=0`;
- `MC_RELAY_CAPABILITY_TEST_ENABLED=0`; and
- scoped `MC_CODEX_EXEC_PREVIEW_ENABLED=1` only for worker
  `mission-control-live-slice`, using producer
  `worker:mission-control-live-slice`.

PRIMARY/browser-fence mutation, production mutation, provider sends,
permission broadening, paid API inference, and a synthetic pilot remained
unauthorized. None occurred. No natural pilot executed during readiness work.

## Canonical source and installed parity

Fresh canonical default-branch tip at final refresh:
`7eb393d6894c6c5dd921dc78beeb0b4ebac03d0d`.

The installed source receipt remains
`a4dd25aadab33a9f02cd0930880a0ae398c232da`. The relay subtree object is
identical at the installed receipt and current main:
`23af6a63f06a61543d7fe7621b79f3caae15a901`.

Installed package verification on SECONDARY:

- deployed files: 56;
- relative file-manifest SHA-256:
  `9716a3eea39b81cb7decc3b8fad4a2ecbade439f4771dda352a4a7121e0aa3f8`;
- repository/current-main manifest matches exactly after the two documented
  repository-only scheduler shim/test exclusions;
- system browser unit SHA-256:
  `c523dae92982b976f546af987d18507841d40625c375a4bd195d7950e882dd55`;
- system relay unit SHA-256:
  `73f62c465d60abadbb07897c50af347aee1dbc37a7c34816cf66364ee6740a92`;
- system slice unit SHA-256:
  `19582ee048c2a3d205bca793a3bd78b71531503e66df242d95c5f0bbd1538242`.

## SECONDARY fence release and topology

Immediately before release, the active lease, exact epoch/role, event chain,
scheduler ledger, queue/admission/transition/safety state, provider boundary,
and authenticated WORKER read path were revalidated. All previously clean
authority gates remained clean.

The exact installed fence helper returned `HOST_BROWSER_UNFENCED` for only the
SECONDARY `cloudbrowser` instance. The final mechanical readback confirms its
fence file is absent.

The root-managed system topology is the reviewed compatibility topology and is
now the sole active topology:

- `mission-control-chatgpt-browser@cloudbrowser.service`: active and enabled,
  zero restarts, active since `2026-09-19 17:57:33 UTC`;
- `mission-control-chatgpt-relay@cloudbrowser.service`: active and enabled,
  zero restarts, active since `2026-09-19 17:58:22 UTC`;
- loopback CDP listener: `127.0.0.1` only;
- browser `--no-sandbox`: absent; and
- user-manager browser and relay units: inactive and disabled.

The prior graphical display no longer existed. The reviewed launcher therefore
uses its built-in isolated Xvfb path. A stale relay drop-in Node path was
repaired to the already checksum-verified private Node runtime. The superseded
drop-ins were preserved in the root-only rollback backup. These changes did
not alter browser capabilities, credentials, authority, or send policy.

## Stable no-send relay cycles

The relay completed repeated stable cycles after startup. The final two sampled
consecutive cycles were:

- `2026-09-19T18:04:02.656Z`; and
- `2026-09-19T18:04:17.983Z`.

Both reported:

- status `IDLE`;
- `submitEnabled: false`;
- `capabilityTestEnabled: false`;
- queue discovered: 0;
- paused reason: null;
- unresolved ambiguities: 0; and
- closed targets: 0.

More than two consecutive cycles returned the same stable result. The automatic
Codex dispatcher runs before ordinary relay routing; an idle return is expected
when no eligible directive exists.

## Final authority and execution readback

Final central/scheduler readback:

- authority: `MISSION_CONTROL_SINGLE_WRITER`;
- scheduler state: `ACTIVE_LEASE`, ready true;
- active role: `SECONDARY`;
- epoch: 5;
- split-brain state: `SINGLE_ACTIVE_CONFIRMED`;
- event chain: valid, zero errors, latest sequence 14244;
- scheduler ledger: valid, zero errors;
- queue depth: 0;
- unresolved admission: null;
- relay target transition: `CLEAR`;
- safety halt: null; and
- last provider boundary: `2026-09-19T06:22:25.685Z`.

The provider boundary is identical to the pre-release value, so provider sends
during fence release, startup, and verification: zero.

The authenticated WORKER path returned the exact intended worker with no RPC
error, zero directive events, and zero eligible active uncompleted candidates.
There is no Codex execution child process and no Codex job artifact. Codex auth
still reports `Logged in using ChatGPT`; `OPENAI_API_KEY` and `CODEX_API_KEY`
assignments remain absent.

## PRIMARY and production isolation

PRIMARY remains fenced, masked, and inactive. Its fence SHA-256 is unchanged:
`04c29c5efcec900bd7e621296010792e10dc20698f1dae15f84bd433eee511d2`.
PRIMARY preview remains absent/default-off. Production was not accessed or
mutated.

## Rollback and disable readiness

The exact pre-install package/config/state/unit backup remains root-only at the
previously recorded backup location. Its manifest SHA-256 remains recorded as
`f0ef251fb9c3cee3aa68a9e87ed12d9ddadc861ac3ac88f565d559f9c6337384`.
The exact pre-install package symlink rollback remains present. The preview
disable override was previously mechanically verified without changing the
intended final preview state. The reviewed service stop and SECONDARY fence
engage paths remain available.

## First natural pilot boundary

The system is intentionally idle and waiting. The first naturally occurring
harmless local filesystem/terminal task becomes the first `CODEX_LOCAL` pilot
only when Mission Control contains one exact admitted schema-v3 directive with
an accepted local capability for the scoped worker. The resulting evidence must
bind the exact directive/source/artifact/profile, authenticated admission and
persisted preflight, isolated subscription-auth execution attempt, child
environment credential exclusion, process/timeout result, and exact execution
receipt. Chat, not the executor, adjudicates that pilot.

No task was fabricated to prove installation.

`READY_WAITING_FOR_FIRST_NATURAL_CODEX_LOCAL: YES`

`MC_CODEX_EXEC_RELEASE_INSTALL: PASS`
