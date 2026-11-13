# Codex on defect D1: the reviewer's final message, as returned

1. **P1 — A passing final check now instructs delivery despite unfinished required research.**  
   `apps/research-mcp/src/final-check-messages.ts:76`

   The new instruction says to deliver immediately and defer inputs such as `community_leads`. Required searches and audits remain advisory in the finalizer, so a six-check pass can coexist with unexecuted Forum Signal or bidirectional work. This contradicts HRP `MandatoryTriggeredModuleCompletion`.

   **Adversarial test:** Use the passing `base()` fixture in `tests/finalize-unchecked-answer.test.ts`, overriding `community_evidence:"researched"`, `treatment_choice:"compared"`, `research_depth:"deep"`, and a hip-treatment verdict, with no research receipts. Required-work notes coexist with the new “give … now” instruction. Repair planning/delivery guidance without adding a seventh blocker.

2. **P1 — Required forum work can disappear from the recommended execution.**  
   `apps/research-mcp/src/research-steering.ts:703`

   Every task labelled `could_change:"detail"` is excluded, regardless of protocol applicability. A forum task’s presence also suppresses `PEOPLE_TASK_MISSING`, even when the recommendation excludes it. The resulting next step directs finalization without performing the required module.

   **Adversarial test:** Call `planResearch` in balanced mode with `steering_could_help:false` and one task: `{task:"Read patient reports about avoiding hip replacement",kind:"forum_thread",could_change:"detail"}`. It returns `recommended:[]` and `next:"go_on"`. The Project router requires Forum Signal for this question; expected informational value cannot waive execution.

3. **P1 — A same-site redirect can falsely verify the original thread as fully read.**  
   `apps/research-mcp/src/forum-tools.ts:197`

   The new `sameSiteRedirect` alternative signs the requested URL as an alias whenever the destination shares its registrable domain and is not the home page. Redirects to login, category, or unrelated thread pages therefore authenticate content that was never read. Finalization accepts that alias for source provenance and reading depth.

   **Adversarial test:** Request `https://forum.example.org/threads/123`; return a reader result for `https://forum.example.org/account/login` with `access_state:"read"`, 1,500 characters, and no pagination. The receipt signs the original thread’s digest as `ur` and completion as `e:"1"`. Declare the original URL as a fully read key source: its provenance and depth checks accept the substituted page.

4. **P1 — Repeat-pass guidance explicitly permits unchecked answer changes.**  
   `apps/research-mcp/src/final-check-messages.ts:85`

   After a second passing check, the result instructs the model to apply corrections with “no further check.” Those corrections can change claims, figures, or citations after the finalization receipt has signed the draft’s hash. The delivered answer consequently need not satisfy even the existing six checks.

   **Adversarial test:** Obtain two passes using the first result’s `round_token` and `carry_forward`, then apply a newly discovered dose correction, changing `5 mg` to `50 mg`. Following this instruction delivers the modified answer without verification; its hash differs from the signed `answer` claim.

5. **P1 — An old allocation bypasses an unanswered changed-menu decision.**  
   `apps/research-mcp/src/research-steering.ts:725`

   `answered` takes precedence over `changed`. Any allocation naming an unfinished task counts as approval, including an allocation copied from the previous menu. A material fork can therefore remain unanswered while the tool directs continued research and eventual delivery.

   **Adversarial test:** Approve task 1 for five minutes. Before task 1 finishes, append a conclusion-changing task, pass the previous `menu_digest`, and retain `allocation:[{task:1,minutes:5}]`. The handler detects `menu_changed:true` but returns `next:"go_on"`. The allocation needs a binding to the menu actually approved.

6. **P2 — The menu digest does not identify the tasks it supposedly protects.**  
   `apps/research-mcp/src/research-steering.ts:159`

   The digest includes only kind, impact category, and loop. Replacing a source, intervention, or task—or swapping two tasks with identical metadata—leaves it unchanged. This defeats changed-plan detection independently of the stale-allocation issue.

   **Adversarial test:** Digest `{task:"Read the oral-treatment trial",kind:"full_text",could_change:"conclusion"}`, then replace its text with `"Read the injected-treatment trial"` while preserving the other fields. Both digests are identical. With no completed tasks or allocation and `steering_could_help:false`, replanning returns `go_on` without `menu_changed`, although the original task remains unfinished. Use stable task/source identities so rewording need not trigger approval but substantive replacement does.
