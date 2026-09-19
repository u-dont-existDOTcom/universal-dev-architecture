# Mission Control Codex preview readiness — concurrent root re-fence blocker

Status: `BLOCKED_ON_CONCURRENT_PRIVILEGED_SAFETY_TRANSITION`

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT**

Recorded: 2026-09-19

## Verified readiness interval

The owner-authorized SECONDARY-only fence release succeeded. The reviewed
root-managed browser/relay topology ran with
`MC_RELAY_SUBMIT_ENABLED=0` and
`MC_RELAY_CAPABILITY_TEST_ENABLED=0`. It completed repeated stable `IDLE`
cycles with zero queue items, no ambiguity, no paused reason, no browser writes,
no provider sends, and no Codex execution.

The full transient readiness receipt is preserved in
`docs/handoffs/2026-09-19-mc-codex-preview-readiness-ready-waiting.md`.

## Concurrent state change

The final post-checkpoint readback found that a separate root context had run
the reviewed fence helper's `engage cloudbrowser` transition at
`2026-09-19T18:09:32Z`, after the successful cycles and after the first
readiness checkpoint was pushed.

Exact current SECONDARY readback:

- fence: engaged;
- fence SHA-256:
  `9e00aa9d98de99316d280f3ef221de0fb5cdb7d0c6c1dc26f8b871af4bf0014b`;
- fence owner: root;
- browser system instance: inactive and masked; and
- relay system instance: inactive and disabled.

The privacy-safe privileged audit projection identifies an explicit
`browser-fence engage cloudbrowser` command from a root context. It was not part
of this execution. No attempt was made to release it again because that would
overwrite a concurrent privileged safety decision and violate parallel-writer
isolation.

## Authority and isolation after re-fence

The central scheduler still reports:

- authority: `MISSION_CONTROL_SINGLE_WRITER`;
- scheduler state: `ACTIVE_LEASE`, ready true;
- active role: `SECONDARY`;
- epoch: 5;
- scheduler ledger: valid;
- queue depth: 0;
- unresolved admission: null;
- relay target transition: `CLEAR`;
- safety halt: null; and
- last provider boundary: `2026-09-19T06:22:25.685Z`.

The provider boundary remains unchanged, so provider sends during this work:
zero. No synthetic or natural pilot ran.

PRIMARY remains fenced, masked, and inactive with unchanged fence SHA-256
`04c29c5efcec900bd7e621296010792e10dc20698f1dae15f84bd433eee511d2`.
Production was not accessed or mutated.

## Exact blocker

The requested target state cannot coexist with the later concurrent root-owned
fence decision. Releasing the new fence requires resolving which privileged
execution owns the current host transition, rather than silently overwriting
it. The system is safe and no-send, but it is not ready for a natural pilot
because the reviewed browser/relay topology is stopped.

`READY_WAITING_FOR_FIRST_NATURAL_CODEX_LOCAL: NO`

`MC_CODEX_EXEC_RELEASE_INSTALL: BLOCKED`
