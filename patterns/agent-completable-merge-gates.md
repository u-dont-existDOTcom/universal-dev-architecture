# Merge gates the agent can complete

## Status

Current universal pattern, promoted 2026-10-03 from one project's incident (see **Transfer rationale and limits**). It adds no gate and grants no authority. Changing a hosted gate stays the owner's decision.

## Problem

Branch protection required every review conversation to be resolved before merging, but the agent's permission layer blocked it from resolving threads. Every reviewer comment became a manual click for the owner, repeated on every pull request, and the agent found out at the first merge rather than at the start.

Resolving a thread is a click that verifies nothing about the fix. The owner clicked to satisfy the gate, and nothing checked that the comment was fixed or answered. A gate the agent cannot complete makes the owner the executor of a recurring chore, and the chore tests the wrong thing.

## Rules

1. **Check the gates when the workstream starts.** For a workstream that will merge, release, or deploy through hosted controls, list each hosted gate on that path (for example required reviews, resolved conversations, required checks, bypass limits, environment approvals, and the merge itself) from current settings evidence, not from repository files (`patterns/codex-github-operating-system.md`). For each gate, check that the agent can satisfy it with the permissions it actually has: account or token scopes, the connector's actions, the sandbox, and the permission or safety layer's own refusals, which can block an action the platform allows. Check the exact action, not a neighboring one, because being able to read threads says nothing about resolving them (`patterns/reasoning-selection.md`, capability edges). Read the permission rules or documentation that govern the action, query the settings read-only, or use a refusal already on record. Attempt the action itself only on a destination the workstream already authorizes for such tests, such as a sandbox repository, never by creating a hosted object just to probe. Record can or cannot for each gate in the task checkpoint.
2. **If the agent cannot complete a gate, raise one owner decision early.** Put one question on the owner questions page (`patterns/owner-questions-page.md`) at the start, not at the first merge. It is the owner's decision because it changes what the platform enforces. Name the gate in plain words, say why the agent cannot satisfy it, and give the options with a recommendation. First sort the gate. A clerical gate records a step whose substance a check can verify, such as resolved review conversations or an up-to-date branch. An approval gate exists for independent human authorization, such as a required approving review or an environment approval, and an agent-run check cannot stand in for that separation.
   - **Replace the gate with a check the agent can run that verifies substance** (the recommendation for a clerical gate; never offered for an approval gate). The check passes when the latest review of the exact head commit reports nothing open, every earlier finding maps to a fix commit or to a written reason it was not changed, and the required status checks pass. When the gate it replaces is the up-to-date-branch requirement, the check also confirms that the head contains the current base commit, or runs the required checks on the exact merge result, so checks that passed on an older base cannot admit a change that conflicts with newer work. It ends the recurring clicks, and it costs the platform's own enforcement unless the check is also made a required status check.
   - **Automate the gate with owner-approved tooling,** scoped to that one action, with the approval and scope written down. It keeps the platform gate and removes the clicks, and it costs tooling the owner must approve and maintain. The agent never grants itself the permission that was refused.
   - **Keep the gate and the clicks,** (the recommendation for an approval gate) when the gate exists for a person's authorization or the owner wants a person to confirm each one. Rule 4 then applies, and the agent can attach the substance check's result so the approval rests on a verified result.
3. **Do not hand the owner a recurring chore list.** An owner action that returns on every pull request signals a gate the agent cannot complete. Do not list it again on each pull request; the one decision in rule 2 covers them all. Until the owner decides, the declared gate stays in force, and the agent can attach the substance check's result to each pull request so the owner's clicks rest on a verified result.
4. **Keep owner clicks for decisions.** A click that records a choice only the owner can make (accept a risk, approve a spend, merge a change) stays with the owner. When a click is unavoidable, batch it into one step: exact links to every target in one place (the **For you to do** section of the owner questions page), and a read-back the agent runs afterward to confirm it worked, such as a hosted query that counts the threads still open. The owner is then not asked twice, and the agent does not take "done" on faith.

## Bounds

- **No bypass.** Nothing here lets an agent relax a hosted gate, use an owner-only bypass, merge around a refusal, or disguise a refused action behind another tool or route. A refusal by the permission or safety layer is a boundary (`patterns/worker-self-remediation-before-owner-interruption.md`, **Fail closed on genuine boundaries**).
- **A declared gate stays until the owner changes it.** The agent proposes the replacement, and the owner decides (`patterns/owner-goal-followup-and-requirement-accretion.md`, **Declared gates are not accretion**). A hosted setting counts as changed only when settings or API evidence shows it (`patterns/codex-github-operating-system.md`).
- **One question per gate.** Raise it once per workstream and gate. Reopen it only when the gate, the agent's permissions, or the permission or safety layer changes.

## Failure condition and repair

Failure condition, any one of:

- the first sign that the agent cannot complete a hosted gate comes at the merge step;
- the owner is asked for the same gate action on a second pull request with no decision on the page;
- a thread is marked resolved with no fix and no written reason to point to.

Repair: stop listing the click; put the decision on the owner questions page with a recommendation; batch the unavoidable clicks as in rule 4; and move the answer to **Decided** when the owner replies.

## Relationship to other patterns

- `patterns/codex-github-operating-system.md` (section 6) lists the baseline gates, including resolved review conversations, and owns hosted-control evidence. This pattern adds the check that each gate can be completed, and the decision to raise when one cannot.
- `patterns/worker-self-remediation-before-owner-interruption.md` keeps routine work with the agent. This pattern applies its admission check to hosted gates and keeps its refusal boundary.
- `patterns/owner-questions-page.md` owns where the decision and the batched clicks go.
- `patterns/worker-github-publication-and-recovery.md` preflights publication transport before the work; this pattern preflights the merge gates.
- `patterns/logic-failure-map.md` places this pattern at LF-8.6.

## Requirement-accretion declaration

- Origin: a failure observed in project work and filed by an agent session on 2026-10-03, not an owner statement.
- Decision it changes: whether a hosted gate the agent cannot complete is discovered at the first merge and turned into recurring owner chores, or raised once at the start.
- Why the simpler standard is insufficient: the click that satisfies the gate verifies nothing, and repeating it on every pull request costs the owner time for no assurance.
- Why it is scoped: it adds one start-of-workstream check and at most one owner question per gate. It adds no blocking gate and changes no hosted setting.

## Transfer rationale and limits

Promoted from one project where the default-branch ruleset required resolved review conversations and the agent's permission layer refused thread resolution. The project's own evidence stays in its repository.

- The substance check is only as good as the review behind it. It does not turn an author's own review into independent review (`patterns/independent-evaluation-separation.md`), and it assumes a reviewer that reports open findings against the exact head commit.
- Which actions a permission layer refuses depends on the platform, the account and the layer's current configuration. Check the exact action in the current session; do not rely on this pattern's example.
- Replacing a gate changes what the platform enforces. The owner accepts that tradeoff in deciding; the agent states it in the question.
- In the same project, after the owner replaced the conversation gate with the substance check, the safety layer still refused the agent's merge of its own pull request as a merge without a person's review, although the owner had approved merges in general. The merge stayed an owner click (rule 4). Checking the merge action at the start would have batched those clicks from the first pull request.
