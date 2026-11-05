# When a safety layer cuts the agent's output

## Status

Current universal pattern. Origin: **OWNER** request, 2026-11-05: apply one lane's fix for safety-layer cuts so that other lanes avoid the same problem. Owner requirement: `docs/requirements/2026-11-05-safety-layer-cuts.owner-requirement.json`. Most of that lane's fix is adopted here. One part is not, for the reason under **Not a fix**.

## Problem

A runtime's safety layer can cut the agent's own output partway through a turn, and the turn's work is lost with it. Its classifiers judge what the output contains. Many passages that together give, for example, substances, doses, routes of administration and combinations can be cut, whether the agent wrote them or copied them from the owner's own text.

In the origin case, a lane editing the owner's long article wrote a build file that carried dozens of the article's dose passages verbatim, though it was changing few of them. The safety layer cut that turn. The retry generated more of the same and was cut too.

Neither output was needed in that form:

- **Most of the text was copies.** The output carried passages the task wasn't changing.
- **The retry repeated what had been cut.**

## Rule

1. **Write only what the task changes.** Before a long output that carries material a safety layer may treat as hazardous, such as drug doses, routes and combinations, and again after any cut, check how much of that material the task needs the agent to write. The measure is what the task needs, not what the safety layer lets through.
2. **Point to text that stays the same.** Name unchanged text by block ID, heading or exact anchor, and write only the changed passages, as placed edits (`patterns/editorial-authority-and-lossless-editing.md`, **Make every proposed edit operationally placeable**). A report says "B12 to B40 unchanged", not their text.
3. **Copy the owner's text with a script.** When a build or export needs the owner's passages as they stand, a deterministic script copies them by block ID from the registered master. The agent writes the script and the list of IDs, not the passages. The copies are also exact, where a retyped dose or unit can drift. After an edit, a script check confirms that every protected value still matches the master (`patterns/transformation-preservation-proof.md`).
4. **Keep sensitive passages out of replies.** A reply or report to the owner names the passages it touched by ID and says what changed. It doesn't quote them back: the owner has them.
5. **A cut is a boundary.** Treat it like any other refusal by a permission or safety layer (`patterns/worker-self-remediation-before-owner-interruption.md`, **Fail closed on genuine boundaries**). Don't retry the output that was cut. Record the cut in the work record: when, which output, and what was lost. Then apply steps 1 to 4 to the rest of the task and carry on.
6. **What only the agent could write goes to the owner.** If the task needs the agent itself to write or rewrite passages the safety layer cuts, for example rewording a passage that gives doses, stop that part. Leave those passages exactly as the owner wrote them, list them in the work record and in the next report, and tell the owner plainly. He can edit them himself or change the task. The rest of the work goes on.

## Not a fix

Each of these keeps the content and changes only how it gets out, which routes around the safety layer:

- writing the same content with a file-writing or other tool instead of in the reply. A tool call's input is the agent's output too. The rule that long output goes in a file (`patterns/worker-directive-delivery-and-chat-output-budget.md`) is about readability; it doesn't make a file a way past a safety layer;
- splitting the same content into smaller outputs so that none is cut;
- rewording, encoding or masking it so that it passes, including leaving its values as placeholders for a script to fill in;
- asking another model, agent or runtime to produce it.

Steps 1 to 3 reduce what the agent writes in total, by leaving out copies the task didn't need. These keep the total and change only its packaging. After a cut, what can change is whether the agent writes that content at all.

## Existing-work basis

- `patterns/worker-self-remediation-before-owner-interruption.md` (**Fail closed on genuine boundaries**) and `patterns/agent-completable-merge-gates.md` (**No bypass**): a refusal by a permission or safety layer is a boundary, and a refused action isn't disguised behind another tool or route.
- `patterns/suggested-fix-queue.md`, step 3, **ChatGPT note**: content refused once isn't retried in another form or through another route.
- `patterns/editorial-authority-and-lossless-editing.md` and `patterns/targeted-artifact-edit-preservation.md`: placed edits, an exact authorized delta, and the owner's text kept exact.

## Origin evidence

On 2026-11-05 the owner passed on the analysis of a lane editing his long published article, after a safety layer cut two of its turns. The lane found that the cuts matched what the output contained, many passages of substances, doses, routes and combinations at once, and that two outputs had set them off: a build file that reproduced many dose passages verbatim, and the retry, which generated more of them. It proposed three fixes:

1. work by block references and diffs, without re-emitting the dose passages;
2. write verbatim dose passages to files with the file tool ("quietly, to disk"), never into its chat replies;
3. avoid putting many substances, doses and routes into one output, and work in smaller, reference-based pieces.

Fix 1 is steps 2 and 3 here, and fix 3's reference-based pieces are the same thing. Keeping the passages out of replies, from fix 2, is step 4. Writing them through the file tool instead, and splitting the same content into smaller pieces, are under **Not a fix**.

## Limits

- This pattern doesn't decide what content a task may contain; the owner, the project and the runtime's policies do. It covers leaving out output the task doesn't need, and what to do when a safety layer cuts output.
- Which outputs a safety layer cuts depends on the runtime, its version and the content. Nothing here predicts it.
- A static test checks this text and its routing. Whether a lane follows it shows only in its turns (WORKFLOW_ONLY).
