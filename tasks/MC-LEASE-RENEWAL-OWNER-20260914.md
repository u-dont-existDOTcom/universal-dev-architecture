# Owner correction and durable renewal

Exact owner request:

> Astra is not in the picker yet, it's called "latest", told you that before. it may be called Astra or GPT 6 later.
> how to fix the stale lease and why is it going stale? i don't want it to go stale anymore

Owner outcome OPEN: recognize Latest as the current Astra UI label and prevent a
healthy authorized relay from losing its lease solely because nobody manually
extends a fixed timestamp. Preserve finite expiry when the owner relay disappears
and existing single-owner/fenced-takeover rules. This is owner-required repair,
not an added proof requirement. No merge/deployment under the existing PR boundary.

Verified diagnosis: live expiry 2026-09-14T20:45:11.808Z; health timer active every
minute. Current health handler does not renew; lease is activated from static
configuration only at daemon startup. Earlier "Astra unavailable" conclusion was
wrong: the selector omitted the owner-provided Latest alias and treated literal
name absence as model absence. That blocker is superseded, not still active.

Repair: owner-approved UI aliases; serialized heartbeat renewal for the same
durable active owner/epoch; bounded rolling expiry; stale report and standby
rejection; restart reads the persisted same-owner lease without rolling expiry
back to the original configuration. Real runtime activation remains separately
unverified until deployment is allowed and exercised.

Verification: focused scheduler/alias/runtime tests passed, including two simulated
hours of one-minute health reports, automatic same-owner recovery after expiry,
restart with expired bootstrap configuration, standby/epoch/health rejection,
finite expiry after heartbeat loss and non-renewal from stale reports. Full app:
272 tests; relay: 191; repository: 321. Typecheck/build passed. Final affected
tests passed after aligning ambiguity handling with existing unresolved-state rules.
Source archive: 166 files, 79 parts, SHA-256
`974d3882d558f65cea7656d678559d570f239107f328754af49690155c2012f6`.

Activation procedure under the existing review boundary: deploy the reviewed
candidate without changing the scheduler database or bootstrap owner/epoch; let
the existing one-minute health report renew that persisted owner; verify
ACTIVE_LEASE and future expiry. No manual database edit, infinite expiry, new
cron job, new credentials, or automatic takeover is needed. No live deployment
was performed during this repair.
