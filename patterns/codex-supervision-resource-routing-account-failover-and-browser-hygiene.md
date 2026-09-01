# Codex Supervision Resource Routing, Account Failover, and Browser Hygiene

**Status:** Required owner correction and companion to:

- `codex-pro-supervision-mission-control.md`
- `codex-supervision-intelligence-routing-and-context-lifecycle.md`

**Date:** 2026-08-30  
**Authority:** Current owner correction

---

## 1. Normative correction

This pattern supersedes any reading of the Mission Control architecture that implies:

- Codex should be used whenever a task involves code or GitHub;
- Extra High should be skipped merely because Codex is available;
- Pro should be conserved so aggressively that important therapy or AskRigor judgments are left to a weaker route;
- every uncertain task should be sent directly to Pro without triage;
- two owner-authorized ChatGPT accounts can be treated as one merged account or one continuous conversation;
- reaching an ordinary usage limit is indistinguishable from an account restriction;
- browser tabs opened by automation may accumulate indefinitely;
- closing the visible browser is an adequate substitute for recording task/chat provenance.

The corrected rules are:

1. **Use Extra High for analysis, repository reading, planning, review, research, and artifact preparation whenever local execution is not required.**
2. **Use Codex for capabilities that require an execution environment:** terminal, filesystem, multi-file mutation, build/test loops, local services, OS/browser control, deployment, or other tool-backed action Extra High cannot complete reliably.
3. **Use Pro when the decision merits the highest available semantic intelligence.** Do not be stingy for material therapy-answer or AskRigor-methodology judgments, but do not spend Pro on retrieval, routine code review, or deterministic facts.
4. **When Pro value is uncertain, Extra High may perform a bounded Pro-necessity triage.** Obvious high-consequence Pro cases bypass this extra step.
5. **Track resource use and audit it periodically and whenever a resource becomes unavailable.** The audit asks whether Pro and Codex were used where they changed outcomes, not merely whether usage was high.
6. **Use the owner’s second authorized account as a documented failover only after identifying the exact exhausted resource and confirming that the second account independently has the needed capability.** Never rotate accounts to evade an account-level restriction or enforcement action.
7. **Treat every account as a separate authority and conversation namespace.** Cross-account continuation requires an exact handoff capsule; chat history, files, memory, workspaces, and usage do not merge.
8. **Tabs opened by the automation are leased resources.** Reuse them only when near-term reuse is declared; otherwise close them at task boundaries and periodic tab audits.

---

## 2. Current platform constraints

As of 2026-08-30, OpenAI documents that:

- ChatGPT web can keep two accounts signed in and switch between them without logging out;
- the accounts remain independent, and switching does not merge chats, memory, files, billing, or workspaces;
- the built-in account switcher is not supported in Codex desktop or native ChatGPT mobile apps;
- Codex consumption varies with model, task size, codebase size, execution location, and session length;
- the Codex usage page or limit banner is the authoritative user-facing signal when a limit is near or reached;
- some ChatGPT models have separate usage allowances, which can vary by Pro tier and may show a reset time when unavailable.

Official references:

- https://help.openai.com/en/articles/20001068
- https://help.openai.com/en/articles/11369540/
- https://help.openai.com/en/articles/9793128/

Consequences for Mission Control:

- never hard-code an assumed number such as “500 Pro messages per month” without direct current account evidence;
- never infer remaining usage from silence or from an old plan description;
- record observed availability, banners, reset times, and local usage estimates separately;
- do not claim that the platform itself automatically switches accounts;
- do not assume the web account switcher can switch Codex desktop sessions;
- do not treat a second account as merged capacity.

---

## 3. Capability-first routing

### 3.1 Routing question

Before choosing a surface, ask:

> What capability is required for the next decision or action?

Do not route merely from the task’s domain label.

### 3.2 Default capability map

