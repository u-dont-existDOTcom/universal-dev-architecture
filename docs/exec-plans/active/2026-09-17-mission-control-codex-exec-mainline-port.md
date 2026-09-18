# Mission Control Codex-execution mainline forward-port

Status: validated review candidate

## Objective

Replay the three accepted Codex-execution commits in order onto a fresh branch from current canonical `main`, resolve overlap semantically, validate the combined current-main and Codex behavior, and publish only the review branch.

## Immutable inputs

- Fresh `origin/main`: `80aeef8ac138bfb2e9cf1809ffb6b0144da7be29`
- Reviewed source tip: `87625db886461cad1e7ef995140d55d34495d185`
- Shared merge base: `ad76fcac1aed29658dbdab6575f91965573e6c51`
- Divergence: 16 main-only commits and 3 candidate-only commits
- Replay order:
  1. `a39b36eaffc6759705ae01dd3b46cf61d3b5b2e7`
  2. `f383da2d8ced0209a861cea126289c70658db67d`
  3. `87625db886461cad1e7ef995140d55d34495d185`

## Pre-conflict overlap record

The files changed on both current main since the merge base and the accepted candidate are:

- `tools/codex-mission-control/vps-browser-relay/README.md`
- `tools/codex-mission-control/vps-browser-relay/bin/mc-chatgpt-relay.mjs`
- `tools/codex-mission-control/vps-browser-relay/src/relay.mjs`
- `tools/codex-mission-control/vps-browser-relay/test/relay.test.mjs`
- `tools/codex-mission-control/vps-browser-relay/test/state-and-client.test.mjs`

Conflict resolution must keep current-main browser-fence, health, controller recovery, expired-cycle terminalization, terminal-state helper, pacing, lease, ambiguity, and route-terminalization behavior while adding the accepted automatic Codex dispatcher and exact source-bound legacy fallback.

## Work preflight

- Residual class: `GENUINELY_DIFFICULT`
- Reason: substantial hidden coupling across overlapping relay/controller consumers
- Requested minimum expected-sufficient tier: GPT-5.6 Sol XHigh
- Fast: disabled by owner directive
- Runtime model/effort readback: unavailable on this task surface; do not fabricate identity

## Execution sequence

1. Cherry-pick the accepted commits in order.
2. Resolve each conflict semantically and record both behavior families retained.
3. Run focused tests while resolving failures.
4. Run the complete VPS browser-relay package once at the combined checkpoint.
5. Run affected Mission Control authority/profile tests, JavaScript checks, and TypeScript checks.
6. Run the two repository-required completion commands once at the final checkpoint; record pre-existing unrelated failures separately.
7. Review the exact diff against fresh main and scan public additions for secrets or private locators.
8. Commit port evidence, push the review branch without force, and verify the remote exact tip.

## Prohibited actions

Do not modify the source candidate branch, main, production, live configuration, controller recovery, the browser fence, or `state/CURRENT-STATE.md`. Do not open a pull request, merge, deploy, install, run natural owner work, or rerun paid/API/model smoke evidence.

## Conflict disposition

Two files required explicit conflict resolution during the third replay:

- `bin/mc-chatgpt-relay.mjs`: retained current-main `observeRelayHealth` behavior and added the accepted automatic Codex dispatcher, separate authenticated worker client, and exact legacy command.
- `test/relay.test.mjs`: retained the current-main expired-controller admission regression and added the accepted local-dispatch-before-browser and adjacent-task exact-fallback regressions.

`src/relay.mjs` auto-merged and was reviewed semantically. Its cycle still checks `isTerminalControllerCycle` before admitting new work, treats historical capability receipts as diagnostics rather than a prerequisite, and now composes automatic Codex dispatch before browser availability plus exact legacy selection. Current-main browser-fence and health observation files were not replaced or edited by the replay.

## Validation checkpoint

- Conflict-focused relay tests: 3 passed.
- Current-main expired-cycle terminalization tests: 4 passed.
- Complete VPS browser-relay package: 232 passed, including browser-fence, controller, health, Codex authority, automatic dispatch, exact fallback, private auth, timeout, and restricted-shell coverage.
- Work profile/admission/preflight and integrated Codex authority tests: 37 passed after installing the package's declared local dependencies in the isolated worktree.
- Relay JavaScript syntax checks: passed.
- Mission Control TypeScript typecheck: passed.
- Repository Python policy suite: 338 passed.
- Paid/API inference and live Codex model runs: not run; the runner/launch contract was replayed unchanged and only its composition with newer relay/controller code required validation.
