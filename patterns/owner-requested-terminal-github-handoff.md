# Owner-requested terminal GitHub handoff

## Activation and authority

Activate this output rule when the owner has explicitly asked for a one-line GitHub handoff at the end of ongoing repository-backed work. The final-line preference belongs to the owner, not to all users.

**This owner's request is standing (owner rule).** He asked on 2026-10-26 ("continue and give me at the end of every turn a one-line github handoff in case chat is overflowed. make that a rule in UDA also"), again on 2026-11-01, on 2026-11-03 ("make sure any prompt which is part of multiple turns will give me a one line GH handoff at the end"), and on 2026-11-08 ("new chats are still not giving me the account handoff line at the end for some reason"). So for this owner the rule is active without a new request, in every workstream that loads UDA, for every final answer in work that spans more than one turn: a task resumed from an earlier turn or handed on to a later one, an open checkpointed workstream, or any reply that ends with a resume line. **A new chat's first turn counts.** A chat that changes, saves or plans project work starts work that can go on in a later turn or in his other account, so its first reply ends with the line too. A self-contained one-turn answer, such as a translation or a quick fact, needs no line unless he asks for one. It complements, and does not replace, the separate checkpoint-internal one-line resume instruction in `patterns/context-compaction-resilience.md` and any local handoff-folder requirement.

## Required final-answer line

For each assistant final answer in an activated workstream (for this owner, any work that spans more than one turn, whether or not it already has a GitHub checkpoint):

1. Continue safe authorized work to an evidenced completion or genuine stopping boundary, and first write/read back the current durable checkpoint in the correct public or private repository. If work could not advance, read back the last legitimate checkpoint and make the barrier explicit.
2. Put **exactly one compact GH handoff line as the last nonblank line**, after all explanations, citations, artifacts, status text and any local resume line the workstream also requires (for this owner, the account resume line of `patterns/cross-account-continuity.md`, rule 5), using this pattern:
   `GH handoff: [<plain-English checkpoint label>](<direct verified GitHub file URL>) — Next: <one specific safe action>`
3. For a complete workstream, replace `Next` with a succinct `Closed:` disposition and point to the final verified artifact. Never imply an OPEN research goal is complete because an individual pass is archived.
4. The URL must identify the exact latest successfully saved and read-back checkpoint or, if no update succeeded, an existing verified checkpoint. Do not substitute a repository root, an opaque commit ID alone, a branch-selection instruction, a fabricated filename, or an unverified outbound link. Resolve the destination within the authorized GitHub route before presenting it.
5. If there is no validated remote URL, including in work that has no GitHub checkpoint yet and no authorized repository to save one in, **still end with a one-line truthful handoff**, such as `GH handoff: not saved (exact access/write blocker) — Next: <recoverable action>`. Never invent a successful save.
6. Keep private case data in its authorized private repository; do not embed identifying information, secrets, patient details, or private research substance in public URLs or public UDA instructions.

## Why this is distinct

A prior instruction required the **checkpoint** to contain a one-line resume instruction. That requirement did **not** reliably make the assistant's **user-visible final answer** end with the requested GitHub handoff. The owner expressly requested both, so this is a final-output contract, not a replacement for research or project continuity. The first version of this pattern waited for a new request in each workstream, so replies in at least one lane still ended without the line after the owner had asked twice; the standing activation above closes that gap. On 2026-11-08 the owner reported that new chats still ended without the lines. Two causes were found in the rules: the line was reachable only through the lesson index, while the timestamp rule a reply opens with sits in root `AGENTS.md`; and a new chat's first reply could read itself as one-turn work. Root `AGENTS.md` now carries both last lines next to its other every-turn output rules, and the activation names a new chat's first turn.

## Lightweight verification

Before final delivery, check the rendered text: the final nonblank line begins `GH handoff:`; it occurs exactly once as the terminal handoff; its link, if any, resolves to the read-back checkpoint; its next action is consistent with the current OPEN/CLOSED status; and it follows the timestamp-first rule from `AGENTS.md`.

## Limits

This is an owner-preference pattern: standing for this owner (see **Activation and authority**), conditional for anyone else. Do not apply it to other users without an explicit request, impose new approval gates, misstate remote write success, or prioritize the line over substantive work.
