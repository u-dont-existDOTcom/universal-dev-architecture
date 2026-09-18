# Mission Control Codex release/install handoff

Status: OWNER-AUTHORIZED RELEASE/INSTALL HANDOFF  
Classification: NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT  
Recorded: 2026-09-18

## Owner authorization

The owner explicitly approved:

- merge of the reviewed Mission Control Codex execution chain;
- reversible installation on the authorized NON-PRODUCTION SECONDARY Mission Control host;
- enabling the Codex preview only for the intended scoped non-production worker(s);
- using the first naturally occurring harmless local filesystem/terminal task as the first CODEX_LOCAL pilot.

Still **not authorized**:

- production mutation or production deployment;
- releasing, bypassing, weakening, or otherwise changing the protected browser fence;
- broadening browser/MCP capability beyond the already accepted restricted capability;
- paid API inference or API-key fallback;
- manufacturing another synthetic model smoke merely to prove installation.

## Canonical bootstrap

Before substantive work:

1. Fresh-read default-branch root `AGENTS.md`.
2. Fresh-read the current task-relevant patterns, including:
   - `patterns/development-assurance-lanes.md`
   - `patterns/chat-work-execution-routing-threshold.md`
   - `patterns/work-model-and-effort-routing.md`
   - `patterns/test-efficiency-and-verification-budget.md`
   - `patterns/parallel-chat-write-isolation.md`
   - `patterns/owner-goal-followup-and-requirement-accretion.md`
3. Fresh-read `state/CURRENT-STATE.md`.
4. Resolve the exact current `origin/main` SHA at action time. Do not rely on this file for a supposedly current tip.

At handoff creation, canonical `main` was:

`1df60d86a08acceb34076488d7cbb33363a1c4d9`

This is an observation only; refresh before acting.

## Reviewed execution chain

The following candidate chain has been reviewed in Chat and accepted at the reversible-candidate boundary.

### Current reviewed bridge

Branch:

`task/mission-control-codex-directive-publication-20260917`

Exact tip:

`1592d7b383d0f35710aab728664e2192de4a3c47`

Exact parent:

`b5e0fb5bb85904a6e31a7f51e803e2b22ec2128f`

### Current-main-compatible execution port

Reviewed mainline-port tip:

`b5e0fb5bb85904a6e31a7f51e803e2b22ec2128f`

That port preserved current controller, health, browser-fence, expiry, pacing, lease, ambiguity, and Work-routing behavior while adding the accepted Codex execution path.

### Accepted predecessor chain

The reviewed path leading to the current bridge includes:

- `a39b36eaffc6759705ae01dd3b46cf61d3b5b2e7` — initial Codex execution integration candidate;
- `f383da2d8ced0209a861cea126289c70658db67d` — authenticated authority/preflight and credential-isolation repair;
- `87625db886461cad1e7ef995140d55d34495d185` — exact automatic Mission Control dispatch and source-bound legacy fallback;
- forward-port lineage on fresh main culminating in `b5e0fb5bb85904a6e31a7f51e803e2b22ec2128f`;
- `1592d7b383d0f35710aab728664e2192de4a3c47` — canonical GitHub decision to SYSTEM-derived execution-directive bridge.

Do not rewrite or force-push the reviewed source branches.

## Accepted architecture

The accepted end-to-end topology is:

```text
reasoning Chat
  -> canonical GitHub supervisory decision artifact
  -> existing Mission Control GitHub decision validation
  -> optional bounded_execution residue
  -> SYSTEM-derived schema-v3 execution_directive_recorded
  -> normal RelayRuntime.cycle automatic dispatcher
  -> authenticated WORKER admission
  -> mayExecute:true + exact persisted directive binding
  -> trusted task-creation setter evidence
  -> persisted Work execution preflight
  -> CODEX_LOCAL or already-qualified restricted browser MCP
  -> local codex exec --json
  -> codex_execution_started / execution_receipt_recorded
```

