# Interactive shell command safety

## Problem

Copy/paste setup instructions often mix two different execution environments:

1. a **disposable script/subshell**, where strict shell options such as `set -euo pipefail` are useful; and
2. the user's **ordinary interactive terminal**, whose shell state survives after each pasted command.

Treating them as interchangeable can turn an ordinary diagnostic failure into a disappearing terminal, lost logs, changed environment variables, changed traps/options, or later commands behaving differently for reasons the user cannot see.

## Rule

Do not paste persistent shell-state mutations directly into a user's ordinary interactive shell unless the task actually requires them **and** the original state is restored on every path.

This includes, at minimum:

- `set -e`, `set -u`, and `set -o pipefail` / `set -euo pipefail`;
- traps;
- persistent shell-option changes;
- directory or environment mutations whose later persistence is not part of the documented contract;
- failure hooks that can terminate or redirect the parent interactive shell.

### Preferred boundaries

For strict setup logic, use one of these approaches in descending preference:

1. **Repository script as a child process**

   ```bash
   bash scripts/bootstrap.sh
   ```

   The script may use `set -euo pipefail`; its shell options die with the child process.

2. **Explicit subshell for a pasted block**

   ```bash
   (
     set -euo pipefail
     # bounded setup commands
   )
   ```

   Shell options and ordinary directory changes remain inside the subshell.

3. **Stepwise interactive commands with explicit checks** when the user needs to inspect/intervene between steps.

Do not use a naked `set -e` at the beginning of a block that the user will paste into their persistent terminal and then continue using afterward.

## Diagnostic commands

A diagnostic command should preserve the operator's terminal and evidence even when the thing being tested fails.

When diagnosis, rather than pass/fail gating, is the objective:

- capture stdout/stderr;
- expose the child command's real exit status;
- preserve the log automatically;
- return control to the shell so the failure can be inspected;
- avoid relying on inherited hidden shell state.

A diagnostic wrapper may intentionally return success after recording `child_exit_status != 0`; a CI/release/verification gate should still return nonzero when its contract fails. The distinction must be explicit.

## Bootstrap command quality

Before giving a user machine-setup commands, resolve these prerequisites rather than assuming them:

- actual repository location or a deterministic clone location;
- whether the command must run inside a Git worktree;
- system Python policy such as PEP 668 / externally managed environments;
- project virtual-environment path and activation-independent executable path;
- whether the next command requires GUI/session state, credentials, or an interactive prompt.

Prefer commands such as `.venv/bin/python` and `.venv/bin/<tool>` in troubleshooting instructions because they do not depend on activation state surviving between pasted blocks.

## Failure recovery

If an earlier instruction may have leaked `errexit` into the current shell, recover before further diagnostics:

```bash
set +e
```

A newly opened normal interactive shell also starts from its normal startup configuration rather than inheriting shell options from the terminated shell process.

Do not infer the underlying tool failure from the terminal disappearing alone. First separate:

1. **why the parent shell exited**, and
2. **why the child diagnostic command returned nonzero**.

They are distinct causal questions.

## Provenance

Promoted 2026-08-18 from `u-dont-existDOTcom/pangram-humanization-lab`, branch `agent/pangram-local-playwright-gpt-20260818`, exact project incident commit `c981edac8c77935cc735f89ebb0a48087848e099`, source `state/PANGRAM-LOCAL-INTERACTIVE-SHELL-INCIDENT-2026-08-18.md`.

The incident occurred after an assistant-supplied interactive setup block used a naked `set -e`; a later local Playwright smoke command returned nonzero and the terminal disappeared before the underlying browser error could be retained. Inspection of the smoke runner showed no parent-shell termination mechanism, separating the leaked shell-state failure from the still-unresolved browser-launch failure.

## Limits

This pattern does not ban strict shell mode. `set -euo pipefail` remains useful inside bounded scripts and subprocesses. It also does not claim that every terminal exit after `set -e` has the same cause; inspect the actual shell, command, and logs. The transferable rule is to prevent hidden persistent shell state from contaminating later interactive work and to preserve diagnostic evidence when failures are expected to be investigated.
