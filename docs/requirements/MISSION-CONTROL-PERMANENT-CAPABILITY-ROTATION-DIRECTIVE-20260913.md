# Mission Control — Permanent Capability-Challenge Rotation Directive

Date: 2026-09-13  
Classification: NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT  
Repository: `u-dont-existDOTcom/universal-dev-architecture`  
Preferred branch: `task/mission-control-capability-challenge-rotation-20260913`

## Owner objective

Implement a permanent fix for capability-challenge expiry so operators no longer have to manually rotate challenge IDs/nonces/expiry or edit private supervisor-chat registrations whenever a challenge expires. This is Mission Control infrastructure work only; do not run or modify the Somatic humanization experiment.

## Existing approved receipt-policy authority

Do not invent a replacement security policy. Preserve and compose these existing authorities:

1. `docs/requirements/2026-09-03-capability-challenge-public-read.owner-requirement.json`
   - exact-ID public read-only challenge path;
   - exact challenge/chat and two-nonce verification;
   - authorized-writer and expiry verification;
   - expired challenges must not be reused;
   - MC nonce is read from Mission Control, not embedded in the browser prompt.
2. GitHub issue #59: canonical supervisor decision receipt bus (`MISSION_CONTROL_CANONICAL_DECISION_V1`).
3. GitHub issue #60: canonical capability challenge/receipt bus (`MISSION_CONTROL_CHAT_CAPABILITY_RECEIPT_V1`); disposable capability nonces may be rotated when receipts expire.
4. GitHub issue #61: canonical stage-liveness bus (`MISSION_CONTROL_CHAT_STAGE_RECEIPT_V1`).
5. Accepted writer evidence: capability receipt comment `#5532362859` on issue #60 was authored by `u-dont-existDOTcom` and was subsequently reconciled by Mission Control to `CAPABILITIES_VERIFIED` with Mission Control read, GitHub read/write, and mode switching all true.

Approved static receipt-channel values for this owner deployment:
- repository: `u-dont-existDOTcom/universal-dev-architecture`
- decision issue: `59`
- capability issue: `60`
- stage issue: `61`
- authorized writer login: `u-dont-existDOTcom`

Do not fabricate a historical live `MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON` if the current runtime does not contain one. Materialize only the minimum static receipt policy required by these durable sources.

## Current runtime correction

Do not require historical Railway identity. The accepted current authority is the PRIMARY loopback Mission Control single writer. The observed runtime is `mission-control-issue90-live`, with relay Mission Control URL `http://127.0.0.1:3000`. SECONDARY remains standby/failover. Use local PRIMARY process/service/filesystem evidence as runtime identity and retain existing work already completed in the current Work run.

## Defect

Ephemeral capability state currently lives in static deployment configuration:
- challenge ID;
- MC nonce;
- GitHub nonce;
- expiry.

The private supervisor registry also binds `bootstrapCapability.challengeId`. Once that challenge expires, the relay keeps looking for the stale ID and returns `CAPABILITY_CHALLENGE_MISSING`; recovery requires coordinated manual config edits.

## Required architecture

### Stable static authority

Keep static:
- exact supervisor ID and registered `MISSION_CONTROL_ONLY` chat identity;
- worker binding and registration/ownership provenance;
- fixed consumer controls: GPT-5.6 Sol, Thinking effort, Extra High, 4 of 5, Pro only as account-plan provenance;
- exact receipt repository/issues;
- authorized writer allowlist.

### Dynamic durable challenge state

Move into Mission Control durable state:
- globally unique challenge ID;
- cryptographically random MC nonce;
- independent cryptographically random GitHub nonce;
- issued-at and expires-at;
- exact supervisor/chat binding;
- publication/activation lifecycle state.

Mission Control's existing single-writer daemon owns the lifecycle. Do not add another scheduler or lock plane.

### Rotation behavior

For each authorized supervisor/chat:
1. Reuse a sufficiently fresh current challenge.
2. If missing, expired, or inside a bounded renewal window, mint exactly one successor.
3. Use independent cryptographically random MC/GitHub nonces.
4. Default to ~24-hour TTL and ~4-hour renewal lead unless implementation evidence justifies another bounded value.
5. Publish the fresh GitHub nonce fixture to exact capability bus #60 before activation.
6. Verify publication targeted the exact configured repository/issue.
7. Only then durably activate the challenge.
8. Preserve old challenges immutably.
9. Rotation never grants capability PASS; a fresh receipt is still required.
10. Exactly one challenge is current for a supervisor/chat at a time.

### GitHub nonce publication

Publish only to `u-dont-existDOTcom/universal-dev-architecture` issue #60, using the established `MISSION_CONTROL_CAPABILITY_NONCE_V1` shape.

