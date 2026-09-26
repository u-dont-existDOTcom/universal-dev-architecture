# Relay-lock lifecycle fix live on both hosts — 2026-09-26

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT**. Structured record:
`docs/evidence/2026-09-26-relay-lock-deployment-both-hosts.json`.

## What was deployed

- **Commit:** UDA main `f37d7ca7f9bd7049f7108bb03a32b0ca6629e879`. The relay tree was verified by hash at staging and after install on each host (installed tree `9ee6e35c…`).
- **Owner approval (2026-09-26T03:08Z):** "approved: deploy the Mission Control relay-lock fix from UDA main f37d7ca to the primary and secondary hosts, install the cloudbrowser services, run the no-send lock check, and restart the relay only if it was running".
- **Secondary resumed** on the owner's "finish secondary host" (13:32Z).
- **Installers:** `scripts/install-user-service.sh` as `cloudbrowser`, then `scripts/install-system-services.sh`. The relay unit now declares `SuccessExitStatus=143`.

## Primary (standby, fenced)

- **State:** fenced before and after. The relay was not running before, so it was not restarted.
- **Lock:** the dead legacy owner was recovered by the new code's guarded stale-owner path. `lock-status` ended `FREE`.
- **Checks:** the no-send lock check passed and 34/34 focused tests passed on the host's Node 22.
- **Nothing else moved:** protected state hashes, central lease, queue and ledger were unchanged. The read-only doctor gave the same result before and after; it cannot reach a browser on the fenced host either time.

## Secondary (active lease, epoch 6)

- **Quiet window, 13:40Z:**
  - central queue 0, no unresolved admission, no generation in flight;
  - health timer stopped (kept enabled) after its in-flight run finished;
  - old relay stopped with exit 0, removing its own lock metadata.
- **Install and checks, 13:44Z:** installed, then the no-send lock check passed, 34/34 tests passed, and the read-only doctor gave the same result before and after. From the quiet baseline to post-install, protected state, central state and ledger were unchanged.
- **Restart, 13:46:40Z:** the relay was running before and the lease allows it, so it was restarted with `start` (unit file still disabled, as before), and the health timer was restarted. `lock-status`: `HELD` by the relay (`PERSISTENT_SERVICE`, `relay:run`).
- **Fence:** neither engaged nor released on the active host. Release is reserved for takeover, and engaging would restart its browser.
- **Before install:** every non-backup file of the old app already matched `f37d7ca` except an older `src/cdp.mjs` progress detector, which `f37d7ca` supersedes (UDA #254/#256).

## No provider sends

The ledger had 510 records with the same digest at every baseline, and `lastSubmissionAt` stayed `2026-09-24T19:48:57.810Z`. Every maintenance command ran with `MC_RELAY_SUBMIT_ENABLED=0` and `MC_RELAY_CAPABILITY_TEST_ENABLED=0`, and no lock file was unlinked by hand.

## Residual risk

- **Relay can't send (not caused by this deployment):** since 2026-09-25T06:18Z the secondary relay reports that ChatGPT did not become ready in the automation-owned window.
  - Central shows an OPEN `WINDOW_REPLACE` transition (binding revision 16) and `ready=false`.
  - The read-only doctor reports `AUTOMATION_WINDOW_BINDING_MISMATCH`: no ChatGPT tab owned by the automation window, and one foreign tab.
  - No sends have gone out since 2026-09-24T19:48:57Z. The new relay reports the same error after restart.
- **Lease:** the active lease expires 2026-09-27T00:00:00Z.
- **Stale queue item:** one local queue item from before the outage is still in `IN_BAND_REQUEST_DECISION_GENERATION_STARTED`.
- **Transient probe error:** one secondary probe saw a transient `CENTRAL_SCHEDULER_UNREACHABLE` at 13:41–13:43Z; later probes and a direct status call succeeded.

## Rollback

Each host keeps its pre-install app as `app.rollback.<timestamp>.<pid>` (tree-verified) and a root-only backup of the system units and fence helper. Roll back only in a quiet window, from the preserved copy after hash verification. Keep `relay.lock.guard`, never hand-edit state or replay sends, and never unlink lock files.
