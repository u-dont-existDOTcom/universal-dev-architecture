# Codex Plugin Ablation Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, run, score, and persist a reproducible benchmark that identifies the smallest empirically effective Codex plugin, skill, tool, hook, and instruction stack on the 2026-08-17 host.

**Architecture:** A Python standard-library harness freezes redacted inventory and Node-standard-library task fixtures, constructs exact per-run conditions without moving authentication, invokes `codex exec --ephemeral --json`, and scores resulting diffs with withheld tests and captured process evidence. Static inspection and real-host overhead checks complement model trials for hooks, connectors, security tooling, GitHub integration, and components that cannot be safely ablated through prompt exposure alone.

**Tech Stack:** Python 3.12 standard library, Node.js 24 built-in test runner, Codex CLI 0.147.0, Git 2.43, JSON/JSONL, Markdown, `unittest`.

## Global Constraints

- Do not uninstall, reinstall, enable, or reconfigure plugins as part of the benchmark. The owner independently removed Codex Process Jobs on 2026-08-17; record that state rather than restoring it.
- Never read, copy, print, or relocate credential values. Authentication remains in the existing `CODEX_HOME`; trials use `--ignore-user-config` and exact runtime overrides.
- Never repurpose `HOME` or `CODEX_HOME`.
- Every trial runs in a fresh disposable Git repository with no remote, no production secrets, no external dependency, and no network requirement inside the fixture.
- Label the cleanest achievable baseline `native plus unavoidable global instructions` unless prompt-surface evidence proves a fully native prompt.
- Correctness and withheld security/regression tests dominate process scores.
- Preserve every failed or invalid trial with a machine-readable exclusion reason.
- Use `gpt-5.6-sol`, `xhigh`, `workspace-write`, approval policy `never`, `--ephemeral`, and JSONL for scored model trials.
- Run repository gates exactly: `python3 -m unittest discover -s tests -v` and `python3 scripts/audit_codex_github.py --root . --fail-on error`.

---

## File Structure

- `scripts/codex_plugin_benchmark/common.py`: hashing, atomic JSON writes, command execution, redaction, and schema constants.
- `scripts/codex_plugin_benchmark/inventory.py`: redacted installed/effective-stack collector.
- `scripts/codex_plugin_benchmark/fixtures.py`: deterministic materialization and hashing of tasks A-G.
- `scripts/codex_plugin_benchmark/conditions.py`: condition manifests, skill-path enablement, feature suppression, and prompt-surface assertions.
- `scripts/codex_plugin_benchmark/runner.py`: disposable repository creation, Codex invocation, JSONL/timing capture, and run metadata.
- `scripts/codex_plugin_benchmark/scorer.py`: withheld-test injection, diff/process metrics, correctness gates, and normalized run records.
- `scripts/codex_plugin_benchmark/report.py`: aggregate tables, marginal comparisons, verdict rules, and Markdown report generation.
- `scripts/codex_plugin_benchmark/cli.py`: stable command-line entry points for inventory, fixtures, preflight, run, score, and report.
- `tests/test_codex_plugin_benchmark.py`: deterministic harness and fixture regressions.
- `audits/codex-plugin-stack/`: versioned inventory, fixtures, conditions, results, and final reports.
- `docs/exec-plans/active/2026-08-17-codex-plugin-ablation-benchmark.md`: execution/recovery ledger until closeout.
- `state/CURRENT-STATE.md`: concise canonical recovery pointer for the active branch.

### Task 1: Harness foundations and redacted inventory

**Files:**
- Create: `scripts/codex_plugin_benchmark/__init__.py`
- Create: `scripts/codex_plugin_benchmark/common.py`
- Create: `scripts/codex_plugin_benchmark/inventory.py`
- Create: `scripts/codex_plugin_benchmark/cli.py`
- Create: `tests/test_codex_plugin_benchmark.py`
- Create: `audits/codex-plugin-stack/inventory/.gitkeep`

