# Test efficiency and verification budget

## Status

Current universal pattern.

## Purpose

Preserve regression confidence without letting an autonomous coding agent spend large fractions of task wall time repeatedly proving facts that have not changed.

This pattern governs **when** to run focused, affected, full, and mutation tests; how to measure their cost; and when a repeated green result is redundant. It does not weaken repository-declared completion gates. It changes the execution schedule so expensive evidence is gathered at the point where it can change a decision.

## Independent conception snapshot

Before the existing-work scan, the candidate mechanism was:

- treat each test invocation as an information-acquisition action with a measurable wall-clock cost;
- classify invocations as `focused`, `affected`, `full`, `mutation`, or `other`;
- start task-wall-clock telemetry before substantive implementation so test time can be expressed as a percentage of task time;
- fingerprint the exact repository state and test command;
- prevent an unchanged full or mutation suite from being executed again after an equivalent green run unless a material reason is recorded;
- use focused/affected tests in the inner loop;
- permit full suites at explicit integration/completion checkpoints rather than after every edit;
- permit mutation testing only for an explicit test-quality or high-risk trigger;
- report both observed test cost and redundant-green time actually executed or avoided.

Constraints: preserve safety for high-risk changes, do not hide failures, do not infer that every green run was waste, and keep the mechanism generic across test frameworks.

Candidate insight: autonomous agents should optimize **fault-detection information per unit wall time**, not maximize the raw number of green test executions.

## Existing-work scan

This is primarily an adaptation/composition problem, not a novel testing algorithm.

### Academic literature

Selective regression testing and regression-test prioritization are established research areas. A systematic review in *ACM Computing Surveys* found cost, coverage, and fault-detection capability to be recurring evaluation dimensions for regression-test selection. Practical industrial work has shown that coverage/history-aware selection can materially reduce feedback time while retaining similar fault-detection effectiveness.

Relevant baselines:

- Rafaqut Kazmi, Dayang N. A. Jawawi, Radziah Mohamad, and Imran Ghani, “Effective Regression Test Case Selection: A Systematic Literature Review,” *ACM Computing Surveys* 50(2), 2017. DOI: https://doi.org/10.1145/3057269
- Dusica Marijan and Marius Liaaen, “Practical selective regression testing with effective redundancy in interleaved tests,” ICSE/SEIP, 2018. DOI: https://doi.org/10.1145/3183519.3183532

### Mature implementations

Develocity Predictive Test Selection explicitly separates relevant-tests execution for frequent early feedback from remaining-tests execution at later coverage stages. It also treats recently passed tests on the same inputs as less useful to rerun and measures serial test-time savings.

- https://docs.gradle.com/develocity/predictive-test-selection

Pytest exposes duration profiling because slow-test identification is a first-class optimization concern.

- https://docs.pytest.org/en/stable/how-to/usage.html#profiling-test-execution-duration

Mutation-testing tools independently converge on incremental/selective execution. Mutmut remembers prior work and chooses relevant tests; PIT offers incremental analysis that avoids re-running mutation results that can be inferred from unchanged code/tests.

- https://mutmut.readthedocs.io/en/latest/
- https://pitest.org/quickstart/incremental_analysis/

### Disposition

**Compose and adapt.**

Reuse established selective-regression/test-impact principles and framework-native timing/selection when available. Add a lightweight agent-specific control layer for two gaps that existing tools do not universally solve:

1. measuring testing as a share of the autonomous task's wall time; and
2. refusing redundant unchanged-state full/mutation reruns unless an explicit material reason exists.

Do not invent a bespoke predictive model when a mature project-native impact-analysis or predictive-test-selection system already exists.

## Verification ladder

### 1. Focused tests — default inner loop

Run the smallest tests that directly exercise changed behavior, reproduced failures, changed invariants, or a newly added regression.

Use after a local implementation change when the result can immediately guide the next edit.

### 2. Affected tests — broaden when dependency impact is known

Run tests for affected modules, dependency neighborhoods, packages, services, or behavior classes.

Prefer project-native test-impact analysis, coverage maps, build-graph `affected` commands, or mature predictive selection over hand-maintained guesses.

Use this tier when a focused test is green but the changed surface plausibly affects adjacent behavior.

### 3. Full relevant suite — checkpoint, not reflex

A full relevant suite is required when repository policy says so, but it belongs at a meaningful checkpoint rather than after every edit.

Valid default triggers are:

- establishing a baseline before a risky change;
- crossing an integration boundary;
- a genuinely high-risk change where targeted impact is uncertain;
- pre-commit when the commit is intended as a verified durable boundary;
- pre-PR or equivalent merge-ready checkpoint;
- pre-handoff when the next worker must inherit a verified state;
- release/deployment gate;
- CI-required verification;
- explicit owner request.

After a full suite fails, reproduce and fix with focused/affected tests first. Re-run the full suite when the repository state has materially changed enough to justify re-validating the checkpoint.

### 4. Mutation testing — specialist gate

Mutation testing is **not** an autonomous inner-loop default and must not be inferred merely because ordinary tests are green.

Use it when at least one explicit trigger exists:

- test-quality logic itself changed;
- critical/high-risk logic needs evidence that tests reject plausible faults;
- a previously surviving mutant is being investigated;
- the owner explicitly requests mutation testing;
- a repository-defined release/assurance gate requires it.

