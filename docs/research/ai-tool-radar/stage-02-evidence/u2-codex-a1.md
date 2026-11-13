# Codex on unit 2: the reviewer's final message, as returned

1. **P1 — Forum markup can block the server’s event loop.** [packages/sources/src/forum-page.ts:285](packages/sources/src/forum-page.ts#L285)  
   A valid script containing many literal `<script>` strings and no `_cf_chl_opt` makes this regex rescan the remaining script for every opening token. Within the 3 MB response limit, this produces quadratic synchronous work, blocking other MCP requests. The fetch timeout cannot interrupt it.

2. **P2 — DOI decoding can reject a matching full-text candidate.** [packages/sources/src/open-full-text.ts:301](packages/sources/src/open-full-text.ts#L301)  
   An input such as `10.1000/a%3Cb%3E` now becomes `10.1000/a<b>`, but `verifyArticleIdentity` still compares `citation_doi` without percent decoding. An otherwise valid HTML paper whose metadata contains the escaped DOI is rejected as `IDENTITY_MISMATCH`.

3. **P2 — Discovered pagination is hidden from clients.** [apps/research-mcp/src/forum-tools.ts:168](apps/research-mcp/src/forum-tools.ts#L168)  
   For a pager linking `?page=2` without `rel="next"`, the reader discovers the link, but this destructuring removes it without populating `next_page`. The result reports `access_status: complete` and `pagination.exhausted: true`, while its receipt says the thread is unfinished. Clients receive no continuation URL.

4. **P2 — Link boundaries can fabricate a matching harm figure.** [apps/research-mcp/src/displayed-prose.ts:725](apps/research-mcp/src/displayed-prose.ts#L725)  
   An answer containing `1[3% stopped the drug](https://example.org)` visibly says “13% stopped the drug.” Adding spaces around every link creates “1 3% stopped the drug,” so a declared `harms_quote` of “3% stopped the drug” incorrectly passes the new whole-word check.

5. **P2 — Escaped DOI searches no longer earn completion receipts.** [packages/sources/src/open-full-text.ts:301](packages/sources/src/open-full-text.ts#L301)  
   When the DOI field and recorded public-copy query both use `%3C`/`%3E`, only the identifier is decoded. `checkPublicCopySearch` compares the unchanged query against the decoded identifier and reports `missing_exact_identifiers`. Consequently, an exhausted acquisition cannot issue its lead or route-failure receipt despite the matching DOI search.
