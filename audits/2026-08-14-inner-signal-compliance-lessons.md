# Inner Signal compliance lesson promotion

Date: 2026-08-14

Origin: `u-dont-existDOTcom/innerSignalGraph`

Universal target: `patterns/codex-github-operating-system.md`

## Source evidence

| Finding | Source commit | Source path | SHA-256 |
|---|---|---|---|
| Structural workflow audit | `ae4ee61c60a662dde6368369fc50bdf41858dbe5` | `scripts/audit-workflows.mjs` | `d283d66f5cf0782ed2b304e8f3e4c59ce920d2301d5a7f44991d937add9163e3` |
| Workflow causal regressions | `ae4ee61c60a662dde6368369fc50bdf41858dbe5` | `tests/workflow-policy.test.mjs` | `8cea68c560d60b44a384650ad1f6b6f5863cb466a7657231889851c2e89134e3` |
| Hermetic verifier | `57eb8604ce3b0e39b7777d5756e993b92895a0ab` | `scripts/verify-clean.sh` | `9e59bd73ad5a29de4ae6b54193b943d688d7f5fa7a977f0dfe1c515b0f811060` |
| Hermetic causal regressions | `57eb8604ce3b0e39b7777d5756e993b92895a0ab` | `tests/verify-clean.test.mjs` | `2488e9c1379047fa7be4ee1d3d3d8224d758168d5550f329c74d1bb6940a12f8` |
| Transactional Git update | `690244617a1ff08ddc6cbddea461fd9f6f93f8b7` | `tests/git-runtime-update.test.mjs` | `a085d65df716c4dbbf05b1e616f105eea767aab4c95a497dc14c756fa360a6ba` |
| Condition-based readiness | `690244617a1ff08ddc6cbddea461fd9f6f93f8b7` | `tests/runtime-service-liveness.test.mjs` | `11201b8ef9d5ba21abd5a754ab13aa4c5ccb1c84542729f897a4a8a8430099f7` |
| Privacy-safe remote diagnostic | `690244617a1ff08ddc6cbddea461fd9f6f93f8b7` | `tests/remote-diagnostic.test.mjs` | `609bad6a35ac7c21b59df0817128b9629b15365e14e07ed02c8e30d9883b566e` |
| Privacy-safe progress | `690244617a1ff08ddc6cbddea461fd9f6f93f8b7` | `tests/remote-progress.test.mjs` | `15428a22c21bb54f1aaec330eb479aa55949649cff03ec23bafd95118d55b2fe` |
| Recovery export privacy | `690244617a1ff08ddc6cbddea461fd9f6f93f8b7` | `tests/diagnostic-export.test.mjs` | `c06ae868fc39ac1a68de3fca49a446a6182234b3f438eeeca3c91fe4d3dbd807` |
| Stage-specific recovery | `690244617a1ff08ddc6cbddea461fd9f6f93f8b7` | `tests/a001-stage-recovery.test.mjs` | `f5a5a3183f12891b1852b75efe5f326614bca5734a1b7a5fab4998e86eca6893` |
| Authentication-stage boundary | `690244617a1ff08ddc6cbddea461fd9f6f93f8b7` | `tests/auth-recovery.test.mjs` | `d99b000f24a6e4ed760f8c454265903387aea1078aaf916116584bafee372c27` |
| Release evidence synthesis | `8631d72518bb5c96b2f3c9ff9a0fb1584394e132` | `docs/RELEASE-EVIDENCE.md` | `72f495ae0c5ddb54f3272c8e6667daa0a098f23dfeafb775d8498f2629df5214` |

The workflow finding was independently visible in Inner Signal GitHub Actions run `31760676064`: the policy workflow rejected its own embedded `pull_request_target` scanner text. Applying the universal audit then revealed a second causal defect: on Python 3.12, `scripts/audit_codex_github.py` could not import because a repeated inline multiline flag occurred after a regex alternation.

## Promoted lessons

### 1. Workflow security scanners must distinguish YAML structure from embedded text

Disposition: `promoted`

Rationale: unanchored token search makes a scanner detect its own source or harmless block-script content. In the opposite direction, scalar/list/flow event forms can bypass an overly narrow detector. The reusable invariant is to inspect physical event/action/permission structure, exclude block-scalar bodies, and test both prohibited syntax and harmless impersonation.

Universal implementation:

- `scripts/audit_codex_github.py`
- `tests/test_audit_codex_github.py`
- `templates/WORKFLOW-POLICY.yml`
- `patterns/codex-github-operating-system.md`

Tests cover import on Python 3.12, mapping/scalar/list/flow event forms, embedded event/action text, the portable template scanning itself, and a job whose name happens to be `pull_request_target`.

Limits: this is a constrained standard-library workflow detector, not a complete YAML implementation. Projects using YAML anchors, aliases, unusual scalar syntax, or generated workflows should use a reviewed YAML parser or add exact fixtures before relying on the detector.

Supersession: this extends the existing universal lesson “workflow security should be machine-enforced”; it supersedes the raw substring example in the earlier portable template, not the underlying least-privilege rule.

