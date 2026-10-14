# Current State — reissue a Work question that expired unsent; one failing fleet watch no longer starves the rest

## Goal

- Task ID: `pr-378`.
- Branch: `claude/work-question-reissue-20261014`.
- The Work-supervisor round trip (issue #339) stalled at its send step: a native Work thread's question to its supervisor expired on 8 Oct while the relay's sending was off, and nothing in Mission Control can queue it again. Let the owner reissue such a question once it is proven unsent, so the relay sends it and the answer continues the same Work thread. Also stop one failing fleet watch from starving the others.

## Authority / baseline

- Owner, 12 Oct 04:36 UTC: "turn them both on" (supervision running again); the owner page's agreed order puts the #339 round trip next once the relay sends again, which it has since 14 Oct 03:05 UTC.
- Evidence: the live status on 14 Oct showed the worker's latest supervisor request as a Work question queued 8 Oct, expired the same day, never sent; the relay reports no pending request on every cycle.
- Baseline: `main` at `7a58228f`.

## Completed

- `lib/work-question-reissue.ts`, the owner-only daemon route `POST /workers/:worker/work-questions/reissue-expired` and the owner-action `work-question-reissue`: proof-gated retirement of the expired question and one successor with the same question, capsule, owner outcome, supervisor and Work thread, a fresh window of the same length and today's decision channel, appended in one transaction; idempotent; refuses anything sent, answered, superseded, overtaken or stale.
- `lib/unsent-request-proof.ts`: the submission authority proves work-question ids unsent; a retirement counts only from the verifier for that request kind, in Mission Control and in the relay.
- `FleetSupervisorRuntime.tick`: a watch whose tick throws stays due and the tick still fails, but the watches after it run.
- Tests for each, including an in-process relay dry run that selects the reissued question.

## Current checkpoint

- Pushed for CI and review.

## Remaining

- Green checks and a clean review, then the owner's merge and a Mission Control deploy; then the owner reissues the expired question once from inside the live container.

## Blockers / unresolved

- None in this change. Routing system-derived owner-action gaps to the supervisor is a separate follow-up.

## Evidence / artifacts

- `python3 -m unittest discover -s tests -v`: **PASS**, 949 tests
- `python3 scripts/audit_codex_github.py --root . --fail-on error`: **PASS**, 0 errors, 0 warnings
- `npm test` in `tools/codex-mission-control/restored/codex-mission-control`: **PASS**, 647 tests; `npm run typecheck`: **PASS**.
- `node --test test/*.test.mjs` in `tools/codex-mission-control/vps-browser-relay`: **PASS**, 553 tests; `npm run check`: **PASS**.

## Next safe action

- Read CI and the review on this head; if both are clean, put the merge and the deploy in the owner's next command.
