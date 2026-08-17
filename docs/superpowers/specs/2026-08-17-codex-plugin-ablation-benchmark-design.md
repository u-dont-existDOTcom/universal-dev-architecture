# Codex Plugin Audit and Capability Ablation Benchmark Design

**Status:** Approved for implementation by Joel on 2026-08-17

**Target repository:** `u-dont-existDOTcom/universal-dev-architecture`

**Objective:** Determine the smallest effective Codex development stack by measuring whether each installed component improves final task outcomes enough to justify its instruction, tool, execution, and workflow costs.

## Decision principle

An installed component receives no credit for existing, exposing tools, invoking itself successfully, creating an artifact, or changing the process. It earns retention only through one or both of these outcomes:

1. It produces a repeatable, material improvement over the appropriate baseline.
2. It provides a genuinely unique capability that is necessary for a defined task class and is not available more effectively from native Codex or another retained component.

Weak or noisy evidence does not default to `KEEP`. Components that cannot be exercised, have no working dependency path, or impose measurable cost without measurable outcome improvement are removal candidates.

## Scope

The audit covers the complete effective stack available to the 2026-08-17 Codex session, including:

- installed plugin manifests, skills, scripts, hooks, MCP servers, apps, and connector dependencies;
- standalone user and system skills;
- global and repository `AGENTS.md` instructions;
- user configuration, feature flags, approval defaults, persistent rules, and trusted-project configuration;
- native multi-agent, shell, worktree, browser, Git, and GitHub behavior;
- persistent workflow state and recovery mechanisms;
- actual runtime availability, not marketplace or cache presence alone.

The development-performance experiment focuses on workflow components that can plausibly affect software outcomes. External research and domain-data apps receive capability and overhead assessments rather than artificial coding-task credit.

## Initial verified inventory boundary

The implementation must freeze a machine-readable inventory before running trials. The initial read-only survey found:

- 14 installed plugin manifests paired with remote-install receipts;
- 68 plugin-provided `SKILL.md` files, of which 48 were exposed in the current session;
- 17 readable standalone Codex skills, plus broken `ai-check` and `humanize` symlinks that provide no effective capability;
- 293 callable runtime tools in the current host, including 280 MCP tools and 13 non-MCP functions;
- two plugins with lifecycle hooks: Codex Coordinator and Codex Process Jobs;
- one plugin-bundled local MCP server: Codex Security;
- a broad shared GitHub connector dependency declared by both GitHub and Codex Security;
- no configured standalone MCP servers in `~/.codex/config.toml`;
- `gpt-5.6-sol` with `xhigh` reasoning as the current default;
- Codex CLI 0.147.0.

The inventory must distinguish all of the following states:

- installed and enabled;
- installed but not exposed;
- cached but not installed;
- tool schema visible but connector authorization unverified;
- available in the marketplace but not installed;
- unavailable on the current operating system or product surface;
- installed but operationally unusable.

### Explicit initial dispositions

- Empire LLM is treated as operationally dead for this audit. Its keyring credentials are unavailable, the target repository has no configured budget, its direct provider is not configured, and Joel declined setup work. No paid or external-model trial will run.
- Codex Browser Recorder is not installed. The catalog entry alone is not an effective capability. Official Record & Replay is also unavailable on this Linux host because it requires macOS and Computer Use.
- Default Templates contains 20 installed skills that were not exposed in the current session. They are not treated as active development methodology.
- App and connector schemas do not prove authenticated access.

## Experimental approaches considered

### Account-level plugin toggling

This is closest to end-user packaging but changes persistent installation state, risks connector drift, and conflicts with the instruction not to uninstall anything during the audit. It is rejected as the primary method.

### Prompt-only invocation and suppression

Telling the model to use or ignore a component is cheap but leaves ambient catalog, hook, instruction, and tool effects uncontrolled. It is acceptable only as a secondary trigger check and is rejected as the primary causal method.

### Controlled repository-scoped ablation

This is the selected method. Each disposable trial repository exposes only the exact treatment skills through repository-scoped `.agents/skills` links. CLI feature and configuration overrides suppress optional ambient plugins, apps, hooks, rules, and standalone skills for the minimal condition. The current authentication store remains untouched.

Repository-scoped exposure uses the exact installed skill directories rather than paraphrased copies. A prompt-rendering preflight must verify that expected component names are present and excluded component names are absent before a billable model trial starts.

## Experimental architecture

The benchmark consists of six bounded layers:

