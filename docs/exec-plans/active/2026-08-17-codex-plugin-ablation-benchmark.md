# Codex plugin ablation benchmark execution plan

**Goal:** Determine and publish the smallest empirically effective Codex stack on the 2026-08-17 host.

**Baseline:** Isolated worktree `/home/joel/universal-dev-architecture-worktrees/plugin-stack-ablation-audit-2026-08-17`, branch `codex/plugin-stack-ablation-audit-20260817`, design commit `730a3a479f0c83812a4e4f95ed95b10343d90387`, draft PR #17.

**Acceptance criteria:**

- [x] Redacted effective-stack inventory covers installed, exposed, unavailable, and removed components.
- [x] Tasks A-G have deterministic visible baselines and withheld outcome oracles.
- [x] Prompt preflight proves or honestly labels each condition's effective surface.
- [x] Required baseline, interaction, specialized, and maximum/minimal comparisons are executed or carry an explicit evidence-backed unavailable classification.
- [x] Important close comparisons have adaptive repeated trials.
- [x] Final report contains every requested matrix, benchmark/ablation table, removal ranking, activation rule, workflow, gap, and decision row.
- [ ] Real-project Task H has terminal B0/workflow trials; the fixture and schedule are ready, but the host boundary requires fresh owner confirmation for additional model spend.
- [x] Complete repository tests and audit pass on the final integrated branch.

**Non-goals:** No plugin reinstall/uninstall, credential movement, production-repository mutation, unapproved external-model spending, or unsupported claim of a perfectly hermetic baseline.

## Decisions

| Date | Decision | Evidence | Consequence |
| --- | --- | --- | --- |
| 2026-08-17 | Persist in `universal-dev-architecture`. | Owner-approved design and PR #17. | Audit is reusable across repositories and model/plugin updates. |
| 2026-08-17 | Empire is operationally dead. | No usable credentials/budget; owner declined setup. | No Empire live trial; current utility can be `REMOVE` rather than defaulting to uncertainty. |
| 2026-08-17 | Browser Recorder is not installed and Record & Replay is unavailable on Linux. | Installed-cache and host-surface inventory. | Availability assessment only. |
| 2026-08-17 | Process Jobs is removed by the owner. | Owner message after direct instruction/code/overhead inspection. | Never restore it; use pre-removal evidence plus native Task G. |
| 2026-08-17 | Keep current authentication store untouched. | `--ignore-user-config` retains auth; official config supports per-skill enablement. | B0 uses exact suppressions and receives an honest residual-context label. |
| 2026-08-17 | Use native polling for all result-gating commands. | Owner explicitly rejected Process Jobs' turn-release behavior. | The root agent waits through trials and verification until terminal. |
| 2026-08-17 | Promote the evidence-based component-ablation lesson. | The final report demonstrates native baselines, task-paired marginal cost, harmful interactions, and narrow specialization across A-G. | `LESSON-INDEX.md` now routes to the report; version-specific plugin decisions remain bounded to the preserved host/model/manifests. |
| 2026-08-17 | Publish only allowlisted benchmark evidence. | Raw JSONL contained model output, local paths, and cached skill bodies prohibited by repository policy. | Verbatim evidence remains private/local; the repository stores hashes, terminal metadata, event categories, scores, and redacted schedule facts. |
| 2026-08-17 | Split Security skill evidence from formal tool evidence. | Task F exposed only `fix-finding`; same-prompt Task I exercised B0, skill-only, and actual scan/tool conditions. | Remove the remediation skill from default; formal scan artifacts remain uncertain/specialized. |

## Tasks

The executable task sequence and file-level test cycles are authoritative in `docs/superpowers/plans/2026-08-17-codex-plugin-ablation-benchmark.md`.

## Progress

| Date | Completed | Evidence/commit | Next action or blocker |
| --- | --- | --- | --- |
| 2026-08-17 | Approved experimental design, isolated worktree, clean baseline, draft publication. | `730a3a4`; PR #17; 87 tests and deterministic audit passed. | Implement harness Task 1. |
| 2026-08-17 | Read-only stack/plugin/feasibility inventories completed through three agents. | Agent reports retained in active task context; canonical structured inventory still planned. | Convert evidence into versioned JSON and matrices. |
| 2026-08-17 | Process Jobs runtime/policy/hook inspected and owner removed plugin. | Installed v0.3.0 source evidence and measured hook overhead. | Record removed-state evidence; no reinstall. |
| 2026-08-17 | Harness foundations and redacted inventory implemented test-first. | Four focused tests; first real run exposed and then regression-tested dynamic config-table path leakage. | Commit Task 1 and build frozen fixtures. |
| 2026-08-17 | Seven representative fixtures frozen and oracle-tested. | Visible seeds pass, withheld oracles fail, and two independent materializations produced identical hashes for tasks A-G. | Commit Task 2 and implement exact condition isolation. |
| 2026-08-17 | Twelve controlled prompt surfaces preflighted. | B0/B1 expose zero optional skills; all selected treatment skills render; maximum exposes 58 skills and records 20 app-dependent templates plus the hidden review-agent as unavailable rather than silently crediting them. | Commit Task 3 and build the synchronous trial runner. |
| 2026-08-17 | Synchronous native runner implemented test-first. | Fake terminal success and exit-7 failure preserve raw evidence; argv assertions prove no Process Jobs or `CODEX_HOME` override; owned process group is polled to terminal or bounded timeout. | Commit Task 4 and implement deterministic scoring. |
| 2026-08-17 | Deterministic scorer implemented test-first. | Withheld failures cannot outrank correct runs; false completion claims and unnecessary workflow artifacts are explicit costs; unmeasurable tokens remain null. | Commit Task 5 and execute the counterbalanced screening schedule. |
| 2026-08-17 | Screening and supplemental schedules completed with native terminal polling. | 42 current/effective trials across A-G plus one hash-excluded historical maximum run; terminal metadata, JSONL, diffs, final workspaces, and schedule ledgers retained. | Normalize and synthesize decisions. |
| 2026-08-17 | Crash recovery and exclusion handling validated in real operation. | One interrupted nonterminal trial and fifteen pre-model read-only initialization failures preserved under `results/excluded/`; no completed evidence rerun or scored as a model failure. | Finish current-hash trials at the host boundary. |
| 2026-08-17 | Final empirical decisions and reproducible report generated. | B0 8/8, B1 3/3, current maximum 5/7; report, matrices, activation rules, workflow, gaps, sanitized event facts, and normalized results are versioned. | Run complete repository gates and independent review, then commit. |
| 2026-08-17 | Formal Security Task I and independent adversarial report review completed. | Three same-prompt Task I trials are terminal; review findings corrected scoring, provenance, portability, causal labels, matrix coverage, and public-evidence policy. | Run full gates; Task H remains approval-gated. |
| 2026-08-17 | Final local repository gates passed. | `python3 -m unittest discover -s tests -v`: 126 passed in 100.376s; `python3 scripts/audit_codex_github.py --root . --fail-on error`: PASS; benchmark integrity and `git diff --check`: PASS. | Commit the durable local boundary; await Task H and publication confirmations. |

## Completion

Record final commit, updated PR URL/head, exact checks, empirical limits, retained gaps, and lesson disposition here before moving this file to `docs/exec-plans/completed/`.

**Lesson disposition:** `promoted`. The transferable rule is to benchmark native and repository-instruction baselines, score outcomes and costs rather than invocation, keep one primary workflow owner per stage, remove methodology that adds gates or ceremony without lift, and trigger unique security/domain capabilities narrowly. Exact component verdicts remain version/host/model-specific and must be rerun after material changes.
