# PR #117 final trust-boundary amendment

## Objective

Amend the existing open PR #117 in place. Do not create a new PR, merge, or deploy.

Preserve the corrected setter-only semantics, separate Chat-message vs directive-artifact provenance, no-self-escalation, telemetry, and archive integrity.

Fix the remaining trust-boundary defect: an authenticated Work/Codex worker must not be able to assert that model/effort setters were applied and thereby satisfy `SET_REQUEST_SUFFICIENT` without evidence from the actual task-creation boundary.

## Verified defect

Current PR code allows `scripts/require-supervision-admission.mjs` to accept `--applied-selection` from the worker, send it to the worker-authenticated `/preflight` endpoint, and have that endpoint persist the result as a SYSTEM event. Because Mission Control currently has no callable task-creation bridge, this is worker self-attestation, not task-creation evidence.

The PR is correctly classified `CONTRACT_ONLY_BRIDGE_BLOCKED`; the runtime must reflect that classification fail-closed.

## Required repair

1. **Worker-supplied `appliedSelection` cannot authorize execution.** Remove the path where a WORKER-authenticated request can provide raw setter values and have them treated as applied-selection evidence.

2. Add a typed task-creation setter evidence object/event for future use, e.g. `work_task_creation_selection_applied`, containing only:
   - exact task/directive/profile authorization identity;
   - exact model setter requested;
   - exact reasoning-effort setter requested;
   - Fast request state if an exposed control exists;
   - trusted producer/source identity;
   - task/thread creation receipt or provider locator if exposed;
   - timestamp.

3. Only a trusted task-creation bridge / SYSTEM producer may create that evidence. A WORKER producer must not be able to create or substitute it.

4. The preflight endpoint may accept only an **evidence ID/reference**, not raw `appliedSelection`, for `SET_REQUEST_SUFFICIENT` runtime admission. It must load the persisted trusted evidence and compare it to the source-authorized profile.

5. Because the current product boundary exposes no callable Mission Control task-creation bridge, current runtime preflight must return a truthful fail-closed state such as:
   - `WORK_TASK_CREATION_BRIDGE_UNAVAILABLE`, or
   - existing `WORK_EXECUTION_PROFILE_UNVERIFIABLE` with a precise reason code.

   Do not claim ordinary autonomous setter-only execution is currently enforceable.

6. Keep the **pure contract function** capable of evaluating `SET_REQUEST_SUFFICIENT` given trusted setter evidence. This preserves the future bridge-ready design and tests the intended semantics without pretending the present bridge exists.

7. Update finalization/receipt semantics so `SET_REQUEST_ONLY` means **trusted task-creation setter evidence exists but provider readback is unavailable**. It must never mean "the worker said these setters were used."

8. Telemetry must carry the same evidence quality distinction.

## Policy identity cleanup

The PR modifies `patterns/work-model-and-effort-routing.md` while profiles still hard-code `policyCommit=fc3d0d7592a4fa69e94ff8ae31d9a4e5433b73cb` (the pre-amendment policy commit).

Do not leave a field named `policyCommit` claiming to identify the exact current policy if it does not contain the assurance semantics now enforced.

Choose one non-circular truthful solution:

- rename it to `routingPolicyBaseCommit` and document that it binds the original routing-ladder decision only, **plus** add a stable `contractVersion` for the setter/readback enforcement semantics; or
- replace commit identity with a stable semantic `policyVersion`/content identity that can truthfully identify the merged semantics without depending on an unknown future merge SHA.

Do not hard-code the PR head as if it were the future merge commit.

## Required tests

Preserve all current tests and add/adjust regressions proving:

1. WORKER raw setter self-attestation cannot satisfy preflight.
2. WORKER cannot create trusted task-creation setter evidence.
3. SYSTEM/trusted bridge evidence with exact Sol Medium setters satisfies `SET_REQUEST_SUFFICIENT` in the pure/runtime seam when such evidence exists.
4. Trusted Astra Low setter evidence works analogously.
5. Wrong setter evidence fails closed.
6. Setter evidence bound to wrong directive/task/profile fails closed.
7. Current bridge-missing live path remains blocked with exact reason.
8. Provider readback remains null/unverified under SET_ONLY.
9. `INDEPENDENT_READBACK_REQUIRED` remains blocked without readback even if trusted setter evidence exists.
10. Finalization cannot upgrade worker self-report into `SET_REQUEST_ONLY` identity evidence.
11. Telemetry cannot claim `SET_REQUEST_ONLY` without trusted setter evidence.
12. The policy identity fields are truthful under the revised scheme.
13. Existing provenance test with different Chat-source and directive-artifact hashes remains green.
14. Existing no-self-escalation and Fast-state truth tests remain green.

## Consumer seam

> A source-authorized model/effort profile is considered setter-applied only when the actual trusted task-creation boundary records the exact setter request. Worker self-report is never setter evidence. Until that bridge exists, Mission Control remains contract-ready but fails closed for autonomous model-routed task creation.

## Verification

Run focused/affected tests, Mission Control full tests, repository-required full suite, typecheck/build, deterministic audit, owner-integrity checks, archive reconstruction, and hosted PR checks as required.

Return `PR 117 TRUST BOUNDARY AMENDED` with new head SHA, exact trust-evidence path, policy-identity repair, tests, hosted checks, and remaining product limitation.

Do not merge or deploy.
