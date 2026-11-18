# Write for a reader who was not there

## Status

Current universal pattern. Origin: **OWNER**, 2026-11-18, after reading a page and several explanations an agent had written for him: "i feel like you're talking to yourself, and i'm missing the context", "just say that then!", and "it's not just that you can't explain science, you can't write clearly at all. DEBUG THAT! we need to get to the root of this and fix it in UDA and askrigor and everywhere". Owner requirement: `docs/requirements/2026-11-18-write-for-a-reader-who-was-not-there.owner-requirement.json`.

## Problem

An agent spent hours on calculations and then wrote the results up for the owner: a long page and a set of explanations. The figures were right and the page worked. The owner could not understand it. He asked what a made-up word meant, whether a sentence was good news or bad, and what a paragraph was telling him to do. When he found the one useful sentence in a paragraph, it was the second to last.

The root `AGENTS.md` already says to explain a thing before its identifier and to use plain words. That did not prevent this. Five causes did the damage:

1. **The writer wrote for itself.** During the work it gave things private names and then used those names as if the reader had been there. Words that belong to the method went in the same way.
2. **The writer copied the voice of the field.** It wrote sentences in which an idea behaves like a person ("the structure has to hold", "the data asks a question"). They sound meaningful and commit to nothing, so the reader cannot tell what is being claimed.
3. **A caution turned into fog.** Told not to overclaim, the writer stopped saying anything concrete. It hedged every clause and never said what might actually happen.
4. **The evidence came before the point.** Each paragraph opened with what the writer had checked and ended with what the reader needed.
5. **Nobody without the context read it before it went out.** The tests checked that the page ran and that the numbers were right. No check asked whether a reader could say back what a sentence meant.

## Rule

This applies to everything a person will read: a chat answer that explains a method or a result, a page, a report, an email, and the text a product shows its users.

1. **Say the claim.** Each paragraph has one sentence a stranger could repeat to a friend: what is true, what may happen, or what to do, in everyday words. If you cannot finish "In other words, ..." without reusing the same special words, there is no claim yet.
2. **Keep this order.** First what it means for the reader, with an ordinary example. Then what to do. Then whether it is good news, bad news, mixed, or unknown. The evidence and the method come last, where they can be skipped.
3. **No private words.** A word made up during the work, or one that belongs to the method, reaches the reader only with its meaning in the same sentence. A project that has such words keeps a short table of the plain wording to use for each.
4. **No idea behaving like a person.** Write what is claimed and who claims it: "the textbook reads this as a tiring two weeks", not "the two weeks ask what you can carry".
5. **Say the direction.** Good, bad, mixed, or "the method does not say". Never leave the reader to guess whether something is good news.
6. **Answer the next question.** After each claim, ask what the reader will ask next ("does this apply to me now?", "for how long?", "is this dangerous?") and answer it in the next sentence, even when the answer is "it cannot tell".
7. **Titles state the claim.** "A plan may change suddenly on 4 December", not "The jolt".
8. **One idea to a sentence.** Every "it", "this" and "that" points to a noun in the same sentence or the one before. Every number comes with what it counts.
9. **Explaining a method: example first.** Start with one worked case using the reader's real numbers. Then the general statement. Never the other way round.
10. **Honesty in one place.** Say once, plainly, how well the method has done. Do not smear "may" and "perhaps" over every clause; one per claim is enough.
11. **Keep the order the person used.** If they numbered their questions, answer in that order, with their numbers.

## The cold-reader check

Before the text goes out, a reader who has seen nothing else gets the text alone: a small model with an empty context, a model from another family, or a person. It gets no project notes, no earlier messages and no explanation of who wrote the text or why. It returns three lists:

1. each paragraph said back in one concrete sentence;
2. every word or phrase it could not explain to a friend;
3. every question the text left it with.

The text goes out when every sentence in list 1 says what the writer meant, list 2 holds nothing the reader needs, and the questions in list 3 that a reader needs answered are answered in the text. Otherwise fix and check again, at most twice. What is still open after that is said to the owner, not hidden.

A strict reader lists far more than needs fixing: labels of the interface, ordinary words, and questions no text of that length could answer. The writer goes through the lists and fixes what a real reader would stumble on. A paragraph the reader says back wrongly, or cannot say back at all, is always fixed.

Where the text is built by a program, add the cheap half as a test: a list of the project's private and technical words, and a check that none of them appears in what the reader sees before opening the technical detail.

Use it for writing that another person will rely on, and for any answer that explains a method or a result to the owner. A short status reply does not need it.

## Bounds

- This adds no authority and no gate on work other than writing. It does not replace the checks that the content is true.
- Plain does not mean vague. A precise figure, a date and a named source stay; they follow the claim instead of opening the paragraph.
- Technical detail is kept, folded or placed last, for the reader who wants to verify the work.
- Wording rules in other patterns still apply: plain names before identifiers (`patterns/human-readable-operational-references.md`), and conversational prose (`patterns/conversational-prose-speakability.md`).
