# Current State

Updated: 2026-08-17

## Active branch task

- Goal: finish the Codex plugin/skill/tool capability-ablation benchmark and publish the smallest empirically effective stack.
- Worktree: dedicated isolated audit worktree (local absolute path deliberately omitted from public state).
- Branch: `codex/plugin-stack-ablation-audit-20260817`.
- Baseline: fresh `origin/main` at `df1c75ce1066d4ea97194ee92e6b8e4b9715ba38`.
- Durable design: `docs/superpowers/specs/2026-08-17-codex-plugin-ablation-benchmark-design.md`, committed as `730a3a479f0c83812a4e4f95ed95b10343d90387` and published in draft PR #17.
- Implementation plan: `docs/superpowers/plans/2026-08-17-codex-plugin-ablation-benchmark.md`.
- Recovery ledger: `docs/exec-plans/active/2026-08-17-codex-plugin-ablation-benchmark.md`.
- Owner removed Codex Process Jobs after evidence showed its hard release boundary and global hook conflicted with result-gating work. The owner later removed Superpowers after its Task H treatment was frozen. Do not reinstall either component. Use native process polling and retain only sanitized historical evidence in the public audit.
- Empire remains operationally dead; do not configure credentials or spend on external routing.
- Current step: 50 terminal records are normalized and sanitized; 49 current/equivalent records drive the report and one materially different historical maximum trial is excluded from current aggregation. Final release review is clear and the verified evidence is committed at `257ca17f54a53a38bb2869b99137d5c78991d336`; PR #17 push and publication of the companion `codex-plugin-fix` lessons branch remain.
- Empirical result: native B0 passed all eight A-G baselines and Tasks H/I, while concise-repository B1 passed 3/3 and current maximum passed 5/7. Adversarial review found Task H's original hidden direct-child check stricter than the prompt's recursive relocation contract; after versioned evaluator correction, native and Coordinator both pass C/H. Coordinator cost more on C and less in one H run, so it is uncertain/conditional and outside the minimal stack. Guardrails and Superpowers produced correct Task H workspaces but timed out at 1,200 seconds. Remove both as harmful, remove GitHub workflow instructions from the default path, remove Security's `fix-finding` methodology from the default path, keep the formal Security tool pipeline uncertain/specialized, and do not restore Process Jobs or Empire.
- Final report: `audits/codex-plugin-stack/reports/final-report.md`; reproducibility entry point: `audits/codex-plugin-stack/README.md`.
- Publication boundary: the owner explicitly authorized Task H and sanitized publication to PR #17 plus the public `codex-plugin-fix` repository. Verbatim JSONL, logs, model/command output, workspaces, diffs, host paths/identity, and cached installed instructions remain private.
- Owner instruction architecture: global coordination is now proportional (one agent/no durable artifact for small work), and the continuous-autonomous-completion rule requires routine safe work to continue, material tradeoff questions to include pros/cons and a recommendation, and completeness to win over time-saving shortcuts unless work is tangential or unnecessary. Both changes occurred after controlled trials and receive no invented causal credit.
- Verified local boundary: all fixtures preflighted deterministically; 130 unit tests passed in 57.727 seconds; the deterministic repository audit and `git diff --check` passed; 50 sanitized records were regenerated and scanned; the clean companion lessons worktree passed its three structural/sanitization tests before final lesson synchronization.
- Required completion: push the audit branch to PR #17, commit and publish the isolated `codex-plugin-fix` lessons branch without touching the unrelated dirty `feat/codexresume` worktree, then verify remote heads and links.

## Prior canonical repository state

## Goal

Maintain and apply a source-grounded, risk-adjusted Codex + GitHub operating
system across repositories, with executable audits, durable recovery, exact
lesson provenance, and directly verified hosted governance.

## Authority / baseline

- Canonical repository: `u-dont-existDOTcom/universal-dev-architecture`
- Canonical branch: `main`
- Final verified maintenance boundary on `main`:
  `67418bea3dcf024dae1dbc7ff6558430730ac595`
- No unresolved compliance or lesson branch remains authoritative; inspect
  current Git and GitHub state before reusing any historical task branch.
- Recovery refs: `recovery/universal-compliance-pre-main-e37f34b`,
  `recovery/universal-pre-final-fleet-1d1e6d0`,
  `recovery/universal-pre-public-c37f012`, and
  `recovery/universal-pre-main-9de3671-394e419`, and
  `recovery/universal-pre-main-385fb12-1c53752`, and
  `recovery/universal-pre-main-b699b31-774fd0d`
