# Claude on unit 2 (rerun): the reviewer's final message, as returned

I found two defects in this change, both P2 (they only affect non-blocking notes). The rest of the diff checked out. Tests were not run, as instructed.

### 1. P2: forum entries with user-pasted reports are now asked for reader receipts
**Where:** `apps/research-mcp/src/research-finalization-gate.ts:2158-2161`

**What changed:** For `forum` and `patient_organization` entries, `refused` used to be true for any `access_boundary` other than `no_relevant_results` or `retrieval_failed`. Now it is true only when `readerStops(search).fits`. `FITTING_READER_STOPS` has entries only for `blocked`, `login_required` and `retrieval_failed`, so `fits` is always false for `supplied_by_user`, `not_found` and `no_web_search`. Those entries no longer skip the thread-receipt check.

**Scenario:** The user pastes posts from a patient forum. The AI declares `{platform: "forum", access_boundary: "supplied_by_user", threads_read: [{url: …}]}`. No `forum_thread_read` receipt exists, because AskRigor never read the pages. The check now adds: "community_searches for X declares threads read, but no receipt … read them with read_forum_thread … or leave the community out of community_searches and don't present it as read."
- That tells the AI to drop or re-read reports the user supplied, which contradicts what `supplied_by_user` means.
- The new code comment and `docs/final-check.md` say only "such a boundary" (`blocked`, `login_required`, `retrieval_failed`) should lose the exemption.

**Fix:** Apply the `readerStops` condition only when the boundary is in `ATTEMPTED_BOUNDARIES`.

### 2. P2: the source-line shape note says a line was left out when it was kept
**Where:** `apps/research-mcp/src/research-finalization-gate.ts:1225-1228`

**What's wrong:** `SOURCE_LINE_SHAPE_NOTE` ("a line was left out because of its shape … with these five fields and no others") is pushed whenever a raw line fails the strict `sourceLineSchema`. But `salvageFinalizeInput` has already salvaged that same raw input, and it keeps a strict object after dropping unknown keys (`salvage-finalize-input.ts:73-97`).

**Scenario:** The AI sends `{source, claim, sentence, conclusion, against, study_id: "x"}`.
- Salvage drops `study_id` with a "dropped an unknown field" note, keeps the line, and the line is looked up.
- The result also says the line "was left out" and asks the AI to check the answer again, which can cost a check round for nothing.
- A line that fails only on length (for example `claim` over its maximum) gets the same "shape" note, which names the wrong fix.

**Fix:** Decide the note from what salvage actually dropped (the parsed `source_lines` count against the given count), not from a fresh strict parse of the raw lines.
