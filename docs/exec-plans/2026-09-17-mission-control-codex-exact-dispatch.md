# Mission Control Codex exact automatic dispatch

Status: IMPLEMENTED AND LIVE VERIFIED

Assurance lane: Iteration.

Owner requirement:
`docs/requirements/2026-09-17-mission-control-codex-exact-dispatch.owner-requirement.json`.

## Outcome and boundaries

Close the two remaining reviewed-candidate gaps without changing the accepted
authority architecture. Mission Control must turn its current durable,
source-bound schema-v3 directive into executable work without operator-supplied
files. A disabled or unsupported candidate route must remain attributable to
the exact same legacy worker/task/request identity.

Production, `main`, `state/CURRENT-STATE.md`, the controller-recovery branch,
and the canonical browser fence remain untouched. The restricted-browser live
smoke and natural owner work remain deferred.

## Implemented seam

1. The normal `RelayRuntime.cycle()` obtains the existing scoped Mission
   Control worker projection. It calls the Codex dispatcher before browser
   route selection.
2. Discovery recognizes only the latest active schema-v3 directive whose exact
   verified or owner-attested reasoning source begins with
   `MISSION_CONTROL_CODEX_EXECUTION_PAYLOAD_V1` and has no matching execution
   receipt.
3. The source payload supplies only mechanical execution bytes. Mission
   Control supplies the worker, task, directive/revision, source digest, and
   exact Work profile. Reconstructing those values must reproduce the persisted
   directive artifact digest.
4. The automatic dispatcher derives the bounded admission request, calls the
   existing authenticated worker admission endpoint, consumes its persisted
   trusted task-creation selection, requires the existing persisted preflight,
   and then uses the already-accepted bounded Codex runner.
5. The admission route persists the exact source/profile-bound setter request
   as a SYSTEM event. The worker cannot self-author this evidence.
6. `worker:codex-exec` now performs one automatic durable-state cycle when no
   diagnostic files are supplied. Its file-based form remains available for
   diagnosis.

## Exact legacy retention

The source reasoning message's durable `decision_request_id`, the directive's
`task_id`, and the worker ID form the legacy selector. The existing browser
relay filters its existing routes by all three fields. It requires exactly one
match before the old route can progress. Zero matches and multiple matches fail
closed, and an adjacent eligible route stays untouched. The diagnostic
`once-exact` command additionally verifies that the returned route carries the
same worker, task, and request before it attaches the directive binding to the
result.

This reuses the current relay route set and local delivery state. It adds no
queue, claim authority, or semantic dispatcher.

## Verification

- Automatic durable-state local path: passed with the real admission and
  preflight evaluators.
- Preview-disabled exact fallback: passed.
- Unsupported-browser exact fallback: passed.
- Adjacent unrelated eligible legacy route: remained unselected.
- No executable directive: idle; no Codex child.
- Existing authority, forged-receipt, auth-isolation, retry, timeout, MCP, and
  relay regressions: passed.
- TypeScript and JavaScript syntax checks: passed.
- Live local smoke: GPT-5.6 Sol Low completed from a temporary durable Mission
  Control ledger through automatic discovery, authenticated admission,
  persisted preflight, `CODEX_LOCAL`, start/receipt lifecycle, ChatGPT
  subscription authentication, structured output, no API-key fallback, and
  ephemeral auth cleanup.

Evidence:
`docs/evidence/2026-09-17-mission-control-codex-exact-dispatch.json`.
