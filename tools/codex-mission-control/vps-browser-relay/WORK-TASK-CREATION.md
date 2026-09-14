# Source-authorized browser Work creation

The existing `provision-mc-only-chat.mjs` flow is reused by:

```text
mc-chatgpt-relay provision-work <owner-authorized-supervisor-id> <exact-directive-file> <authorization-id>
```

The caller supplies neither a model nor an effort. The authenticated SYSTEM relay
loads the current Chat-bound authorization through `/api/work-task-creation/[worker]`.
The exact directive file must hash to the separately recorded directive artifact
digest. The Chat message digest is not substituted for that digest.

The existing ownership wrapper and central scheduler create New chat in the managed
target. Model/effort controls are selected and read back before submission. Only a
clear mechanical mismatch gets one retry; ambiguity blocks submission. Fast is not
enabled and is recorded as unobserved, not verified off. Supervisor provisioning
retains its existing fixed controls; only the Work-specific path uses the profile.

After submission, the private registration persists the created locator. Then the
SYSTEM relay writes `work_task_creation_selection_applied`, with source
`TRUSTED_MANAGED_BROWSER_TASK_CREATION_BOUNDARY`. Only successful durable ingestion
returns `BROWSER_TASK_CREATION_TRUSTED_SETTER_ACTIVE` and the evidence ID. Preflight
accepts that ID through the existing durable trust checks. UI proof is setter proof,
not provider identity readback; independent-readback assurance remains stronger.

Never replay a provisioning registration after a created locator is recorded, even
if evidence ingestion failed. Reconcile the private record instead. Do not expose
private locators, prompt bodies, account sessions, or screenshots in public telemetry.

## Current verification boundary

This branch is a candidate, not a deployed/activated feature. Real Sol Medium and
Astra Low calibration is pending authorized access to the dedicated managed browser
account. No personal browser may substitute for that account. Keep screenshots
private and cropped to the selected controls, with no sidebar, prompt or session
content. A successful synthetic test is not calibration. Do not merge or deploy
before Chat reviews the live diff and calibration evidence.
