# Mission Control Pilot Addendum — Resource Routing, Account Failover, and Tab Hygiene

**Status:** Required addition to `2026-08-30-mission-control-symphony-gap-audit-and-pilot.md`  
**Date:** 2026-08-30  
**Assurance lane:** Decision, then Iteration

## 1. Objective

Extend the Symphony gap audit and one-worker pilot so the implementation proves:

- analysis/research/repository review defaults to Extra High;
- Codex starts only for a named local execution capability;
- Pro is used promptly for material therapy/AskRigor semantic decisions without becoming the default reviewer;
- uncertain Pro value can be triaged by Extra High;
- Pro and Codex resource use is locally audited;
- ordinary usage exhaustion is distinguished from an account restriction;
- the owner’s second authorized account can be used through a verified, provenance-preserving failover;
- raw account identities remain private;
- system-opened Brave tabs are periodically inventoried and closed when not needed soon.

This addendum is required before the current Codex handoff is issued.

---

## 2. Required additional read

Read fresh:

- `patterns/codex-supervision-resource-routing-account-failover-and-browser-hygiene.md`
- current official OpenAI account-switching and Codex-usage documentation linked from that pattern;
- any existing local browser-profile/account-switching scripts;
- current Mission Control/browser-relay tab state, if any;
- private account mapping only from the owner-only local registry or direct owner handoff, never from public Git history.

---

## 3. Diagnostic additions

Before implementation, audit whether current code already has:

```text
resource routing state
Codex necessity declarations
Pro necessity/triage records
per-account resource availability
limit/error classification
cross-account handoff capsules
account-bound chat URLs
separate desktop/browser profiles
system-owned tab inventory
tab lease/expiry state
periodic tab audit
Pro efficiency audit
Codex efficiency audit
```

Classify each as:

```text
KEEP
ADAPT
IMPLEMENT
DELETE_AS_UNSAFE_OR_DUPLICATE
DEFER
UNKNOWN
```

Do not infer account automation from the existence of two logged-in windows. Verify profile identity, capability, and switching behavior.

---

## 4. Private account registry

Create an ignored owner-only configuration, not a committed file:

```text
~/.config/codex-mission-control/accounts.local.toml
```

Requirements:

- mode `0600`;
- account aliases `primary` and `secondary` in durable/public records;
- raw email identity visible only in the private registry and owner-facing handoff;
- no passwords, cookies, auth files, or MFA material;
- separate browser/Codex profile identifiers;
- observed plan/model availability recorded separately from configured identity.

Add a redacted committed example only if the implementation repository needs one.

---

## 5. Routing pilot cases

### Case A — Extra High instead of Codex

Use an analysis-only repository task.

Prove:

- route selected as Extra High;
- no Codex process starts;
- repository evidence and result are durable;
- the task can later hand a bounded execution packet to Codex if mutation becomes necessary.

### Case B — justified Codex

Use a task requiring a local edit plus focused test.

Prove a stored declaration names:

```text
required local capability
why Extra High cannot complete
expected files/commands
evidence required
stop condition
```

After tests and artifact capture, return the review/reasoning stage to Extra High.

### Case C — optional Pro triage

Use a synthetic semantic decision where Pro value is uncertain.

Extra High returns:

```text
PRO_REQUIRED
PRO_RECOMMENDED
PRO_OPTIONAL
NO_PRO
```

with a bounded reason and exact proposed Pro question.

### Case D — direct Pro

Use a clearly labeled synthetic therapy-answer or AskRigor-methodology fixture with no private data.

Prove:

- the route bypasses unnecessary triage;
- the question is decision-specific;
- the packet does not require GitHub access;
- the result can change a directive or conclusion boundary.

---

## 6. Resource ledger and audits

Implement minimal append-only records for:

```text
resource class
account alias
task/decision
route reason
input/output artifact
availability before/after
estimated tokens/usage
observed limit/reset evidence
outcome changed
```

Pilot audit triggers:

- simulated Pro exhaustion;
- simulated Codex exhaustion;
- ten synthetic/historical Pro records for classification;
- one long Codex session fixture that should have returned to Extra High.

Audit outputs must identify both:

- overuse or poor preparation;
- under-escalation where Pro should have been used.

Never encode an assumed fixed monthly Pro quota.

---

## 7. Account failover pilot

Use aliases only in committed fixtures.

### Web Pro/Extra High failover simulation

1. source account chat epoch and packet are recorded;
2. ordinary model limit is observed or simulated;
3. second account capability is verified;
4. a cross-account capsule is generated;
5. target account identity is verified after switch;
6. target chat epoch receives only current authority, unresolved state, and delta;
7. source/target epochs remain separate.

### Codex failover simulation

