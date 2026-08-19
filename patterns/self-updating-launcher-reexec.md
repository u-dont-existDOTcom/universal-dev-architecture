# Self-updating launcher re-exec

## Rule

A running script does **not** automatically begin executing newly fetched source merely because it updates its own file on disk.

If a launcher performs `git pull`, package update, artifact replacement, or another update that may change the launcher itself or the control-flow files it has already loaded, it must establish an explicit update boundary before consequential downstream work.

For a shell launcher that can update itself:

1. record the launcher's identity before the update, such as a Git blob hash or cryptographic file hash;
2. perform the bounded update;
3. record the launcher's identity afterward;
4. if the launcher changed, `exec` the newly fetched launcher exactly once rather than continuing the already-running stale script body;
5. carry an environment/process marker across the `exec` to prevent re-exec loops;
6. preserve the same diagnostic log across the restart rather than truncating evidence;
7. only after the update boundary is settled should the launcher perform paid, destructive, privileged, publication, migration, or other consequential work.

A stable bootstrap executable that never updates itself may instead update a separate worker and then launch that worker. The invariant is the same: **the code controlling consequential post-update behavior must be the code version the operator believes was just installed.**

## Why this matters

A self-updating script can produce a deceptive state:

- the repository is visibly at the new commit;
- `git pull` reports success;
- the file on disk contains the fix;
- but the running process continues executing the old script's already-parsed control flow.

This is particularly dangerous when the update added a safety gate, recovery path, new stop condition, billing guard, credential boundary, or destructive-action fix. The operator can reasonably believe the new protection is active when it is not.

## Safe shell shape

Use a bounded child script, not persistent interactive-shell state. A representative pattern is:

```bash
self_path="$repo_root/scripts/launcher.sh"
before="$(git hash-object "$self_path" 2>/dev/null)"

git pull --ff-only || exit 1

after="$(git hash-object "$self_path" 2>/dev/null)"
if [ "${LAUNCHER_REEXECED:-0}" != "1" ] \
   && [ -n "$before" ] \
   && [ -n "$after" ] \
   && [ "$before" != "$after" ]; then
  LAUNCHER_REEXECED=1 exec bash "$self_path" "$@"
fi
```

The exact implementation can differ. Important properties are change detection, one-time re-exec, argument/state preservation where appropriate, and evidence/log continuity.

## Tests

For consequential launchers, add at least one regression that verifies the update/re-exec contract cannot disappear silently. Stronger tests may use a temporary repository and a fake/controlled update. A structural test that asserts the re-exec guard remains present is weaker but still useful when end-to-end shell testing would be disproportionate.

Also test the post-update behavior independently. A re-exec mechanism does not prove the newly loaded workflow itself is correct.

## Origin and evidence

Promoted 2026-08-19 from `u-dont-existDOTcom/pangram-humanization-lab`.

A terminal-safe Romance Pangram recovery launcher started from an older commit, then `git pull --ff-only` fetched a new wrapper that added dedicated-profile History recovery. The repository and wrapper file updated successfully, but the already-running shell continued the old control flow and stopped after the earlier recovery stage. The new History recovery therefore did not execute until a subsequent invocation.

The project repair added one-time self-hash comparison and `exec` restart after a self-changing pull, plus a regression preserving that contract. Project-local detector evidence and paid-call state remain in the Pangram repository.

## Limits

- Do not blindly re-exec after every update if the launcher is inside a transaction that cannot safely restart. Establish a transaction-aware restart boundary instead.
- If the update changes schemas or state formats, migration/recovery rules may need to run before re-exec.
- A hash change is not itself proof that the update is trusted; normal repository authority, signature/review, branch, and supply-chain controls still apply.
- This pattern does not authorize unattended package or repository updates where the project requires version pinning or owner approval.
