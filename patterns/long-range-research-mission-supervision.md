# Long-range research mission supervision

Status: proposed reusable extension to the shared Codex/Pro supervision architecture

## Purpose

Use this pattern when work may continue across multiple research sessions, workers, restarts, releases, or scheduled refreshes. It supplements the shared supervision bootstrap and does not replace its owner-outcome invariant, anti-contract-laundering rules, intelligence routing, or deterministic-evidence requirements.

## Core composition

```text
Owner/user purpose
  -> RESEARCH-MISSION.json authority
    -> versioned research questions
      -> independent work packages
        -> bounded research sessions / Codex tasks / provider operations
          -> evidence records and receipts
            -> interim snapshots
              -> reviewed release versions
                -> scheduled refresh / correction / closure
```

The root mission is authoritative. Child tasks cannot rewrite or close it.

## 1. Authority layers

### 1.1 Immutable purpose

Preserve verbatim and hash:

- the user's requested outcome;
- non-negotiable constraints;
- intended audience/use;
- privacy and publication expectations;
- initial scope and exclusions.

A checkpoint, PR, study audit, synthesis, supervisor verdict, or passing test cannot replace this purpose.

### 1.2 Amendable research questions

Scientific learning may justify changing the questions. Every amendment must:

- preserve the immutable purpose;
- identify the prior question/version;
- state the evidence or owner decision motivating the change;
- classify the change as clarification, narrowing, expansion, replacement, or new branch;
- preserve abandoned and unresolved questions historically;
- define changed acceptance/coverage requirements.

No silent question drift.

### 1.3 Independent data authority

Participant consent, data-use permissions, withdrawal, source licenses, provider rules, and legal/security boundaries are independent constraints. They cannot be overridden by owner outcome or supervisor preference.

### 1.4 Public release authority

Work completion and publication are separate. A public release requires a release receipt binding exact claims, evidence, freshness, dissent, limitations, privacy/consent, licensing, and approver.

## 2. Mission modes

- `QUICK`: one bounded pass.
- `DEEP`: sustained but ordinarily one release cycle.
- `LONG_RANGE`: multiple work cycles across days/weeks or many workers.
- `LIVING`: recurring surveillance and versioned updates until paused or closed.

Mode affects lifecycle, budgets, cadence, and reporting. It does not weaken evidence requirements.

## 3. Research-specific lifecycle

Primary flow:

`PROPOSED -> PREFLIGHT -> ACTIVE -> INTERIM_SNAPSHOT -> ACTIVE -> RELEASE_CANDIDATE -> RELEASED`

Additional states:

- `PAUSED_USER`
- `PAUSED_BUDGET`
- `BLOCKED_ACCESS`
- `BLOCKED_OWNER_DECISION`
- `WAITING_FOR_EVIDENCE`
- `SCHEDULED_REFRESH`
- `STALE_REFRESH_FAILED`
- `CORRECTION_PENDING`
- `CANCELLED`
- `SUPERSEDED`
- `CLOSED`

A released living mission can return to `ACTIVE` for a new version. A release is not permanent evidence-frontier exhaustion.

## 4. Work-package contract

Each work package must declare:

- mission and question version;
- exact objective;
- read set and write set;
- source classes/date windows/languages/jurisdictions;
- prerequisites;
- epistemic role: discovery, identity, screening, access, audit, synthesis, contradiction, prediction, community evidence, explanation, release verification, or other explicit role;
- independence/blinding requirements;
- worker class and reasoning tier;
- provider/tool permissions and budget;
- lease/fence token;
- structured output schema;
- deterministic acceptance tests;
- scientific/reviewer acceptance state;
- heartbeat/checkpoint cadence;
- escalation and stop conditions.

A package can finish while the parent remains open. Report `SUBTASK_COMPLETE_PARENT_OPEN` unless root closure is independently proven.

## 5. Safe parallelism

Parallelism is allowed when the mission records:

- non-conflicting or explicitly coordinated write sets;
- shared identity and deduplication authority;
- required independence between judgments;
- lease/fence rules preventing stale commits;
- reconciliation/adjudication procedure;
- duplicate-work detection;
- common protocol/rubric/source versions.

Useful independent lanes include:

- searches by database/source class/language;
- duplicate blinded eligibility screening;
- independent method audits;
- synthesis versus contradiction challenge;
- formal evidence versus patient/community evidence;
- public explanation versus entailment verification;
- privacy/consent review versus scientific review.

Do not use alignment percentage to pressure independent workers into false consensus.

## 6. Evidence frontier

The mission tracks what was actually searched and what remains:

