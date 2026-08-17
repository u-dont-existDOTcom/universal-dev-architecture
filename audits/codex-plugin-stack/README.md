# Codex plugin-stack ablation benchmark

This directory is the reproducible evidence bundle for the 2026-08-17 Codex plugin audit. The controlling question is whether a component improves final task outcomes enough to justify its context, latency, tools, artifacts, gates, and failure modes.

**[Read the final report](reports/final-report.md).**

## Evidence layout

- `inventory/effective-stack.json`: redacted post-removal live cache/skill snapshot.
- `inventory/effective-stack-pre-removal.json`: frozen snapshot containing Process Jobs and Empire for removal provenance.
- `inventory/effective-stack-summary.md` and `runtime-tool-surface.json`: human-readable package/instruction inventory and all 293 callable schema counts.
- `fixtures/`: Tasks A-G, visible tests, and withheld outcome oracles.
- `configurations/`: exact ablation manifests, prompt-surface preflight, trial schedules, and the narrowly justified legacy-hash equivalence manifest.
- `results/published-raw/`: allowlisted per-run terminal metadata, ordered event categories, evaluator hashes, and scores; no model text, command output, absolute paths, or installed skill bodies.
- `results/normalized/`: deterministic oracle and cost scores.
- `results/excluded/`: public classification of non-model infrastructure attempts. Verbatim raw and excluded evidence remains private/local under the repository publication policy.
- `capability-map.json`: workflow-stage ownership summary.
- `overlap-matrix.csv`: dense core-workflow matrix; `component-relationships.csv`: explicit A-G relationship rows covering every inventoried decision component.
- `conflict-matrix.csv`: exact instruction collisions and authority decisions.
- `activation-rules.md`, `authoritative-workflow.md`, and `capability-gaps.md`: retained architecture.
- `reports/final-report.md`: decision report and full benchmark/ablation tables.

No production repository, global plugin installation, authentication file, connector, or global configuration is mutated by the harness. Each model trial starts from a fresh temporary Git repository. Process Jobs is not used.

## Fixed controls

- Codex CLI 0.147.0
- `gpt-5.6-sol`, `xhigh`
- `workspace-write`, approval policy `never`, ephemeral JSONL session
- no network or package dependency in fixtures
- prompt-routing condition and agent-facing fixture hashes in every terminal metadata record
- separate skill-content, effective-stack, runtime-tool-surface, oracle, command, and evaluator-contract identities in public manifests/results
- correctness scored after termination with a withheld oracle
- whole-harness monotonic wall time, token usage when the CLI emits a terminal usage event, completed tool calls, test commands, changed files/lines, user-input gates, waits, and workflow artifacts

The original measurements record whole-harness wall time (fixture setup through snapshot), not pure inference time. New runner versions also write `agent_wall_seconds`; old evidence cannot be reconstructed. JSONL does not reliably expose subagent creation, so an absent spawn count is `null`, not zero.

B0 and maximum use the same unavoidable system/developer base; maximum adds the discovered optional skill/app/hook surface. B1 and minimal-finalist add one controlled, hashed repository `AGENTS.md`. Maximum does not add that fixture instruction, so its causal contrast with B0 remains internally consistent rather than mixing optional-stack and repository-instruction effects.

## Reproduce deterministic layers

From the repository root:

```bash
CODEX_AUDIT_ROOT=/absolute/path/to/.codex

python3 -m scripts.codex_plugin_benchmark.cli inventory \
  --codex-root "${CODEX_AUDIT_ROOT}" \
  --output audits/codex-plugin-stack/inventory/effective-stack.json

python3 -m scripts.codex_plugin_benchmark.cli fixtures verify \
  --all \
  --output audits/codex-plugin-stack/results/fixture-verification.json

python3 -m scripts.codex_plugin_benchmark.cli conditions \
  --all \
  --codex-root "${CODEX_AUDIT_ROOT}" \
  --output audits/codex-plugin-stack/configurations

python3 -m scripts.codex_plugin_benchmark.cli preflight \
  --all \
  --codex-root "${CODEX_AUDIT_ROOT}" \
  --output audits/codex-plugin-stack/configurations/preflight.json

python3 -m unittest discover -s tests -v
python3 scripts/audit_codex_github.py --root . --fail-on error
```

## Run model trials