| Required capability | Default route |
|---|---|
| Exact branch/SHA/test/CI/schema fact | Deterministic tooling |
| Public-web research or literature mapping | Extra High with appropriate search/research tools |
| GitHub repository reading and evidence extraction | Extra High or deterministic Git/GitHub tooling |
| Architecture, planning, protocol design, code review, diff review | Extra High |
| Drafting implementation instructions or patch plan | Extra High |
| Bounded GitHub metadata/document edit supported by a connector and requiring no local verification | Extra High/controller surface |
| Local filesystem, terminal, package manager, compiler, build, tests | Codex |
| Multi-file implementation requiring an execution loop | Codex |
| Running or debugging local services | Codex |
| OS-level or browser automation | Codex/Work-capable execution surface |
| Deployment, migration, or environment inspection | Codex with the proper owner gate |
| Therapy-response semantics, safety, relational interpretation | Pro when material |
| AskRigor methodology, evidence interpretation, conclusion validity | Pro when material |
| Highest-consequence disputed judgment | Fresh Pro adjudication when independence matters |

### 3.3 Extra High is the default reasoning surface, not an absolute unlimited resource

The owner expects Extra High availability to be much less constraining than Codex or Pro. Treat it as the default abundant reasoning pool while still recording actual observed availability.

Do not encode `extra_high_unlimited: true`. Use:

```text
availability = AVAILABLE | NEARING_LIMIT | EXHAUSTED | RESTRICTED | UNKNOWN
```

### 3.4 Codex necessity declaration

Before allocating Codex, record:

```yaml
codex_necessity:
  required_capability: ...
  why_extra_high_cannot_complete: ...
  expected_mutations_or_commands: []
  required_local_evidence: []
  stop_condition: ...
  estimated_scope: small | medium | large
```

A generic statement such as “this is coding work” is insufficient.

Valid reasons include:

- actual repository mutation plus tests;
- local runtime inspection;
- executable reproduction;
- browser/OS interaction;
- deployment or service configuration;
- large mechanical changes that would be unsafe to apply manually.

Invalid reasons include:

- reading GitHub;
- thinking through architecture;
- reviewing a diff;
- summarizing logs already collected;
- deciding whether a change is conceptually sound;
- drafting a worker handoff.

### 3.5 Reason first, execute second

For substantial work, prefer:

```text
Extra High
  -> establishes contract, plan, likely files, risks, and tests
Codex
  -> executes a bounded implementation loop
Deterministic tooling / Extra High
  -> reviews evidence and diff
Pro
  -> only if a highest-intelligence semantic decision remains
```

This reduces Codex context load and prevents spending agentic execution capacity on work that requires reasoning but no local action.

### 3.6 Return work out of Codex when execution is no longer needed

If a Codex task reaches a point where the remaining work is only:

- interpretation;
- architecture comparison;
- research;
- review;
- writing a handoff;
- evaluating whether Pro is necessary;

checkpoint the exact state and route the remainder to Extra High rather than keeping an execution session alive.

---

## 4. Pro routing without false thrift

### 4.1 Direct Pro triggers

Do not require an Extra High triage when the review clearly concerns:

- a material therapy answer, technique, safety boundary, relational interpretation, or risk of leading/invalidating/dependency-forming behavior;
- whether an AskRigor methodological defect materially changes what evidence can support;
- a conflict between evidence and a health-research conclusion;
- a consequential ambiguity in protocol interpretation;
- a high-consequence decision where Extra High explicitly reports unresolved semantic uncertainty;
- a fresh independent adjudication required by the current assurance boundary.

### 4.2 Optional Extra High Pro-necessity triage

When Pro value is genuinely uncertain, Extra High may answer this bounded question:

```yaml
pro_triage:
  classification: PRO_REQUIRED | PRO_RECOMMENDED | PRO_OPTIONAL | NO_PRO
  decision_under_review: ...
  unresolved_semantic_uncertainty: ...
  consequence_if_wrong: ...
  why_extra_high_is_or_is_not_sufficient: ...
  exact_question_for_pro: ...
```

