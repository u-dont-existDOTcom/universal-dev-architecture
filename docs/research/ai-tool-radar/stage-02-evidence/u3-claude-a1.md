# Claude on unit 3: the reviewer's final message, as returned

I found four correctness defects, all P2. Nothing I found blocks the main flows (marking, the challenges page, the reading summary, linked readings or the notice step). I didn't run any tests.

**1. P2: a hidden mark makes a finding's page claim a quick AI answer misses it.** `apps/research-mcp/src/atlas/pages.ts:934`
- `quickAnswerWords` (and `challengeBox`) only see `finding.challenge`. The pages blank that out in two places while the finding stays shown:
  - `shownChallenge` (`apps/research-mcp/src/atlas/page-data.ts:199`) drops a mark whose text fails the page guard or whose link opens YouTube.
  - `pageChallengeOf` in `atlas-pages.ts` drops one that fails `validChallengeMark`.
- **Scenario:** an unreviewed, unkept publication shows only because of its mark, with verdict `fail`. Its stored `usual_view` holds U+FFF9. The 0030 CHECK and `mark_atlas_challenges` accept it, since U+FFF9 isn't in the SQL list, but `validChallengeMark` refuses it on read.
- **Result:** the page drops the mark and the status falls through to "A separate AI found that a quick AI answer misses it." That is the statement NOT_CLEARABLE exists to prevent.
- The same happens if a mark's link host is later added to `YOUTUBE_HOST`.

**2. P2: one bad mark blocks every `list_challenges` and `clear_challenge` call.** `packages/evidence-repository/src/atlas-publications.ts:980`
- `challengeFromRow` throws `INPUT_INVALID` for any row that fails the strict re-read, and `inspectChallenges` passes every marked row through it.
- The SQL check is looser than the JS one: it allows format characters outside its list (U+0600–U+0605, U+FFF9–U+FFFB, tag characters), and `btrim` only strips ASCII spaces, so other edge whitespace passes.
- **Scenario:** one such row exists. `list_challenges` fails, and so does `clear_challenge` for any P number, because its pre-check (`challenge-review.ts:157`) calls `inspectChallenges()` outside the try/catch.
- This lasts until someone re-marks that exact row with valid text.

**3. P2: the clear guard can be bypassed through keep, clear, show.** `packages/evidence-repository/migrations/0030_atlas_challenges.sql:128`
- NOT_CLEARABLE only refuses while the finding is unreviewed and not kept, and nothing else keeps the verdict.
- **Scenario:** an unreviewed `fail` finding is shown for its challenge. Then:
  1. `keep_for_research` keeps it.
  2. `clear_challenge` is now allowed, and the mark and verdict are deleted.
  3. `show_on_pages` shows it again.
- **Result:** it shows unreviewed and unmarked, and `statusBlock` says "A separate AI found that a quick AI answer misses it." The guarantee the change documents doesn't hold, and `show_on_pages` has nothing left to check.

**4. P2: a report page says no one else reported when the reports were only hidden.** `apps/research-mcp/src/atlas/report-pages.ts:201` (rendered at :213)
- `researchSection` now removes `others` entries whose link opens YouTube or fails the guard, then renders as if they never existed.
- **Scenario:** a report's research was stored with one other report at `https://youtube.googleapis.com/…`. The old `YOUTUBE_HOSTS` list allowed that host; `opensYouTube` now catches it.
- **Result:** the page says "No one else’s report was found yet." and the outcome counts leave that report out, though the research did find one. It should say that some reports aren't shown.
