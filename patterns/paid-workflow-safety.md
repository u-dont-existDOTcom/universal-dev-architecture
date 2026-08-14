# Paid, privileged, and irreversible workflow safety

Reviewed: 2026-08-14

## Purpose

Use this pattern when a GitHub Actions path can spend money, call a metered service, expose a consequential secret, publish or deploy, mutate durable evidence, or perform another action that is difficult to reverse. The governing invariant is:

> Automatic or untrusted events may validate the proposed operation, but they must not reach the paid, privileged, or irreversible execution boundary.

This extends the general Actions hardening rules in `patterns/codex-github-operating-system.md`. It is deliberately provider-neutral; the originating Pangram implementation is evidence, not a template to copy without adaptation.

## Registration and dispatch topology

GitHub requires a manually dispatched workflow file to exist on the default branch before `workflow_dispatch` can trigger it. A paid implementation that exists only on a non-default evidence or release branch therefore is not a usable manual entry point.

When the executable implementation must remain off the default branch:

1. Choose one new workflow path for the controlled entry point. Do not register a historic path whose old default-branch contents or triggers may be unsafe.
2. Put a fail-closed registration stub at that path on the default branch. It should have only `workflow_dispatch`, `permissions: {}`, one refusal job, no checkout, no `uses`, no secret or context reference, and an exact failing command that explains which trusted ref to select.
3. Keep the real implementation at the same path on the selected trusted branch.
4. In the paid job, require the exact canonical `github.ref` as well as `github.event_name == 'workflow_dispatch'`. Treat the UI's ref selector as routing, not authorization.
5. snapshot-lock the complete default-branch stub byte-for-byte. A substring test cannot rule out an added trigger, job-level write permission, alternate secret, action, context, or command.
6. Protect the trusted implementation branch or environment where the repository plan and operating model permit it.

If the full paid workflow can safely live on the protected default branch, a separate registration stub is unnecessary. The same trigger, validation, secret, and credential boundaries still apply.

GitHub source: https://docs.github.com/actions/managing-workflow-runs/manually-running-a-workflow

## Separate validation from execution

Model the workflow as two planes.

The validation plane is deterministic, read-only, secret-free, and safe on push and pull-request events. It should:

- parse and validate every manual input against a narrow grammar;
- require an exact, deliberately awkward confirmation phrase;
- normalize and constrain repository-relative paths, rejecting absolute paths, traversal, symlinks where material, and unexpected file types;
- validate the selected specification, result destination, identifiers, and immutable source/ref expectations;
- reject control characters;
- expose only the minimum normalized values needed by the next job;
- run unit tests, repository policy checks, and any static workflow-security checks;
- use explicit read-only permissions, immutable action pins, timeouts, and non-persistent checkout credentials.

The execution plane must depend on successful validation and repeat its non-negotiable guards in its own `if` condition. It alone may receive the paid API key, write token, protected environment approval, or other consequential authority. Give it a timeout and a concurrency group; for a paid operation, cancellation policy should be chosen explicitly rather than inherited accidentally.

A request identifier is evidence and correlation, not authorization. A confirmation phrase is friction and intent evidence, not a substitute for trusted ref, actor, environment, and permission controls.

## Treat environment files as command channels

Files such as `GITHUB_OUTPUT` are parsed protocols, not ordinary logs. Writing an untrusted value as `name=value` lets an embedded newline create another assignment. An identifier like `audit\nspec_path=other.json` can therefore redirect later steps even when the original path was validated.

For all values written to `GITHUB_OUTPUT`, `GITHUB_ENV`, or related workflow command files:

- reject CR/LF and other control characters unless multiline data is explicitly required;
- prefer an allowlist grammar and a conservative length bound;
- emit only values actually consumed by a downstream boundary;
- never copy unused untrusted metadata into an environment file;
- write normalized values, not the original raw input;
- use GitHub's documented multiline delimiter form only for intentional multiline values, and choose a delimiter that cannot occur in the payload.

A downstream job should consume only the validated outputs. Do not rebuild a sensitive path from raw dispatch inputs after preflight.

GitHub source: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands

## Credential and secret boundary

Start at workflow-level read-only permissions or `permissions: {}`, then grant the smallest job-level scope that is needed. GitHub token permissions are job-scoped, so keep read-only validation and write execution in different jobs.

Use `persist-credentials: false` for every checkout that does not push. If a final job must push, delay any credential-persisting checkout until immediately before the verified write boundary. Keep paid or deployment secrets in the environment of the one step that calls the provider; do not place them at workflow or broad job scope. Prefer a protected GitHub environment for meaningful spend, publication, or deployment.

Pin remote actions to reviewed full commit SHAs. A protected environment, required reviewer, branch rule, or hosted Actions policy can be a necessary independent control; repository files must record these settings as verified, disabled, or unverified rather than assume them.

GitHub source: https://docs.github.com/en/actions/reference/security/secure-use

## Archive obsolete workflows without losing provenance

Deleting executable history makes later forensic review harder. Leaving obsolete files under `.github/workflows` keeps their triggers executable.

For a consolidation or migration:

1. Inventory every historic executable workflow path and its source commit and Git blob SHA.
2. Move exact bytes outside `.github/workflows`, for example under `docs/workflow-archive/<source-ref>/`.
3. Record a table mapping original executable path, source blob SHA, and non-executable archive path.
4. Verify every archived blob against the baseline. Avoid formatting, comments, or line-ending changes in the archived copies.
5. Add the new controlled workflow at a distinct reviewed path.
6. Report the lifecycle precisely: how many historic paths remain executable and how many newly registered paths exist.

An archive blob proves preserved content identity. It does not prove that a historic run used that blob; run IDs and commit/ref evidence are still required.

## Verification and evidence

For code-bearing changes, preserve separate evidence for:

- a test-only red commit showing the intended failure;
- the code-bearing green head and exact test/audit run IDs;
- the final reviewed head;
- the merge commit;
- post-merge checks at the exact merge head when GitHub emits them.

If a connector-originated merge emits no detectable push suite, say so. A green PR head plus exact blob or tree identity between that head and the merge commit proves content equivalence, but it is not an executed merge-head suite.

Zero `workflow_dispatch` runs supports a claim that no Actions dispatch occurred during a migration. It does not prove provider-account billing or rule out calls made outside GitHub; use the provider's own audit surface where available.

## Origin evidence

Originating repository: `u-dont-existDOTcom/pangram-humanization-lab`  
Promotion date: 2026-08-14  
Rationale: consolidation of fourteen historic executable evidence workflows exposed three transferable gaps: privileged-trigger parsing across valid YAML forms, default-branch registration for a non-default manual paid implementation, and environment-file output injection.

### Main-branch repository hardening

- Squash merge: `8bf49ac0132c2fa55429d78d4ab79997081413a3`
- Audit implementation: `scripts/audit_codex_github.py`, blob `6e52f493718c8aeceea3456427a439a6986aa786`
- Audit regressions: `tests/test_codex_github_audit.py`, blob `f82e38a5da969a027e6fa9d13e62c7f3aadc0315`
- Code-bearing verification: head `61f86ae74908447c92e6320b815b07cd60d9125a`, runs `31775932523` and `31775932515`, 60 tests
- Final reviewed head: `6641cf84797e7f96f5be874d04e6c3066bab0a16`, runs `31776448800` and `31776448821`

### Default-branch fail-closed registration

- Squash merge: `81b5cd017e3be088c0638e527ce25f5df6a2f4e8`
- Registration stub: `.github/workflows/pangram-paid-dispatch.yml`, blob `f6aed38791db48f494be78ee79239dc8b6bec478`
- Complete snapshot regression: `tests/test_paid_dispatch_registration.py`, blob `fab9e7c250ecabde8b93ce35e4c8045915363db7`
- Final reviewed head: `092367b72a819b524575fadd6118513cc7bf7c3c`, runs `31778554058` and `31778554047`, 62 tests

### Evidence-branch paid implementation and archive

- Squash merge: `c8147df0831a3a38589a3df7b17f5d76d899b8f4`
- Controlled workflow: `.github/workflows/pangram-paid-dispatch.yml`, blob `d0d74e0e35fe7994d8e431295881e9b713ee8786`
- Dispatch validator: `scripts/validate_paid_dispatch.py`, blob `cfc8bd9aff78b0f8c04613248599f8ff853dbefa`
- Security regressions: `tests/test_paid_workflow_security.py`, blob `208ccd24ba33b9ce46fe1a2e1698aa318a79f45e`
- Archive map: `docs/workflow-archive/automation-pangram-fixed-batch/README.md`, blob `e7ad49a2fde26a782c8151cd4612ed4aea48b2b3`
- Compliance record: `docs/EVIDENCE-WORKFLOW-COMPLIANCE-2026-08-14.md`, blob `71268dd33eb8435d63bd159f8c13f2a6baad5bbf`
- Security red run: `31777929822`, four intended failures and 74 unrelated passes
- Final reviewed head: `4452759d05b135d48ca136626393f2751f411dea`, run `31779023061`, 78 tests, repository audit 0 errors, paid preflight skipped, detector skipped
- All 32 changed paths at the final reviewed head matched the squash-merge blobs; all fourteen archive copies matched their baseline Git blob SHAs.
- No manual dispatch was made during the migration; the repository-wide `workflow_dispatch` run count was zero.

The Pangram-specific fixed-batch schema, provider cache, six-call ledger, result naming, and confirmation literal are local evidence. They are not universal requirements.

## Limits

This pattern does not prove hosted branch rules, protected-environment reviewers, secret visibility, Actions allowlists, token defaults, billing records, or provider-side calls. Verify those settings through the relevant GitHub or provider surface.

A fail-closed default-branch stub prevents accidental execution in its reviewed form; it cannot protect against a trusted writer later changing that file. Branch rules, review, CODEOWNERS, environments, and collaborator hygiene remain part of the trust boundary.

Static policy checks catch known shapes, not every YAML semantic or shell-injection possibility. Prefer a real YAML parser when dependencies and schema control permit it, keep adversarial regressions for valid trigger forms, and fail closed on constructs the checker cannot safely resolve.

Review official sources before major revisions because GitHub event registration, environment-file syntax, runner behavior, and security controls can change.