- Universal entry point: `LESSON-INDEX.md`
- Current Codex/GitHub policy: `patterns/codex-github-operating-system.md`
- Repository profile and exact commands: `.github/codex-repository.json`
- Current owner/project requirements outrank universal defaults on genuine
  conflict.

## Completed

- Repository-first learning, context-compaction resilience, GitHub bootstrap,
  the Codex/GitHub operating pattern, templates, executable audit,
  least-privilege CI, drift reporting, and durable worker/fleet-auditor
  templates exist.
- Compliance commits `c83b99e` through `e37f34b` repair Python 3.12
  compatibility and add exact-command, profile, state, instruction-budget,
  workflow, unsafe-filename, secret-content, risk-posture, and hosted-claim
  checks with regression coverage.
- The current candidate retains `main`'s structure-aware workflow parser,
  Inner Signal lessons, paid-workflow safety, editorial authority/lossless
  editing, universal coordination, and continuous next-step advancement after
  owner input.
- PR #11 merged the tested next-step rule as
  `5e8ab185a4bf052313698ea5348031e344fcd930`; merge-head runs
  `31856690969` / job `94942680272` and `31856691275` / job `94942681121`
  succeeded. PR #12 completed its state-only closeout as current `main`
  `9de36712e9250b79092b2ecd12cda5e005760d83`.
- Root compatibility state points only to this checkpoint, and the superseded
  operating-standard file remains provenance rather than a competing authority.
- AskRigor PR #8 merged as
  `f8e7ca1e10c096e050207828eeb9eb7957d7ef6f` after exact-head checks and
  bounded live Action acceptance; the synthetic lesson issue was safely closed.
- AskRigor compliance PR #7 is published at
  final head `43e5b9442c5456bcfaba9b76194bf6474f74346d` and merged as
  `9134e22784e4d26dcf3c6d24a299bb5f783455ad`; exact-head deterministic,
  workflow-policy, and CodeQL runs succeeded, issue #6 closed, and merged-main
  CodeQL closed the fixed alert.
- AskRigor-lessons PR #3 final head
  `c99a02492efa34d23bb836791aef00e08ce535ff` merged as
  `8e894ea73b1d589444fd5a059c517177eb4eb5d8`; exact-head and merged-main
  integrity/CodeQL gates succeeded. Its sole lesson remains
  provisional/unverified because originating incident/test provenance is absent.
- Official OpenAI and GitHub registry links were reviewed on 2026-08-15.
  Repository files do not assert hosted settings without API evidence.
- The owner authorized public visibility on 2026-08-15 after a reachable
  remote-history audit found no sensitive filenames, private-key material, or
  provider-token material. `LICENSE.md` deliberately grants no public reuse
  rights, and public visibility does not grant GitHub write access.
- Hosted public-repository governance is directly verified: active ruleset
  `20882387` requires pull requests and strict `Deterministic repository
  audit`, blocks deletion/force pushes, and retains the sole owner as the only
  bypass without requiring fake independent approval.
- Actions are limited to the repository's exact SHA-pinned checkout Action;
  default workflow tokens are read-only and cannot approve pull requests.
  Secret scanning, push protection, vulnerability alerts, Dependabot security
  updates, private vulnerability reporting, and CodeQL are enabled. CodeQL
  setup run `31862468675` succeeded for Actions/Python with zero open alerts.
- Compliance PR #4 final head
  `8472b43f73489999fbbe8fec98a61b199676491f` merged as
  `dfbb97b58db733ee1e5568a5c78d703a8c92e03c`. Its exact-head and
  merged-main deterministic/CodeQL checks succeeded, hardening issue #3 is
  closed, and later current-main commit `7b5516856dd3873d4a46eaa69ebd7dd42f7958ac`
  also passed deterministic and Actions/Python CodeQL checks.
- Public-visibility transition PR #13 final head
  `fde98ae8465cbe58f2fcad8bd167d9319a47b15c` merged as
  `996d67ae9f8f44b0865cea6d88d169dbbadbbf41`. Exact-head deterministic run
  `31866987772` and CodeQL run `31866986996`, plus merged-main deterministic
  run `31867049940` and CodeQL run `31867049400`, succeeded.
- The external-evaluation reproducibility pattern and index are current through
  `f0c22df8844976bfff36cda09f494fa311aa2142` and
  `6c55dac2d4bcb71df3a1fd2e3f9d10728f760ca7`; deterministic and CodeQL runs
  `31871042102` and `31871041988` passed on the latter exact commit.