1. source worker is checkpointed;
2. branch/HEAD/dirty fingerprint/tests/next command are captured;
3. secondary pre-authenticated desktop/profile capability is verified or simulated;
4. a new `run_id` binds to the same `task_id`;
5. both accounts cannot write the same workspace concurrently;
6. if automation is unavailable, an exact manual switch notice and direct resume artifact are produced.

### Restriction negative case

Simulate `ACCOUNT_RESTRICTION` or `POLICY_OR_ABUSE_GUARDRAIL` and prove the system does not rotate accounts.

---

## 8. Brave tab hygiene pilot

Instrument only tabs opened by the system.

Each tab record includes:

```text
ownership
profile/account alias
task/chat epoch
purpose
opened/last-used time
expected reuse
pending/unsaved state
lease state
```

Prove:

1. a one-time evidence tab closes after durable capture;
2. a duplicate ChatGPT tab closes;
3. a task chat expected within 30 minutes remains leased;
4. a stale leased tab closes at audit;
5. a generating/pending-result tab remains open;
6. an owner-pinned tab remains open;
7. a pre-existing/unknown tab is never closed;
8. audits run at task boundary, account switch, 30-minute active interval, and before opening a seventh system-owned tab in one profile.

The browser relay must keep headed windows off the owner’s active workspace and avoid stealing focus.

---

## 9. Owner notification fixture

Generate one notification for Pro exhaustion and one for Codex exhaustion.

Each must state:

```text
which resource is exhausted
which account alias
what evidence proves it
reset time or unknown
which tasks are affected
which work continues
secondary account availability
automatic switch result
exact manual steps if needed
direct resume artifact
```

Do not emit a generic “usage ran out” notice.

---

## 10. Dashboard additions for the pilot

Read-only UI shows:

- per-account Extra High/Pro/Codex availability;
- active route and reason per task;
- Codex necessity declaration;
- Pro triage/necessity state;
- current account alias per surface;
- resource-limit evidence/reset time;
- last Pro and Codex efficiency audit;
- system-owned tabs by account/profile;
- stale/pending/leased counts;
- last/next tab audit.

Raw email identities remain hidden by default.

---

## 11. Acceptance criteria

The addendum is complete when:

1. Extra High completes an analysis-only task without Codex.
2. Codex cannot start without a valid necessity declaration, except an explicitly documented emergency/recovery path.
3. A Codex task returns to Extra High after local execution ends.
4. Extra High can recommend or decline a Pro pass.
5. Clear therapy/AskRigor semantic fixtures route directly to Pro.
6. Pro usage audits detect overuse and under-escalation.
7. Codex audits detect planning/review work that should have stayed in Extra High.
8. An ordinary Pro limit produces a verified second-account handoff.
9. An ordinary Codex limit produces a checkpointed secondary-profile handoff.
10. An account restriction does not trigger rotation.
11. Public Git history contains no raw owner account identities.
12. Web account switching requires post-switch identity verification.
13. Codex desktop failover does not rely on the web account switcher.
14. System-opened stale tabs close; pending, owner-pinned, and pre-existing tabs remain.
15. The owner receives resource-specific switch instructions when automation cannot proceed.
16. No speculative “500 per month” or other unverified quota is encoded.

---

## 12. Updated worker instruction

A fresh Codex worker must be told:

```text
Do not start more orchestration code before the existing implementation/Symphony gap audit is frozen.

Load all three Mission Control patterns and both execution plans. Default analysis, research, GitHub reading, architecture, and review to Extra High. Start Codex only for a named local execution capability and record why Extra High cannot complete it. Return reasoning-only work to Extra High after the execution boundary.

Use Pro promptly for material therapy-answer and AskRigor methodology/conclusion judgments. For genuinely uncertain Pro value, Extra High may produce a bounded PRO_REQUIRED / PRO_RECOMMENDED / PRO_OPTIONAL / NO_PRO triage. Do not force triage for obvious high-consequence cases.

Implement account-aware resource state using public aliases only. The private owner handoff supplies the two account identities. Verify the exact exhausted resource and the second account’s independent capability before switching. Web ChatGPT switching and Codex desktop switching are different; use separate authenticated profiles for Codex or provide exact manual steps. Never rotate accounts to evade an account restriction.

Track only system-opened Brave tabs. Reuse tabs only for the same account/task/chat epoch when they will be used in the next action or within 30 minutes. Audit every 30 minutes while active, at task boundaries, account switches, limit events, and before opening a seventh system-owned tab. Close stale/duplicate tabs, but never close pre-existing, owner-pinned, pending-result, unsaved, or ambiguous tabs.

Save all routing, usage, failover, tab-audit, and recovery evidence durably in GitHub or private local state as appropriate.
```