Chat remains the semantic/architectural/supervisory authority. Work/Codex receives only the source-authored bounded mechanical residue.

## Accepted authority and security properties

Preserve all of these:

- the canonical GitHub supervisory decision bus is the semantic mailbox;
- the optional bounded execution residue is part of the already-validated canonical decision path;
- Mission Control mechanically derives the schema-v3 execution directive as SYSTEM;
- `GITHUB_SESSION_ATTESTED` remains `UNVERIFIED`; it is **not** relabeled provider-direct or VERIFIED;
- execution authority comes from the server-validated GitHub decision proof plus exact persisted directive reconstruction;
- a caller-supplied receipt string, hash, or worker-authored directive cannot authorize execution;
- exact directive ID/revision/task/source/artifact/profile bindings are rechecked before launch;
- worker admission must return `admitted:true` and `mayExecute:true`;
- trusted setter evidence and persisted preflight must bind the exact authorized profile;
- ChatGPT subscription authentication is required;
- `OPENAI_API_KEY` / `CODEX_API_KEY` fallback is removed from executor children;
- per-attempt Codex auth lives in a private ephemeral runtime home outside durable state and is removed after execution/setup failure;
- sandbox remains `workspace-write`;
- approval policy remains `never`;
- workspace network access remains disabled;
- retry identity remains source-bound and materially changed retries are rejected;
- timeout remains scoped to the Codex process group;
- raw CDP is not exposed to the Codex shell;
- restricted browser access goes only through the digest-bound constrained adapter;
- unsupported/representational browser work stays on the existing legacy browser route;
- legacy fallback is exact to worker + task + originating request and fails closed on zero/multiple matches;
- preview is disabled by default;
- browser-fence and existing controller/health/pacing/lease protections remain authoritative.

## Evidence already accepted

Do not repeat these campaigns merely for reassurance:

- local `codex exec` unattended control-plane qualification: PASS;
- existing authenticated Chromium restricted MCP qualification: PASS;
- integration candidate deterministic smokes: PASS;
- authority/preflight repair: PASS for local route;
- exact automatic dispatch from durable Mission Control state: PASS;
- current-main forward-port deterministic validation: PASS;
- canonical GitHub decision -> SYSTEM execution directive -> automatic fake/local CODEX_LOCAL consumer-seam test: PASS.

No new real model smoke is needed merely because the release/install step begins.

## Current owner outcome

Status: OPEN only for **promotion to an owner-usable non-production installation and first natural pilot**.

Remaining gap:

1. integrate the reviewed branch onto fresh current main if needed;
2. cross the repository Release gate;
3. PR/merge if green;
4. install the exact merged package reversibly on the authorized NON-PRODUCTION SECONDARY only;
5. enable preview only for intended scoped worker(s);
6. verify health/config/rollback with production and browser fence untouched;
7. wait for the first naturally occurring harmless local filesystem/terminal task and observe whether it routes to CODEX_LOCAL.

Do not redefine completion by adding new proof requirements that do not change this owner outcome.

## Next authorized action

### 1. Fresh-main release integration

Refresh `origin/main`.

At handoff creation, main had advanced beyond the reviewed branch after the bridge review. The observed new main-only changes were instruction/control-plane guidance rather than overlapping Mission Control executable code, but this must be rechecked at execution time.

Create a fresh release-integration branch/worktree from exact current main.

Integrate the reviewed bridge branch without rewriting it and without losing newer current-main instructions or executable fixes.

Follow `patterns/parallel-chat-write-isolation.md`: do not overwrite another active chat's branch/worktree/state.

### 2. Release validation

This is now a Release boundary.

Run the exact repository completion commands declared by `.github/codex-repository.json`, plus the complete applicable Mission Control and VPS relay release gates already established for this package.

Use the test-efficiency observer and avoid gratuitous reruns.

At minimum preserve/recheck:

- repository policy/compliance;
- deterministic audit;
- Mission Control tests/typecheck/build;
- complete relay tests/syntax/service assets;
- security/privacy checks relevant to credentials, public content, and browser fence;
- exact installed-package/rollback readiness;
- no secret/private-locator leakage.

Do not launch paid/API inference.

### 3. PR and merge

Open a PR from the release-integration branch to current main.

Check hosted CI/review.

If green and there is no new substantive tradeoff, merge normally.

The owner has already authorized this merge. Do not ask again merely for the merge.

Stop and return to Chat before merge only if fresh main changes the accepted architecture materially or CI exposes a semantic regression requiring a new decision.

### 4. Reversible non-production install

After merge, install the exact merged package on the authorized NON-PRODUCTION SECONDARY role only.

Do not touch production.

Do not release or bypass the protected browser fence.

Preserve:

- exact source/package SHA;
- pre-install package/config backup;
- rollback package/state;
- relevant file hashes;
- existing volume/state;
- current scheduler/lease safety.

### 5. Preview configuration

Enable the Codex execution preview only for intended scoped non-production worker(s).

Keep:

- default off outside scope;
- authenticated WORKER credential;
- ChatGPT subscription auth;
- no API-key fallback;
- accepted local capability;
- already-qualified restricted MCP only;
- unsupported browser/representational work on legacy routing.

Do not broaden permissions.

### 6. Post-install verification

Verify without manufacturing a new semantic/model qualification task:

- exact merged package installed;
- service/package parity;
- central scheduler/lease healthy;
- no unresolved admission/target-transition/safety-halt ambiguity;
- browser fence unchanged;
- preview scope exact;
- worker credential/admission path functional;
- subscription-auth executor path present;
- API-key variables absent from executor child environment;
- rollback/disable switch works.

### 7. First natural pilot

Do **not** fabricate another model smoke.

Wait for the first naturally occurring harmless task that genuinely requires local terminal/filesystem execution.

That task should flow through the already-authorized normal reasoning path:

canonical GitHub decision with bounded residue -> SYSTEM directive -> automatic CODEX_LOCAL execution.

For the first natural pilot, record:

- exact task/directive/source identities;
- selected Work profile/model/effort;
- authenticated admission;
- persisted setter/preflight;
- CODEX_LOCAL selection;
- terminal status;
- start/receipt lifecycle;
- scope/stop-condition compliance;
- observable allowance data if available, otherwise unavailable;
- rollback/legacy fallback status.

Chat reviews that receipt and decides whether any further change is warranted.

## Work model routing

Fresh-read the current `patterns/work-model-and-effort-routing.md`.

Do not use remembered tier mappings.

Current policy at handoff creation used GPT-5.6 Sol XHigh as the difficult-task baseline and Astra XHigh only as a matched challenger after a qualifying Sol failure.

Apply the current policy at execution time.

No purchased credits or API spend is authorized.

## Stop conditions

Return to Chat rather than continuing automatically if any of these occurs:

- current main has material executable overlap that changes the accepted architecture;
- release validation exposes a semantic/security regression;
- installation would require production mutation;
- installation would require browser-fence release/bypass;
- the only route requires API credentials or paid inference;
- a new substantive owner tradeoff appears;
- rollback cannot be preserved;
- the first natural task is not actually harmless/bounded/local.

## Expected terminal receipt

For the release/install portion, return:

- fresh main SHA used;
- release-integration branch;
- PR number;
- merged SHA;
- hosted/local release-gate results;
- installed non-production role;
- installed source/package SHA;
- preview scope;
- browser-fence status;
- rollback/disable state;
- production untouched confirmation;
- whether the system is ready and waiting for the first natural CODEX_LOCAL task.

Terminal marker:

`MC_CODEX_EXEC_RELEASE_INSTALL: PASS`

or

`MC_CODEX_EXEC_RELEASE_INSTALL: FAIL`

or

`MC_CODEX_EXEC_RELEASE_INSTALL: BLOCKED`