The triage must not become a ritual before every Pro call. Its purpose is to resolve uncertain allocation, not to add another layer of ceremony.

### 4.3 Bias toward Pro when material stakes and irreducible uncertainty coincide

A high Pro usage count is not itself evidence of waste. If a therapy or AskRigor judgment is material and Extra High remains uncertain, route to Pro.

The efficiency objective is:

> Use the least expensive route that preserves decision quality, while escalating promptly when a stronger model could materially prevent semantic harm or a false research conclusion.

### 4.4 Batch related Pro cases

Where independence and context permit, batch tightly related cases under one decision contract, for example:

- a therapy response regression set testing one policy;
- several AskRigor flaws bearing on the same conclusion boundary;
- alternative outputs from one architecture decision.

Do not batch unrelated tasks merely to save Pro turns.

---

## 5. Resource ledger

Mission Control maintains append-only records for every scarce or consequential model/tool use.

### 5.1 Resource event fields

```text
resource_event_id
task_id
decision_id
account_alias
surface
resource_class
mode_label
started_at
completed_at
route_reason
necessity_declaration_id
input_packet_id
output_artifact_id
estimated_input_tokens
estimated_output_tokens
observed_usage_delta
availability_before
availability_after
outcome_changed
outcome_change_summary
fallback_used
failure_or_limit_evidence
```

`resource_class` includes:

```text
EXTRA_HIGH_CHAT
PRO_CHAT
CODEX_AGENTIC
DEEP_RESEARCH
BROWSER_AUTOMATION
OTHER
```

### 5.2 Do not pretend estimates are platform meters

Local counts and token estimates are planning evidence only.

Keep separate:

```text
local_estimate
platform_observed_status
platform_reset_time
confidence
```

A local estimate never overrides a platform banner or availability result.

---

## 6. Pro efficiency audits

### 6.1 Triggers

Run a Pro efficiency audit:

- whenever Pro becomes unavailable or a model-specific limit is observed;
- every 10 focused Pro review requests, by default;
- every 7 days while Pro is actively used;
- at the end of a consequential therapy or AskRigor phase;
- when the owner requests an audit.

The cadence is configurable. Do not consume Pro to audit Pro usage unless the audit itself presents a material high-intelligence decision.

### 6.2 Classification

Classify each Pro request:

```text
ESSENTIAL_HIGH_VALUE
JUSTIFIED_CONFIRMATORY
COULD_HAVE_USED_EXTRA_HIGH
COULD_HAVE_USED_DETERMINISTIC
DUPLICATE_OR_STALE_CONTEXT
UNRESOLVED
```

### 6.3 Audit questions

- Was there a named decision?
- Could the result change the worker directive, conclusion, or gate?
- Was the packet decision-specific?
- Did Extra High/deterministic tooling prepare the evidence first?
- Did Pro spend effort retrieving material that should have been supplied?
- Was an existing healthy chat reused appropriately?
- Was a new chat created when context or independence required it?
- Did the answer materially change or strengthen the decision?
- Was a negative confirmation valuable because it prevented unnecessary changes?
- Were therapy and AskRigor semantic cases escalated promptly enough?

Do not label a Pro review wasteful merely because it confirmed the existing path.

### 6.4 Audit output

```yaml
pro_efficiency_audit:
  period: ...
  account_alias: ...
  requests_total: 0
  essential_high_value: 0
  justified_confirmatory: 0
  could_have_used_extra_high: 0
  could_have_used_deterministic: 0
  duplicate_or_stale_context: 0
  under_escalation_findings: []
  over_escalation_findings: []
  context_waste_findings: []
  recommended_routing_changes: []
```

`under_escalation_findings` is as important as overuse. The system must detect cases where it withheld Pro despite material stakes.

---

## 7. Codex efficiency audits

### 7.1 Triggers

Run a Codex efficiency audit:

