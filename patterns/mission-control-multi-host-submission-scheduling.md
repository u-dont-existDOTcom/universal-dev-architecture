# Mission Control multi-host submission scheduling

## Rule

When more than one host can run a Mission Control browser relay, keep the hosts
active/passive behind one durable submission scheduler. A host-local timer,
process mutex, promise chain, or reconstructed work list is not a global queue.

Every operation that can submit a ChatGPT message—including capability checks,
binding preloads, ordinary or escalated supervision, controller origin/PM/return
stages, and stuck-turn recovery—must obtain one single-use scheduler admission
before the first browser mutation that can cross the send boundary.

## Portable topology

```text
Mission Control authoritative route/event
  -> central durable submission queue
  -> single active deployment lease + monotonically increasing epoch
  -> single-use send admission
  -> exact MC-only conversation registration
  -> exact automation-owned browser window and target
  -> browser send boundary
  -> durable boundary receipt and global cooldown

secondary host
  -> healthy standby, no active lease, no send admission
```

Reasoning authority remains in the registered ChatGPT supervisor. The scheduler
orders and fences transport; it does not author, edit, summarize, classify, or
semantically acknowledge messages.

## Queue and admission record

Persist a queue row before admission with at least:

```text
queue_item_id
operation_kind
request_or_cycle_id
stable_supervisor_id
conversation_registration_id
automation_target_id
body_sha256
host_alias
deployment_epoch
queued_at
status
```

The scheduler may grant one admission only when all of these hold:

- the deployment lease is current, active, unexpired where expiry is used, and
  bound to the requesting host alias and epoch;
- no other admission is active or ambiguously crossed;
- the item is the deterministic queue head under the declared ordering;
- its payload hash, operation identity, supervisor, conversation registration,
  target and epoch still match;
- the conversation is explicitly registered `MISSION_CONTROL_ONLY` with
  provenance and purpose;
- the target is explicitly owned by the automation window under the current
  browser-ownership rules;
- the globally persisted prior send boundary plus the minimum interval is not
  later than the current time;
- normal capability, authorization, memory and ambiguity gates pass.

Persist the granted admission before browser mutation. Bind it to a unique
admission ID, queue item, host/epoch, exact payload hash and earliest eligible
time. An admission is single-use and cannot survive an epoch change.

## Send-boundary transaction

Immediately after the browser reports a click or generation-start boundary:

1. consume the exact admission;
2. persist the observed boundary time as the global last-submission time;
3. bind the boundary to the queue item, host alias, epoch and operation receipt;
4. mark the queue item crossed or ambiguous as appropriate;
5. prevent automatic replay until exact reconciliation proves it safe.

If persistence fails after a possible click, fail closed as an ambiguous crossed
boundary. Never create a replacement admission merely because the process or
browser restarted.

The provider rate-limit recovery rule remains subordinate to the same global
scheduler. A supported exact retry waits for both its provider delay and the
global minimum interval, then obtains a new single-use admission for the same
payload. A second or ambiguous provider limit fails closed.

## Active/passive failover

Ordinary operation has exactly one active sender. A secondary can be fully
installed, authenticated and health-checked while remaining unable to obtain a
send admission.

Controlled takeover requires all of:

1. stop and disable the current primary relay and scheduler;
2. prove the primary scheduler and relay are quiescent;
3. reconcile every queued, admitted, crossed and ambiguous item;
4. transfer or import the maximum durable global send-boundary timestamp;
5. bind the takeover to the exact old lease expiry and wait until that lease has
   expired, so an accidental old-host restart remains stale;
6. increment the deployment epoch;
7. invalidate every admission from the older epoch;
8. wait until both the imported cooldown and a full safety interval after the
   takeover boundary have elapsed;
9. activate the successor lease; then verify a no-send status before admitting
   work.

If the primary cannot be proven quiescent, the scheduler state cannot be
transferred, a stale lease may still be live, or both hosts claim active status,
fail closed. This pattern prefers temporary unavailability over duplicate or
too-fast provider submissions. Automatic network-partition failover is forbidden
without an external consensus/fencing authority that can prove single-writer
ownership.

Recovery to the preferred primary uses the same transaction and a newer epoch;
it is not a special bypass.

## Mission Control-only conversation ownership

Browser target ownership and conversation ownership are separate invariants.
Exact target/window ownership does not prove that the underlying conversation is
reserved for automation.

Every eligible supervisor registration must declare:

```text
ownership_class: MISSION_CONTROL_ONLY
registration_id
stable_supervisor_id
purpose
registered_at
registration_provenance
account_or_workspace_alias
private_locator_reference
```

The exact private conversation locator stays in owner-only configuration. A
personal, shared-purpose, legacy-unclassified, copied, ambiguous, or
wrong-account conversation is ineligible. The same conversation must never be
used both as an owner/manual chat and as a Mission Control automation surface.

## Owner computer and clipboard boundary

Routine relay work runs on a designated remote execution host using its own
independent authenticated browser profile, automation-owned window and direct
browser-protocol text input.

- Do not enumerate, activate, navigate, edit, submit into, or close browser
  windows or tabs on the owner's interactive computer.
- Do not read or write the owner/user clipboard for prompt transport, response
  transport, recovery, or diagnostics.
- Do not copy cookies, browser profiles, authentication databases, password
  stores, or clipboard contents between hosts.
- If the remote authenticated profile is missing or blocked by login/MFA, stop
  at that exact boundary; the owner's local browser and clipboard are not a
  fallback.

## Observability and acceptance

Privacy-safe scheduler status should expose:

```text
host_alias
host_role
deployment_epoch
lease_state
queue_depth
queue_head_id
active_admission_id
minimum_interval_ms
last_submission_at
next_eligible_at
standby_reason
ambiguous_count
```

Durable acceptance requires exact evidence for:

- all retained send-boundary times and computed intervals;
- one admission for every attempted send and no direct send path;
- zero sub-minimum intervals;
- denial on secondary, stale/missing lease, wrong host, stale epoch, duplicate
  admission, cooldown, split-brain ambiguity and legacy chat ownership;
- exact MC-only conversation registration plus exact automation target/window
  ownership;
- active-primary and disabled-standby health;
- no local/user browser or clipboard API/command in code, configuration or the
  observed runtime path;
- preservation of native browser sandbox, loopback control and bounded
  rate-limit handling.

Tests prove deterministic controls. Installed no-send probes prove deployment
and health. Neither substitutes for a live provider send when live delivery is
the claimed outcome.

## Portability and owner examples

Reusable code, templates and runbooks use host roles and aliases, not one
provider or owner's machine facts. Actual provider names, hostnames, IPs,
service identifiers, absolute machine paths, account mappings and topology
choices belong only in clearly isolated `NON_UNIVERSAL /
EXAMPLE_OWNER_DEPLOYMENT` evidence. Secrets, credentials, private locators and
authenticated profiles never belong in Git.

Removing every owner-deployment example must leave the portable scheduler,
tests, templates and runbook usable.

## Provenance and transfer limits

Origin: a 2026-09-10 Mission Control hardening task found that a correct
single-host 60-second pacer used a host-local lock and timestamp. Adding a second
relay host would therefore create independent pacing authorities. The promoted
lesson is the cross-project control: central single-use admission plus fenced
active/passive failover.

Transfer limit: this pattern does not prescribe a VPS provider, consensus
database, automatic failover, browser vendor, interval value, or semantic
supervisor topology. Multi-active failover requires a real external fencing
authority; do not simulate consensus with independent local files.
