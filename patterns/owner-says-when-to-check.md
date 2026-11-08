# The owner says when to check

## Status

Current universal pattern. Origin: **OWNER**, 2026-11-08: "also i don't understand why claude is always checking to see if i did a merge or if i answered something in an artifact, i can just tell it when to check". Owner requirement: `docs/requirements/2026-11-08-owner-says-when-to-check.owner-requirement.json`.

## Problem

Several rules send an agent to look, at the start of each turn, at what changed while it was away: the mailbox check (`patterns/suggested-fix-queue.md`, step 4) and the review of the lane's own open pull requests (`patterns/short-lived-pull-requests.md`, rule 3). Read broadly, they also send it to look for what the owner himself did: whether he merged a pull request he was asked to merge, or answered a question on his questions page or in an artifact. Agents did that turn after turn and told him the result, such as "not merged yet" or "no answers on the page yet". Each look costs time in his turn, and the report tells him nothing he doesn't know, because he knows what he did. A Claude artifact also sends a remote session no notice when it changes, so the only way to see an answer there is to read it again, and the owner is the one who knows when that is worth doing.

## Rule

1. **Don't check for the owner's own actions.** Unless he says he has done something or asks you to check, don't look whether he has merged, approved, answered or otherwise done what you asked of him: on GitHub, on his questions page, in an artifact or its comments, or anywhere else. Don't report that it hasn't happened yet either.
2. **Check when he says.** When he says he has done it, for example "merged" or "answered 4 on the page", or asks you to check, check in that turn and act on what you find.
3. **Say once what waits on him.** Record what waits for the owner once: as a question or a to-do on his questions page (`patterns/owner-questions-page.md`), and in the lane's handoff. Then go on with work that doesn't depend on it. Don't ask again or check again each turn.
4. **The mailbox keeps everything else.** The mailbox check still covers what other agents, lanes and people send the lane: new items and pull requests, comments and reviews, and edits other agents make to its handoff note or questions page. Only the owner's own merges and answers leave it. An agent also still checks its own work: its own merges, an auto-merge it turned on, its own jobs.
5. **Reading what the work needs is not checking on him.** Fetching the current main branch before branching from it, or reading a file the work edits, is part of the work, even when it shows that he merged something. Use what it shows; don't report on it.

## Bounds

- This changes when an agent looks, not what it may do. It adds no gate and grants no authority.
- An answer the owner gives in chat is acted on in that turn (`patterns/owner-questions-page.md`, rule 6).
- A deadline that runs out while the agent waits for him is still the agent's to track. Before it runs out, the agent says once what happens when it does, on his questions page.
