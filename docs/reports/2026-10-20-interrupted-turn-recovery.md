# Interrupted-turn recovery: saved artifacts were not enough

Status: owner-requested report for UDA maintainer review. No global prevention claim.
Origin: Joel Articles editorial task, 2026-10-20. The owner asked that this report reach the UDA lane before article work resumes.

## Observed failure
Long editorial turns were interrupted with the UI message “thinking failed.” Earlier delivered articles, scripts, reviews and test receipts were committed. Later uploads and some analysis derivatives were also saved. However, the new input cycle lacked a committed, current next-action checkpoint. The old article record still stopped at awaiting approval after approval and replacement wording had arrived. On resume, broad retrieval/setup/extraction repeated instead of proceeding to the unapplied edit. The owner detected the repetition.

The runtime and provider cause of “thinking failed” is unknown. This report does not diagnose a product defect, promise to prevent interruption, or claim every unsaved reasoning outcome was recovered. It describes the preventable rework after an interruption.

## Evidence and correction already made
- The prior delivered family remains in joel-articles commit 258d56f97d3d114ccd1f72462e76b8ef97341ad3.
- Exact new inputs and terminal owner answers were subsequently committed at 797cbb938d833000f10cfd236a2ef9b763fe5384, including state/tasks/community-innerchild-20261020/CONTINUATION.md and INPUT-MANIFEST.json.
- That checkpoint expressly says the requested new prose corrections and media merge were NOT yet applied; input transfer was not reported as editing.
- A fresh readback reconciled the isolated task branch and saved inputs. The current workflow resumes the actual unfinished operation, not an invented reconstruction of completed work.
- Some extracted reading copies existed only in the previous conversation runtime. A successor must check their presence; if absent, regenerate those derivatives from the archived raw inputs with that limited reason recorded. Do not classify all prior work as lost.

## Existing rule coverage
patterns/context-compaction-resilience.md already requires repository-first state, checkpoints after each meaningful step/owner decision, and recovery without repeating completed work. Adding another general instruction to “save your work” would not by itself fix this case. Please investigate the activation/enforcement gap at new-owner-input ingestion and interruption recovery, rather than simply duplicating that rule.

## Proposed bounded repair
1. When owner feedback arrives, durably record its identity, terminal decisions, supersession and the exact unapplied next operation BEFORE the next long operation. Do not retain a stale awaiting-owner status.
2. Pair each meaningful output with a short receipt: input identities, output location/identity, validation scope and result, state (prepared/applied/verified/delivered), and next action. Save pending discoveries/decisions in concise source-grounded notes; not private reasoning or transcripts.
3. At resume, inspect a compact completed-operation ledger before regenerating. Reuse an output when inputs and scope match and it remains accessible. Justify retries by changed input, missing artifact, failed check or unresolved external result. Required fresh rule activation is not permission to repeat completed research/extraction/edits.
4. Before a long external call, persist its intended operation and recoverable request identity. After ambiguous paid/irreversible calls, inspect existing job/result records before retrying. Compose existing paid-workflow and durable-write rules rather than duplicating them.
5. Save small coherent work-in-progress milestones during the turn, not just at final response or a usage threshold. A local write, a commit, a pushed/read-back checkpoint and a delivered artifact are different persistence levels.
6. Keep the recovery record small and discoverable. Do not create new bureaucracy, giant evidence dumps, full-suite reruns or a new service for every paragraph. The purpose is less repeated work and faster owner-outcome progress.

## Behavioural acceptance tests for the maintainer
Use fault injection or a fresh worker, not only tests asserting a rule file exists:
- Interrupt after new feedback is saved but before it is applied: next worker applies the pending operation without reasking the owner.
- Interrupt after output write but before receipt/commit: reconcile the actual file and complete the checkpoint, not blindly rerun generation.
- Interrupt after an external submission but before result capture: recover by request identity; no duplicate paid call.
- Lose the ephemeral runtime while retaining Git: regenerate only missing derivatives; preserve exact raw source and owner decisions.
- Change one source after a green result: invalidate only affected results; do not reuse stale passes or rerun unrelated suites.
- Compare recovery against an unchanged-input completed unit: no substantive re-execution without a recorded reason.

## Transfer limits and remaining work
The article case supports a recovery failure diagnosis, not a universal runtime fix. Broad provider/IDE hooks are proposals requiring existing-route investigation. Maintainer should decide the smallest enforceable binding and evaluate it; the filing agent is continuing the article task. No owner decision is missing for sending this report. The article task itself remains open.
