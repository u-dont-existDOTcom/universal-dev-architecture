# Owner-requested improvement: pair primary book reading with independent reader reviews

**Filed:** 2026-10-18 · **Status:** UDA maintainer suggestion, NOT yet active policy.  
**Scope:** Substantive evaluation, comparison, research, recommendation or adoption of a book's methods. Does not replace an expressly requested full reading, and does not turn every minor reference to a book into an exhaustive community audit.

## Observed failure

An assistant was asked to read several therapy books and compare their practical teachings. It invested heavily in direct text analysis but initially overlooked user reviews. When a substantial collection of reader comments was later examined, independent firsthand experiences exposed several issues that the texts' authored cases underrepresented:

- non-dominant-hand writing helped some, but other readers could not meaningfully use it or found it repetitive;
- audiobook presentation made written exercises difficult and infant-style narration alienated some readers;
- some exercises were emotionally draining or benefited from support;
- readers challenged authors' physical-health causal claims and overconfident psychological inference;
- a substantial number of reviewers had not tried the exercises or finished the book, so their statements cannot be interpreted as outcomes.

This is **not** evidence that reader reviews are unbiased studies. They provide information about adoption, usability, adverse fit, and reality checks on authored claims that should be triangulated against the actual passages.

## Proposed task-time source rule

1. For substantive **book-method reviews or recommendations**, where relevant independent readers' reports are accessible, inspect a bounded, reasonably diverse sample of reviews **alongside the primary book**; search for both positive and negative experiences, not just aggregate ratings and endorsements.
2. Scope by format and edition. A print/digital/audiobook method can be differently usable. Keep reviews of a prior distinct book separate even if written by the same author.
3. Distinguish actual reading/completion/exercise use from DNF, wish-list, audiobook-only, hearsay, professional endorsement, publisher blurbs and promotional testimonials. Avoid treating all as equivalent experiential outcomes.
4. Separate **reviewers' allegations** (e.g. claims about an author saying “all illness”) from the exact text: verify load-bearing assertions against primary passages; preserve qualifications rather than exaggerating an author to rebut them.
5. Represent denominator and independence accurately: 80 written reviews is not 80 treatment responses; hundreds of ratings are not participants in a trial; duplicate edition pages and copied reviews are not independent informants.
6. Present qualitative directional signal, not ungrounded clinical effect, adverse-event rates or proof of causation. Record coverage and missing/unavailable reviews explicitly.
7. Retain the original owner objective. **Independent feedback supports—not replaces—primary reading.** A full-text reading task cannot be marked complete because a large review audit exists, nor should an external review become a new mandatory obstacle when no review data can be found.

## Suggested enforcement

Activate `patterns/research-before-reinvention.md`, `patterns/coverage-before-depth-in-selection.md` and `patterns/source-interpretation-provenance.md` at substantive book-research time. If their language already covers this practice, prefer a **small explicit book-review activation trigger and behavioral test**, not a new parallel methodology or database.

**Regression:** Owner supplies a substantial book and asks what method can be learned from it. Assistant reads direct passages and states that the book is practical. A mixed review sample, if available, reports both successful use and inability to perform the central exercise, plus possible safety concerns. **Pass:** the answer retains book-derived findings, checks critical review allegations against the book, explains practical limitations and nonrepresentative evidence, and distinguishes the reader anecdotes from trials. **Fail:** only consults book/publisher endorsements or reports reviews as proven prevalence. A case with no independent reviews must pass if the gap is clearly stated; never invent reviews.

## Owner's requested target and handoff

The owner explicitly requested that book reviews be checked as well as books and that this improvement be transmitted to **UDA and AskRigor**. A companion source-specific suggestion is filed under `suggested-fixes/AskRigor/` in this same UDA worker PR. This report is a **proposal for maintainer triage**, not a claim that UDA or AskRigor production procedures have been changed.