- when the Codex/agentic pool becomes unavailable or a limit warning appears;
- weekly while multiple workers are active;
- after an unusually long or high-context Codex task;
- after a task spends substantial Codex time without repository/runtime mutation;
- after repeated test or build loops.

### 7.2 Classification

```text
CODEX_REQUIRED
CODEX_JUSTIFIED_BUT_OVERSCOPED
COULD_HAVE_STARTED_IN_EXTRA_HIGH
COULD_HAVE_RETURNED_TO_EXTRA_HIGH_EARLIER
REDUNDANT_TEST_OR_CONTEXT_COST
DUPLICATE_WORKER
UNRESOLVED
```

### 7.3 Audit questions

- What local/tool capability required Codex?
- Was the execution packet narrow enough?
- Did Codex spend substantial turns planning or reading that Extra High could have done?
- Were focused tests used before full suites?
- Did the worker keep working after the task became analysis-only?
- Were multiple workers duplicating one bottleneck?
- Was fast or high-cost execution mode necessary?
- Did a stale or overlarge context increase usage?
- Could one integration worker have replaced conflicting parallel workers?

### 7.4 Automatic corrective actions

A Codex audit may recommend:

- pre-plan in Extra High;
- reduce worker concurrency;
- split task contracts;
- stop a duplicate worker;
- use focused tests;
- compact context or start a new bounded execution attempt;
- return analysis-only work to Extra High.

It may not silently lower a required verification boundary.

---

## 8. Account aliases and private identity mapping

### 8.1 Public repositories contain aliases only

Use:

```text
primary
secondary
```

Never commit owner email addresses, session identifiers, cookies, profile directories containing personal identity, or chat URLs to a public repository.

### 8.2 Private local account registry

Store account identity and profile mapping in an ignored owner-only file, for example:

```text
~/.config/codex-mission-control/accounts.local.toml
```

Permissions:

```text
0600
```

Example schema:

```toml
[accounts.primary]
email = "<private>"
chatgpt_web_profile = "primary"
codex_desktop_profile = "primary"
priority = 1

[accounts.secondary]
email = "<private>"
chatgpt_web_profile = "secondary"
codex_desktop_profile = "secondary"
priority = 2
```

Mission Control may display configured friendly aliases publicly in the local UI, but raw emails remain hidden by default.

### 8.3 Account capability state

Track independently per account:

```text
observed_plan_label
extra_high_status
pro_status
codex_status
agentic_pool_status
observed_at
reset_at
status_evidence
last_successful_use
```

Do not assume both accounts have the same plan or available models. Verify the capability before failover.

---

## 9. Limit and restriction classification

When a resource stops working, classify the boundary before switching.

```text
ORDINARY_MODEL_LIMIT
CODEX_AGENTIC_LIMIT
CREDIT_EXHAUSTION
TEMPORARY_SERVICE_ERROR
AUTH_SESSION_ERROR
ACCOUNT_RESTRICTION
POLICY_OR_ABUSE_GUARDRAIL
UNKNOWN
```

### 9.1 Evidence sources

Use, in order:

1. explicit model-unavailable or usage-limit banner;
2. Codex usage page or thread-level usage where available;
3. model picker availability/reset time;
4. exact error receipt from the active surface;
5. repeated bounded retry proving a transient error did not resolve.

Do not diagnose a quota from a generic failed page load.

### 9.2 Failover eligibility

Automatic failover is allowed only when:

- the owner has pre-authorized the secondary account;
- the boundary is an ordinary resource/usage limitation or an account-specific technical failure;
- the secondary account is already authenticated or can be selected without credential entry;
- the secondary account independently exposes the required capability;
- the task packet is safe to transfer to that account;
- the switch is recorded and verified.

Do **not** rotate accounts to evade:

- an account-level restriction;
- a policy or abuse guardrail;
- a security challenge;
- a requirement to verify account ownership;
- a platform instruction not to continue.

