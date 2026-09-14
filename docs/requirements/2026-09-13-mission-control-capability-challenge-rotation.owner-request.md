# Mission Control capability-challenge rotation — exact owner request

Source identity: `owner-chat:2026-09-13:capability-challenge-rotation`

Source-time status: `TIMESTAMP_UNAVAILABLE`

Exact UTF-8 SHA-256: `3cb6f80c276ed6280a914d6060b5c0180615ae715c45b337d535b7d4272633c0`

## Exact request

Implement a permanent capability-challenge rotation fix in `u-dont-existDOTcom/universal-dev-architecture`.

Use a new isolated task branch from current `main`, preferably:

`task/mission-control-capability-challenge-rotation-20260913`

This is Mission Control infrastructure work only. Do not touch the Somatic humanization repository or experiment state.

## Problem to solve

Mission Control capability challenges currently contain ephemeral values—challenge ID, MC nonce, GitHub nonce and expiry—inside static `MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON`.

The private supervisor chat registry also statically binds each registered chat to one `bootstrapCapability.challengeId`.

The daemon's `ensureConfiguredCapabilityChallenges()` materializes a configured challenge only once by challenge ID. After that challenge expires, the relay returns `CAPABILITY_CHALLENGE_MISSING`. Manual creation of a new challenge ID plus coordinated Railway and relay-registration edits is currently required.

That is the defect.

Do not solve it with a cron job that edits environment variables every day. Remove ephemeral challenge lifecycle from static deployment configuration.

## Required architecture

Static configuration should define **who may be challenged**, not the current challenge.

Preserve as static authority:

* supervisor ID;
* registered MC-only chat ID;
* worker binding;
* ownership/registration provenance;
* fixed visible GPT-5.6 Sol / Thinking effort Extra High 4-of-5 controls;
* exact GitHub capability issue and authorized writer policy.

Move these values into dynamically generated durable challenge state:

* challenge ID;
* MC nonce;
* GitHub nonce;
* issuance time;
* expiry.

### Dynamic challenge manager

Add one Mission Control challenge manager owned by the existing single-writer daemon.

For every statically authorized supervisor/chat:

1. resolve the latest durable challenge;
2. if a sufficiently fresh current challenge exists, reuse it;
3. if none exists or it is inside the renewal window, mint a new challenge with:

   * a new globally unique challenge ID;
   * cryptographically random independent MC nonce;
   * cryptographically random independent GitHub nonce;
   * issuance timestamp;
   * bounded expiry;
4. persist it durably and immutably;
5. never overwrite an old challenge or reuse its identity.

Use approximately a 24-hour challenge TTL and a renewal lead such as 4–6 hours unless current repository evidence establishes a better existing value. Make the durations bounded/configurable, but do not turn this into a general scheduling subsystem.

Exactly one active challenge per supervisor/chat should be selected at a time. Historical expired challenges remain provenance only.

## GitHub nonce publication

Fresh GitHub read proof must remain genuinely fresh. Do **not** weaken the protocol by permanently reusing an old public GitHub nonce.

The rotation mechanism must publish the newly generated GitHub nonce to the existing capability bus before making the challenge live.

Use the existing exact capability repository/issue policy. Add the minimum narrowly scoped authenticated GitHub-write mechanism needed for this single operation if no suitable existing mechanism exists.

Preferred security shape:

* a distinct capability-writer credential;
* least privilege possible: only the configured repository's Issues write capability;
* server code hard-locks it to the configured capability repository and exact capability issue;
* it cannot choose arbitrary repositories/issues;
* it cannot write decisions, stage receipts, source code, releases, or other GitHub content.

Never expose this token through the API, dashboard, logs, receipts, Git, or relay hosts.

Publish the established public fixture shape:

`MISSION_CONTROL_CAPABILITY_NONCE_V1`

with only:

* challenge ID;
* non-private chat alias/ID already authorized for the bus;
* raw GitHub nonce;
* expiry.

Never publish the MC nonce or private conversation locator.

Use a safe ordering. A reasonable transaction is:

generate candidate challenge
→ publish exact GitHub nonce comment
→ verify the returned GitHub comment belongs to the exact configured capability issue
→ persist/activate the durable Mission Control challenge

If publication fails, do not activate the challenge. An orphaned public nonce comment is harmless historical evidence; never infer activation from it.

## Relay change

Remove the requirement that `MISSION_CONTROL_SUPERVISOR_CHATS_JSON` carry the current mutable challenge ID.

