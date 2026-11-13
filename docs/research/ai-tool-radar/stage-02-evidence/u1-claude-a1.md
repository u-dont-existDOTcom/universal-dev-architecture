# Claude on unit 1: the reviewer's final message, as returned

I found five issues, all P2. Nothing I traced in the core logic crashes, corrupts data, or traps a client in a loop. The repeat-pass round state, the carried-state fallback, the `plan_next` write and read path with its migration check, and the runtime-versus-published output schemas all line up. The five problems are instructions that contradict each other, a token that older servers will reject, and two places in the research-menu text that send the wrong signal.

**1. P2: on a repeat pass, the result gives two opposite instructions about closing questions**
- `apps/research-mcp/src/register-tools.ts:2821` adds `CLOSING_QUESTIONS_GUIDANCE` under every status, including a pass marked `turn_already_passed`. That text says to close the answer with up to three questions.
- The same result then ends with `REPEAT_PASS_GUIDANCE` (`final-check-messages.ts:85-89`), which says to add no closing questions the checked draft doesn't have and not to call `finalize_research` again.
- Scenario: a draft with no closing questions passes, then passes again in the same turn. The second result tells the model both to add the questions and not to. If it follows the first instruction, the answer goes out with new claims and figures under the "checked" line that no check read, which the 12 Nov comment says this change was meant to prevent.

**2. P2: older servers reject new round tokens**
- `apps/research-mcp/src/check-rounds.ts:39-40` adds `passed` to a `.strict()` schema, and the token stays at `v: 2`.
- The file's own comment notes that several servers sign with the same secret. A server still on the previous image (rollback, or a mixed fleet during deploy) will reject any token with `passed: true`.
- Scenario: a turn passes on a new server, and the next call lands on an old one. The token is ignored, so the call starts a new turn at round 1. The 10-round cap resets, and `checkCarriedState` treats the turn as a different one, so it can report the previous check as unpassed.

**3. P2: the published `finalize_research` description stops clients from sending what repeat-pass detection needs**
- Detection depends on `round_token` coming back after a pass (`research-finalization-gate.ts:2035`). Without a token, `readCheckRound` makes up a new random turn id, so the carried-state fallback can never match either.
- But the frozen published description (`register-tools.ts:2526`) still says to pass `round_token` only "after a not_ready result in this turn".
- Scenario: a client that follows the published contract passes, edits the draft and calls again without the token. It gets `FIRST_PASS_GUIDANCE` again ("call finalize_research once more…"), and `turn_already_passed` never fires. For those clients, the main goal of this change (cutting extra checks after a pass) silently doesn't happen.

**4. P2: a 0-minute allocation is described as "detail only"**
- `apps/research-mcp/src/research-steering.ts:427` counts an allocation like `[{task: 1, minutes: 0}]` as the person's answer, even when task 1 "could change the conclusion". Line 453 then filters it out, leaving `recommended = []`.
- `planResearchText` then shows `NOTHING_RECOMMENDED` (line 536), "the open tasks add detail only", followed by "Go on now: do these tasks in this order".
- Scenario: the person skips the conclusion-changing task by giving it 0 minutes. The model is told the open tasks are only detail, which is false, and is given an empty task list to "do".

**5. P2: the answer rule for a re-plan menu leaves out `done`**
- When a re-plan asks (`replanned`, line 478), the menu marks tasks "(done)". But the rule for the person's reply (`research-steering.ts:608`) says to call `plan_research` again with "the same plain_answer_receipt and tasks … and their allocation", with no mention of `done`.
- Scenario: after a re-plan ask, the model follows the rule word for word. The next menu loses the done marks, and `allocationAnswered` (line 427) treats an allocation naming an already-done task as a fresh open task. That task can then be recommended and done a second time.
