# Excluded infrastructure attempts

These directories are raw recovery evidence, not model-performance trials.

- `session-crash-interrupted-20260817/`: one nonterminal Guardrails Task D attempt whose parent terminal/session exited. It has partial JSONL and no final workspace, so no correctness outcome exists.
- `session-crash-readonly-20260817/`: fifteen retries launched after the crash from the new outer sandbox. Each failed in under one second before a model turn with `failed to initialize in-process app-server client: Read-only file system`. Their final workspaces are unchanged seed snapshots created by the harness cleanup path.

The failed directories were moved intact out of `results/raw/`, then the same schedule resumed at the host boundary. Completed terminal trials were skipped, the interrupted run was repeated from a fresh fixture, and all replacements retain their own metadata and hashes.
