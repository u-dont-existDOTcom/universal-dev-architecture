# Book research: reader reviews alongside the book

## Status

Current universal pattern. Origin: **OWNER**, 2026-10-20. The owner gave the two sentences under **Rule** as a new item for the Universal Instructions, AskRigor's public protocol, and asked for it to be sent to this repository too. The same need was filed earlier at the owner's request, on 2026-10-18, as uda-lane pull request #398, with a maintainer suggestion and an AskRigor lane item. The rule's two sentences are the owner's words, unchanged. The trigger, the links to other patterns, the regression case and the bounds are the maintainer's; they add no requirement. Owner requirement: `docs/requirements/2026-10-20-book-research-reader-reviews.owner-requirement.json`.

## Problem

An assistant asked to read several books and compare the practical methods they teach studied the texts closely but did not read what readers reported. Reader reviews, read later, showed what the books' own examples did not: some readers found the central exercise helpful, others could not do it or found it repetitive, some found exercises emotionally draining, and some challenged health claims the authors made. A review sample has its own limits: its readers chose to write, the same review can appear on several pages, and a reviewer's account of what a book says can be wrong.

## Rule

Book research should include reader-review evidence alongside primary-text reading, identifying practical difficulties, negative experiences, differences in usability, and criticisms that the author might not address.

Reviews must be checked against the book, duplicates should not be counted as independent evidence, and self-selected reviews must not be mistaken for clinical outcome studies.

## Trigger

Book research is research that reads, assesses or recommends a book or a method a book teaches. A passing mention of a book is not book research.

## Relationship to other patterns

- **Checking reviews against the book.** A reviewer's account of what the book says is a paraphrase. Under point-of-use anchoring in `patterns/source-interpretation-provenance.md`, a sentence about what the book says rests on a passage in the book, not on the review. Before saying that the author does not address a criticism, that pattern's rule on absence claims and `patterns/whole-argument-reconstruction.md` apply: the book may answer the point in another chapter.
- **Weighing reviews.** When the research asks whether a book's method works in practice, `patterns/consilience-and-expected-observability.md` applies as well. It already treats reviews as discrepancy detectors and heterogeneity evidence, not informal randomized trials, and counts repetitions of one source as one lineage.
- **Comparing several books or methods.** `patterns/coverage-before-depth-in-selection.md` applies on its own trigger, a broad comparison or landscape synthesis.
- **Buying a book.** When the task also finds, prices or recommends where to buy a book, `patterns/shopping-research.md` governs that part.
- **Building a method.** #398 suggested activating `patterns/research-before-reinvention.md` together with the provenance and coverage patterns above. It applies when books are read as part of an existing-work scan before building a bespoke method or framework; book research as such does not trigger it.

## Regression

A synthetic case. A user asks what method can be learned from a book that teaches a daily writing exercise for difficult feelings. The assistant reads the book and reports that the method is practical. Reader reviews are available. Some readers say the exercise helped; others say they could not do it, found it repetitive or found it draining. One widely shared review says the author claims the exercise cures physical illness, while the book says only that some people who practice it report less stress. The same review text appears on two sites.

- **Pass:** the answer keeps what the book teaches and adds what the reviews show: the practical difficulties, the negative experiences, how usability differed between readers, and criticisms that the author might not address. It reports what the book says about illness instead of the reviewer's version, does not count the repeated review as a second, independent account, and presents the reviews as self-selected accounts, not as an outcome study.
- **Fail:** the answer rests on the book alone; or it repeats the reviewer's version of the illness claim as the book's; or it counts the repeated review as two independent accounts; or it reports the share of reviews that praise or criticize the exercise as how often the method works or harms.

## Bounds

- This adds no gate and grants no authority. It sets no quota of reviews or sources.
- Further details proposed in #398 beyond the owner's two sentences, such as counting only readers who tried the method, keeping reviews of other editions, formats and translations apart, setting blurbs and endorsements aside, and reporting how many reviews were read or that none were found, are not adopted; they become part of this rule only if the owner adopts them.
- No repository rule reaches a session that never loaded UDA.