In those cases, stop the affected route and notify the owner.

---

## 10. ChatGPT web account switching

### 10.1 Preferred automation topology

Prefer separate persistent browser profiles or contexts per account when practical:

```text
Brave profile A -> primary account
Brave profile B -> secondary account
```

This reduces wrong-account chat access, global switch side effects, and accidental continuation in the wrong history namespace.

### 10.2 Built-in switcher fallback

When both accounts are already present in one ChatGPT web session, the browser relay may use the built-in account switcher.

Required transaction:

1. checkpoint the active task and current chat URL;
2. run a tab audit and close stale system-owned tabs;
3. open the account menu;
4. select the target account;
5. verify the visible active account identity against the private registry;
6. verify required model/mode availability;
7. open the target account’s existing task chat or create a new account-specific chat epoch;
8. supply the current authority capsule and delta packet;
9. record the switch event and evidence.

A click without post-switch identity verification is not a successful switch.

### 10.3 Conversation separation

Because accounts do not share conversation history, a task moved to another account requires:

```text
cross_account_handoff_id
source_account_alias
source_chat_epoch
source_packet_id
current_context_capsule
unresolved_findings
owner_decisions
current_HEAD
requested_decision/action
target_account_alias
target_chat_epoch
```

Never say only “continue the previous chat” after switching accounts.

---

## 11. Codex account failover

### 11.1 Platform boundary

The ChatGPT web account switcher does not switch Codex desktop accounts.

Preferred Codex failover uses one already-authenticated desktop/profile instance per account. Do not copy auth files, cookies, or credentials between profiles.

### 11.2 Failover transaction

1. detect and classify the Codex/agentic limit;
2. preserve the worker’s exact repository/worktree state;
3. stop or checkpoint the affected worker cleanly;
4. record current branch, HEAD, dirty fingerprint, tests, and next command;
5. verify the secondary Codex profile is authenticated and has available capacity;
6. launch or focus the secondary profile without covering the owner’s active workspace;
7. provide a complete GitHub/local handoff, not a chat-memory reference;
8. bind the new worker run to the same durable `task_id` and a new `run_id`;
9. prevent both accounts from writing the same workspace concurrently;
10. record the account failover event.

### 11.3 If automation cannot switch Codex

Notify the owner with:

```text
RESOURCE EXHAUSTED: CODEX
ACTIVE ACCOUNT: <alias>
EVIDENCE: <banner/error/usage-page result>
RESET: <time or unknown>
AFFECTED TASKS: <plain-language list>
SECONDARY STATUS: <available/unknown/unavailable>
WHY AUTOMATION STOPPED: <exact boundary>
MANUAL ACTION: <exact profile/account switch steps>
RESUME ARTIFACT: <direct handoff file/link>
```

Do not merely say “switch accounts.”

---

## 12. Pro account failover

### 12.1 No assumed monthly quota

Mission Control must not assume a fixed Pro allowance such as 500 messages/month. Maintain a local turn ledger and rely on observed model availability/reset information.

### 12.2 Failover transaction

When Pro is unavailable on one account:

1. identify that the unavailable resource is specifically Pro, not Codex or the base reasoning model;
2. record the model picker/banner/reset evidence;
3. run the Pro efficiency audit;
4. check whether the pending decision truly still requires Pro;
5. verify the second account has Pro available;
6. create or reuse the second account’s chat epoch for the same scope key;
7. send a deterministic cross-account rollover capsule and decision packet;
8. record predecessor/successor chat epochs and account aliases.

Do not resend the entire old transcript.

### 12.3 Do not become artificially stingy after a limit

The post-limit audit may improve batching, evidence preparation, and routing, but it must not create a rule that downgrades material therapy or AskRigor reviews to Extra High solely to avoid future exhaustion.

---

## 13. Owner notification when automatic switching fails

The notification must identify the resource and reason:

