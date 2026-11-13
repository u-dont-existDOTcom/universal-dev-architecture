# The instruction Greptile's review carried for defect D3, as each reviewer got it in Experiment 2

```text
PRIORITY 6: historical frozen tool-catalog patch 660eda1b; compare current origin/main to distinguish fixed versus live issues. Audit backend/connector release integrity: 35 frozen MCP tools, input schema later_inputs, catalog/version manifest, HRP/Universal hashes, installed plugin skill files and package receipt, Custom GPT and Claude sync, rollback and production acceptance. Find specific path that can report release complete with outdated, mismatched or unverified installed bytes/tools, without inventing a new tool. Inspect changed register-tools, connector-input-schema, freeze scripts and tests. Give exact code location, adversarial test, severity. No code or deployment changes.
```
