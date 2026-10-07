# Preserve verified source links in user-facing research answers

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-07, by ChatGPT reasoning chat after reproducing an AskRigor research-output failure
- From: owner correction in an AskRigor ChatGPT session on 2026-10-07
- Owner request: yes — owner explicitly asked to submit the detailed bug reports to the AskRigor lane
- Existing pull request: none
- Supersedes: none

## What to do

Fix the research-output path so a verified canonical source URL cannot be silently degraded to a bare PMID, PMCID, DOI, trial ID, or other opaque identifier in the user-facing answer when the URL is already known.

The immediate observed case:

1. `fetch_pubmed_record` returned `source_identity.canonical_url` for every cited PubMed paper.
2. The full-text acquisition path also returned canonical URLs for open full texts.
3. `finalize_research` itself emitted required caveats containing clickable PubMed links.
4. The final answer nevertheless rendered several sources only as:
   - `PMID 34285282`
   - `PMID 14745664`
   - `PMID 17069947`
   - `PMID 10204240`
5. The owner correctly flagged that these should have been clickable links.

Add an explicit user-facing citation/link preservation contract at the final-answer boundary, not merely inside source retrieval.

Recommended behavior:

- When a research source has a verified canonical URL, the user-visible citation must expose a clickable destination.
- A PMID/PMCID/DOI may still be shown as metadata, but must not be the only access path when the canonical URL is known.
- Preserve the URL across all transformations: provider result -> evidence record -> synthesis -> `finalize_research` -> final answer.
- If a final-answer renderer or model rewrites a linked citation to a bare identifier, the final gate should catch it.
- Do not fabricate a URL from an identifier when no verified URL exists; preserve the existing source-verification rules.
- Keep outbound-link verification compatible with UDA's owner-facing link-quality rule.

Add a mechanical or schema-level check where possible. This is not primarily a model-writing-quality issue; the source layer already had the URL.

### Suggested acceptance test

Construct a research result with:

- PMID `34285282`
- canonical URL `https://pubmed.ncbi.nlm.nih.gov/34285282/`

Draft an answer containing only `PMID 34285282` for that source.

Expected result: finalization should reject it or return a required repair that makes the citation clickable.

Then draft:

`[Samekova et al., 2021 — PubMed](https://pubmed.ncbi.nlm.nih.gov/34285282/)`

Expected result: pass, subject to existing link and entailment checks.

Also test DOI-only, PMCID, inaccessible-full-text, and non-PubMed primary sources.

## Why

This failure was not missing evidence or failed source discovery. AskRigor had the source URL and still permitted a lower-usability output.

Bare identifiers create unnecessary work for the user, are especially bad on mobile, and discard useful information already obtained by the research system. They also make AskRigor look less capable than it is because the retrieval layer succeeded but the presentation layer threw the result away.

The important architectural distinction is:

- source identity verification = scientific/provenance correctness;
- clickable citation preservation = delivery/usability correctness.

Passing the first must not silently excuse failure of the second.

This also exposes a boundary-enforcement issue: `finalize_research` checks source status, claim entailment, caveats, and several formatting constraints, but did not reject the bare-ID degradation.

## Check first

1. Inspect the current canonical HRP `OutputFormatting`, `SourceVerificationAndCitationAudit`, and finalization rules before editing.
2. Inspect the current `finalize_research` implementation and response schema for where canonical source URLs are retained or discarded.
3. Check whether the final answer is expected to use raw Markdown links, provider citation objects, or another UI-safe link representation in each supported host.
4. Do not solve this by blindly synthesizing PubMed URLs from PMID strings. Use verified canonical URLs already returned by source tools.
5. Add regression coverage proving the URL survives an end-to-end research run into the final user-facing draft.
6. Verify the rule does not force links when a verified destination is unavailable or when surfacing the destination would violate another access/privacy constraint.
