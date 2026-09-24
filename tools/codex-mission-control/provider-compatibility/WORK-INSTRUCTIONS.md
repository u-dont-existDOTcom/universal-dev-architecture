# Next boundary — Claude compatibility live acceptance

## Current checkpoint

The no-inference integration implementation is complete at commit `1b14c87b876aeb9c0c41c0e4966575d3c7f3582c` on branch `chat/claude-compatibility-integration-20260924-0110`.

Do **not** redo provider discovery, admission design, host transport, OpenAI-preservation work, or the broad Claude capability audit. Read `README.md`, `TASK-STATE.json`, `TEST-RESULTS.json`, current UDA authority, and current integration ownership first.

## Proven now

- Existing OpenAI/Codex directives still reach the existing dispatcher with the exact original argument object.
- Claude requires an explicit provider/surface/role binding and a separate exact execution profile.
- The exact Claude request is content-bound to the directive digest.
- Host preflight verifies CLI flags, subscription auth and provider-override absence without inference.
- Mission Control persists the exact plan-hash preflight before spawn.
- Direct argv subprocess, bounded stdout collector, private stderr, timeout/abort/process-tree cleanup and sanitized final receipt are implemented.
- Existing `claude.ai` connectors remain health-visible under strict MCP config; MCP is denied by default unless an exact tool approval is source-bound.
- Focused suites are green; one unrelated baseline TypeScript UI error remains on unchanged `main`.

## Next action — only after resource use is authorized

Run exactly one low/medium-effort Claude subscription acceptance case. It must be bounded and disposable. Verify:

1. exact source/task/directive/provider/profile binding;
2. one new session and exact returned session ID;
3. client-reported primary model without claiming independent provider attestation;
4. one explicitly approved read operation;
5. one operation that must be denied under `dontAsk` / no prompt;
6. one exact existing MCP tool identity if connector use is part of the selected case;
7. exact-ID resume under the same directive binding;
8. cancellation/timeout with all child processes stopped;
9. sanitized Mission Control receipt, with no prompt/assistant/tool-input/raw-error leakage.

Do not auto-retry, switch model, add API fallback, enable xhigh/max, spawn agents, alter OAuth, or loosen MCP audiences/scopes to rescue a failure.

## After the acceptance case

Classify provider/tool/auth failures separately from model quality. If the acceptance case passes, decide whether automatic no-`--directive` Claude autodiscovery is actually needed for the owner migration workflow. Add it only if it removes a real remaining manual integration step; do not make it a new release prerequisite by inference.

Merge/deploy/restart/routing-switch work remains outside this packet until explicitly admitted at that boundary. Full repository release gates belong there, not in this Iteration checkpoint.