**Interfaces:**
- Produces: `sha256_path(path: Path) -> str`, `atomic_write_json(path: Path, value: object) -> None`, `run_command(argv: list[str], cwd: Path, timeout_s: float | None) -> CommandResult`, `collect_inventory(codex_root: Path) -> dict[str, object]`.
- Consumes: only Python standard library and paths explicitly supplied by the caller.

- [x] **Step 1: Write failing foundation and redaction tests**

```python
def test_inventory_never_serializes_secret_values(self):
    inventory = collect_inventory(self.codex_root)
    encoded = json.dumps(inventory)
    self.assertNotIn("token-value", encoded)
    self.assertEqual(inventory["auth"]["mode"], "chatgpt")
    self.assertEqual(inventory["auth"]["secret_values_read"], False)

def test_atomic_write_and_hash_are_stable(self):
    atomic_write_json(self.output, {"b": 2, "a": 1})
    first = sha256_path(self.output)
    atomic_write_json(self.output, {"a": 1, "b": 2})
    self.assertEqual(first, sha256_path(self.output))
```

- [x] **Step 2: Run the focused tests and require the missing-module failure**

```bash
python3 -m unittest tests.test_codex_plugin_benchmark.HarnessFoundationTests -v
```

Expected: import failure for `scripts.codex_plugin_benchmark`.

- [x] **Step 3: Implement deterministic helpers and inventory collection**

```python
@dataclass(frozen=True)
class CommandResult:
    argv: tuple[str, ...]
    returncode: int
    stdout: str
    stderr: str
    wall_seconds: float

def collect_inventory(codex_root: Path) -> dict[str, object]:
    manifest_paths = sorted((codex_root / "plugins" / "cache").glob("*/*/*/.codex-plugin/plugin.json"))
    return {
        "schema_version": 1,
        "codex_root": str(codex_root),
        "auth": {"mode": read_auth_mode_without_tokens(codex_root), "secret_values_read": False},
        "plugins": [read_manifest_metadata(path) for path in manifest_paths],
        "standalone_skills": read_skill_metadata(codex_root / "skills"),
        "config": read_redacted_config_metadata(codex_root / "config.toml"),
    }
```

- [x] **Step 4: Run foundation tests, generate the inventory, and inspect it for secrets**

```bash
python3 -m unittest tests.test_codex_plugin_benchmark.HarnessFoundationTests -v
python3 -m scripts.codex_plugin_benchmark.cli inventory --codex-root /home/joel/.codex --output audits/codex-plugin-stack/inventory/effective-stack.json
python3 -m json.tool audits/codex-plugin-stack/inventory/effective-stack.json >/dev/null
```

Expected: tests pass, JSON parses, and the record contains metadata rather than credential values.

- [x] **Step 5: Commit the recoverable inventory slice**

```bash
git add scripts/codex_plugin_benchmark tests/test_codex_plugin_benchmark.py audits/codex-plugin-stack/inventory
git commit -m "feat: inventory the effective Codex stack"
```

### Task 2: Frozen representative fixtures and withheld oracles

**Files:**
- Create: `scripts/codex_plugin_benchmark/fixtures.py`
- Create: `audits/codex-plugin-stack/fixtures/task-a-small-bug/**`
- Create: `audits/codex-plugin-stack/fixtures/task-b-ambiguous-feature/**`
- Create: `audits/codex-plugin-stack/fixtures/task-c-multi-component/**`
- Create: `audits/codex-plugin-stack/fixtures/task-d-debugging/**`
- Create: `audits/codex-plugin-stack/fixtures/task-e-refactor/**`
- Create: `audits/codex-plugin-stack/fixtures/task-f-security/**`
- Create: `audits/codex-plugin-stack/fixtures/task-g-long-running/**`
- Modify: `tests/test_codex_plugin_benchmark.py`

**Interfaces:**
- Consumes: `sha256_path` and a fixture identifier `task-a` through `task-g`.
- Produces: `materialize_fixture(task_id: str, destination: Path) -> FixtureRecord` where `FixtureRecord` contains `task_id`, `prompt_path`, `visible_test_argv`, `hidden_test_argv`, `content_sha256`, and `expected_baseline_status`.

- [x] **Step 1: Write failing fixture integrity and oracle-sensitivity tests**

