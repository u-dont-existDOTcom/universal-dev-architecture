# Source-authorized browser Work creation

The existing `provision-mc-only-chat.mjs` flow is reused by:

```text
mc-chatgpt-relay provision-work <owner-authorized-supervisor-id> <exact-directive-file> <authorization-id>
```

The caller supplies neither a model nor an effort. The authenticated MC-bound relay
loads the current Chat-bound authorization through `/api/work-task-creation/[worker]`.
The exact directive file must hash to the separately recorded directive artifact
digest. The Chat message digest is not substituted for that digest.

The existing ownership wrapper and central scheduler create New chat in the managed
target. Model/effort controls are selected and read back before submission. Only a
clear mechanical mismatch gets one retry; ambiguity blocks submission. Fast is not
enabled and is recorded as unobserved, not verified off. Supervisor provisioning
retains its existing fixed controls; only the Work-specific path uses the profile.

After submission, the private registration persists the created locator. Then the
server-side SYSTEM bridge writes `work_task_creation_selection_applied`, with source
`TRUSTED_MANAGED_BROWSER_TASK_CREATION_BOUNDARY`. Only successful durable ingestion
returns `BROWSER_TASK_CREATION_TRUSTED_SETTER_ACTIVE` and the evidence ID. Preflight
accepts that ID through the existing durable trust checks. UI proof is setter proof,
not provider identity readback; independent-readback assurance remains stronger.

Never replay a provisioning registration after a created locator is recorded, even
if evidence ingestion failed. Reconcile the private record instead. Do not expose
private locators, prompt bodies, account sessions, or screenshots in public telemetry.

## Current verification boundary

This branch is a candidate, not a deployed/activated feature. Dedicated-account
access was authorized and verified. The live scheduler reports `LEASE_STALE`; the
expanded model picker offers Latest, GPT-5.6 Sol and GPT-5.5. The owner confirms
Latest is the current Astra label. Literal Astra-name absence is not a blocker;
selection supports Latest and the owner-approved future Astra/GPT 6 names.
No calibration task was submitted. No personal browser may substitute for that account. Keep screenshots
private and cropped to the selected controls, with no sidebar, prompt or session
content. A successful synthetic test is not calibration. Do not merge or deploy
before Chat reviews the live diff and calibration evidence. The deployed version
only activates a static lease at daemon initialization. This candidate renews the
same active owner's lease through fresh healthy existing relay-health reports:
ten-minute expiry, renewal when five minutes remain. No service/config deployment
or account/subscription change was made.

The existing relay uses a COLLECTOR credential for the scheduler. The browser
bridge accepts only a registered MC relay from that credential set, validates the
exact owned target/window and current source authorization, and emits a server-derived
SYSTEM producer event. WORKER and unbound collector credentials cannot use it.
