# Journal Claude worker and usage meter: task specification

NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT

Status: task for Codex, 2026-09-28. Written by Claude (Opus) at the owner's request that the remaining engineering go to Codex and Mission Control. It builds on the journal work runner (`JOURNAL-WORK-RUNNER.md`) on this branch. Nothing here is deployed, and deployment needs the owner's approval naming the step.

## Purpose

InnerSignal's journal import marks some work items `tier: "hardest"`. Each is a step that failed all its standard attempts. The owner decided that Claude Opus answers these, through Claude Code signed in to his subscription, on the host that runs the import. This task adds three things:

1. A worker command, `journal-claude`, that answers hardest items one at a time.
2. A content-free usage log and summary for the Claude lane.
3. A small read-only status page for Mission Control. It shows the journal runner's state and a Claude usage meter.

The journal work runner skips hardest items. This worker takes only those.

## Hard rules

- The worker never reads, stores or logs journal text, packets or answers. Claude Code fetches the packet and submits the answer through InnerSignal's local work server; the worker only starts Claude Code and reads the dispatch listing.
- It never stores Claude Code's `result` text or `session_id`. The only exception is while checking an error result for the usage-limit message, and even then it keeps only a category and a reset time.
- No secrets, private paths, account identifiers or conversation IDs in Git. Configuration comes from the relay's private environment. Claude Code authenticates with `CLAUDE_CODE_OAUTH_TOKEN` from that environment, which the owner creates with `claude setup-token` at deployment. The worker never logs, copies or writes it.
- It does nothing unless `MC_JOURNAL_CLAUDE_ENABLED=1`.
- Add a test that fails if text from the fake Claude run or the fake packet reaches a log, status or usage file. Use a sentinel string.

## Configuration

- **`MC_JOURNAL_DISPATCH_COMMAND`**: the same listing command the runner uses. Reuse the runner's reader and validation.
- **`MC_JOURNAL_WORK_MCP_COMMAND_JSON`**: a JSON array giving the command that starts InnerSignal's local stdio work server for this lane, without a shell. For example:

  ```json
  ["npm", "--prefix", "<checkout>", "run", "--silent", "journal:work:mcp", "--", "--config", "<private run config>", "--principal", "claude-hardest", "--tier", "hardest"]
  ```

  The worker writes an MCP config file with one stdio server named `journal` that runs it. The file goes in the relay's state directory, with mode 0600.
- **Claude Code**:
  - `MC_CLAUDE_BIN` (default `claude`);
  - `MC_CLAUDE_MODEL` (default `opus`);
  - `MC_CLAUDE_EFFORT` (default `max`);
  - `MC_CLAUDE_TIMEOUT_MS` (default 30 minutes).
- **`MC_JOURNAL_IMPORT_COMMAND`**: the same import command the runner uses.

## One pass

1. Read the listing. Choose the oldest record with:
   - `tier` equal to `hardest`;
   - `answered` false;
   - an expiry that hasn't passed.
2. Run Claude Code once for it, in a new empty temporary directory, so no project settings or CLAUDE.md apply:

   ```text
   claude -p "<instruction>" --model <model> --effort <effort> --output-format json
     --mcp-config <file> --strict-mcp-config --tools ""
     --allowedTools mcp__journal__get_journal_work_packet mcp__journal__submit_journal_work_result
     --permission-mode dontAsk --no-session-persistence
   ```

   - The instruction is the runner's fixed instruction, with the work ID filled in.
   - Build the argument list without a shell.
   - On timeout, kill the whole process group.
3. Parse the JSON result and keep only these fields:
   - `is_error`, `subtype`, `duration_ms`, `num_turns`, `total_cost_usd`;
   - from `usage`: `input_tokens`, `output_tokens`, `cache_creation_input_tokens` and `cache_read_input_tokens`;
   - the same four token counts per model from `modelUsage`, when present.

   Tolerate any of them being missing.
4. Read the listing again. The item is done only when `answered` is true; what Claude Code printed doesn't count.
5. If it isn't answered, run Claude Code once more. If it still isn't answered, record `unanswered` and move on. InnerSignal pauses the import and sends the item again after it expires, so nothing is lost.
6. After an answered item, start one import run, exactly as the runner does. Share the runner's import-run lock, so the two never run imports at once.

Work on one item at a time, with the worker's own lock file.

## Usage limits

When Claude Code returns an error saying the subscription's usage limit is reached:

- Record a `limited` event, with the reset time if the message gives one. Parse only the time.
- Send nothing more until that time. If there is no reset time, wait `MC_CLAUDE_LIMIT_BACKOFF_MS` (default one hour).
- Never retry in a tight loop.

## Usage log and meter

- Append one JSON line per Claude Code run to `claude-usage.jsonl` in the relay's state directory:

  ```json
  {"at":"<ISO>","lane":"journal-hardest","outcome":"answered|unanswered|error|limited|timeout","duration_ms":0,"num_turns":0,"input_tokens":0,"output_tokens":0,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"cost_usd_equivalent":0}
  ```

- Keep `claude-usage-summary.json` up to date. It holds, for today (UTC) and the last seven days:
  - runs, and items answered;
  - tokens and cost equivalent;
  - limit events;
  - the time sending resumes, if it is paused for a limit.
- `cost_usd_equivalent` is what Claude Code reports as `total_cost_usd`. On a subscription it isn't a charge. Label it that way wherever it is shown.
- If the installed Claude Code offers a documented, non-interactive way to read the plan's current usage (check `claude --help`), include it in the summary. Otherwise leave it out. Never call undocumented endpoints or scrape the interactive interface.

## Status page

Add `bin/mc-status.mjs`: a read-only HTTP server bound to 127.0.0.1 (`MC_STATUS_PORT`, default 8787). It renders one HTML page from the state directory, with no external assets. It refreshes itself every 30 seconds with a meta tag. It shows:

- **The journal runner**, from `journal-work-status.json`:
  - the current item's role and ladder rung;
  - today's answered, expired and waiting counts;
  - the back-off state.
- **The Claude lane**:
  - the usage meter from `claude-usage-summary.json`;
  - whether sending is paused for a limit, and until when.
- **The last import run's content-free summary**:
  - its stage and blocker;
  - completed units;
  - residual counts;
  - the hardest-lane counts: sent today and the daily limit.

It shows only the fields listed here.

Also add:
- a systemd user unit example next to the relay's;
- `scripts/mc-status-tunnel.sh <ssh-host>`, which opens an SSH tunnel from the owner's laptop and prints the local address.

## Tests

Use a fake `claude` executable (a script that prints fixture JSON and records its arguments) and the runner's fake listing. Cover:

- the happy path, with the exact argument list;
- an item counted as done only when the listing says `answered`;
- the second run, then `unanswered`;
- a timeout that kills the process group;
- a usage-limit error with a reset time, and one without;
- the shared import-run lock;
- the usage summary across a UTC day boundary and a seven-day window;
- the status page showing only the listed fields;
- content-free logs, status and usage files, checked with the sentinel;
- nothing running without `MC_JOURNAL_CLAUDE_ENABLED=1`.

Run the relay's own tests (`npm test` in this directory) and the repository gates in `.github/codex-repository.json`. Record the change in `state/CURRENT-STATE.md`.
