# State and Recovery Agent Instructions

- Treat state files as concise routing documents, not chat transcripts or substitutes for exact repository evidence.
- Use `state/CURRENT-STATE.md` as the repository recovery entry point. Give each task one checkpoint at the path from `python3 scripts/task_checkpoint_path.py "$(git branch --show-current)"`; start from `templates/CURRENT-STATE.md`, edit only that task's file, and retain it after merge. Edit the entry point only for repository-level state.
- Before trusting or editing a checkpoint, inspect actual Git state, relevant commits/artifacts, and newer owner instructions; repair stale entries immediately.
- Record goal, baseline, active constraints, completed work not to repeat, current step, last verified durable boundary, remaining work, blockers, evidence/tests/commits, and next safe action.
- Update state at meaningful durable boundaries, after consequential decisions or falsified approaches, before handoff, and before claiming multi-step work complete.
- Never store credentials, secret values, private chain-of-thought, unnecessary personal data, or large raw logs here; link to canonical evidence.
- Distinguish `verified`, `observed`, `unverified`, `blocked`, and `planned`. Do not convert plans or remembered summaries into completion claims.
- A checkpoint never outranks current owner instruction, exact Git state, tests, canonical protocols, or source evidence.
- Transferable findings still require lesson disposition and provenance.
- After interruption, context compaction, model switch, or a fresh thread, identify exactly what survived and resume from the latest verified durable boundary without repeating completed work.
