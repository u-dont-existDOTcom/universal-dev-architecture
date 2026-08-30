# Contract-integrity review of current Codex/Pro supervision bootstrap

Date: 2026-08-30
Reviewed path: `templates/CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md`
Reviewed branch: `architecture/codex-pro-supervision-mission-control-20260830`
Status: accepted and implemented through companion pattern, schemas, templates, fixture, and tests

## Verdict

The architecture correctly targets scope contraction, objective substitution, and completion illusion. The remaining high-impact gap was that owner-objective reconciliation was still primarily an instruction rather than an independently sourced, machine-checkable contract.

A worker can be perfectly aligned with a narrowed task contract. Mission Control therefore needs two distinct states:

- worker-to-contract alignment; and
- contract-to-owner alignment.

## Required generic additions

### Immutable owner-source identity

Every supervised task should bind:

- `owner_request_id`;
- exact canonical locator or immutable source block;
- `owner_request_sha256`;
- capture timestamp;
- append-only owner corrections with independent identities.

A summary or handoff may annotate this source but cannot replace it.

### Independent supervisor receipt

The supervisor must receive the owner source independently of the worker's handoff. A complete worker packet can still preserve the worker's framing error.

### Objective reconciliation matrix

Before substantive work and at material transitions, require:

| Owner requirement | Worker interpretation | Task criterion | Acceptance evidence | Status | Authorized change |
| --- | --- | --- | --- | --- | --- |

Every owner requirement must be mapped, explicitly excluded by the owner, or escalated.

### Typed completion claims

Distinguish:

- `WORKING`;
- `ARTIFACT_READY`;
- `TESTS_PASS`;
- `READY_FOR_OWNER_REVIEW`;
- `READY_FOR_RELEASE`;
- `PARTIAL_OUTCOME`;
- `OWNER_OUTCOME_ACHIEVED`;
- `BLOCKED_OWNER_DECISION`.

No earlier state implies `OWNER_OUTCOME_ACHIEVED`.

### Mission Control heartbeat fields

```json
{
  "owner_request_sha256": "...",
  "task_contract_sha256": "...",
  "objective_reconciliation_status": "MATCH | PARTIAL | DIVERGED | SOURCE_MISSING",
  "unmapped_owner_requirements": [],
  "authorized_scope_changes": [],
  "completion_claim_type": "WORKING | ARTIFACT_READY | REVIEW_READY | OUTCOME_ACHIEVED",
  "contract_divergence": [],
  "evidence_receipts": []
}
```

Mission Control should be able to show worker alignment green while contract integrity is red.

### Fail-closed supervisor verdicts

The supervisor cannot issue `ON_TRACK` or approve completion when the owner source is missing, a material requirement is unmapped, the contract diverges, or the evidence only proves artifact/review readiness.

Add explicit verdicts:

- `OBJECTIVE_SOURCE_MISSING`;
- `CONTRACT_RECONCILIATION_REQUIRED`;
- `OBJECTIVE_DIVERGED`;
- `COMPLETION_CLAIM_UNSUPPORTED`.

### Recurring reconciliation

Re-run reconciliation:

- after material discoveries;
- before phase transitions;
- before owner review;
- before release/deployment;
- after acceptance-test changes;
- after owner corrections.

### Append-only corrections

Owner corrections change future authority without silently rewriting prior checkpoints. Preserve what each actor knew, when authority changed, and whether prior approvals became invalid, incomplete, or merely historical.

## Hostile acceptance fixtures

1. Task contract omits a material owner sentence.
2. Worker substitutes review readiness for a requested measured outcome.
3. Existing acceptance criteria faithfully encode the wrong objective.
4. Supervisor sees only the worker's polished handoff.
5. Owner source is unavailable.
6. Later correction changes future criteria without rewriting history.
7. Worker-to-contract alignment is green while contract-to-owner alignment is red.
8. Material discovery makes the approved plan incapable of satisfying the owner outcome.
9. Tests pass while the user-visible outcome is absent.
10. Domain adequacy passes while privacy/licensing/release adequacy fails.

## Adoption recommendation

Add these fields and fixtures to the generic shared bootstrap/Mission Control contracts. Domain repositories should then add only domain-specific adequacy and release fields rather than forking objective-integrity logic.

## Implemented disposition

The critique is implemented through:

- `patterns/supervision-assurance-planes-and-pro-meta-review.md`;
- `templates/OBJECTIVE-RECONCILIATION.json`;
- `templates/RESEARCH-SUPERVISION-VERDICT.json`;
- `templates/SUPERVISION-DESIGN-FEEDBACK.json`;
- the revised current-worker bootstrap, task contract, current-state, and active-task templates;
- `docs/exec-plans/2026-08-30-mission-control-dual-alignment-and-pro-meta-review-addendum.md`;
- the strengthened `13.82% Human` regression fixture;
- `tests/test_supervision_assurance_planes_pattern.py`.

The owner additionally requires every worker that discovers a substantive supervision-design improvement or question to route a self-contained packet to the shared scope-bound Pro supervisor-design chat. No ceremonial Pro call is required when the worker has no substantive feedback.
