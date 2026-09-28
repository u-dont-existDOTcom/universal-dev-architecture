# Journal work runner: task specification

NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT

Status: task for Codex, 2026-09-28. Written by Claude (Opus) at the owner's request that the remaining engineering go to Codex and Mission Control. Nothing here is deployed, and deployment needs the owner's approval naming the step.

## Purpose

The owner's InnerSignal journal importer (repository `innerSignalGraph`) publishes each model call as an encrypted work item in a private exchange directory. For each item it also writes a plain, content-free dispatch record. A fresh ChatGPT chat with the InnerSignal app enabled then does the call:

1. It fetches the item with the app's `get_journal_work_packet` tool.
2. It does the work.
3. It stores its answer with `submit_journal_work_result`.

The first valid answer for a work ID wins.

This task adds a relay command, `journal-work`, that runs those chats on the owner's ChatGPT Pro account through the relay's existing browser layer. It is a job runner. It needs none of the supervision, receipt or Project Manager machinery, and must not change their behavior.

## Hard rules

- The runner never reads, stores or logs journal text, packets or answers. What it knows about an item is the dispatch record: work ID, role, schema name, model, effort, tier, issue and expiry times, and whether it has been answered. What it logs is limited to those fields, times, outcomes and counts. Add a test that fails if page text reaches a log or state file; use a sentinel string on the fake page.
- It only sends the fixed instruction below, filled in with a work ID from the listing.
- No secrets, private paths, account identifiers or conversation URLs in Git. Configuration comes from the relay's private environment.
- Keep the relay lock, the automation-owned browser fence and the central submission scheduler. The runner is one more client of those; it isn't a way around them.

## The dispatch listing (input)

InnerSignal is adding a content-free command for the host that holds the exchange (its Task 1): `npm run journal:work -- dispatch --json` in its checkout. It prints one JSON object per line:

```json
{"work_id":"<opaque>","role":"extractor","output_schema_id":"extraction-result","model":"GPT-5.6 Sol","effort":"Pro","tier":"standard","issued_at":"<ISO>","expires_at":"<ISO>","answered":false}
```

The runner calls it through a configured command (for example `MC_JOURNAL_DISPATCH_COMMAND`), treats a non-zero exit as "no work, try later", and validates every field. Until InnerSignal ships the command, the tests use a fake command that prints fixture lines.

## One pass

1. Read the listing. Choose the oldest record that:
   - has `answered` false and has not expired;
   - has `tier` equal to `standard`;
   - has a `model` and `effort` that the configured account offers (for the Pro account, `GPT-5.6 Sol` and `Pro`).
2. Open a fresh conversation with `createFreshChatTarget`.
3. Set the model and thinking effort with `ensureExactConsumerControls`, using the same control observations the relay uses today.
4. Enable the InnerSignal app with `selectAppsForMessage`, using a configured label. If the app is missing, fail closed and record an owner action.
5. Submit exactly this text with `submitExactMessage`, which keeps its body-hash check:

   > Private InnerSignal journal work item `<work_id>`. Call get_journal_work_packet with this work_id, follow its instruction using only its packet, then submit your JSON answer with submit_journal_work_result. If it lists schema problems, fix them and submit again. Reply only: done.

6. Wait with `waitForGenerationComplete`, then read the listing again. The item is done only when `answered` is true. What the page says doesn't count.

## When an item isn't answered

Climb this ladder until the item is answered or expires:

1. **Continue.** Use the relay's existing continue recovery.
2. **Retry.** Use the existing failed-continue retry.
3. **Fresh chat.** Start a fresh conversation with the same work ID. This is safe: the exchange keeps the first valid answer, so a second chat can't overwrite it.

Record which rung resolved each item.

## App write confirmations

ChatGPT sometimes asks the user to confirm an app's write action.

- Add a detector that returns a structured observation of a confirmation dialog: whether there is one, the app name and the tool name it shows, and which buttons it offers. It returns no other text.
- Approve only a dialog that names `submit_journal_work_result` for the InnerSignal app. If the dialog offers an "always allow" choice for that app, choose it once.
- Any other confirmation stops the item and records an owner action. The runner never approves it.
- Test the detector with DOM fixtures. The pilot then calibrates it against the live page, and the owner approves the pilot.

## After an answer lands

The importer makes one call at a time. Once it has read an answer, it publishes the next item on its next run.

- After each answered item, start one import run through a configured command (for example `MC_JOURNAL_IMPORT_COMMAND`, which runs `npm run journal:import -- run --config <private path>` in the importer's private environment).
- Record only the run's exit code and its content-free summary fields: stage, blocker, completed units, and residual counts.
- Never run two import runs at once. The importer also holds its own writer lock.

## Pacing and adapting

- Work one item at a time per account.
- Back off with growing delays, and record each event, on:
  - "too many requests";
  - a model-unavailable or capacity message;
  - the relay host running short of memory.
- Count completions per UTC day against a configured allowance (about 170 Pro calls a day). Slow down before reaching it rather than hitting it.
- Keep these per-account settings in the relay's state, not in constants, so they can be tuned from observed results: pace, back-off and the fresh-chat threshold. The owner wants Mission Control to learn and adapt rather than run on fixed rules. Record each outcome in a form a later pass can read to adjust them.

## Status for the dashboard

Write a content-free status file (for example `journal-work-status.json`) in the relay's runtime directory. It holds:

- the current work ID and its rung;
- the counts answered, expired and waiting today;
- the back-off state;
- the time of the last import run and its content-free summary.

## Tests

Use a fake browser that implements the methods above and a fake listing command. Cover:

- the happy path;
- each rung of the ladder;
- an item that expires;
- an answer that arrives from an earlier chat;
- a missing app;
- an approved confirmation, and a refused one;
- each back-off trigger;
- the daily allowance;
- a failing listing command;
- the import run after an answer, and never two at once;
- content-free logs and status, checked with the sentinel.

Run the relay's own tests (`npm test` in this directory) and the repository gates in `.github/codex-repository.json`.

## Later phase, not in this task: the hardest-case lane

InnerSignal will mark some items `tier: "hardest"`. These are steps that failed all their standard attempts. Claude Opus answers them, through Claude Code signed in to the owner's subscription, and this runner must skip them.

A separate Claude worker will:

- run `claude -p --model opus --output-format json` with the same instruction;
- keep its own app principal, so the record shows which lane answered;
- write each item's reported usage to a content-free usage log. The dashboard shows that log as the Claude usage meter the owner asked for.

That phase waits on InnerSignal's `tier` field and on the owner's decisions about it.
