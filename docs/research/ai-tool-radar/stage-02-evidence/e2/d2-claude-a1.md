# Claude on defect D2: the reviewer's final message, as returned

I couldn't check this against the latest `origin/main`: the tree has no `.git` and the network was off, so everything below is against the tree as given. No tests were run and nothing was changed.

Four findings are serious (P1). Findings 1–3 are the same failure the #421 review kept hitting: a thread marked complete when it wasn't. Adding more link and markup patterns hasn't closed it, so the fixes below change the default to "part read" unless a page proves it is the whole thread. None of them adds a new blocking check.

**1. [P1] One "whole-looking" read cancels proof that the thread has several pages** — `apps/research-mcp/src/research-finalization-gate.ts:2095` (used at `:2959`)
- **Cause:** `threadReadToEnd` marks a thread complete if *any* read of that thread looks complete. `threadOfPages` is only consulted at `:2980` after `read` is already true, so it never overrides.
- **Repro:** a two-page phpBB 3.0 thread.
  - Read `viewtopic.php?f=4&t=99`. Its pager links `start=15`, so it signs `e=0, pa=1`.
  - Read `viewtopic.php?f=4&t=99&p=1234`, a post on page 2. Page 2 links only page 1, so it signs `e=1, pv=0`.
  - Both reads get the same thread digest (`viewtopic.php?t=99`), so the thread passes as `full_text_read`.
  - MyBB `showthread.php?tid=77` followed by `&action=lastpost` does the same.
- **Impact:** the gate holds evidence that the thread has more pages and still accepts "read in full". This is the page-stitching that `docs/final-check.md` says never happens.
- **Fix:** at `:2959`, also require `!threadOfPages.has(t)`.
- **Regression test:** the two reads above should give `partial_text`.

**2. [P1] A redirect to a login page counts as the thread, read in full** — `apps/research-mcp/src/forum-tools.ts:197-198`, via `apps/research-mcp/src/forum-thread-links.ts:176`
- **Cause:** `sameSiteRedirect` accepts any landing page on the same site except the front page, and the read then signs `ur` for the thread link that was requested.
- **Repro:** `/viewtopic.php?t=99` redirects with a 302 to `/ucp.php?mode=login&redirect=…`. That login page returns 200 with at least 1,500 characters of site text, so it is "read" with `e=1, pv=0, pa=0`. The key source `viewtopic.php?t=99` then resolves through the alias (`:2048`, `:2959`) to `full_text_read`.
- **Impact:** a thread that was never read passes the read-depth check. The new limit at `docs/final-check.md:377` only says a login wall "reads as a page read". It doesn't say the wall becomes the requested thread.
- **Fix:**
  - Sign `ur` only when the landing link is the same thread (`sameThreadAtSite`) or is itself a thread link form (`forumPublishedLink` is defined). This still covers the LongeCity case, which landed on `viewtopic.php?t=…`.
  - Separately, a redirected page whose form has `<input type=password>` is an exact, language-independent sign of a login wall, so the reader should return `login_required` for it.
- **Regression test:** mock the reader to return a final URL of `/login`. The read should sign no `ur`.

