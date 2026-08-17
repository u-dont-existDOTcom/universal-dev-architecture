# Sanitized raw evidence

This directory is the public, allowlisted raw-evidence layer. Each terminal trial retains terminal metadata, ordered event categories, token/call facts, evaluator hashes, and its deterministic scored record.

Verbatim JSONL, command output, model messages, final workspaces, diffs, stderr, installed skill bodies, absolute paths, and host identity are deliberately excluded under the repository's public-publication policy. The verbatim source evidence remains in a private local evidence store and is not required to recompute the published score tables from these records.

Regenerate from the private raw root:

```bash
python3 -m scripts.codex_plugin_benchmark.publish_results \
  --raw "${PRIVATE_CODEX_AUDIT_RAW}" \
  --normalized audits/codex-plugin-stack/results/normalized/all-trials.json \
  --output audits/codex-plugin-stack/results/published-raw
```