Prefer incremental mutation, changed-file/function scopes, coverage filtering, cached historical results, or selected mutants before a whole-repository mutation campaign.

## Redundant-green rule

An invocation is **redundant-green-same-state** when all of these are true:

1. the previous equivalent invocation passed;
2. repository result-affecting state is unchanged;
3. the executed command/test selection is equivalent; and
4. no material external-environment reason requires re-observation.

Do not execute an unchanged full or mutation suite again merely for reassurance.

If the environment, dependency service, clock-sensitive input, credentials, generated artifact, or other non-worktree input materially changed, a rerun can be justified. Record that reason explicitly.

Focused tests may be rerun when they are cheap and useful to an active debugging hypothesis, but repeated identical green focused runs should still be avoided when they cannot change the next decision.

## Mandatory telemetry for non-trivial software tasks

When testing is non-trivial enough that repeated execution could materially affect task time, start measurement before substantive implementation and route agent-initiated test commands through `scripts/test_efficiency.py` or a project-native equivalent that preserves the same fields.

A project-local copy is **not** assumed to exist. If the active project lacks an equivalent observer, do not silently skip measurement. Before the first substantive test run, do one of the following:

1. vendor/copy the current canonical `scripts/test_efficiency.py` from `u-dont-existDOTcom/universal-dev-architecture` into the project;
2. execute the current canonical observer from a checked-out universal-architecture repository and pass `--root <PROJECT>`; or
3. use a project-native observer that preserves this pattern's trigger, fingerprint/deduplication, and summary semantics.

Mark telemetry `not_applicable` only when test execution is genuinely trivial enough that measuring it would cost more than it can plausibly save, and record that rationale in the task/plan. A missing local observer is not a valid `not_applicable` reason.

Reference commands:

```bash
python3 scripts/test_efficiency.py start --task-id <TASK>

python3 scripts/test_efficiency.py run \
  --task-id <TASK> \
  --scope focused \
  --reason "changed parser branch" \
  -- pytest tests/test_parser.py -q

python3 scripts/test_efficiency.py run \
  --task-id <TASK> \
  --scope full \
  --reason "merge-ready verification" \
  --full-trigger pre-pr \
  -- pytest -q

python3 scripts/test_efficiency.py summary --task-id <TASK>
```

For mutation testing, add `--mutation-trigger <TRIGGER>`.

The reference implementation stores telemetry under `.git/codex-test-efficiency/` by default so measurement does not dirty the worktree.

## Required measurements

At completion or handoff, preserve/report:

- task elapsed wall time;
- observed test wall time;
- test wall time as a percentage of task wall time;
- run count and wall time by scope;
- failure-discovering runs by scope;
- full-suite wall time;
- mutation-testing wall time;
- forced redundant-green full/mutation rerun time;
- redundant-green runs skipped;
- estimated wall time avoided by those skips.

Do **not** label all green-test time as waste. The strongest direct waste measure is identical-state green reruns that were forced despite an earlier equivalent pass. High full-suite or mutation share with zero discoveries is a review signal, not proof by itself.

## Optimization response

If telemetry shows excessive testing cost:

1. eliminate redundant-green reruns first;
2. move full suites from edit-by-edit execution to checkpoint execution;
3. improve focused/affected selection;
4. use framework-native duration reports to identify slow tests;
5. split or parallelize genuinely necessary long-running suites where correctness permits;
6. cache deterministic setup/build work;
7. make integration/E2E tests conditional on affected surfaces when a validated impact mechanism exists;
8. scope mutation runs to changed/high-risk code and use incremental caches;
9. only then consider deleting or weakening tests, and require independent evidence that they are redundant or low-value.

The goal is not “fewer tests.” The goal is the same or better decision-relevant confidence per unit wall time.

## Risk escalation

Bias toward broader verification when any of the following is true:

- security, authentication, authorization, billing, money movement, destructive data changes, migrations, updater/installer logic, release signing, or other high-consequence paths changed;
- the dependency graph is uncertain;
- test selection machinery itself changed;
- failures are flaky or environment-sensitive;
- hidden coupling has recently caused escaped regressions;
- the task changes shared infrastructure used by many packages/services.

A broader checkpoint does not license repeated full-suite runs after every subsequent edit. Return to focused debugging, then re-enter the full checkpoint when state is ready.

## Mechanical control

`scripts/test_efficiency.py` implements the portable baseline:

- requires a task start event so the wall-time denominator exists;
- fingerprints `HEAD`, tracked diff, and untracked file contents;
- classifies test scope;
- requires an explicit full-suite trigger;
- requires an explicit mutation-testing trigger;
- skips identical-state green full/mutation reruns by default;
- requires `--force-rerun --force-reason ...` to override that deduplication;
- records JSONL telemetry under `.git`;
- summarizes test share, scope costs, failure-discovering runs, forced redundant cost, and avoided redundant cost.

Projects with better native tooling may replace the script, but the replacement must preserve the policy semantics and measurements.

## Anti-patterns

- “Run the entire suite after every edit because tests are cheap enough.”
- “700 passed, 0 failed” as evidence that the last identical run needed to happen.
- Treating mutation testing as routine proof after every implementation change.
- Rerunning the full suite immediately after a failure without first localizing/fixing the failure.
- Calling all green test time “waste.”
- Optimizing test count while ignoring wall time.
- Selecting tests by intuition when the project already has validated impact-analysis tooling.
- Skipping required final/CI gates merely because focused tests passed.