Public fields only:
- challenge ID;
- already-authorized non-private chat alias/ID;
- raw GitHub nonce;
- expiry.

Never publish MC nonce, private conversation locator, credentials, tokens, or owner-session data.

Safe order:
`generate candidate -> publish exact #60 nonce fixture -> verify exact publication -> activate challenge`.

If publication fails or is ambiguous, do not activate. An orphaned public nonce fixture grants no authority.

### GitHub write scope

Do not create generic GitHub mutation authority. Reuse an existing narrow owner/runtime GitHub path if available. If a credential is needed, use least privilege and hard-lock it to this repository + issue #60 + issue-comment creation only. It must not write arbitrary issues, decisions, stage receipts, source, releases, or workflows, and must never be exposed in logs/API/dashboard/relay/Git.

### Relay registration/discovery

Stop requiring operators to edit `bootstrapCapability.challengeId` on rotation. Stable registration retains chat ID/URL, supervisor identity, owner provenance, and fixed controls. Treat `bootstrapCapability.challengeId` as migration-only/deprecated.

The relay must resolve the latest CURRENT, NON-EXPIRED challenge for the exact registered supervisor + chat pair from Mission Control. `mcp-preflight` and `capabilities` bind to that dynamic current challenge. Historical configured IDs cannot outrank current durable state.

### Receipt validation

Keep the exact receipt schema. Validate against the exact current durable challenge:
- challenge ID;
- chat/supervisor binding;
- MC nonce;
- GitHub nonce/hash/source;
- exact repository/issue;
- authorized writer;
- receipt before expiry;
- exact ordered capabilities `["MISSION_CONTROL_READ","GITHUB_READ","GITHUB_WRITE"]`.

A new challenge requires a fresh receipt. Old challenge/receipt pairs remain historical and cannot satisfy current decision admission.

## Migration

Provide bounded compatibility from current static `capabilityChallenges` and `bootstrapCapability.challengeId`. Legacy fields may be read initially, but the final live path must not require editing them when a challenge expires. No flag-day private-registry rewrite.

## Required tests

Prove at minimum:
1. healthy challenge reuse;
2. expiry rotation;
3. renewal-window rotation;
4. concurrent ensure -> at most one active challenge;
5. restart/idempotency;
6. failed GitHub publication -> no activation;
7. crash/restart around publication/activation -> no double-active challenge;
8. stale receipt rejected;
9. wrong supervisor/chat rejected;
10. exact GitHub bus restriction and authorized writer preserved;
11. MC nonce does not leak;
12. relay discovers current challenge without registration mutation;
13. legacy-config migration;
14. rotation itself sends zero ChatGPT provider messages;
15. capability PASS still requires a fresh receipt.

Run focused/affected tests first, then appropriate repository/Mission Control/relay gates.

## Independent security review

Review stale selection, double-active challenges, restart atomicity, GitHub-write scope, nonce/secret leakage, binding regressions, expiry bypass, accidental capability grant from rotation, and migration allowing stale legacy IDs to override dynamic state.

## PRIMARY live acceptance

Target actual accepted PRIMARY runtime `mission-control-issue90-live`; do not require historical Railway identity.

Preserve SQLite state, queue/ledger/lease/pacing, relay/browser ownership, and the installed PRIMARY relay-lock lifecycle correction. Capture rollback copies before install. Do not activate/promote SECONDARY.

After install/restart:
1. prove PRIMARY remains healthy single writer and queue/ledger/lease/pacing are coherent;
2. use a missing/expired challenge or narrow controlled equivalent;
3. observe one automatic successor;
4. verify exact #60 nonce publication;
5. verify relay discovers it without private registration edit;
6. run canonical `mcp-preflight`;
7. run canonical `capabilities`;
8. require fresh validated capability proof;
9. prove the previous challenge/receipt cannot satisfy current admission.

Any capability-test ChatGPT messages must use canonical global scheduling and >=60-second spacing and must be counted truthfully.

Do not run the Somatic experiment in this infrastructure thread.

## Scope exclusions / stop conditions

Do not broaden into a general scheduler, weaken the public-read/receipt security model, broaden GitHub mutation authority, expose MC nonce/private locators, change global pacing/single-writer architecture, use owner workstation browser/clipboard, or deploy to an unrelated production service. Stop for a genuine new security/authority tradeoff rather than inventing one.

## Work reasoning and return

Use Medium reasoning unless the Work surface independently determines another available level is materially more appropriate. Architecture is fixed here; Work owns implementation/debugging choices that do not alter it.

Return branch/commits, exact files changed, migration design, tests, independent security review, PRIMARY live acceptance, capability-send counts/timestamps, rollback procedure, and exact remaining blocker. Do not merge without explicit merge authority.