1. **Inventory collector:** captures manifests, install receipts, skill metadata, hooks, MCP/app declarations, effective configuration, instruction files, runtime versions, and tool counts without secret values.
2. **Fixture builder:** creates frozen disposable Git repositories for tasks A through G from versioned source fixtures and records their content hashes.
3. **Condition builder:** creates the exact skill links, instruction layers, feature flags, hook configuration, and CLI arguments for one named configuration.
4. **Trial runner:** invokes Codex non-interactively, captures JSONL events and monotonic timing, and preserves the resulting Git diff and agent message.
5. **Deterministic scorer:** injects withheld tests after the agent stops, runs visible and hidden checks, validates the diff, and computes process and outcome metrics.
6. **Blinded adjudicator:** reviews anonymized finalist diffs only where deterministic evidence cannot distinguish architecture, maintainability, or requirement interpretation.

Every layer consumes and produces explicit versioned files. No layer infers success from another layer's prose summary.

## Isolation model

Each trial receives a fresh disposable Git repository with a recorded baseline commit. Trial repositories contain no production secrets, remotes, external credentials, or unrelated user work.

The harness must not alter `~/.codex/auth.json`, global skill installations, plugin installations, connectors, or global configuration. It must not repurpose `HOME` or `CODEX_HOME`.

The minimal condition uses supported CLI overrides to disable optional plugin, app, hook, rule, and skill surfaces. Ambient standalone skills are disabled by their exact paths. Native system capabilities remain available because the purpose of B0 is to measure native Codex, not an artificially crippled model.

`project_doc_max_bytes = 0` and controlled `developer_instructions` are used only after a prompt-rendering preflight proves their effect. If they do not suppress ambient `AGENTS.md` content as intended, the run is invalid and must not proceed. The fallback is to label the best achievable condition `native plus unavoidable global instructions`, not falsely call it native.

## Fixed trial controls

Unless a component specifically requires a different surface, trials pin:

- Codex CLI version: 0.147.0;
- model: `gpt-5.6-sol`;
- reasoning effort: `xhigh`;
- sandbox: `workspace-write`;
- approval policy: `never` for noninteractive fixtures;
- session mode: `--ephemeral`;
- output: `--json` plus a stable final-output schema;
- prompt bytes and task-fixture content hash;
- visible test command and withheld scoring command;
- Git author-independent diff collection;
- no network access inside task fixtures;
- no package installation or external service dependency.

The harness records model alias, CLI version, run timestamp, condition hash, task hash, and execution order because no sampling seed is available and backend model weights may change behind an alias.

## Baseline and treatment configurations

### Required baselines

- **B0 native:** optional plugins, apps, hooks, rules, and ambient standalone skills disabled; no project instructions beyond the task contract.
- **B1 native plus repository instructions:** B0 plus one concise controlled repository instruction file.
- **MAX current methodology:** all effective installed development-workflow skills, current global working agreements, and applicable integration surfaces.
- **MIN finalist:** the smallest stack selected from measured winners after screening.

### Coordination interaction family

- B1;
- B1 plus Coordinator;
- B1 plus Superpowers coordination skills;
- B1 plus Coordinator and Superpowers coordination skills;
- MAX;
- MAX minus Coordinator;
- MAX minus Superpowers coordination skills.

### Engineering-method interaction family

- B1;
- B1 plus Engineering Guardrails;
- B1 plus Superpowers engineering skills;
- B1 plus both;
- MAX;
- MAX minus Engineering Guardrails;
- MAX minus Superpowers engineering skills.

### Security family

- native security-sensitive implementation;
- native implementation followed by native review;
- Codex Security alone;
- Guardrails implementation followed by Codex Security review;
- MAX;
- MAX minus Codex Security.

Codex Security is evaluated separately as a specialized late-stage adversarial layer. Its tool and artifact ceremony receives no credit unless it discovers, validates, or prevents defects that the corresponding native or ordinary-engineering condition misses.

### Long-running process family

- native foreground execution;
- native shell session recovery where supported;
- Process Jobs start/result workflow;
- Process Jobs inside MAX;
- MAX minus Process Jobs.

The Process Jobs comparison must include completion correctness, turn release time, total time to usable result, recovery after client/task interruption, state artifacts, hook overhead, and required human intervention. Merely detaching a command is not success.

### GitHub and external-tool family

