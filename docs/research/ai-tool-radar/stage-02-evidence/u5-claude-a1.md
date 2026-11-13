# Claude on unit 5: the reviewer's final message, as returned

I found 6 correctness defects in the change: 2 at P1 and 4 at P2. I read the surrounding code but ran no tests, as instructed.

### 1. P1: a YouTube audit chain can be lost when the Action response is too large
**Where:** `apps/research-mcp/src/actions/research-routes.ts:332`, together with the handle commit at `:288` and the response at `:293`.

- The audit output is trimmed to `RESEARCH_ACTION_RESPONSE_MAX_BYTES - 4_000` (56,000 bytes). Then `coverage_receipt` is added (`:271`), and it copies all of `reply_count_mismatches` and `receipt.blockers` a second time.
- Each mismatch is about 80 bytes, so the receipt passes the 4,000-byte reserve once a video has about 35–40 reply-count mismatches. That is common on large videos.
- The trimmed sample fills 56,000 bytes, so the response grows past 60,000. The router then answers `502 action_response_too_large`.
- By then the route has already committed and deleted the previous `arh1_` handle. The new handle never reaches the client, so the chain cannot be continued.
- Mismatches accumulate across the chain, so restarting from the video ID fails again at the same depth.

### 2. P1: a complete discussion audit can block the per-video depth check permanently
**Where:** `apps/research-mcp/src/actions/treatment-landscape-coverage-route.ts:1610` (`providerCountReconciles`), with the fall-through at `:1640–1646` and `boundaryStatusSchema` at `:24–27`.

- `auditYoutubeVideoCommunity` returns `api_visible_complete` with lock `pass` even when YouTube's comment count differs from the records retrieved. It only adds a limitation for this, and the two counts usually differ.
- The coverage check treats that receipt as incomplete. With lock `pass`, it then calls `requireBoundary` and expects a boundary whose `access_status` is `"api_visible_complete"`.
- `boundaryStatusSchema` cannot hold that value, so every boundary the caller supplies is reported as "missing, mismatched, or status-inconsistent".
- Result: `per_video_depth_lock` stays `block` for that video, and only editing the receipt clears it.
- The same happens when only the metadata lookup failed but the comments are complete.

### 3. P2: the transcript check has the same dead end
**Where:** `apps/research-mcp/src/actions/treatment-landscape-coverage-route.ts:1582`.

- A transcript receipt with `access_status: "api_visible_complete"` that fails any other completeness condition reaches `requireBoundary` with status `"api_visible_complete"`. Examples: no track metadata (`language_name: "not_reported"`), or no segment timestamp URLs.
- No boundary can carry that status, so `creator_content_verified` stays false and the depth blocker cannot be cleared.

### 4. P2: an `invalid_input` result leaves the continuation handle stuck
**Where:** `apps/research-mcp/src/actions/research-routes.ts:250`.

- After an `arh1_` handle has been claimed (`claimed = true`), an `invalid_input` result from the operation returns 422 straight away.
- That path skips both commit and rollback. This can happen because the tool's runtime schema in `later-inputs.ts` is stricter than the Action's parse schema.
- The entry stays claimed until its one-hour lifetime runs out. A corrected retry with the same handle gets `youtube_action_continuation_invalid_or_expired`, so the chain is lost.

### 5. P2: the multi-video audit says `mode: "all"` while returning only a subset
**Where:** `apps/research-mcp/src/youtube-community-audit.ts:264`.

- The mode is chosen by comparing `comments.length` with `sample_comments_per_video`. But `sampleWithinResponseBudget` can shrink the sample to fit 30,000 characters shared by all videos.
- Example: 2 videos, one with 200 comments and the default limit of 250. The response says `mode: "all"`, `corpus_count: 200`, `sampled_count` of about 50.
- A client that trusts `mode` would treat a subset as the whole corpus.

### 6. P2: discovery can be reported as saturated after failed searches
**Where:** `apps/research-mcp/src/actions/treatment-landscape-coverage-route.ts:1328` and `discoverySaturation` at `:1975–2008`.

- The saturation check counts every valid batch, including ones that were `rate_limited`, errored, or still have an unread cursor.
- Two final batches with different queries that hit a quota and returned nothing count as "found nothing new". The output then says `discovery_saturated: true` and `first_pass_complete` is true, although discovery never ran.
- The batch-count rule nearby (`discoveryAngles`, `:1431`) does filter on access status; this check does not.