- requested versus confirmed source classes;
- exact queries/query versions;
- date windows;
- pages/cursors and exhaustion state;
- candidate decisions and reasons;
- full-text/access state;
- audits and synthesis coverage;
- unresolved trails;
- blocked/inaccessible sources;
- zero-result receipts;
- freshness and next refresh;
- explicit stopping rule.

The final prose report is derived output. It is not the frontier authority.

## 7. Progress reporting

Avoid a mission-wide percentage unless the entire search space is fixed and declared.

Display:

- current mission state;
- current question versions;
- source-class coverage;
- candidate/screening/audit/synthesis counts;
- unresolved contradictions;
- access and budget blocks;
- current active packages and leases;
- latest interim snapshot;
- current released version;
- freshness/refresh status;
- next executable step;
- owner decision needed, if any.

A work package may have a percentage against its finite checklist. Label it explicitly as package progress.

## 8. Interim snapshots

An interim snapshot must state:

- nonterminal status;
- evidence date and exact frontier coverage;
- current supported, contradicted, and uncertain conclusions;
- important missing work;
- whether the snapshot is safe for any external use;
- next work and budget state;
- supersession relationship.

It cannot be silently promoted to a final answer or public release.

## 9. Budgets and resources

Store ceilings and current use for:

- provider/API spending;
- premium reasoning usage;
- worker concurrency;
- storage/retention;
- scheduled refresh frequency;
- human review.

On exhaustion:

- fail closed or pause according to policy;
- preserve frontier/checkpoint;
- state which resource ended;
- route to approved account/provider failover if available;
- never relabel incomplete work as terminal.

## 10. Pro and Extra High routing

### Use Pro for

- owner-value tradeoffs;
- consequential health/safety interpretation;
- conflicts among strong evidence sources;
- original discovery/novelty claims;
- public release wording;
- sensitive-data/consent policy;
- material scope changes;
- unresolved methodological judgments that change conclusions.

### Use Extra High for

- repository-aware research planning;
- literature and standards scans;
- source/synthesis comparison;
- audit reconstruction;
- deterministic evidence review requiring GitHub access;
- context preparation for Pro.

### Use Codex/ordinary workers for

- implementation;
- parsing, identity resolution, deduplication;
- schema validation;
- deterministic calculations;
- controlled source acquisition;
- fixture/test construction;
- projections and dashboards.

Pro never becomes the canonical evidence store or mission controller.

## 11. Conflict and adjudication

For every consequential disagreement preserve:

- independent judgments;
- exact evidence and rationale;
- rubric/protocol/source version;
- adjudicator decision when made;
- unresolved state where no justified resolution exists;
- effect of each plausible judgment on synthesis/release.

The objective is calibrated truth, not unanimous-looking dashboards.

## 12. Sensitive-data extension

When a mission handles personal/sensitive data:

- use a separate private identity/contact store;
- minimize data supplied to workers;
- bind every data use to a specific consent/legal/provider authority;
- prohibit public release without exact-version consent and privacy review;
- support withdrawal/deletion according to disclosed limits;
- block analytics/advertising trackers by default;
- report breaches or unauthorized disclosures under applicable rules;
- prevent raw sensitive data from entering Git, supervisor chats, worker prompts, logs, or public dashboards.

## 13. Publication firewall

A `RESEARCH_RELEASE` record must include:

- mission and question versions;
- exact public claims/text;
- claim/evidence/source/audit/synthesis versions and hashes;
- coverage/freshness;
- limitations and dissent;
- can-support/cannot-support/uncertain;
- privacy/consent/licensing checks;
- release reviewer/approver;
- release hash/signature and timestamp;
- supersession/correction state.

Only a valid release can update a public current pointer.

## 14. Mission closure

A non-living mission closes only when:

- the immutable purpose's completion criteria are met or explicitly amended by the owner;
- all mandatory work packages are accepted;
- unresolved gaps are disclosed and compatible with the requested outcome;
- no active lease or unreviewed consequential conflict remains;
- release/handback/deletion obligations are complete;
- the terminal comparator evaluates the owner outcome, not a proxy artifact.

A living mission closes only by explicit owner/system authority after any required final snapshot, subscription handling, and retention/deletion actions.

## 15. Failure patterns prevented

- “The PR merged, therefore the research is done.”
- “One database was searched, therefore discovery is complete.”
- “A high-weight study is the best-quality study.”
- “Workers agree, therefore the claim is true.”
- “A checkpoint is a final answer.”
- “A released review is permanently current.”
- “The owner wants publication, therefore participant consent is unnecessary.”
- “The budget ended, therefore the incomplete frontier is a bounded conclusion.”
- “A new hypothesis silently replaced the original question.”