GitHub receives a bounded repository-orientation, CI evidence, and publication-workflow assessment. It is compared with native `git` and `gh` for the same authorized operations. Connector schemas alone do not count as capability.

Research and domain apps—SciSpace, Wolfram, Nansen, Exa, and Parallels—receive activation, authorization, uniqueness, and idle-overhead assessments. They do not participate in ordinary coding trials unless the task genuinely needs their domain.

Plugin Management and Default Templates receive specialized capability and idle-context assessments. Empire receives an operational-deadness assessment and no live routing.

## Representative task suite

All fixtures use the Node standard library and built-in test runner to avoid dependency and network variance.

### Task A: small bug fix

A focused defect with one obvious symptom and at least two non-obvious boundary cases. The agent must reproduce the defect, implement the smallest fix, add or improve a regression test, and verify the affected suite.

### Task B: ambiguous feature

A feature request with a real architectural choice, explicit invariants, and enough information to proceed without asking the owner. Multiple valid designs may exist, but the hidden oracle tests required behavior rather than one implementation shape.

### Task C: multi-component feature

A feature spanning three stable components with two genuinely independent implementation surfaces and one integration boundary. It allows useful parallelization but penalizes duplicated investigation, conflicting edits, unnecessary worktrees, and failed integration.

### Task D: difficult debugging

A deterministic failure whose visible symptom is separated from its root cause across component boundaries. Random patching can make visible tests pass while hidden invariants still fail. The fixture records hypotheses and commands through event logs, not required narrative artifacts.

### Task E: refactor

A behavior-preserving internal restructuring with a broad characterization suite and hidden compatibility checks. It penalizes speculative API changes, unrelated cleanup, and tests that merely mirror the new implementation.

### Task F: security-sensitive change

An authorization and filesystem-boundary change containing multiple plausible attack paths, including a control that prevents a superficially obvious exploit while leaving a deeper variant. The oracle checks exploitability, legitimate behavior, and remediation regressions.

### Task G: long-running workflow

A finite operation lasting longer than 60 seconds, producing bounded progress, failing deterministically in one phase, and supporting a subsequent successful resume. It distinguishes detachment, monitoring, state preservation, and actual completion.

## Trial schedule and repetition

The benchmark uses adaptive replication rather than a wasteful full Cartesian product.

1. Run one randomized screening trial for every required task/configuration pairing.
2. Expand important or close comparisons to three total independent trials.
3. Add trials only when paired results remain inconsistent, a hidden-test outcome flips across repetitions, or confidence intervals overlap materially.
4. Do not repeat role-unambiguous availability checks merely to increase sample size.

Condition order is counterbalanced within each task. Configuration labels are hidden from qualitative adjudicators. Failed infrastructure preflights are not scored as model failures, but their operational cost and cause are recorded.

## Outcome metrics

### Correctness

- explicit requirements satisfied;
- visible tests passing;
- withheld tests passing;
- introduced regressions;
- missed edge cases;
- exploitable security defects remaining.

### Engineering quality

- scope discipline;
- code and API simplicity;
- unnecessary code and files;
- maintainability;
- test oracle independence;
- architecture quality at stable boundaries.

### Reasoning and autonomy

- correct decomposition;
- evidence before implementation;
- hypothesis quality and root-cause accuracy;
- unnecessary user questions or approvals;
- recovery without human intervention;
- premature completion or workaround substitution.

### Verification

- commands actually executed;
- focused and broad check coverage;
- claims supported by captured exit status;
- false completion claims;
- failures ignored, retried silently, or misclassified.

### Efficiency and workflow harm

- wall-clock time;
- input, cached input, output, and reasoning tokens;
- tool calls and repeated calls;
- number of subagents and overlapping assignments;
- worktrees, branches, plans, ledgers, review packages, and other artifacts;
- redundant planning and review passes;
- idle hook invocations and hook latency;
- abandoned state and cleanup burden.

### Robustness

- response to visible test failure;
- response to tool failure;
- state preservation after interruption;
- deterministic resume behavior;
- integrated verification after parallel work.

## Scoring and verdict rules

Correctness and hidden security/regression tests dominate. A component cannot compensate for a material correctness loss with better process scores.

The structured scorer reports separate axes rather than hiding failures in one average. A composite ranking may be used for finalist ordering only after all material correctness failures remain visible.

Component decisions use these labels:

- `KEEP` — clear, repeatable general improvement or necessary unique capability;
- `KEEP — SPECIALIZED` — clear value for one narrow task class and excluded from ordinary workflow;
- `KEEP — CONDITIONAL` — useful under exact evidence-backed triggers;
- `REMOVE` — no meaningful marginal improvement;
- `REMOVE — HARMFUL` — performance is consistently better without it;
- `REMOVE / REPLACE` — another component provides the capability better;
- `UNCERTAIN` — evidence cannot distinguish the effect from noise.

Operationally dead components do not default to `UNCERTAIN` when they impose installation, catalog, or maintenance cost and have no callable benefit. Their decision may be `REMOVE` with high confidence in current-state utility and lower confidence about hypothetical future utility.

## Failure handling

- A prompt-rendering mismatch invalidates the trial before model invocation.
- A model/network/rate-limit failure is retried only after classification and is not silently converted into a poor performance score.
- A fixture defect invalidates all affected conditions and requires regeneration under a new task hash.
- A visible-test baseline failure blocks that fixture until corrected.
- A scoring failure preserves the raw run and records the scorer error; it does not alter the agent result.
- A component workflow that cannot initialize because its own required dependency is unavailable records an operational failure for that component.
- No failed trial is deleted. Superseded runs remain identifiable but excluded with a written reason.

## Reproducibility and stored evidence

The repository will contain:

- `audits/codex-plugin-stack/README.md` — entry point, methodology, rerun instructions, and current verdict;
- `audits/codex-plugin-stack/inventory/` — redacted structured inventory and source hashes;
- `audits/codex-plugin-stack/fixtures/` — frozen task sources, visible tests, prompts, and withheld scorer inputs;
- `audits/codex-plugin-stack/configurations/` — condition manifests and expected prompt-surface assertions;
- `audits/codex-plugin-stack/results/raw/` — per-run JSONL, timing, Git diff, test output, and terminal metadata;
- `audits/codex-plugin-stack/results/normalized/` — stable scored records;
- `audits/codex-plugin-stack/reports/` — capability map, overlap matrix, conflict matrix, benchmark tables, ablation analysis, decisions, activation rules, and capability gaps;
- `scripts/codex_plugin_benchmark/` — runner, inventory, fixture, prompt-preflight, and scoring code;
- `tests/test_codex_plugin_benchmark.py` — deterministic harness tests;
- `docs/exec-plans/active/` — implementation and execution recovery ledger while work remains active;
- `CURRENT-STATE.md` — concise durable boundary and next safe action.

Raw results must exclude secrets, authentication files, full private environment dumps, unrelated session history, and chain-of-thought. Model-visible reasoning events are retained only to the extent emitted by supported Codex JSONL and necessary for aggregate process metrics; reports use bounded summaries.

## Final deliverables

The final report must include:

1. effective capability map;
2. component overlap matrix using classifications A through G;
3. instruction conflict matrix with authoritative-owner recommendations;
4. per-benchmark result table;
5. component ablation table;
6. ranked removal list;
7. specialized and conditional activation rules;
8. recommended minimal stack;
9. exact authoritative workflow;
10. retained capability gaps;
11. the required final component decision table.

The report must distinguish direct evidence, inference, operational unavailability, and untested hypothetical benefit. It must recommend fewer plugins whenever fewer plugins produce better outcomes.

## Repository and publication workflow

Work occurs on the isolated branch `codex/plugin-stack-ablation-audit-20260817` in a dedicated worktree created from fresh `origin/main` at `df1c75c`.

Each durable implementation slice receives focused tests and an explicit commit. Long model trials run as tracked finite background work after the harness itself is verified. Final publication follows the repository's pull-request workflow; no production repository is used as a mutable benchmark target.

## Design risks and limits

- A model alias is not a frozen weight snapshot, so timestamps and CLI/model metadata are mandatory.
- No sampling seed is available; adaptive repeated trials reduce but do not eliminate stochastic uncertainty.
- Repo-scoped skill exposure faithfully tests the exact skill instructions but does not perfectly reproduce every plugin installer or desktop-host packaging behavior. Packaging, hooks, MCP, and connectors therefore receive separate real-stack checks.
- Global host instructions may prove impossible to suppress completely without changing `CODEX_HOME`, which this benchmark will not do. If so, the baseline is labeled accurately rather than overstated.
- Qualitative adjudication can introduce model bias. It remains blinded, secondary, and subordinate to deterministic outcomes.
- The benchmark measures the current host, model family, plugin versions, and representative tasks. Activation rules must state those limits and be rerun after material model or plugin changes.
