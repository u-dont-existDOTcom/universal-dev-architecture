NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT

# Mission Control secure MCP tunnel — PRIMARY live receipt

Recorded 2026-09-14. This receipt intentionally omits credentials, tunnel identifiers, private conversation locators, provider target identifiers, runtime keys, nonces, and receipt bodies.

## Preserved prerequisite

The recovered AskRigor v2 checkpoint remains in durable non-temporary storage at `/mnt/hdd/storage/joel/AskRigor-recovery-20260913-37686f0`. Its recorded SHA-256 manifest reverified without mismatch, both Git bundles reverified as complete histories, and its exact recovery ref remains `37686f0132494bb3e777172dc8bd12dc365072e8`. No hidden DEVELOPMENT gold was opened.

## Tunnel and private app

- Netcup PRIMARY runs exactly one active outbound Secure MCP Tunnel service to the loopback-only constrained endpoint `http://127.0.0.1:3000/mcp`. The broader `/api/mcp` route was not connected.
- No inbound public Mission Control listener was opened. Mission Control, daemon, browser-control, and tunnel origin listeners remain loopback-only where applicable.
- Tunnel association used a least-privilege runtime credential sealed with systemd credentials. The tunnel service has zero recorded restarts and suppresses credential-bearing stdout/stderr.
- The current supervisor workspace/account contains exactly one private developer app named `Mission Control`.
- Direct protocol verification returned exactly `get_capability_challenge`, `get_supervisory_request_binding`, and `get_stage_liveness_state`. Each advertises `readOnlyHint:true`, `destructiveHint:false`, `idempotentHint:true`, and `openWorldHint:false`; no fourth tool exists.
- Hostinger SECONDARY was not mutated. PRIMARY remains the only active lease and SECONDARY fencing was not changed.
- Tunnel and app setup created zero provider sends.

## Exact installed relay candidate

- Branch: `task/mission-control-current-work-observability-20260913`
- Head: `47eb230b125402ab22f5491083eb554c64c24ec6`
- Relay subtree: `59920353dc916d4b8678b3565efea472a493ee76`
- Installed archive SHA-256: `4f23afc53dec7fa3d53703ec5156eebbd2be1e30a1a3f64f348c3b5c594f4bbc`
- Install checks verified exact before/after program hashes and preserved private configuration plus durable relay state byte-for-byte. The normal relay send service and obsolete host-local scheduler stayed inactive; the tunnel and remote browser stayed active.
- The live UI compatibility correction recognizes the current protected inline app pill, retains an exact required subset, adds a missing exact required app through the current searchable app menu, and fails closed on unknown, malformed, ambiguous, contaminated, or unexpected state.
- A remote no-send check ended with exactly one `Mission Control` pill and one `GitHub` pill in the empty composer and reported `inspectedAssistantOutput:false`.

## Live capability boundary

The read-only MCP preflight crossed the centrally admitted provider boundary at `2026-09-14T04:28:46.748Z` and completed at `2026-09-14T04:28:53.915Z`. Its durable record selected only `Mission Control`, as required for the preflight.

The capability attempt crossed at `2026-09-14T04:30:38.112Z` and completed at `2026-09-14T04:30:48.439Z`. The observed boundary spacing was 111.364 seconds, above the immutable 60-second minimum. That attempt selected `Mission Control` but merely referenced `GitHub`; it produced no fresh capability receipt on issue 60. The only capability receipt still present on that bus is the historical 2026-09-03 receipt, and current Mission Control capability projection remained false for Mission Control read, GitHub read, GitHub write, and aggregate current authority. The stale receipt therefore did not authorize the current challenge.

The exact mechanical defect was corrected and proven without another provider send: the current capability plan now requires both `Mission Control` and `GitHub`, and the installed remote selector verified both exact pills. A third provider send was deliberately not made because it would exceed the owner-approved no-extra-send acceptance boundary without a fresh explicit tradeoff decision.

The central authority currently reports `MISSION_CONTROL_SINGLE_WRITER`, `ACTIVE_LEASE`, `PRIMARY`, `SINGLE_ACTIVE_CONFIRMED`, 60,000 ms minimum pacing, a valid ledger, no safety halt, no unresolved admission, no ambiguity, and zero open queue items. The previously observed `PRECLICK_RETRY_PENDING` row is therefore no longer open after the admitted preflight; it was not duplicated. Terminal queue history is append-only and was not rewritten or reconstructed. No substantive v3 provider send resumed.

The application did not emit its optional public-MCP console access marker in the production container log. Consequently, generation completion alone is not promoted to proof that `get_capability_challenge` succeeded. The absent fresh receipt also prevents that inference.

One early privacy-filtering diagnostic displayed opaque browser ownership metadata in the private execution transcript. The values were not copied into Git, this receipt, GitHub, or any server log, and are intentionally not repeated. Because the historical transcript cannot be rewritten, the no-target-identifier-in-logs condition is not claimed fully clean.

## Verification

- Relay focused tests: 110 passed before the final scratch correction.
- Relay full tests at the final source: 250 passed; syntax check passed.
- Mission Control: 405 tests passed; TypeScript typecheck passed; production Next.js build passed and includes only the intended constrained `/mcp` route alongside the existing authenticated internal routes.
- Repository suite initially produced 298 passes and one documentation-label failure for this new owner-specific request artifact. The artifact was then labeled `NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT`; the final repository suite passed all 299 tests, owner-request integrity validation passed, JSON validation passed, and the repository audit reported no findings.
- PR 108 remains open and unmerged. Historical issue 90 remains closed.

## Unmet terminal acceptance and next authority

The fresh GitHub capability receipt, positive current capability booleans, server-observed exact app call, no-extra-send condition, preserved-open `PRECLICK_RETRY_PENDING` state, and completely clean target-identifier logging boundary have not all passed together. The singular v3 item remains frozen.

The next action requires an owner tradeoff: either preserve the strict no-extra-send boundary and stop with incomplete live acceptance, or explicitly authorize one fresh challenge rotation plus one globally paced capability-only retry using the now-verified two-app selector. Recommendation: authorize that one bounded retry only if completing the capability proof is worth accepting the already-recorded failed capability attempt and the fact that the former pre-click queue row is now terminal history. This does not authorize PR 108 merge, issue 90 reopening, or substantive v3 execution.