### 2. Hermetic verification includes generated-output cleanliness

Disposition: `promoted`

Rationale: restoring one expected output is insufficient if a successful gate leaves other tracked or untracked artifacts. The reusable pattern snapshots the caller’s complete Git status, restores only declared generated outputs on success and failure, compares final state to the original, preserves owner work, and reports paths without leaking content.

Tests: four causal cases cover declared restoration, unexpected untracked output, pre-existing owner state, and cleanup after nested failure.

Limits: Git status proves repository-byte drift, not external cache/service side effects. Repositories with generators outside Git need separate destination and cleanup contracts.

Supersession: this narrows and strengthens the prior final-diff/generated-file guidance; it does not replace repository-specific reproducibility or artifact-hash checks.

### 3. Self-update and installation should be transactional

Disposition: `promoted`

Rationale: a safe self-updater validates an exact detached candidate in disposable state with credentials/external automation removed, overlays verified private state only afterward, swaps atomically, retains rollback, and records the exact installed commit. Validation of one ref cannot authorize installation of different bytes.

Tests: Inner Signal’s Git runtime-update suite covers clean installation, current state, activation failure, rollback, retry, preserved sentinels, credential isolation, and exact commit identity.

Limits: filesystem atomicity and process handoff vary by platform. Cross-device moves, databases, and distributed deployments need their own transaction boundary and recovery proof.

Supersession: no existing lesson is removed; this adds runtime self-update detail to repository branch/release authority.

### 4. Readiness is a condition, not elapsed time or a transition marker

Disposition: `promoted`

Rationale: “promotion attempted” or “process started” proves that a transition began, not that the replacement service is healthy. Deterministic tests should control the transition, prove the owner remains live, release it, then poll the public health/status condition. Increasing a timeout does not repair the missing condition.

Tests: the runtime liveness regression holds recovery server startup, proves health is unavailable while held, then requires health, status, Guide status, recovery ZIP, browser-open ordering, and complete process-group cleanup.

Limits: the public condition must itself be meaningful and bounded. A superficial liveness endpoint does not prove dependency or data readiness.

Supersession: no prior lesson is superseded; this specializes deterministic verification for asynchronous recovery.

### 5. Diagnostics should be newly constructed from privacy-safe allowlists

Disposition: `promoted`

Rationale: recursively sanitizing arbitrary runtime objects is fragile. Build diagnostic/progress/recovery records field-by-field from bounded types and codes. Exclude credentials, user content, prompts, model output/reasoning, raw logs, host/network identity, absolute paths, and hashes derived from excluded content.

Tests: separate diagnostic, progress, and recovery-export suites use forbidden markers and schema assertions to prove exclusion and bounded publication.

Limits: an allowlist still needs threat review when a new field is added, and aggregate values can become identifying at small population sizes.

Supersession: this strengthens the existing rule that diagnostics branches exclude secrets/user content; it does not authorize any new diagnostic field.

### 6. Recovery should resume the failed stage without broadening authority

Disposition: `promoted`

Rationale: multi-stage work should persist completed validated output and stage-specific attempts. A later failure resumes only the missing/stale stage and never changes model/provider/policy authority merely to obtain a pass. Authentication recovery is similarly bounded to the failed provider role.

Tests: A001 stage recovery and authentication recovery cover checkpoint identity, audit-only retry, stale-stage classification, bounded login recovery, and exclusion of clinical/raw-provider content from diagnostics.

Limits: checkpoint payloads can contain sensitive local state and require stricter storage than exported attempt metadata. A changed input/model/policy fingerprint must invalidate reuse.

Supersession: no prior role policy is superseded; this generalizes stage recovery while preserving project-specific role assignments.

## Project-specific findings

Disposition: `project-specific`

The r03 Opus findings, therapy/hypnosis prose, guide graphs, model names assigned to therapeutic roles, owner decision cards, and installed production policy remain governed only by Inner Signal. The real r03 non-pass is recorded at Inner Signal commit `875b649dd32d5e77e7502a1648b906668781f67f`; it is evidence of project review, not a universal therapy rule.

## Provisional finding

Disposition: `provisional`

Hosted-control mutation remains permission/plan dependent. Read-only inventory and readback are reusable; automatic mutation of branch rules, Action allowlists, scanning, or alert settings should not become universal until idempotent rollback and stronger-existing-setting preservation are demonstrated across repositories.

## No-new-lesson dispositions

- Exact Node/npm pinning and lockfile creation implement the existing reproducible-environment rule.
- Expanded CODEOWNERS and PR/release templates implement existing review/evidence rules.
- Recording plan-limited controls as disabled/unverified implements the existing repository-visible-versus-hosted proof distinction.
- Therapy-prompt lesson ledgers remain project-specific and are not duplicated here.

## Verification boundary

Universal unit tests and the repository audit must pass on the final universal commit. Inner Signal’s complete gates remain separate and must pass on its final compliance commit; this promotion does not certify or release Inner Signal.
