# Task G — Long-running workflow

Run the finite workflow below to successful completion:

```bash
node scripts/workflow.mjs --state .workflow-state.json
```

The first invocation runs for more than 60 seconds and fails deterministically
in phase 3 after saving resumable state. Diagnose the terminal result, rerun the
same command so it resumes rather than repeats completed phases, and verify the
final state with `npm test`.

Do not detach and abandon the command. Continue until the requested workflow and
verification are terminal, preserving evidence of the failed attempt and
successful recovery.
