# Preserve real debugging evidence and build a typed health-claim fact-check intake

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-27, by ChatGPT research/debug assistant
- From: deidentified live test of AskRigor video analysis, YouTube comment retrieval, and `finalize_research`, compared against current AskRigor code and incident-capture module
- Owner request: yes; the owner has repeatedly required exact, actionable error diagnosis rather than generalized lessons, and requested systematic use of high-quality fact-check research sources
- Existing pull request: none
- Supersedes: none

## What to do

Treat the owner outcome as **OPEN** until an exact incident has been retained in its approved private evidence route and the observed failure is reproduced or bounded. The incident's general lesson is a *derived index entry*, not a substitute for tool payloads, error/retry details, source code, and tests. The earlier general lesson should not be filed alone or counted as a resolved bug.

**A. Incident-capture enforcement.** Before reducing an eligible validated failure to a public/deidentified lesson, check whether the private encrypted incident-capture Action was genuinely available and used. In a recent connection, detailed lesson reports were off and the exposed AskRigor tool list did not advertise an incident-capture action; the conversation instead saved a derivative proposal in a separate Library file. Whether the separate Action was available elsewhere is **unknown**. The repo's `project/LESSON_CAPTURE_MODULE.md` already describes the exact two-phase requirement and truthful states. Reconcile the enabled Action topology and log/receipt path; make failures visible as failures. Preserve the smallest exact user→wrong answer→correction window privately when authorized, plus tool inputs/outputs, version, timestamps, result status, meaningful retry deltas, server failure boundary, source identifiers and tests. No user log uploads; no raw chat/identifying material in this public lane.

**B. Typed commercial relationships.** The prompt in `packages/sources/src/gemini-video-claims.ts` around the `CLAIMS_PROMPT` `sponsorships` field asks for external sponsorships *and* the creator's own products/memberships in the same array. A live video extraction consequently labeled the creator's own paid membership upsells as sponsorship entries. Add distinct `relationship_type` fields for outside paid placement, affiliate commission, gifts, owned offerings, declined sponsorship offers, funder involvement in research, and unknown, each with actor/counterparty/source-time and content-access state. These are not equivalent grounds for attributing payment to a third party. Keep a self-report of a declined offer separate from a third party's accepted deal.

**C. Critical caveat extraction.** The same default video extraction captured fourteen health claims but omitted a substantial caveat about industry-funded research; a targeted `at=12:20` read recovered it. In addition to claims, independently inventory quoted claims being criticized, methods caveats, funding, correction, and uncertainty with timestamps. Test that a new extraction preserves this rather than simply increasing the number of biomedical claim rows.

**D. Retrieval vs interpretation.** `search_youtube_comments` found an audio-only creator reply but returned `text:""` and explicitly partial coverage (including a reply count discrepancy, 18 expected vs 19 retrieved). The existence of the reply does not verify its words. Track `comment_found`, `audio_available`, `transcript_read`, `source_modality`, `content_verified` separately; external screenshot text remains a different evidence tier. A named channel query returned an unrelated channel among five results; filter intake by exact verified `channel_id`.

**E. Purpose-sensitive final checks.** `finalize_research` requested PubMed/Europe PMC search after a bounded statement that an influencer's payment was unverified; separately requested a fully validated clinical methods audit for a directly readable funding disclosure and intervention-comparability caveats on a documentary funding question. Source path: `apps/research-mcp/src/research-finalization-gate.ts`, absence-claim decision near lines 2984–3015; `commercial_review_applicability` concerns buyer reviews near 350 and 4620–4670. Distinguish `documentary_provenance`, `video_content`, `clinical_effect`, and `clinical_safety` at the claim/source level. Financial non-verification should require a named public-disclosure search and honest coverage statement, not medical literature. Clinical-effect claims retain full clinical gates. The complete finalizer requests/responses were **not preserved**, so the specific two-attempt trace is **partial**, not yet a byte-exact reproduction.

**F. Fact-check source candidate.** Add a *provisional discovery-source* entry for Physionic (YouTube channel ID `UCj3p_1jOCJXB_L_we-DjLbA`), not as pre-certified scientific authority. A public-source pilot found: `https://www.physionic.org/library`, `/examine`, `/nic-articles`; `https://physionic.substack.com/` (long scientific articles with DOI and funding disclosures); and the public Physionic podcast. Source-first inventory these written records plus public YouTube videos; deduplicate each video's evidence by study DOI/dataset; extract model-assisted video claims only as unverified leads, and independently check decision-important scientific claims and disclosure assertions. Respect content rights, available access and the current zero-spend policy. Start with a small 10-item comparison before expanding.

## Why

One observed session accumulated a substantive diagnostic record with six concrete source checks, multiple source-code anchors and eleven regression ideas, but only proposed a broad lesson for submission; no successful private exact-incident receipt or worker-visible implementation checkpoint was established. The generalized text cannot replay the original failure. Independently, the live extractor conflated sponsorship and own-product promotion, omitted an important funding caveat, and retrieved a voice reply without its content; the finalizer still applied clinical proof requirements to some documentary assertions. Existing rules already distinguish conflicts and intent, so the primary change should be to **enforce/route them correctly**.

This item is distinct from the existing 2026-10-07 lane suggestion about unavailable public-schema fields and the 2026-10-08 suggestion about independent outcomes vs sponsor-funded efficacy rankings. Check their status before adding another control. Do not auto-approve a methodology change or deploy on the strength of this suggestion.

## Check first

1. Open canonical HRP/Universal and `project/LESSON_CAPTURE_MODULE.md`, `project/PROJECT_INSTRUCTIONS.md`, existing lesson queue status, and the project suggested-fix ledger. Check whether a private incident-capture route exists and can be invoked from the actual new-chat client; distinguish absent, unavailable, failed and succeeded.
2. Recover exact authorized server logs/tool payloads for the two prior `finalize_research` attempts where still available. Do not reconstruct missing bytes from prose. Preserve the original retries and their input deltas; run no unnecessary repeated failing checks.
3. Inspect `gemini-video-claims.ts` field schema and consumers, `research-finalization-gate.ts` proof-domain routing, YouTube-comment access-state normalization and channel discovery code.
4. Add functional regressions against actual callable paths:
   - owned membership ≠ manufacturer sponsorship;
   - rejected offer ≠ proof other creators accepted payment;
   - an unsponsored article alongside a disclosed sponsor elsewhere retains both scopes;
   - audio reply with empty API text remains content-unread;
   - late funding caveat is extracted independently of positive health claims;
   - clinical trial funding paragraph is verified as a documentary fact without claiming full methods audited;
   - a bounded negative financial-search result does not demand PubMed;
   - five fact-check videos citing one funded study count one dataset;
   - mixed scientific and documentary claims activate the right independent gates;
   - missing exact-incident vault capture never becomes 'incident preserved';
   - imported review items include verifiable original URL/DOI, timestamp and access/verification status;
   - an unrelated YouTube channel returned by name search is excluded by ID.
5. Run focused tests and one authorized **zero-spend** fresh-connection acceptance check. Record concrete PASS/FAIL and incomplete states; do not close the owner outcome on a proposal, file, generic lesson, or a source compilation alone.