- Dependabot PR #2 updated `actions/checkout` from signed immutable v4.2.2 to
  signed immutable v7.0.1 commit
  `3d3c42e5aac5ba805825da76410c181273ba90b1`. Its exact head
  `cd00d80ff3e6b82858049731be23e5e3b778b0b9` passed deterministic run
  `31921666592` and CodeQL run `31921664845`, then merged as
  `6c2dff349f7b5ae9065ee32566dd2ce57acdc46e`. Post-merge deterministic run
  `31921716522` and CodeQL run `31921716274` succeeded.
- The selected-Action policy was updated transactionally: only the old and new
  reviewed SHAs were allowed during PR validation, then authenticated API
  readback confirmed only the v7.0.1 SHA remains allowed, with broad
  GitHub-owned and verified-creator allowances disabled.
- Maintenance PR #14 final head
  `2299c084e46a9ebf2abdfd94c338e510f9dab30c` merged as
  `67418bea3dcf024dae1dbc7ff6558430730ac595`. Exact-head deterministic run
  `31922026424` and CodeQL run `31922025782`, plus merged-main deterministic
  run `31922110416` and CodeQL run `31922110407`, succeeded.

## Current checkpoint

- The universal policy/control-plane baseline, public-transition promotion,
  external-evaluation reproducibility pattern, and checkout v7.0.1 dependency
  update are merged on protected `main` with exact successful deterministic and
  CodeQL receipts.
- The reusable workflow-policy template and both repository checkout jobs use
  the same v7.0.1 immutable pin. The read-only repository jobs explicitly set
  `persist-credentials: false`; no job permissions, triggers, or verification
  commands were broadened.
- `.github/codex-repository.json` records the separately authenticated hosted
  Action policy. The repository files remain evidence records, not proof of
  hosted settings.
- The complete declared unit suite and self-audit are the final repository gate
  for any future change. The weekly drift workflow remains the durable
  actionable detector.

## Remaining

- No known repository-compliance, lesson-publication, dependency-update, or
  hosted-governance task remains from the 2026-08-14/15 hardening sequence.
- Continue normal reviewed Dependabot handling and weekly drift reconciliation.
- Recheck the official OpenAI/GitHub source registry by the documented quarterly
  cadence or earlier when a material platform behavior changes.

## Blockers / unresolved

- No applicable repository-control blocker remains. Historical private-plan
  `403` results are superseded by the dated public-repository API evidence in
  `.github/codex-repository.json`.
- Hardening issue
  [#3](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/3)
  is closed; PR #4 is its exact merge/check receipt.
- Repository visibility is resolved: public. Readers may view/fork the history
  under GitHub's platform terms, but they cannot modify the canonical repository
  without write permission; `LICENSE.md` grants no broader reuse rights.

## Evidence / artifacts

- Current implementation plan:
  `docs/superpowers/plans/2026-08-14-universal-dev-architecture-compliance.md`
- Audit implementation and regressions: `scripts/audit_codex_github.py` and
  `tests/test_audit_codex_github.py`
- Repository profile: `.github/codex-repository.json`
- Operating policy: `patterns/codex-github-operating-system.md`
- Compliance architecture: `templates/COMPLIANCE-WORKER-METADATA.json` and
  `audits/2026-08-14-compliance-worker-architecture.md`
- Project lesson promotions:
  `audits/2026-08-14-askrigor-transferable-controls.md`,
  `audits/2026-08-14-askrigor-lessons-transferable-design.md`, and
  `audits/2026-08-14-inner-signal-compliance-lessons.md`
- Public-transition promotion and regression:
  `audits/2026-08-14-inner-signal-publication-transition.md` and
  `tests/test_public_visibility_transition_pattern.py`
- Current patterns: `patterns/paid-workflow-safety.md`,
  `patterns/editorial-authority-and-lossless-editing.md`, and the next-step
  continuation rule recorded in
  `audits/2026-08-15-universal-next-step-continuation-rule.md`
- Final report: `audits/2026-08-14-universal-compliance-report.md`
- Hosted evidence: `.github/codex-repository.json`, issue #3, and PR CI.

## Next safe action

For a new task, start from current protected `main`, read `LESSON-INDEX.md` and
the applicable current pattern, and use a focused branch. For maintenance,
review the next Dependabot or weekly drift result only when it appears; do not
reopen completed PRs #2, #4, #13, or #14.

## Recovery rule

After interruption, inspect the Git/merge state, this checkpoint,
`LESSON-INDEX.md`, the operating-system pattern, the public-transition audit,
the external-evaluation pattern, current open PR/check state, and newer owner
instructions. Treat PRs #2, #4, #11, #12, #13, and #14 as complete, preserve
every recovery ref and unrelated branch, and never infer hosted enforcement
from files.