```python
def test_every_fixture_has_clean_visible_baseline_and_failing_hidden_oracle(self):
    for task_id in ALL_TASK_IDS:
        record = materialize_fixture(task_id, self.temp / task_id)
        self.assertEqual(run(record.visible_test_argv, record.root).returncode, 0)
        self.assertNotEqual(run(record.hidden_test_argv, record.root).returncode, 0)

def test_fixture_hash_is_repeatable(self):
    left = materialize_fixture("task-a", self.temp / "left")
    right = materialize_fixture("task-a", self.temp / "right")
    self.assertEqual(left.content_sha256, right.content_sha256)
```

- [x] **Step 2: Run the fixture tests and require failure because no fixtures exist**

```bash
python3 -m unittest tests.test_codex_plugin_benchmark.FixtureTests -v
```

- [x] **Step 3: Implement the seven Node-standard-library fixtures**

Each task stores `seed/`, `oracle/hidden.test.mjs`, `prompt.md`, and `fixture.json`. The hidden oracle must fail against the seed for the intended missing behavior while the visible suite passes. Task G uses a configurable duration with a production default above 60 seconds and a test override below one second.

- [x] **Step 4: Run every visible baseline and oracle-sensitivity test twice**

```bash
python3 -m unittest tests.test_codex_plugin_benchmark.FixtureTests -v
python3 -m scripts.codex_plugin_benchmark.cli fixtures verify --all
python3 -m scripts.codex_plugin_benchmark.cli fixtures verify --all
```

Expected: identical fixture hashes; visible baselines pass; hidden oracles detect the seeded defects.

- [x] **Step 5: Commit the fixture slice**

```bash
git add scripts/codex_plugin_benchmark/fixtures.py tests/test_codex_plugin_benchmark.py audits/codex-plugin-stack/fixtures
git commit -m "test: add representative Codex benchmark fixtures"
```

### Task 3: Exact condition builder and prompt-surface preflight

**Files:**
- Create: `scripts/codex_plugin_benchmark/conditions.py`
- Create: `audits/codex-plugin-stack/configurations/*.json`
- Modify: `tests/test_codex_plugin_benchmark.py`

**Interfaces:**
- Consumes: installed skill directories, the redacted inventory, and a condition ID.
- Produces: `build_condition(condition_id: str, trial_root: Path) -> ConditionRecord`, `codex_overrides(record: ConditionRecord) -> list[str]`, and `validate_prompt_surface(rendered: object, record: ConditionRecord) -> list[str]`.
- Condition IDs include `b0`, `b1`, `guardrails`, `superpowers-engineering`, `guardrails-plus-superpowers`, `coordinator`, `superpowers-coordination`, `coordinator-plus-superpowers`, `maximum`, `security`, `github`, and the measured finalist.

- [x] **Step 1: Write failing condition isolation tests**

```python
def test_b0_disables_every_ambient_skill_and_optional_surface(self):
    condition = build_condition("b0", self.root)
    self.assertIn("plugins", condition.disabled_features)
    self.assertIn("apps", condition.disabled_features)
    self.assertEqual(condition.enabled_skill_paths, ())
    self.assertTrue(all(not item.enabled for item in condition.skill_overrides))

def test_guardrails_exposes_only_exact_guardrail_skills(self):
    condition = build_condition("guardrails", self.root)
    self.assertEqual({p.name for p in condition.enabled_skill_paths}, {"code-work", "code-verification"})
```

- [x] **Step 2: Run condition tests and require failure for missing builder**

```bash
python3 -m unittest tests.test_codex_plugin_benchmark.ConditionTests -v
```

- [x] **Step 3: Implement exact skill-path overrides and configuration manifests**

Use documented `skills.config = [{path = "/home/joel/.codex/skills/cloudflare", enabled = false}]` shape for each discovered ambient path, `--ignore-user-config`, `--ignore-rules`, `project_doc_max_bytes=0`, and repeatable feature disables. Treatments expose exact installed skill directories through fixture-local `.agents/skills` links. Do not copy or paraphrase skill instructions.