```yaml
resource_boundary:
  resource: PRO | CODEX | EXTRA_HIGH | OTHER
  account_alias: primary | secondary
  classification: ...
  observed_evidence: ...
  reset_at: ...
  tasks_affected: []
  safe_work_continuing: []
  secondary_account_status: ...
  automatic_switch_attempted: true | false
  automatic_switch_result: ...
  exact_owner_action: ...
  resume_artifact: ...
```

The dashboard should generate plain-language copy such as:

> Codex capacity is exhausted on the primary account. Pro and Extra High remain available. The current implementation worker was checkpointed at commit X with tests Y. The secondary Codex profile could not be activated automatically because no authenticated profile was detected. Open the secondary ChatGPT desktop profile, select Codex, and paste/open the attached handoff. No other task is blocked.

---

## 14. Browser tab ownership

Every agent browser transaction uses
`templates/BROWSER-OPERATION-RECEIPT.json` and validates through
`scripts/mission_control_provenance.py`. The receipt binds necessity, the exact
capability, non-browser alternatives, selected route, browser session,
transaction, baseline tabs, ownership, transient-tab cap, actions, and cleanup.
Ownership is not established by listing a tab ID. The listing must equal a
successful `OPEN` action in this receipt or a digest-validated proof from
`templates/BROWSER-OWNERSHIP-REGISTRY.json` supplied independently by the
controller.

Repository retrieval defaults to authenticated CLI or local Git whenever that
route satisfies the capability. Browser navigation is blocked before execution
when an available non-browser route satisfies the same capability. A signed-in
ChatGPT reasoning-surface observation may require the browser because CLI and
local Git cannot observe the account, visible mode, conversation submission,
completed response, and post-response mode.

The normative ownership classes for new receipts are:

```text
OWNER_EXISTING
AGENT_OPENED
UNKNOWN
```

Legacy `SYSTEM_OWNED` means `AGENT_OPENED` only when the exact opening event is
bound to the same browser session and transaction. A name or stale tab handle
does not prove ownership.

### 14.1 Close only tabs the system owns

Every tab in a new browser-operation receipt is labeled:

```text
AGENT_OPENED
OWNER_EXISTING
UNKNOWN
```

Automation may close only tabs proven `AGENT_OPENED` in the same browser
session and transaction. `UNKNOWN` ownership fails closed: leave the tab
untouched and report it. Owner-existing tabs and signed-in reasoning
conversation tabs are protected. A tab ID from another browser session cannot
be reused as ownership proof.

At most one agent-opened transient tab is allowed unless `exceptionRef` records
the concrete necessity. Cleanup uses `CLOSE_ONLY_AGENT_OPENED`; a close failure
is reported and never authorizes closing an adjacent or guessed tab. Observing
that a tab is absent does not establish who closed it. When any agent-opened tab
exists, cleanup must be marked attempted and the successful `CLOSE` actions,
cleanup results, and remaining IDs must reconcile exactly.

Required browser failure codes are:

```text
BROWSER_ROUTE_NOT_JUSTIFIED
AGENT_TAB_CAP_EXCEEDED
TAB_OWNERSHIP_UNVERIFIED
TAB_SESSION_MISMATCH
PROTECTED_TAB_MUTATION_ATTEMPT
AGENT_TAB_CLEANUP_INCOMPLETE
UNNECESSARY_OWNER_BROWSER_MUTATION
BROWSER_OPEN_ACTION_MISMATCH
BROWSER_CLEANUP_RECONCILIATION_MISMATCH
```

### 14.2 Tab lease record

```text
tab_id
browser_profile
account_alias
url_origin
task_id
chat_epoch_id
purpose
opened_at
last_used_at
expected_reuse_at
lease_state
close_after
contains_unsaved_state
pending_operation_id
```

`lease_state`:

```text
ACTIVE
PENDING_RESULT
RESERVED_NEAR_TERM
STALE
CLOSE_READY
OWNER_PINNED
```

### 14.3 Near-term reuse

Default definition:

- the tab is part of the next declared task action; or
- it is expected to be reused within 30 minutes.

This window is configurable. A vague possibility of future use is not enough.

### 14.4 Immediate close triggers

Close a system-owned tab when:

- its task is complete or canceled;
- its packet/review has been durably captured;
- its chat has rolled over and the old URL is recorded;
- an account switch makes it irrelevant to the next action;
- it duplicates another usable tab;
- the expected reuse window expires;
- the browser relay created it only for a one-time read or upload;
- the associated resource is unavailable and no pending output remains.

### 14.5 Never close while

- a model response is still generating and not durably captured;
- an upload, download, paid action, or irreversible operation is unresolved;
- a form contains unsaved owner input;
- the tab is the only authenticated recovery route;
- the owner pinned it;
- closure would destroy evidence needed to reconcile an ambiguous action.

### 14.6 Periodic audit triggers

Run a system-owned tab audit:

- every 30 minutes while browser automation is active;
- at every task completion or major task switch;
- before and after an account switch;
- before opening a new tab when the profile already has 6 system-owned tabs;
- after a Pro/Codex limit event;
- before ending a long work session.

### 14.7 Tab audit output

```yaml
tab_audit:
  browser_profile: ...
  account_alias: ...
  audited_at: ...
  system_owned_open: 0
  active: []
  pending_result: []
  retained_near_term: []
  closed_stale: []
  duplicates_closed: []
  ambiguous_not_closed: []
  next_audit_at: ...
```

Do not claim “browser cleaned up” without a tab inventory.

---

## 15. Browser-profile and workspace behavior

- Default browser work remains headless.
- Headed ChatGPT/interactive work uses the dedicated secondary virtual workspace or monitor.
- Avoid stealing focus or covering the owner’s current work.
- Reuse a tab only when account, task scope, and chat epoch match.
- Do not reuse one ChatGPT tab across unrelated tasks merely to reduce tab count.
- Keep the Mission Control dashboard in one stable tab if actively used.
- Keep no dormant log, documentation, search-result, or duplicate ChatGPT tabs solely because they might be useful someday.
- A recorded URL and durable packet are the recovery mechanism; an abandoned open tab is not.

---

## 16. Dashboard additions

### 16.1 Resource status strip

Show per account alias:

```text
Extra High: AVAILABLE / ...
Pro: AVAILABLE / ...
Codex: AVAILABLE / ...
Observed reset time
Last checked
Evidence source
```

Do not show raw email addresses by default.

### 16.2 Current routing on each task

```text
current route
why this route
Codex necessity declaration
Pro necessity/triage result
active account alias per surface
chat epoch/context pressure
next route-review trigger
```

### 16.3 Efficiency panel

Show:

- Pro requests since last audit;
- Pro requests classified as essential/confirmatory/re-routable;
- possible under-escalation warnings;
- Codex tasks that could have started or finished in Extra High;
- long-running Codex workers with no recent mutation or test evidence;
- next audit trigger.

### 16.4 Browser hygiene panel

Show:

- system-owned open tabs by profile/account;
- stale tabs;
- pending-result tabs;
- last tab audit;
- next scheduled audit;
- tabs retained for near-term reuse with expiry.

---

## 17. New event types

```text
RESOURCE_ROUTE_SELECTED
CODEX_NECESSITY_RECORDED
PRO_TRIAGE_COMPLETED
RESOURCE_LIMIT_OBSERVED
RESOURCE_AVAILABILITY_CHANGED
ACCOUNT_SWITCH_REQUESTED
ACCOUNT_SWITCH_VERIFIED
ACCOUNT_SWITCH_FAILED
CROSS_ACCOUNT_HANDOFF_CREATED
PRO_EFFICIENCY_AUDIT_COMPLETED
CODEX_EFFICIENCY_AUDIT_COMPLETED
BROWSER_TAB_OPENED
BROWSER_TAB_LEASE_RENEWED
BROWSER_TAB_CLOSED
BROWSER_TAB_AUDIT_COMPLETED
```

