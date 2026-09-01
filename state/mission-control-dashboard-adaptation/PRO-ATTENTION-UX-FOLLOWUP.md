# Pro attention/correction UX follow-up — turn 2 and final turn in this chat

Shared scope key: `supervision-architecture/pr42-owner-outcome-dual-alignment`

Feedback ID: `SDF-20260830-DASHBOARD-ACTIONABILITY-001`

This is the second substantive turn in this Pro chat. After this response, close this chat for substantive work and hand off any further review using the exact packet, response, state vector, and high-water mark.

## First-turn disposition

The first-turn verdict was `ACCEPT_WITH_REVISION`. It accepted the explanation-first attention queue and Test cleanup top-viewport UX, but blocked public schema freeze on generalized directive/response semantics, exception paths, correction-attempt and target identity, evidence freshness/binding, event-derived finding status, fail-closed owner-action `NONE`, and replacement of the independent-work Boolean with a scoped continuation policy.

## Implemented delta

- Durable status names are now target-neutral: `DIRECTIVE_PREPARED`, `DIRECTIVE_ISSUED`, `DIRECTIVE_DELIVERED`, `DIRECTIVE_DELIVERY_FAILED`, `DIRECTIVE_ACKNOWLEDGED`, `DIRECTIVE_SUPERSEDED`, `DIRECTIVE_WITHDRAWN`, `CORRECTION_STARTED`, `CORRECTION_EVIDENCE_SUBMITTED`, `CORRECTION_EVIDENCE_REJECTED`, `CORRECTION_VERIFIED`, `CORRECTION_RESOLVED`, `CORRECTION_REOPENED`, `CORRECTION_BLOCKED`, and `CORRECTION_FAILED`.
- UI labels remain target-specific. A `WORKER_REDIRECT` at `DIRECTIVE_DELIVERED` projects exactly `REDIRECT DELIVERED — AWAITING ACKNOWLEDGEMENT`; contract repair remains a directive and does not blame a conforming worker.
- Directive kinds include `WORKER_REDIRECT`, `CONTRACT_REPAIR`, `RELEASE_REMEDIATION`, `EVIDENCE_REPAIR`, and `OWNER_DECISION`. Targets include worker run, task contract, release candidate, evidence set, and owner decision.
- Every correction event binds correction attempt, directive ID and SHA-256 digest, task, worker run, assignment epoch, contract ID/hash, owner-outcome ID/epoch/hash, target kind/ID/epoch, producer, actor and role, correlation, causation, and exact predecessor event ID.
- Delivery requires a receiver-generated receipt bound to the exact directive digest and destination. Acknowledgement binds both directive ID and digest. Start requires worker/authorized-executor provenance, a first corrective action, and an expiring lease. `correctionInProgress` is false after expiry or any blocked/failed/superseded/withdrawn/reopened state.
- Evidence submission requires one evidence set, exact candidate, current receipt IDs, and evidence-requirement schema. Verification additionally requires policy identity/hash, verifier identity/role/method, and a PASS manifest covering each required evidence item. Store validation rejects stale, mixed-candidate, missing, unverified, or unknown-provenance verification receipts.
- Verified/resolved state is fail-closed when the current candidate, contract, or owner-outcome binding changes: projection becomes `CORRECTION_REOPENED`, verification/resolution becomes false, and a durable reopen event is supported. Resolution cannot append until every bound raw finding has independently reached `RESOLVED` or `INVALIDATED`.
- Findings are immutable `OPEN` records. `finding_status_changed` events derive `MITIGATED`, `RESOLVED`, `INVALIDATED`, or `REOPENED`; duplicate finding records are rejected.
- Active directive conflict, missing owner-action telemetry, overdue non-owner next action, non-retrying delivery failure, and owner-held correction blocker fail closed to `MANUAL_INTERVENTION_REQUIRED`.
- Owner action is a structured obligation, not an enum alone. `NONE` requires reason, known next actor, exact next action/trigger/due time, evidence sources, and escalation policy. `VERIFY_RESULT` binds evidence set and candidate. `DECISION_REQUIRED` now requires the full Pro choice packet: decision context/question, at least two options, benefits, drawbacks, downstream consequences, recommendation and reasoning, full Pro analysis reference, and default if unanswered. The UI renders the full packet rather than a brief summary.
- The independent-work Boolean is removed from the runtime schema. The continuation policy is `PAUSE_ALL`, `SAFE_WITHIN_SCOPE`, `CONTINUE_UNRESTRICTED`, or `UNKNOWN`, with allowed/forbidden scopes, preconditions, basis findings/evidence, expiry, and recheck trigger. `UNKNOWN` grants no allowed scope and projects fail-closed.
- Test cleanup projects `UNSAFE — STOP`; after stop/revert it allows only `tests/**` and `test-support/**` and forbids `src/core/**` and `src/production/**`.
- The four required Test cleanup reason codes are visible, with task/run, contract/outcome hashes, scope rules, checkpoint, base/current candidate, changed-path manifest, forbidden path, plan-change, and assumption bindings. AskRigor shows independent operational/scientific/release planes, required scientific/release reason codes, exact candidate/claim span/source/manifest/rule/run/evaluator/policy/gate bindings.
- Billing still says `NO CORRECTION ISSUED`; a withdrawn prior directive instead says `PRIOR ... WITHDRAWN — NO ACTIVE DIRECTIVE`.
- The all-worker attention queue remains default. Numeric alignment is secondary metadata. Desktop and CSS-width 390 views have zero horizontal overflow.

## Deterministic evidence

- `npm run typecheck`: PASS.
- 37 tests: PASS, 0 fail.
- Tests cover receiver-bound delivery, digest-bound acknowledgement, worker/authorized start plus expiring lease, atomic verification manifest, owner `NONE` timeout escalation, full Pro decision packet validation, automatic fail-closed reopen on binding change, scoped Test cleanup continuation, immutable/event-derived findings, contract laundering, terminal evidence, AskRigor plane separation, three-turn cap, daemon-only SQLite routes, and Symphony read-only adaptation.
- Runtime daemon health: sequence 67, hash chain valid.
- Responsive screenshots:
  - `docs/evidence/mission-control-adaptation/dashboard-top-1440.jpg`
  - `docs/evidence/mission-control-adaptation/dashboard-top-390.jpg`
  - `docs/evidence/mission-control-adaptation/test-cleanup-detail-top-1440.jpg`
  - `docs/evidence/mission-control-adaptation/test-cleanup-detail-top-390.jpg`

## Final questions for this chat

Return one structured verdict: `ACCEPT`, `ACCEPT_WITH_REVISION`, `REJECT`, `NEEDS_EVIDENCE`, `OWNER_DECISION_REQUIRED`, or `PROJECT_LOCAL_ONLY`.

Then state:

1. Are the first-turn schema blockers resolved enough to freeze this slice's public lifecycle, owner-action, and continuation-policy semantics?
2. Identify any remaining *schema-blocking* loophole, separating it from reasonable follow-on hardening.
3. Does Test cleanup now avoid every false claim that correction is underway, while plainly directing stop/revert/return-to-test-scope?
4. Does the contract-repair target avoid worker blame, and does AskRigor preserve all three assurance planes?
5. If any owner decision is genuinely required, provide the full choice analysis: exact question, options, benefits, drawbacks, downstream consequences, recommendation, reasoning, and default if unanswered. Do not compress an owner choice into a brief summary.