- [x] **Step 4: Run `codex debug prompt-input` for every condition before any model trial**

```bash
python3 -m scripts.codex_plugin_benchmark.cli preflight --all --output audits/codex-plugin-stack/configurations/preflight.json
```

Expected: every treatment contains its expected skill names; excluded component names are absent. If unavoidable global instructions remain, update the B0 label before proceeding.

- [x] **Step 5: Commit the condition/preflight slice**

```bash
git add scripts/codex_plugin_benchmark/conditions.py tests/test_codex_plugin_benchmark.py audits/codex-plugin-stack/configurations
git commit -m "feat: build controlled Codex benchmark conditions"
```

### Task 4: Native trial runner and preserved raw evidence

**Files:**
- Create: `scripts/codex_plugin_benchmark/runner.py`
- Create: `audits/codex-plugin-stack/results/raw/.gitkeep`
- Modify: `tests/test_codex_plugin_benchmark.py`

**Interfaces:**
- Consumes: `FixtureRecord`, `ConditionRecord`, repetition index, and output root.
- Produces: `run_trial(spec: TrialSpec) -> TrialRecord` with monotonic duration, command metadata, condition/task hashes, JSONL path, stderr path, last-message path, Git diff path, exit state, token usage, and infrastructure classification.

- [x] **Step 1: Write failing runner tests using a fake Codex executable**

```python
def test_runner_preserves_failed_jsonl_and_classifies_infrastructure_failure(self):
    record = run_trial(self.spec_with_fake_exit(7))
    self.assertEqual(record.status, "infrastructure-failed")
    self.assertTrue(record.events_path.exists())
    self.assertEqual(record.codex_exit_code, 7)

def test_runner_never_uses_process_jobs_or_changes_codex_home(self):
    argv = build_codex_argv(self.spec)
    self.assertNotIn("process-jobs", " ".join(argv))
    self.assertNotIn("CODEX_HOME", self.spec.environment_overrides)
```

- [x] **Step 2: Run runner tests and require failure for the missing implementation**

```bash
python3 -m unittest tests.test_codex_plugin_benchmark.RunnerTests -v
```

- [x] **Step 3: Implement disposable Git repositories and synchronous native polling**

The runner uses `subprocess.Popen`, drains stdout/stderr without deadlock, waits to a configured deadline, terminates only its owned process group on timeout, and atomically writes terminal metadata. It never launches CPJ and never returns before the Codex process is terminal.

- [x] **Step 4: Execute a zero-model fake end-to-end trial**

```bash
python3 -m unittest tests.test_codex_plugin_benchmark.RunnerTests -v
python3 -m unittest tests.test_codex_plugin_benchmark.RunnerTests -v
```

Expected: a complete raw run directory containing JSONL, timing, diff, stderr, final output, and terminal metadata.

- [x] **Step 5: Commit the runner slice**

```bash
git add scripts/codex_plugin_benchmark/runner.py tests/test_codex_plugin_benchmark.py audits/codex-plugin-stack/results/raw
git commit -m "feat: run isolated Codex benchmark trials"
```

### Task 5: Deterministic scoring and marginal aggregation

**Files:**
- Create: `scripts/codex_plugin_benchmark/scorer.py`
- Create: `scripts/codex_plugin_benchmark/report.py`
- Create: `audits/codex-plugin-stack/results/normalized/.gitkeep`
- Modify: `tests/test_codex_plugin_benchmark.py`

**Interfaces:**
- Consumes: raw `TrialRecord`, frozen fixture oracle, captured diff, and event JSONL.
- Produces: `score_trial(run_dir: Path) -> ScoredTrial`, `compare_conditions(records: Sequence[ScoredTrial]) -> list[MarginalComparison]`, and `render_benchmark_tables(records) -> str`.

- [x] **Step 1: Write failing scorer tests for correctness dominance and harm accounting**