Every account-switch event records the prior and new account aliases, surface, task, reason, and verification evidence.

---

## 18. Security and privacy rules

- Never store account passwords.
- Never automate password entry, MFA, security challenges, or recovery flows.
- Never copy session cookies or authentication files between account profiles.
- Never commit owner emails or private chat URLs to the public Universal repository.
- Keep private account mapping and chat URLs in owner-only local storage.
- Do not send restricted task packets to a second account until data classification permits it.
- Do not treat a second account as permission to bypass a policy/abuse restriction.
- Verify the active account before sending private or consequential content.
- Bind every chat URL and model result to an account alias.

---

## 19. Failure behavior

### 19.1 Unknown resource state

If availability is unknown:

- do not assume exhaustion;
- perform one bounded availability check;
- continue independent work;
- surface `UNKNOWN` if verification is unavailable.

### 19.2 Wrong-account detection

If a chat or task opens under the wrong account:

- do not send the packet;
- record the mismatch;
- switch or open the correct profile;
- verify identity;
- resume from the durable packet.

### 19.3 Both accounts unavailable

- prioritize therapy safety and AskRigor conclusion-validity decisions for the next Pro availability window;
- continue deterministic and Extra High work where available;
- checkpoint Codex tasks cleanly;
- provide the owner one consolidated resource-boundary report rather than repeated interruptions.

### 19.4 Browser relay cannot enumerate tabs safely

- close no ambiguous/pre-existing tabs;
- record that tab hygiene is partially unavailable;
- ask the owner only when manual cleanup is materially needed;
- retain exact URLs for system-owned tabs when known.

---

## 20. Pilot requirements

The Mission Control pilot must prove:

1. An analysis-only task routes to Extra High without starting Codex.
2. A local execution task records why Codex is necessary.
3. A Codex task returns to Extra High after the execution boundary.
4. An uncertain high-intelligence decision can be triaged by Extra High.
5. A material therapy or AskRigor fixture routes directly to Pro.
6. Pro and Codex usage are recorded by account alias and task.
7. A simulated Pro exhaustion produces an efficiency audit and cross-account capsule.
8. A simulated Codex exhaustion preserves repository state and creates a secondary-profile handoff.
9. The system distinguishes ordinary usage exhaustion from account restriction.
10. Raw account emails never appear in public repository state.
11. Web account switching verifies the active account after the switch.
12. Codex desktop failover does not assume the web switcher applies.
13. A stale system-owned browser tab is closed by the periodic audit.
14. A pending-result or owner-pinned tab is retained.
15. Pre-existing/user-owned tabs are never closed.
16. The owner notification names the exact exhausted resource, reason, reset time when known, and manual steps when automation fails.
17. The system does not hard-code a speculative Pro monthly quota.
18. A post-limit audit detects both unnecessary use and important cases where Pro should have been used sooner.

---

## 21. Private owner mapping for this deployment

The public architecture intentionally omits personal account identifiers.

The active deployment must create a private owner-only registry mapping:

```text
primary -> owner-designated main ChatGPT account
secondary -> owner-designated alternate ChatGPT account
```

The exact mapping belongs only in the local ignored configuration and the private owner handoff. A fresh worker must not infer or publish the mapping from old logs.

---

## 22. Summary decision

```text
Reasoning/research/review without local action -> Extra High
Local mutation/execution/tool-backed action -> Codex
Material therapy or AskRigor semantic judgment -> Pro
Uncertain Pro value -> optional Extra High triage
Clear material Pro value -> direct Pro
Ordinary limit on one authorized account -> verified failover to the other account
Account restriction/guardrail -> no rotation; notify owner
System-opened tab not needed soon -> close it
Pre-existing or ambiguous tab -> leave it alone
Every limit event -> identify the resource, preserve state, audit efficiency, then continue safely
```
