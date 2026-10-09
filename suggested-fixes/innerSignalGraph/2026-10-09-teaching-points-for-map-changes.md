# Give every map change a teaching point, and update the AI guide and the queue from it in the same change

- For: `u-dont-existDOTcom/innerSignalGraph`
- Filed: 2026-10-09, by the Claude session working on the humanized Inner Child guide (`u-dont-existDOTcom/joel-articles`)
- From: `u-dont-existDOTcom/joel-articles`, branch `handoff/claude-dangerous-adult-20260924-1631`: `docs/proposals/MAP-TO-GUIDE-ARCHITECTURE-20261008.md` (the design the owner asked for) and `articles/inner-child-therapy/R4-ADDITIONS-PROVENANCE-20261008.md` (how the October 4 guide additions reached the humanized guide)
- Owner request: yes. The owner's words:
  - 2026-10-08 02:23 UTC: "maybe we should somehow implement a rule that guide additions can't be suggested by other owrkers unless they are explained, what map change caused them, and how they are really needed vs superfluous to the guide."
  - 03:57: "the guide and map are supposed to complement each other and agree with each other, but that's also why we have the AI guide and the humanized guide, in case the map-based AI guide is just too much stuff for people to read ... i'm mainly updating the map now (based on using it on clients) rather than the guide directly."
  - 2026-10-09 02:06: "yes teaching points makes sense altho the ai guide is then updated where, from the map side? automatically hopefully when map is updated if need be? can that be set up?"
- Existing pull request: none
- Supersedes: none

## What to do

1. **A teaching point for every map change.** Any change to an owner amendment, a graph node or route, a gate, or a realization or prompt rule gets one of two things, in the same reviewed change:
   - **A teaching point.** One or two plain sentences from the person's side: what someone should understand or do differently. Each has three fields (see Exact text): what caused it, why a reader needs it, and what the guide already says nearby.
   - **"App-only".** For a change that is only about how the app behaves toward a client (routing, state, re-offers, labels) and changes nothing a person should understand or do.
2. **Update the AI guide from the teaching point, in the same change.** Write the canonical guide text (`guides/inner-child-guide-*.txt`, and the other guide families) from the teaching point, in the reader's voice. Notes about the app's own behavior belong in the prompts and rules, or in a passage clearly marked app-only. They don't belong in prose a person reads. Two examples from the October 4 change:
   - "do not keep trying to sneak it back in through “gentler” exercises" is the planner's no-re-offer rule, addressed to the reader;
   - "or this app the only place you can belong" names the app inside reader advice.
3. **Put the teaching point on the queue, in the same change.** Add it, with its three fields, to `authoring/PENDING-PUBLIC-GUIDE-CHANGES.md`. The queue is the humanized guide's only way in.
4. **Make it automatic with a check.** In the repository audit or CI:
   - A change that touches the owner amendments, the graph candidates, the prompt or realization rules, or the canonical guide text must also touch the queue, or say `Guide impact: app-only` with a reason. Otherwise the check fails.
   - Optionally, a second check that every new queue entry has all three fields.

   This is the "automatic" the owner asked about. The agent that makes a map change always writes its guide side too, and a map change can't merge without it.
5. **Backfill the October 4 change.**
   - #126 added the continuity, scaffolded-challenge and community paragraphs to the guide, but never put them on the queue (#128's additions from the same day are on it).
   - The humanization lane has turned them into nine teaching points, which the owner approved on 2026-10-09 ("all those T1-9 points look good"). They're in section 7 of the design file named above.
   - Add queue entries for them, or record them as consumed once the humanized guide carries them.
   - Bundles A to D already name their upstream authority. Add the reader-need and already-covered fields when an entry is next touched.

## Why

- **The app reads the AI guide as context on every turn.** `src/orchestrator/context-builder.mjs` selects guide passages that match the conversation, so a map change rightly changes the guide too.
- **What went wrong on October 4.** #126's guide text was written for the app's model, and its reasons weren't recorded with it. It also never reached the queue. The result:
  - The owner couldn't tell where the additions came from, or what a reader needed from them.
  - The humanization lane drafted app-directed lines into reader prose.
  - The lane then wrongly parked the whole set as app-only, because it wasn't on the queue.
- **What teaching points give each side:**
  - the owner reviews a sentence or two per map change instead of paragraphs of rules;
  - the AI guide gets reader-side text;
  - the humanizer gets an exact handoff with its reasons.

## Check first

- **What `docs/PUBLIC-GUIDE-HUMANIZATION.md` already covers.** It says not every graph node needs a reader paragraph, and that runtime-only mechanics need no queue entry. This item keeps both. What it adds is that app-only is declared, not inferred from a missing entry.
- **Edits to protected files.** Editing `AGENTS.md`, `README.md` or the other bound files means updating the SHA-256 bindings in `scripts/audit-repository.mjs` in the same change.
- **Owner approval of guide wording.** Guide wording is owner-gated. The nine teaching points for #126 are already approved in the humanization lane (owner, 2026-10-09 02:06). New ones go to the owner as teaching points, a sentence or two each, with the change that caused them.

## Exact text

A queue entry:

```markdown
### PGQ-0NN — <title>
Caused by: <pull request>, <amendment and node or route IDs>; owner outcome: "<one line>"
Teaching point: <one or two plain sentences, from the person's side>
Reader need: <what a reader would miss or get wrong without it>
Already covered: <where the AI guide (and the humanized guide, when known) says something close, and what this adds | nothing close>
Where: <the guide section it belongs in>
```

An app-only change, in its pull request body:

```markdown
Guide impact: app-only — <one line on why nothing changes for a reader>
```
