# Claude on defect D1: the reviewer's final message, as returned

I found 8 problems in the new steering and final-check code, 4 of them P1. They are ranked most serious first. I only read the code; no tests were run and nothing was changed.

**1. P1: An allocation the person never gave lets research skip the ask and the forum nudge.**
`apps/research-mcp/src/research-steering.ts:661-664`, `:724-726`; `apps/research-contributor-access-tool.ts:1278,1282`
- `allocationAnswered` only checks that the allocation names a task on the menu that isn't done. Any such allocation sets `next = "go_on"`, for every style including guided.
- A first `plan_research` call has no `menu_digest`, so the person cannot have answered a menu AskRigor showed them. The server can tell this exactly from the missing digest, but doesn't check it.
- Because an allocation is present, `numbered` is true, so the `PEOPLE_TASK_MISSING` prompt to add a people's-reports task is suppressed too. In the 10 Nov runs the AI already made up allocations three times.
- **Test:** guided or balanced account; first call with tasks `[{study_search, conclusion}, {full_text, conclusion}]`, `allocation: [{task:1, minutes:5}]` and no `menu_digest`.
  - Expected: `next: "ask"` and `PEOPLE_TASK_MISSING` in the text.
  - Today: `go_on`, and no forum prompt.

**2. P1: The person's allocation is applied to a menu that changed after they saw it.**
`research-steering.ts:724-726`
- `answered ? "go_on"` comes before `changed ? "ask"`. The digest detects the change but is ignored whenever an allocation is present.
- **Test:**
  - The ask showed `[1 forum_thread/conclusion, 2 study_search/conclusion, 3 full_text/confidence]` with digest D.
  - The person replies "1. 5 min, 3. 3 min".
  - The AI calls again with the forum task dropped: `tasks [study_search, full_text]`, `allocation [{1,5},{3,3}]`, `menu_digest D`.
- Today the result is `menu_changed: true` but still `go_on`. The 5 minutes go to the study search, and task 3 is only mentioned in a "left out" note. The forum task the person chose disappears without them being asked. Expected: `ask`.

**3. P1: Balanced research silently drops tasks that could change the conclusion.**
`research-steering.ts:703-710`, `:922-923`
- The recommendation skips any task that would take the total past `checkBackMinutes`, even a conclusion-changing one.
- The balanced/guided go-on text then says "do these tasks… then check the answer with finalize_research and give it in this turn". It never checks back and never discloses the skipped tasks. The autonomous branch does both.
- This breaks HRP's continuation-handoff and completion-disclosure rules.
- **Test:** balanced, `checkBackMinutes: 3`, `steering_could_help: false`, tasks `[{full_text, conclusion}, {forum_thread, conclusion, sources:2}]`.
  - Result: `recommended=[{1,2}]`, `next: "go_on"`.
  - Task 2 is never done, never offered, and not mentioned in the answer, which can still pass the final check.

**4. P1: Text written after a repeat pass goes out under the check line without being checked.**
`apps/research-mcp/src/final-check-messages.ts:85-89`; `check-rounds.ts:168-169`; `research-finalization-gate.ts:2035-2036`
- `REPEAT_PASS_GUIDANCE` tells the AI to "give this checked answer_draft… word for word" and also to "make in the answer, with no further check, any fix its notes and limits call for". The note being fixed can be about a quote not in the paper or a figure, which is the shown-figures check's job.
- That brings back the 22 Oct problem class (text reworded after the check, which no check read; `register-tools.ts:2838-2840`), and the answer still ends with `check_line`.
- The `passed` flag lives in a round token valid for 2 hours and tied only to `research_target`. A later turn ("continue") that sends that token back gets `turn_already_passed` on its very first check.
- **Test:** turn 1 passes; turn 2 calls `finalize_research` with turn 1's `round_token` and a passing draft. Expected: no `turn_already_passed`. Today it is set, and the result says to apply fixes with no further check.

**5. P2: The framing and guided asks don't meet HRP's steering rule.**
`research-steering.ts:547-553`, `:534-546`
- Guided style's reply is "one line confirming the question you will research and asking for their yes". HRP RO5, through Universal's approval gate, says a bare "approve or modify" request fails.
- The framing questions also carry no recommended default, alternatives, or what each choice changes, which RO5 requires.
- **Test:** guided account, framing with no `redirecting_questions`. Expected: a specification with defaults. Today: a request for a yes and nothing else.

**6. P2: In Claude Code, the model never sees the forum prompt or the target-mismatch warning.**
`research-steering.ts:940-957`; `research-contributor-access-tool.ts:1292`
- Claude Code hands its model only the structured content (`docs/claude-connector.md:15-17`).
- `planNextStep` leaves out `PEOPLE_TASK_MISSING`, the registered-target warning, `NEW_FORK` and the rule for the person's reply. It says only "show the tasks" or "do the recommended tasks… then finalize_research".
- **Test:** on the Claude surface, send a first menu with no forum task and a mismatched `research_target` plus a valid receipt. `structuredContent.next_step` has neither instruction.

**7. P2: The changed-question rule turns off the plain-answer comparison check.**
`research-steering.ts:898-900`
- After the screen, the rule says to "register the plain answer again for the new research target first". That registration comes after the screen's research receipts.
- `registeredPlainAnswer` (`research-finalization-gate.ts:5473-5478`) then returns `after_research`, so the comparison with the quick answer (the sixth blocking check) quietly stops applying.
- Sending `framing` with it can also trigger a second framing ask.
- **Test:** register plain answer for T1 → screen receipt R1 → menu asks → person rewords the question → register plain answer for T2 → `finalize_research(T2, receipts [PA2, R1])`. Today: `plain_answer.status = "after_research"`, no comparison.

**8. P2: Nothing carries the receipts across an ask.**
`research-steering.ts:795-799` (`ASK_NOW`)
- An ask ends the turn and forbids `finalize_research`, which is the only thing that issues a carried state. The ask reply itself contains no receipt.
- The next turn needs the `plain_answer_receipt`, the screen receipts and the `menu_digest`, and depends on the app keeping turn 1's tool results.
- If they're lost: the next `plan_research` call has no digest or receipt, so the target and change checks are skipped, and finalize returns `no_receipt`, so the plain-answer comparison doesn't run.
- **Test:** turn 2 calls `plan_research` with an allocation but no `menu_digest` or receipt (this also triggers finding 1), then `finalize_research` without the plain-answer receipt.