`bootstrapCapability` should retain stable chat identity/URL, but `challengeId` should become unnecessary/deprecated.

Change relay capability lookup so it resolves the **latest current active challenge for the exact registered supervisor + chat pair** from Mission Control state.

`mcp-preflight` and `capabilities` must therefore use the dynamically resolved challenge ID.

A stale or expired challenge must never satisfy the lookup merely because it was once associated with the chat.

Preserve all current:

* MC-only ownership checks;
* supervisor/chat binding;
* worker scoping;
* fixed model/thinking control proof;
* global scheduler and 60-second provider-send pacing;
* ambiguity handling;
* receipt validation;
* GitHub authorized-writer checks.

## Receipt/admission validation

Refactor capability receipt verification so the receipt is validated against the exact durable dynamic challenge rather than the old static challenge array.

Require:

* exact challenge ID;
* exact chat and supervisor binding;
* raw MC nonce exact match;
* raw GitHub nonce/hash match;
* GitHub receipt created before challenge expiry;
* authorized writer;
* exact capability issue;
* exact ordered capability set.

Existing expired receipts and challenges must remain invalid.

Decision admission must continue requiring a current capability verification and current fixed consumer-control verification.

Do not let challenge rotation itself imply capability PASS. A newly rotated challenge means the chat must prove capability again.

## Concurrency / restart requirements

Mission Control is already the single writer. Use that authority rather than inventing a second lock service.

Test:

* two simultaneous "ensure challenge" requests create at most one active challenge;
* daemon restart with a healthy challenge does not rotate it unnecessarily;
* daemon restart during/after publication cannot create two active challenges;
* expiry causes one new challenge;
* old receipt cannot satisfy new challenge;
* wrong supervisor/chat cannot consume another challenge;
* failed GitHub publication never creates an active challenge;
* no provider ChatGPT message is sent merely by challenge rotation.

## Compatibility

Provide a bounded migration path from the current static `capabilityChallenges` / `bootstrapCapability.challengeId` configuration.

Do not require an unsafe flag-day deployment.

Old static configuration may remain readable temporarily for migration, but the final live path should no longer require operators to rotate Railway environment values or private relay chat registries when a challenge expires.

Document the deprecated fields clearly.

## Validation

Add focused tests for the manager, GitHub publication boundary, receipt validation, relay active-challenge selection, expiration, concurrent rotation, restart/idempotency and migration.

Run affected tests first.

Before claiming the fix is ready, run the repository/Mission Control/relay checks appropriate to the changed components. Do not launch unrelated mutation testing or broad experimental work.

Have an independent reviewer inspect especially:

* whether any stale challenge can become current;
* whether GitHub publication can target anywhere except the configured capability bus;
* whether secrets can leak;
* whether multiple challenges can become active;
* whether rotation accidentally grants capability without a fresh receipt;
* whether an expired receipt can satisfy decision admission.

## Deployment boundary

Do not deploy to the separate production Mission Control service.

If the implementation and review pass, install it only into the currently accepted Mission Control hotfix runtime used by the PRIMARY relay, preserving all unrelated runtime configuration and state.

Do not modify SECONDARY except if an exact compatibility/config artifact must be prepared for later deployment; do not activate or promote it.

Do not overwrite or remove the separately installed PRIMARY relay-lock lifecycle correction.

After installation, prove with a controlled live case that:

1. a missing/expired challenge causes automatic creation of one new challenge;
2. the new public GitHub nonce fixture exists;
3. the exact registered chat sees the new challenge without editing its private registration;
4. `mcp-preflight` can proceed against it;
5. a fresh capability receipt validates;
6. an old capability receipt does not validate against the new challenge;
7. normal scheduling/pacing and MC-only ownership remain intact.

Provider sends used for the actual capability proof must be counted accurately.

Do not run the Somatic experiment in this thread.

## Stop conditions

Stop and report rather than improvising if the fix would require:

* weakening GitHub-read freshness;
* broad GitHub write authority;
* exposing private nonces/locators;
* changing the single-writer/pacing architecture;
* production deployment;
* changing supervisor ownership semantics.

## Work reasoning

Use Medium reasoning unless the actual Work surface exposes a materially equivalent lower level that passes its own preflight as sufficient.

The methodology and architecture above are fixed. Work owns implementation/debugging choices only.

Return:

* branch and commits;
* exact files changed;
* tests/results;
* security review findings;
* live hotfix acceptance result if installed;
* rollback procedure;
* any remaining blocker.

Do not merge without explicit merge authority.
