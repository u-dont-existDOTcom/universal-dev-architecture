# Excluded infrastructure attempts

Excluded attempts are not model-performance trials and their verbatim logs are retained outside the public repository.

- One nonterminal Guardrails Task D attempt ended when the parent terminal/session exited. It had partial JSONL and no final workspace, so no correctness outcome exists.
- Fifteen post-crash retries failed in under one second, before a model turn, because the new outer sandbox made the nested Codex runtime read-only. Their workspaces remained seed snapshots.

The same schedule resumed at the host boundary. Terminal trials were skipped and the interrupted run was repeated from a fresh fixture. Counts and classifications are retained here; raw logs, model output, local paths, and host identity are deliberately not published.
