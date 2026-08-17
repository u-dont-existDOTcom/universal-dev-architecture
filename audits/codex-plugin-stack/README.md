# Codex plugin-stack ablation benchmark

This directory is the reproducible evidence bundle for the 2026-08-17 Codex plugin audit. The controlling question is whether a component improves final task outcomes enough to justify its context, latency, tools, artifacts, gates, and failure modes.

## Evidence layout

- `inventory/effective-stack.json`: redacted post-removal live cache/skill snapshot.
- `inventory/effective-stack-pre-removal.json`: frozen snapshot containing Process Jobs and Empire for removal provenance.
- `fixtures/`: Tasks A-G, visible tests, and withheld outcome oracles.
- `configurations/`: exact ablation manifests, prompt-surface preflight, and trial schedules.
- `results/raw/`: per-run metadata, JSONL, stderr, diff, Git status, last message, and final workspace.
- `results/normalized/`: deterministic oracle and cost scores.
- `results/excluded/`: preserved non-model infrastructure attempts, never scored as model outcomes.
- `capability-map.json`, `overlap-matrix.csv`, and `conflict-matrix.csv`: instruction/capability synthesis.
- `activation-rules.md`, `authoritative-workflow.md`, and `capability-gaps.md`: retained architecture.
- `reports/final-report.md`: decision report and full benchmark/ablation tables.

No production repository, global plugin installation, authentication file, connector, or global configuration is mutated by the harness. Each model trial starts from a fresh temporary Git repository. Process Jobs is not used.

## Fixed controls

- Codex CLI 0.147.0
- `gpt-5.6-sol`, `xhigh`
- `workspace-write`, approval policy `never`, ephemeral JSONL session
- no network or package dependency in fixtures
- exact condition and fixture hashes in every terminal metadata record
- correctness scored after termination with a withheld oracle
- whole-harness monotonic wall time, token usage when the CLI emits a terminal usage event, completed tool calls, test commands, changed files/lines, user-input gates, waits, and workflow artifacts

The original measurements record whole-harness wall time (fixture setup through snapshot), not pure inference time. New runner versions also write `agent_wall_seconds`; old evidence cannot be reconstructed. JSONL does not reliably expose subagent creation, so an absent spawn count is `null`, not zero.

## Reproduce deterministic layers

From the repository root:

```bash
python3 -m scripts.codex_plugin_benchmark.cli inventory \
  --codex-root /home/joel/.codex \
  --output audits/codex-plugin-stack/inventory/effective-stack.json

python3 -m scripts.codex_plugin_benchmark.cli fixtures verify \
  --all \
  --output audits/codex-plugin-stack/results/fixture-verification.json

python3 -m scripts.codex_plugin_benchmark.cli conditions \
  --all \
  --codex-root /home/joel/.codex \
  --output audits/codex-plugin-stack/configurations

python3 -m scripts.codex_plugin_benchmark.cli preflight \
  --all \
  --codex-root /home/joel/.codex \
  --output audits/codex-plugin-stack/configurations/preflight.json

python3 -m unittest discover -s tests -v
python3 scripts/audit_codex_github.py --root . --fail-on error
```

## Run model trials

These calls invoke model work and must run where nested Codex can write its own runtime state. They synchronously poll each owned process to terminal or the explicit timeout.

```bash
python3 -m scripts.codex_plugin_benchmark.cli run-schedule \
  --schedule audits/codex-plugin-stack/configurations/screening.json \
  --output audits/codex-plugin-stack/results/raw \
  --timeout 900

python3 -m scripts.codex_plugin_benchmark.cli run-schedule \
  --schedule audits/codex-plugin-stack/configurations/supplemental.json \
  --output audits/codex-plugin-stack/results/raw \
  --timeout 900

python3 -m scripts.codex_plugin_benchmark.cli score \
  --raw audits/codex-plugin-stack/results/raw \
  --output audits/codex-plugin-stack/results/normalized
```

`run-schedule` updates `schedule-ledger.json` after every trial and skips terminal metadata on resume. A 2026-08-17 terminal crash demonstrated this recovery path. Nonterminal residue and immediate read-only-sandbox initialization failures were moved intact to `results/excluded/session-crash-readonly-20260817/` before the host-boundary resume.

## Interpretation rules

- Passing visible tests is insufficient; withheld tests determine implementation correctness.
- A correct preserved workspace after timeout receives correctness credit but the end-to-end run still fails.
- An invocation, plan, scan, detached process, or review is never credited merely for occurring.
- Components without a causal coding path receive availability/uniqueness assessment rather than a toy coding score.
- Close important comparisons expand adaptively; clear failures and extremely expensive specialized roles are not repeated merely to increase sample size.
- Current-state and pre-removal configurations are separated by recorded hashes. A pre-removal maximum-stack Task E run is retained as historical evidence and rerun under the post-removal maximum condition.