```python
def test_material_hidden_failure_cannot_win_on_efficiency(self):
    winner = rank_trials([self.fast_but_wrong, self.slower_correct])
    self.assertEqual(winner.run_id, self.slower_correct.run_id)

def test_unnecessary_artifacts_and_false_completion_are_costs(self):
    score = score_trial(self.run_with_extra_plan_and_unverified_claim)
    self.assertGreater(score.workflow_overhead.artifact_count, 0)
    self.assertEqual(score.verification.false_completion_claims, 1)
```

- [x] **Step 2: Run scorer tests and require failure for missing score types**

```bash
python3 -m unittest tests.test_codex_plugin_benchmark.ScorerTests -v
```

- [x] **Step 3: Implement withheld checks, process metrics, and verdict thresholds**

The scorer injects only the selected fixture's oracle after the trial, runs visible and hidden suites, parses tool and token counts from supported JSONL events, records unmeasurable fields as `null`, and never invents a zero. Marginal comparisons keep correctness, quality, verification, autonomy, efficiency, overhead, and robustness as separate axes.

- [x] **Step 4: Score synthetic pass/fail fixtures and verify stable normalized JSON**

```bash
python3 -m unittest tests.test_codex_plugin_benchmark.ScorerTests -v
python3 -m scripts.codex_plugin_benchmark.cli score --raw audits/codex-plugin-stack/results/raw --output audits/codex-plugin-stack/results/normalized
```

- [ ] **Step 5: Commit the scoring slice**

```bash
git add scripts/codex_plugin_benchmark/scorer.py scripts/codex_plugin_benchmark/report.py tests/test_codex_plugin_benchmark.py audits/codex-plugin-stack/results/normalized
git commit -m "feat: score Codex plugin marginal value"
```

### Task 6: Screening, repeated ablations, and specialized real-stack checks

**Files:**
- Modify: `audits/codex-plugin-stack/results/raw/**`
- Modify: `audits/codex-plugin-stack/results/normalized/**`
- Create: `audits/codex-plugin-stack/results/run-manifest.json`
- Update: `docs/exec-plans/active/2026-08-17-codex-plugin-ablation-benchmark.md`
- Update: `state/CURRENT-STATE.md`

**Interfaces:**
- Consumes: verified harness, all frozen condition/task hashes, current ChatGPT authentication, and randomized counterbalanced schedule.
- Produces: immutable raw/normalized runs plus an exclusion ledger. No model trial begins until its prompt preflight passes.

- [ ] **Step 1: Run one counterbalanced screening trial for each required high-information pairing**

```bash
python3 -m scripts.codex_plugin_benchmark.cli run-schedule --schedule audits/codex-plugin-stack/configurations/screening.json
python3 -m scripts.codex_plugin_benchmark.cli score --raw audits/codex-plugin-stack/results/raw --output audits/codex-plugin-stack/results/normalized
```

The schedule covers A-E across B1, Guardrails, Superpowers, their relevant combination, and MAX; C covers Coordinator interactions; F covers native, Guardrails, and Security; G records native execution plus the pre-removal CPJ evidence and the post-removal operational state.

- [ ] **Step 2: Expand close or important comparisons to three total trials**

```bash
python3 -m scripts.codex_plugin_benchmark.cli plan-repetitions --minimum 3 --only-close --output audits/codex-plugin-stack/configurations/repetitions.json
python3 -m scripts.codex_plugin_benchmark.cli run-schedule --schedule audits/codex-plugin-stack/configurations/repetitions.json
```

Expected: repeated trials only for outcome-relevant or inconsistent comparisons; infrastructure failures remain excluded rather than scored.

- [ ] **Step 3: Run bounded real-stack overhead and availability checks**

Measure Coordinator hooks, current plugin/tool inventory, Security initialization on the disposable security fixture, GitHub connector versus `git`/`gh` for read-only orientation, connector authorization without secrets, and native long-running process polling/recovery. Do not restore Process Jobs or invoke Empire.

- [ ] **Step 4: Verify every recorded run and update the durable ledger**

```bash
python3 -m scripts.codex_plugin_benchmark.cli verify-results --all
git status --short
```

- [ ] **Step 5: Commit the immutable empirical evidence**

