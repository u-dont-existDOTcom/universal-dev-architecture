# Include reader reviews when researching or recommending books

- **For:** `u-dont-existDOTcom/AskRigor`
- **Filed:** 2026-10-18, by a ChatGPT source-reading research worker
- **From:** Owner-requested multi-book method evaluation and reader review audit; research checkpoint in `u-dont-existDOTcom/innerSignalGraph` draft PR 182; UDA companion report `feedback/2026-10-18-book-reviews-in-source-research.md`
- **Owner request:** yes; the owner asked that book reviews be checked in addition to the books and that the request be sent to UDA and AskRigor.
- **Existing pull request:** this UDA-lane filing, pending maintainer publication
- **Supersedes:** none

## What to do

Add a bounded **reader-review/community feedback** step to AskRigor workflows where the research question asks for substantive book-method assessment, selection, comparison or recommendation (including books about health and psychotherapy). Primary-book reading remains the core evidence for what an author actually teaches.

Search at least one appropriate independent discussion/review source when it is available. Consider mixed ratings and relevant discussion communities, not only publisher endorsements. Extract decision-relevant user experience such as whether exercises were usable, prolonged emotional distress, accessibility, reasons for discontinuation, practical improvements, and failures the authored success cases did not mention.

Separate firsthand completed-user reports from DNF, audiobook-only, non-user, author/publisher blurbs, professional endorsements, and reviews of **different books, translations or editions**. Dedupe repeated reviewer text across pages. Report retrieved versus examined coverage and uncertainty. Independently verify any disputed factual or scientific claim in the book; a reviewer's compressed wording is not an authoritative quotation from the author.

Book reviews can support **usability, acceptability and failure-mode discovery**, never automatically efficacy, causality, frequency of adverse effects or safety rates. If relevant independent reviews are inaccessible/sparse, explicitly record that instead of inventing user experiences or imposing an impossible review quota. Limit to a useful sample; respect the user's explicit time budget and source-first objective.

## Why

In a recent book-method review, direct text described expressive practices as helpful while independent readers reported sharply divergent practical experiences: some found the activities transformative, others could not elicit the expected internal dialogue, found the approach repetitious or intolerable, or needed clinical support. Reviewers also noticed medically significant exaggerations. These signals matter to a prospective ordinary user, yet the original book's illustrated cases and promotional copy did not provide their prevalence or full range. Reviews are selective and biased, so they must be triangulated rather than treated as trials.

## Check first

- Existing AskRigor source/reader-community coverage contracts, including the forum/community check, and whether “book” research currently triggers them. Adapt an existing mechanism rather than duplicate it.
- Whether tool access to independent reviews exists; classify and preserve provider-access limitations.
- How each retrieved comment is bound to an edition/format/book identity, verified independence, and actual usage status; do not pool authors' different works.
- Any existing AskRigor lesson or bug already covering this owner requirement; deduplicate.

**Acceptance example:** Given a relevant book with rich publisher copy and independent reviews where some users report success and some cannot do the main exercise, AskRigor discusses both, verifies any contested book claims in primary text, and labels review outcomes as self-selected accounts. If there are no reader reviews, it says so and still completes the book research. An agent should not satisfy this check by quoting five-star advertising testimonials.