These calls invoke model work and must run where nested Codex can write its own runtime state. They synchronously poll each owned process to terminal or the explicit timeout.

```bash
PRIVATE_CODEX_AUDIT_RAW=/private/path/to/plugin-audit-raw

python3 -m scripts.codex_plugin_benchmark.cli run-schedule \
  --schedule audits/codex-plugin-stack/configurations/screening.json \
  --output "${PRIVATE_CODEX_AUDIT_RAW}" \
  --timeout 900

python3 -m scripts.codex_plugin_benchmark.cli run-schedule \
  --schedule audits/codex-plugin-stack/configurations/supplemental.json \
  --output "${PRIVATE_CODEX_AUDIT_RAW}" \
  --timeout 900

python3 -m scripts.codex_plugin_benchmark.cli run-schedule \
  --schedule audits/codex-plugin-stack/configurations/formal-security.json \
  --output "${PRIVATE_CODEX_AUDIT_RAW}" \
  --timeout 900

# Role-relevant real-project trials are deliberately separate because they
# incur additional model cost. Run only under the applicable owner/spend gate.
python3 -m scripts.codex_plugin_benchmark.cli run-schedule \
  --schedule audits/codex-plugin-stack/configurations/real-project.json \
  --output "${PRIVATE_CODEX_AUDIT_RAW}" \
  --timeout 1200

python3 -m scripts.codex_plugin_benchmark.cli score \
  --raw "${PRIVATE_CODEX_AUDIT_RAW}" \
  --output audits/codex-plugin-stack/results/normalized

python3 -m scripts.codex_plugin_benchmark.publish_results \
  --raw "${PRIVATE_CODEX_AUDIT_RAW}" \
  --normalized audits/codex-plugin-stack/results/normalized/all-trials.json \
  --output audits/codex-plugin-stack/results/published-raw

python3 -m scripts.codex_plugin_benchmark.finalize_report \
  --report audits/codex-plugin-stack/reports/final-report.md \
  --normalized audits/codex-plugin-stack/results/normalized/all-trials.json \
  --decisions audits/codex-plugin-stack/component-decisions.json \
  --configurations audits/codex-plugin-stack/configurations
```

`run-schedule` updates `schedule-ledger-<schedule>.json` after every trial and skips terminal metadata on resume. A 2026-08-17 terminal crash demonstrated this recovery path. One interrupted nonterminal trial and fifteen immediate read-only-sandbox initialization failures are classified in `results/excluded/`; their verbatim evidence remains in the private raw store. Neither class is scored as a model outcome.

The public repository never stores verbatim JSONL, raw logs, model messages, command output, final workspaces, diffs, host identity, absolute paths, or cached plugin bodies. `publish_results` derives the allowlisted public evidence layer; normalized evaluator results remain independently reproducible from a private raw run.

Task H is a real 146-file historical snapshot materialized from commit `f3a34581f756bff726a1f9a38acb6bdab8f5d059`. Rerunning it requires a non-shallow clone that contains that commit. Scoped instruction files are stripped; the root agreement remains only to satisfy the repository's own full test suite, while every scheduled Task H condition sets the project-document budget to zero. Production state is never used or changed. The committed 2026-08-17 results do not include Task H model outcomes because the host boundary required a fresh owner confirmation for that additional model spend.

## Interpretation rules

- Passing visible tests is insufficient; withheld tests determine implementation correctness.
- A correct preserved workspace after timeout receives correctness credit but the end-to-end run still fails.
- An invocation, plan, scan, detached process, or review is never credited merely for occurring.
- Components without a causal coding path receive availability/uniqueness assessment rather than a toy coding score.
- Close important comparisons expand adaptively; clear failures and extremely expensive specialized roles are not repeated merely to increase sample size.
- Current-state and pre-removal configurations are separated by recorded hashes. Hashes are strict by default; `configurations/evidence-equivalence.json` allowlists only older conditions whose enabled surface was unchanged when a disabled catalog entry disappeared. A pre-removal maximum-stack Task E run is retained as historical evidence, excluded as a material surface change, and rerun under the post-removal maximum condition.
- Condition `content_sha256` is a prompt-routing hash, not a complete plugin binary/server identity. Manifests separately record each skill-body hash and frozen effective-stack/runtime-tool-surface hashes. Server-side connector drift remains possible.
