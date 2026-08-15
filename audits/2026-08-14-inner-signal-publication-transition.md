# Inner Signal public-visibility transition — transferable lesson audit

Date: 2026-08-15

Disposition: `promoted`

## Transferable lesson

Making an existing repository public is an irreversible disclosure boundary.
The reusable sequence is: complete a fail-closed pre-disclosure audit of Git
history and authenticated hosted surfaces; merge the prepared public posture
through a private pull request; repeat the audits against that exact merged
commit; mutate visibility once; read back repository identity and public
visibility; enable and verify applicable hosted security controls; run and
disposition real public static analysis; protect authoritative branches; and
record the resulting state through a second protected evidence pull request.

This order matters because a repository can contain retained disclosure
surfaces outside the default-branch tree, while public access can create copies
that a later private switch cannot retrieve. Keeping the preparation and
evidence changes in separate pull requests also prevents a repository from
claiming public controls before hosted readback exists.

## Exact source provenance

- Source repository: `u-dont-existDOTcom/innerSignalGraph`.
- Prepared-transition report:
  `docs/PUBLIC-REPOSITORY-TRANSITION-REPORT-2026-08-14.md`.
- The report's current blob bytes on public `main`
  `956b17cc008fe68b6d9f5e9c36f002066aa9732a` have SHA-256
  `5ac4569c06ba2cf9507aada8121076ec0868aa113df600e9ddda8280f83e10fb`
  (Git blob object `20382ab3d529b36119ec6bb6a73051f2e19afb31`).
- Preparation pull request 1 was
  [Inner Signal PR #6](https://github.com/u-dont-existDOTcom/innerSignalGraph/pull/6),
  squash-merged as `855bdfab0b18327d320e703daf82903de65817e3`.
- Hosted transition readback: `2026-08-15T03:52:03.707Z`. Locally captured
  tool evidence records the visibility PATCH/GET invocation at
  `2026-08-15T03:51:54.954Z` and the successful combined PATCH response,
  independent GET, and unchanged branch-head readback at the completion
  timestamp. GitHub did not supply an independently timestamped server-side
  mutation event, so the exact server instant is `UNVERIFIED` and bounded by
  those two local timestamps. Raw session records and hashes derived from them
  are excluded from this promotion.

PR #6 is the preparation pull request for this transition. The later
[PR #7](https://github.com/u-dont-existDOTcom/innerSignalGraph/pull/7), merged
as `22179212afd26fc2cc3d89ac9cecdfeedfc8b4e0`, repaired two fail-open audit
paths exposed by the private pre-visibility run: an empty successful child
result and unchanged zero-byte scanner reports. It did not replace PR #6 or
perform the visibility change. After the repository became public, initial
CodeQL findings were repaired through
[PR #8](https://github.com/u-dont-existDOTcom/innerSignalGraph/pull/8), merged
as `956b17cc008fe68b6d9f5e9c36f002066aa9732a`; that repair is downstream
security evidence, not preparation pull request 1.

## Causal verification evidence

- `tests/publication-audit.test.mjs`,
  `tests/repository-compliance.test.mjs`, and
  `tests/workflow-policy.test.mjs` passed 100/100 on the final PR #6 head.
  These tests cover all-ref/history enumeration, hosted locator coverage,
  redacted finding projection, malformed/incomplete input, private temporary
  files and cleanup, exact external-tool pins, public-posture integrity, and
  private-skip/public-run workflow policy.
- The same focused matrix passed 103/103 on PR #7 after causal RED tests for
  both fail-open paths and the independent all-no-op mutation;
  `tests/publication-audit.test.mjs` itself passed 53/53. The final detached
  merged-main preflight at `22179212afd26fc2cc3d89ac9cecdfeedfc8b4e0`
  scanned 46,785 local records and 46,976 authenticated hosted records with
  zero findings. Immediate post-public repetition scanned 46,785 local and
  46,977 hosted records with zero findings.
- PR #8's affected security matrix passed 121/121 and its complete local test
  suite passed 380/380 before merge. The exact merged-main
  `codeql-javascript` run `31865348513` / job `94965480118` succeeded;
  production alerts were repaired and the remaining bounded test/static-path
  flows were explicitly dispositioned, leaving zero open alerts.
- The hosted scanner was official Gitleaks `8.29.1`, asset
  `gitleaks_8.29.1_linux_x64.tar.gz`, verified with SHA-256
  `e4eb209d04e20339d77122a3bdf9cd41351255cfb27ebcb75e85325e04f88924`.
- The public CodeQL workflow pins both `github/codeql-action/init` and
  `github/codeql-action/analyze` to
  `ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd` (`v4.37.7`).

These are deterministic contract and hosted-run results. They demonstrate the
tested behavior of this implementation and the enumerated GitHub state at the
recorded times; they are not a general proof about every public repository.

## Limits and failure boundary

- Scanners reduce disclosure risk but cannot prove absence of every secret,
  private datum, ownership dispute, or unsafe inference.
- Hosted surfaces require authenticated completeness. API permissions,
  retention windows, inaccessible GitHub App installation data, and surfaces
  absent from the enumeration contract remain explicit limits.
- Public copies remain outside repository control. A later private switch is
  an access change, not rollback of disclosure.
- A clean audit can become stale after any new ref, issue, pull request,
  comment, workflow log, artifact, or setting change. The final preflight must
  therefore bind to the exact commit and immediately precede visibility
  mutation.
- Enabling a control is not evidence that its first analysis is clean. Hosted
  analysis findings require their own repair or bounded disposition before
  protection/compliance claims.

## Supersession

This lesson extends, and does not replace, the current public/high-risk baseline in
`patterns/codex-github-operating-system.md`. It specializes that
baseline for a visibility transition and leaves project-specific branch,
release, privacy, product, and policy authority in the source repository.
Future changes supersede this record only with a newer indexed lesson that
preserves or explicitly replaces this provenance and its limitations.