```bash
git add audits/codex-plugin-stack/results audits/codex-plugin-stack/configurations docs/exec-plans/active/2026-08-17-codex-plugin-ablation-benchmark.md state/CURRENT-STATE.md
git commit -m "data: record Codex plugin ablation trials"
```

### Task 7: Final report, authoritative workflow, and closeout

**Files:**
- Create: `audits/codex-plugin-stack/README.md`
- Create: `audits/codex-plugin-stack/reports/final-report.md`
- Create: `audits/codex-plugin-stack/reports/capability-map.json`
- Create: `audits/codex-plugin-stack/reports/overlap-matrix.csv`
- Create: `audits/codex-plugin-stack/reports/conflict-matrix.csv`
- Create: `audits/codex-plugin-stack/reports/component-decisions.json`
- Create: `audits/codex-plugin-stack/reports/activation-rules.md`
- Create: `audits/codex-plugin-stack/reports/authoritative-workflow.md`
- Create: `audits/codex-plugin-stack/reports/capability-gaps.md`
- Move: `docs/exec-plans/active/2026-08-17-codex-plugin-ablation-benchmark.md` to `docs/exec-plans/completed/2026-08-17-codex-plugin-ablation-benchmark.md`
- Update: `state/CURRENT-STATE.md`

**Interfaces:**
- Consumes: frozen inventory, instruction evidence, all valid scored trials, overhead checks, and blinded qualitative adjudication where deterministic scores tie.
- Produces: every deliverable required by the approved design, with direct evidence distinguished from inference and unavailable tests.

- [ ] **Step 1: Generate draft structured reports and the Markdown final report**

```bash
python3 -m scripts.codex_plugin_benchmark.cli report --inventory audits/codex-plugin-stack/inventory/effective-stack.json --results audits/codex-plugin-stack/results/normalized --output audits/codex-plugin-stack/reports
```

- [ ] **Step 2: Run blinded review only for unresolved qualitative ties**

An adjudicator receives anonymized diffs and the task contract, never condition labels. Record adjudication input hashes, outputs, and limits. Do not override deterministic correctness failures.

- [ ] **Step 3: Verify report completeness and decision-table coverage**

```bash
python3 -m scripts.codex_plugin_benchmark.cli verify-report --report audits/codex-plugin-stack/reports/final-report.md --inventory audits/codex-plugin-stack/inventory/effective-stack.json
```

Expected: every effective component has exactly one decision row; all ten required report sections and the final decision table exist.

- [ ] **Step 4: Run full repository verification and inspect the complete diff**

```bash
python3 -m unittest discover -s tests -v
python3 scripts/audit_codex_github.py --root . --fail-on error
git diff --check origin/main...HEAD
git status -sb
```

- [ ] **Step 5: Complete recovery/lesson closeout and commit**

```bash
git add audits/codex-plugin-stack scripts/codex_plugin_benchmark tests/test_codex_plugin_benchmark.py docs/exec-plans state/CURRENT-STATE.md
git commit -m "docs: publish Codex plugin ablation audit"
```

- [ ] **Step 6: Push the verified branch and update the existing draft PR**

```bash
git push origin codex/plugin-stack-ablation-audit-20260817
gh pr view 17 --repo u-dont-existDOTcom/universal-dev-architecture --json url,isDraft,state,headRefOid
```

## Self-Review

- Spec coverage: tasks 1-7 cover inventory, seven fixtures, exact conditions, native execution, deterministic scoring, adaptive repetition, specialized checks, all final matrices, activation rules, workflow, gaps, persistence, and publication.
- Placeholder scan: no `TBD`, `TODO`, “implement later,” undefined “write tests,” or placeholder function body remains. The `tuple[str, ...]` annotation and `origin/main...HEAD` revision syntax are executable language/tool syntax rather than omissions.
- Type consistency: `FixtureRecord`, `ConditionRecord`, `TrialSpec`, `TrialRecord`, `ScoredTrial`, and `MarginalComparison` are introduced in dependency order and consumed only by later tasks.
- Constraint reconciliation: authenticated trials retain the existing `CODEX_HOME` but use official per-run suppression controls; any residual global context forces an honest B0 label. Codex Process Jobs remains removed and is never reinstalled.