**3. [P1] `pagedHere` misses every thread read through a link to a post** — `apps/research-mcp/src/forum-tools.ts:175`
- **Cause:** the check requires `comparableUrl(link) === comparableUrl(data.url)`. A link to a post, such as `viewtopic.php?p=1234` (or MyBB `showthread.php?pid=500`, vBulletin 3 `showthread.php?p=1234`), has no thread id. Its comparable link keeps `p`, so it never equals the pager's `viewtopic.php?t=99`.
- **Repro:** read `viewtopic.php?p=1234` on page 3 of 5 of a phpBB 3.0 thread. The pager links `start=15/45/60`, but `pagedHere` is false, and `pv` is false too (`p` isn't a page parameter). The read signs `e=1, pv=0, pa=0`.
- **Impact:** a middle page counts as the whole thread. The limit at `docs/final-check.md:268` admits only "page 2 of a two-page" thread.
- **Fix (structural):**
  - A link that points at a post (`p=`, `pid=`, `post-N`) doesn't say which page it is on, so sign `e=0`.
  - Also collect same-thread links with an explicit `start=0` or `page=1` as evidence of an earlier page.
- **Regression test:** feed a `?p=` URL with pager links that carry `t=99&start=15`. It should sign `pa=1, e=0`.

**4. [P1] A robots.txt block on one page is accepted as "this community blocked us", halting research that could still run** — `apps/research-mcp/src/research-finalization-gate.ts:5871-5877`, signed at `apps/research-mcp/src/forum-tools.ts:217-220`, encouraged by the guidance at `:41-42`
- **Cause:** the `sd` digest is the whole host. `readerStopsAt` lets any stop on any page there back the community's boundary.
- **Repro:** Discourse's default robots.txt disallows `/search`.
  - Calling `read_forum_thread("https://forum.example/search?q=x")` signs `robots_disallowed` for the site.
  - The entry `{platform: forum, url: https://forum.example/, access_boundary: blocked}` then fits, and the answer says "A community that blocked access", while its `/t/…` topics are readable.
  - At `:2158-2161`, the same receipt also exempts that entry's declared `threads_read` from the note asking for receipts.
- **Fix:** the receipt should record whether the stop covers the whole site (robots.txt disallows `/` or the thread links) or one page. A one-page stop should only produce "some pages not read". The guidance should say to try one of the community's threads.

**5. [P2] The published result says "complete" while the receipt says part-way, and the later-page link is thrown away** — `apps/research-mcp/src/forum-tools.ts:132` (`partial` only checks `next || truncated`) and `:224`
- **What happens:** a MyBB page 1 that `pagedHere` flags is published as `access_status: "complete"` and `exhausted: true`, with no unfinished guidance. `later_page_links` is removed, so the AI can't continue to the remaining pages.
- **Fix:** count `pageAfter` and `pagedHere` as partial, and return the same-thread later link as `next_page`. It is already same-host and https.

**6. [P2] The 50-link cap fills up with other threads' links before the same-thread filter runs** — `packages/sources/src/forum-page.ts:304`
- **What happens:** links to later pages of *any* thread count toward the cap. A page with more than 50 such links before its own pager (sidebar, "similar threads", portal widgets) never lists the pager, so `pagedHere` is false and the read signs `e=1`.
- **Fix:** pass the thread's comparable link into the reader and filter before capping, or cap only same-thread links.

**7. [P2] The exact host match drops www/bare-host pager links** — `packages/sources/src/forum-page.ts:300`
- **What happens:** `link.host === base.host` rejects absolute pager links to `forum.example` on a page served from `www.forum.example`, even though `comparableUrl` treats the two as one site. The page then reads as complete.
- **Fix:** compare by the site without `www`, as `threadParts` does.

**8. [P2] MyBB's `thread-77-page-2.html` page links aren't recognised** — `packages/sources/src/forum-page.ts:78`
- **What happens:** the page-suffix pattern requires `/page` at the start of a path segment. MyBB's search-friendly links (`thread-77-page-2.html`) and vBulletin 4's `showthread.php?77-title/page2` don't match. The same pattern at `forum-thread-links.ts:30` doesn't strip them either.
- **Impact:** each page reads as a whole thread and has its own thread digest.

**9. [P2] Each page of an SMF thread counts as a separate thread** — `apps/research-mcp/src/forum-thread-links.ts:26,77-78`, counted at `research-finalization-gate.ts:2117`
- **What happens:** `topic` is treated as the thread id, so `topic=123.0`, `topic=123.15` and `topic=123.msg456` are kept as three different threads.
- **Impact:** five pages of one thread satisfy the "Forum evidence rests on fewer than 5 threads" note, and thread counts are inflated. `pagePickedAfterFirst` also misses the `.15` page offset.

**10. [P2] Small review samples can support "how common" claims** — `apps/research-mcp/src/research-finalization-gate.ts:149-153`, `:6440-6441`, `:6555-6557`
- **Repro 1:** `selection: "most_recent"` with 5 of 4,000 reviews read produces no "not how common" limit.
- **Repro 2:** `selection: "all"` with `reviews_shown` left out skips the count check entirely, so 3 reviews pass as the full corpus.
- **Fix:** add a limit (not a blocker) whenever `reviews_shown` is missing or `reviews_read` is a small share of it.

**11. [P2] The published state and the signed state disagree for HTTP 401** — `apps/research-mcp/src/forum-tools.ts:171` vs `:218`
- **What happens:** the AI sees `blocked`, but the receipt signs `login_required`.
- **Impact:** if the AI declares the `blocked` it was shown, the gate (`:5865`) finds no fit, and the limit drops to "A community not read here" with only a corrective note.
- **Fix:** put the `login_required` value in the result's limitations so the AI can declare the boundary that fits.
