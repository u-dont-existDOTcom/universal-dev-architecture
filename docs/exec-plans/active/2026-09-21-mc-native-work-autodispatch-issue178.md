# Mission Control native Work autodispatch + issue #178 closeout

Status: ACTIVE
Owner outcome: OPEN
Integrator: `chat/mc-unified-integrator-20260921`
Canonical base after coordination-lock merge: `bd6787d821a778acace8f050b758ce59ec57f8d6`

## Owner outcome

Remove owner clipboard transport from the normal Mission Control Chat -> native ChatGPT Work -> reasoning-Chat loop, preserve current direct native-Work verification, and close issue #178 only after one harmless live self-development cycle proves supervisor reasoning -> durable decision -> automatic bounded executor -> isolated child branch -> privacy-safe execution receipt -> automatic fresh reasoning return/closure.

No production deployment is authorized.

## Source-lane reconciliation

Reference-only stale source: `chat/mission-control-native-work-autodispatch-20260919@ff9c29855a2f19996b5d08e47fa01f894e3a1bc9`.

Do not merge/rebase/cherry-pick it wholesale. Port only owner-aligned mechanisms missing from current main. Current direct `chatgpt-work-cloud-controller.ts`, request-binding V6, fleet/controller recovery, and directly verified native Work evidence remain authoritative.

## Implemented candidate

- explicit `execution_surface` on bounded residue/directive; historical/default path remains Codex;
- automatic Codex dispatcher excludes `CHATGPT_WORK_CLOUD`;
- deterministic native-Work dispatch derived from durable source-bound state;
- unattended owner-side watcher materializes the private directive artifact/request and invokes the current direct controller;
- three-boundary durability: request -> app handoff intent -> result;
- request-only/no-intent is mechanically unsent and resumable; post-intent/no-result is ambiguous/no replay;
- waiting/ready/ambiguous Work routes do not starve unrelated eligible native-Work directives;
- completion receipt accepts only privacy-safe control facts bound to the exact directly verified READY Work thread;
- receipt ingestion atomically emits one ordinary V6 request-bound reasoning route to the original stable supervisor/current owner outcome;
- Work receipt participates in terminal/pending-reasoning-review/final-response state like a Codex execution receipt, without importing Codex-only model/preflight semantics;
- single-integrator lock is canonical; child Mission Control lanes must hand deltas here and cannot mutate shared runtime/main independently.
- owner nudge rule: while a generation is active, the exact visible system UI message `Our systems are thinking more than usual` is a special recovery signal even on V6 one-message stages; click Stop, wait until generation is fully stopped and the send/up-arrow control is visible again, then submit exactly `continue` through the central scheduler. This narrow signal does not enable generic same-chat retries.


## Provider-write safety failure and current repair

Live issue-178 V6 reasoning reached the exact `mc-project-manager` provider session, but the model's requested GitHub issue-comment write was blocked by OpenAI safety checks. The supervisor correctly failed closed and did not retry. This demonstrates that control-plane receipt transport cannot depend on the reasoning model performing GitHub mutations.

Current repair:
- V6 reasoning uses GitHub only for bound evidence reads and returns one canonical machine decision block in the final provider message;
- native Work returns one privacy-safe execution receipt block in its final Work message;
- an owner-runtime deterministic copier reads those exact messages through the app-owned `read_thread` surface, validates request/session/binding/dispatch hashes against Mission Control, and publishes only the exact machine block through the owner's existing authenticated `gh` credential;
- the copier has no semantic authority and cannot invent, paraphrase, or repair a decision/receipt; missing or mismatched machine blocks remain fail-closed;
- GitHub remains the durable ingestion channel, so existing event-sourced admission and exactly-once reasoning-return semantics remain intact.

The stale `tasks/ACTIVE-TASK.json` issue-53 no-deploy/no-send task is superseded by this later owner-authorized issue-178 task because its writer lease is released and it conflicts mechanically with the current exclusive integrator. Expired/discarded canary v1/v2 requests remain historical and must not be replayed.

## Current verification

- direct autodispatch/fairness/surface/artifact-binding focused tests: PASS;
- unattended watcher process acceptance: PASS;
- direct controller/dispatch/GitHub receipt affected suite: PASS;
- native Work execution receipt -> exactly one V6 reasoning route: PASS;
- weaker/unverified native Work lineage rejection: PASS;
- final-response native Work route-required/route-present acceptance: PASS;
- terminal comparator Work receipt pending-review/cleared-by-later-review: PASS;
- dedicated system-producer auth: PASS;
- automatic Codex exclusion: PASS;
- TypeScript: PASS;
- repository policy/integration-owner tests: PASS;
- `git diff --check`: PASS.

Hosted full repository/Mission Control/relay gates remain required on the exact PR head before merge.

## Next actions

1. Remove local-only dependency link; review and commit the exact selective diff.
2. Push/open PR from current canonical base and require current hosted release gates.
3. Merge only if the exact final diff contains no stale supervisor-mediated Work creation, source-attested fallback, or stale relay/core replacement.
4. Inspect the current non-production runtime before mutation; install the exact merged Mission Control bytes reversibly with rollback preserved.
5. Install/activate the owner-side Work autodispatch watcher using private environment/locator state; do not expose private Chat/thread/app metadata.
6. Instantiate or recover `mission-control-development` without competing lane/runtime ownership.
7. Run one harmless zero-paid-API self-development canary through current canonical Mission Control and prove the full closed loop through automatic reasoning return/closure.
8. Reconcile/close issue #178 only from that evidence; retain shared-runtime ownership until the canary closes or a genuine human-only gate exists.
9. Continue the separate AskRigor Round-5 successor from its frozen-pre-response-1 lane after the Mission Control loop is accepted; do not reuse Round 4.
