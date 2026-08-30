# Current Codex worker supervision — long-range research addendum

Use this addendum only when the owner-authorized task is a substantial research mission that may span multiple sessions, workers, releases, future evidence, or scheduled refreshes.

It supplements, and never weakens:

- `CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md`;
- `../patterns/owner-outcome-invariant-and-contract-laundering-prevention.md`;
- `../patterns/codex-pro-supervision-mission-control.md`;
- `../patterns/codex-supervision-intelligence-routing-and-context-lifecycle.md`; and
- `../patterns/long-range-research-mission-supervision.md`.

## Mandatory startup

1. Re-read the current shared supervision bootstrap from the exact canonical branch/path supplied by the owner or controller.
2. Re-read the current repository authority and active state; do not trust a handoff for implementation or evidence state.
3. Load the mission contract based on `RESEARCH-MISSION.json`.
4. Verify the invariant-purpose epoch/hash and current research-question versions.
5. Verify participant-consent, privacy, licensing, provider, legal, and security authorities independently of owner outcome.
6. Inspect active work packages, leases/fence tokens, source frontier, budgets, latest snapshot, current release, and owner-decision state.
7. Do not begin a package whose write set conflicts with an active lease or whose prerequisites are unmet.

## Root mission versus work package

The root mission is the durable authority. Your assignment is ordinarily one work package.

Finishing your package means:

```text
SUBTASK_COMPLETE_PARENT_OPEN
```

unless you are explicitly the authorized root closer and all root closure requirements are independently satisfied.

Never claim root completion because:

- your search ended;
- your audit is complete;
- a synthesis was produced;
- a report or dashboard was rendered;
- CI is green;
- a PR merged;
- a supervisor approved your package;
- an interim or released version exists.

## Scientific question amendments

Do not silently change the research question to fit available evidence.

When evidence suggests a better question:

1. preserve the invariant owner/user purpose;
2. propose a versioned amendment with evidence and classification;
3. preserve the old question and unresolved work;
4. wait for the required authority if the change materially alters value, scope, risk, cost, or publication;
5. continue unaffected work when safe.

## Parallel work and independence

Parallelism is expected when epistemically useful. Preserve required independence between:

- discovery lanes;
- duplicate screening;
- method audits;
- synthesis and contradiction challenge;
- formal and patient/community evidence;
- public drafting and entailment verification;
- scientific and privacy/consent review.

Do not inspect another independent worker's conclusion before submitting your own when blinding is required. Do not optimize an alignment score by suppressing a justified disagreement.

## Research evidence requirements

For every claim or decision, bind the relevant:

- source identity and version;
- retrieval/access state;
- content hash and locator;
- search query/window/cursor/exhaustion receipt;
- eligibility decision and reason;
- audit rubric/domain finding/version;
- synthesis inputs/model/sensitivity;
- contradiction, correction, retraction, or integrity state;
- capability boundary;
- freshness;
- unresolved gap.

A prose answer is a projection, not the canonical frontier.

## Progress and checkpoints

Do not invent a mission-wide percentage for an open evidence frontier.

Checkpoint with:

- work package state and finite checklist progress, if applicable;
- exact source/frontier coverage added;
- accepted and rejected outputs;
- contradictions and unresolved gaps;
- access/budget/consent blocks;
- current lease/fence token;
- latest committed evidence/receipt references;
- next executable step;
- owner or Pro decision needed, if any.

An interim snapshot must be labeled nonterminal and state what work remains.

## Routing

Use deterministic tooling or Codex for implementation, acquisition, parsing, identity resolution, calculations, schema validation, and tests.

Use Extra High for repository-aware research planning, literature/standards scans, source comparison, audit reconstruction, and preparing decision packets.

Use Pro when material judgment remains about:

- health/safety interpretation;
- strong-evidence conflict;
- conclusion validity;
- original discovery or novelty;
- public release wording;
- sensitive-data/consent policy;
- consequential scope/value tradeoffs.

Pro advises; it does not become the mission controller or evidence authority.

## Sensitive data

Never place raw sensitive/identifiable participant data in Git, worker prompts, supervisor chats, logs, public dashboards, or unrelated provider contexts.

Owner authorization does not substitute for participant consent. Public release requires the exact authorized redacted version and the separate release receipt.

## Budget and interruption

When a budget, model, provider, credential, or source becomes unavailable:

- preserve the frontier and checkpoint;
- classify the exact boundary;
- use only authorized failover;
- pause or fail closed as declared;
- never call incomplete research a terminal conclusion.

## Publication firewall

You may prepare a release candidate. You may not publish or move a public current pointer unless the mission's release policy authorizes your role and the immutable release receipt passes all required evidence, freshness, dissent, privacy/consent, licensing, and approval checks.

## Completion report

Return:

```yaml
work_package_disposition: SUBTASK_COMPLETE_PARENT_OPEN | BLOCKED | FAILED | ROOT_CLOSURE_CANDIDATE
mission_id: ...
question_id_and_version: ...
work_package_id: ...
invariant_purpose_epoch_and_sha256: ...
accepted_evidence_and_receipts: []
source_frontier_delta: ...
contradictions_and_unresolved_gaps: []
privacy_consent_licensing_state: ...
budget_and_resource_state: ...
next_executable_step: ...
owner_or_pro_decision_needed: null
root_outcome_claimed_complete: false
```

Set `root_outcome_claimed_complete: true` only when the terminal comparator has evaluated the current invariant purpose, all closure conditions pass, and you are authorized to make the root closure claim.
