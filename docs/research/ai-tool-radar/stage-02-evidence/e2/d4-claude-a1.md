# Claude on defect D4: the reviewer's final message, as returned

I found 9 problems in patch cbd90d46. One is P1 and the other eight are P2.

**How I checked:** I reviewed the tree as it stands after the change. I could not compare against `origin/main`: there is no network access, and the command to check for a local `origin/main` ref needed approval, so I skipped it. I did not run any tests. Each finding below is tied to the line where it happens.

### 1. [P1] A partial fact-check passes with no limit saying it is partial
- **Where:** `apps/research-mcp/src/research-finalization-gate.ts:2693`, with the note text at `claim-coverage.ts:99-103`.
- **What goes wrong:** Claims that are missing or marked `not_addressed` only produce a note (`addStep("declaration", …)`). Nothing is ever added to `limits`, and `limits` is the only thing the panel shows under a passing answer (gate lines 1586 and 1944).
- **Notes also disappear:** a note already given earlier in the same turn is replaced by "One note an earlier check of this turn gave is not repeated" (gate lines 4583-4586).
- **Failing fixture:**
  - Receipt: `youtube_video_claims {video:V, mode:"claims", n:22}`.
  - `later_inputs.claim_coverage`: `V#1` is `assessed` and `V#2` to `V#22` are `not_addressed`.
  - The draft is otherwise clean.
  - Result: the status is unchanged (the new test asserts `covered.status === result.status`). `result.limits` says nothing about the 21 unassessed claims, and the panel under the check line looks like a full fact-check.
  - A second identical call in the same turn shows only the "not repeated" line.

### 2. [P2] Claims the video made but Gemini didn't list are never counted
- **Where:** `apps/research-mcp/src/gemini-video-tool.ts:468`, and `claim-coverage.ts:61`.
- **What goes wrong:** The receipt signs only `{video, mode, n}`. `more_claims_not_listed` is neither signed nor checked, and the guidance at line 479 only asks the answer to cover the claims that were listed.
- **Failing fixture:** Gemini returns `more_claims_not_listed: true` with n=22, and all 22 ids are declared `assessed`. The result has no note and no limit, so the answer can present itself as a complete fact-check of a video it only partly listed.

### 3. [P2] When a video is read twice, the coverage note gives a false and harmful instruction
- **Where:** `claim-coverage.ts:57`, with the note text at lines 82-84.
- **What goes wrong:** Only the latest claims-mode reading is used. Ids are just positions and are not tied to claim content.
- **Failing fixture:**
  - Receipts: reading A (n=22, t=100) and reading B (n=5, t=200), both for the same video V and both passed.
  - Coverage declared for `V#1` to `V#22`.
  - The note says `V#6` to `V#22` are ones "which no extract_youtube_video_claims receipt passed here lists: leave them out". That is false (A's receipt was passed), and following it deletes coverage for 17 claims that really were listed.
  - The reverse case (A has 5, B has 22) silently applies A's statuses to B's claims #1 to #5, which may be different claims.
- **Test gap:** the existing test only covers the case where the latest reading has more claims.

### 4. [P2] A repeated claim id hides `not_addressed`
- **Where:** `claim-coverage.ts:79`.
- **What goes wrong:** `statuses.set` keeps the last entry for an id, with no note about the duplicate.
- **Failing fixture:** `[{claim_id:"V#3",status:"not_addressed"},{claim_id:"V#3",status:"assessed"}]` with n=3 and `V#1`/`V#2` `assessed`. No note is produced.

### 5. [P2] One incident can get two reports, each called "the one report"
- **Where:** `apps/research-mcp/src/register-tools.ts:1021-1024` and `register-tools.ts:2792-2795`.
- **What goes wrong:** Both instructions can appear in the same result text. Each says it is the incident's only report, and the server has no incident key to stop the second one (`existing_candidate` only deduplicates on the lesson text).
- **Failing fixture:**
  - `corrections:[{by_user:true, report:{…}, retracted:"X", change:"Y"}]`, and the draft keeps "X" for 3 rounds, so the retractions check stops and returns `check_report_token`.
  - The result says both "pass check_report_token … It is this incident's one report" and "pass its preventing_rule … It is this correction's one report".
  - The AI then makes two `submit_lesson_candidate` calls, which save two candidates.
- **Test gap:** no test covers the stopped-check-plus-correction case.

### 6. [P2] A user-reported factual error is filed as a lesson, then told defects need a bug report
- **Where:** `apps/research-mcp/src/lessons/connector-tool.ts:87-89` and `:124`; `docs/owner-regressions.md:913` and `:922`.
- **What goes wrong:**
  - A user correction is routed to `submit_lesson_candidate` (register-tools line 2793), which replies "Lesson saved for review as ARL-…".
  - That reply then says a debuggable defect "gets one detailed bug report … never both".
  - On accounts with detailed reports off, `detailed_report` is refused (line 16 and line 153).
- **Failing fixture:** the regression's own "Defect" prompt ("cited a study for a claim the study doesn't make"). A run that follows the server's instructions sends a lesson, and is then nudged towards also sending a bug report. Either it fails "one detailed bug report, no lesson", or it sends both.

### 7. [P2] The audit-error repair never reaches the Custom GPT Action surface
- **Where:** `apps/research-mcp/src/actions/open-full-text-route.ts:887`, `actions/router.ts:190`, and the plan doc at `docs/superpowers/plans/2026-11-07-next-build.md:72`.
- **What goes wrong:** `AuditSourceMismatchError` is rethrown, and the router turns it into HTTP 500 `action_internal_error` with `retryable: false`.
- **Failing fixture:** a Custom GPT sends `validate_study_method_audit` with the DOI against a PMCID acquisition. It gets an opaque 500 that looks like a server fault, with nothing saying which check failed or what to resubmit.
- **Why it matters:** the plan marks C1 "built" and #431 was a ChatGPT run, yet on this surface the original incident is unchanged.

### 8. [P2] The refusal coaches copying the acquired identifier even when it is a different paper
- **Where:** `apps/research-mcp/src/actions/audit-source.ts:94-95`, with the check at lines 41-43.
- **What goes wrong:** Every identifier mismatch gets "resubmit it with these values … to validate it". There is no check of whether the identifier sent is an alias of the acquired document (its `doi`, `pmid` or `pmcid`) or names another paper.
- **Failing fixture:**
  - Acquired source: `{primary_identifier:"PMC7654321", doi:"10.5555/other"}`.
  - Audit sent `source_primary_identifier:"10.5555/intended"`.
  - The refusal tells the AI to send "PMC7654321". The audit then validates on the wrong paper, and the identity check becomes a copy-paste step.

### 9. [P2] The regression case for #431 never exercises the claim-coverage fix
- **Where:** `docs/owner-regressions.md:868`, with the pass criteria at `:891`.
- **What goes wrong:** Prompt 1 is a pasted transcript, so `extract_youtube_video_claims` is never called. That means no ids, no receipt and no `claim_coverage` check (the limit is stated at `docs/final-check.md:536`).
- **Failing scenario:** a repeat of the actual incident — a video read by the tool, 22 claims listed, a few answered — is not reproduced by this case. It can pass without ever touching the new code path, since line 891 only applies "when the run reads a video instead".
