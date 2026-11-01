# Owner-requested terminal GitHub handoff

## Activation and authority

Activate this output rule **only** when the owner has explicitly asked for a one-line GitHub handoff at the end of ongoing repository-backed work. The final-line preference belongs to the owner, not to all users. It complements, and does not replace, the separate checkpoint-internal one-line resume instruction in `patterns/context-compaction-resilience.md` and any local handoff-folder requirement.

## Required final-answer line

For each assistant final answer in an activated, ongoing GitHub-backed workstream:

1. Continue safe authorized work to an evidenced completion or genuine stopping boundary, and first write/read back the current durable checkpoint in the correct public or private repository. If work could not advance, read back the last legitimate checkpoint and make the barrier explicit.
2. Put **exactly one compact GH handoff line as the last nonblank line**, after all explanations, citations, artifacts, and status text, using this pattern:
   `GH handoff: [<plain-English checkpoint label>](<direct verified GitHub file URL>) — Next: <one specific safe action>`
3. For a complete workstream, replace `Next` with a succinct `Closed:` disposition and point to the final verified artifact. Never imply an OPEN research goal is complete because an individual pass is archived.
4. The URL must identify the exact latest successfully saved and read-back checkpoint or, if no update succeeded, an existing verified checkpoint. Do not substitute a repository root, an opaque commit ID alone, a branch-selection instruction, a fabricated filename, or an unverified outbound link. Resolve the destination within the authorized GitHub route before presenting it.
5. If there is no validated remote URL, **still end with a one-line truthful handoff**, such as `GH handoff: not saved (exact access/write blocker) — Next: <recoverable action>`. Never invent a successful save.
6. Keep private case data in its authorized private repository; do not embed identifying information, secrets, patient details, or private research substance in public URLs or public UDA instructions.

## Why this is distinct

A prior instruction required the **checkpoint** to contain a one-line resume instruction. That requirement did **not** reliably make the assistant's **user-visible final answer** end with the requested GitHub handoff. The owner expressly requested both, so this is a final-output contract, not a replacement for research or project continuity.

## Lightweight verification

Before final delivery, check the rendered text: the final nonblank line begins `GH handoff:`; it occurs exactly once as the terminal handoff; its link, if any, resolves to the read-back checkpoint; its next action is consistent with the current OPEN/CLOSED status; and it follows the timestamp-first rule from `AGENTS.md`.

## Limits

This is a conditional owner-preference pattern. Do not apply it to other users without an explicit request, impose new approval gates, misstate remote write success, or prioritize the line over substantive work.
