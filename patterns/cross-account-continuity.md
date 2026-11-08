# Cross-account continuity

## Status

Current universal pattern. Origin: **OWNER**, 2026-10-10. A Claude session working in one of the owner's accounts could not open a workstream's owner questions page, a Claude artifact published from his other account, and found no copy of it in Git. The owner asked that anything that should continue between accounts be stored clearly in GitHub, and that the continuation handoff always be kept in his local handoff folder. Owner requirement: `docs/requirements/2026-10-10-cross-account-continuity.owner-requirement.json`. This pattern extends **Usage limits and account switches** in `patterns/context-compaction-resilience.md`, which already requires that a fresh session in any account can resume from durable state.

## Problem

Some surfaces keep state for one account only. A Claude artifact can be read and republished only from the account that published it; chats, project memory, scheduled tasks and scratch folders also stay with their account. When the owner continues in another account, a session there cannot see what lives only on those surfaces. On 2026-10-10 a workstream's owner questions page existed only as an artifact in the other account. The new session could not read the owner's earlier answers or put its next question on the page, so it asked in chat.

## Rule

1. **Git holds everything a successor needs.** Anything a session in another account needs to continue the work is stored in GitHub, at a path the project's bootstrap or checkpoint names. That includes the current-state checkpoint, open obligations, the owner's decisions in his own words, and the owner questions page (`OWNER-QUESTIONS.md`, `patterns/owner-questions-page.md`). An artifact, chat, memory, scheduled task or scratch file can show this state or speed work up, but it is never the only copy. Update the Git copy first, then the view.
2. **Private state goes in a private repository.** A file in a public repository is public. When the state holds the owner's private details, such as paths to his key files, account or server details, or his own research goals, store it in a private repository of his, and record where it is in the handoff note and the private checkpoint. Never record the value of a secret anywhere; record only where the secret is kept.
3. **One handoff note per line of work, in the owner's local handoff folder.** Each session doing ongoing work keeps one note there, named after the work, not the session. The note says:
   - what is running and what is waiting;
   - where the durable files are: repositories, paths and branches;
   - what comes next, and any open owner question;
   - which account and session wrote it;
   - a one-line resume instruction that works from any account.

   The note points to Git; it does not replace it. A session that starts a new line of work adds its note to the folder's index.
4. **Before the turn ends,** the Git copy and the handoff note are both current. A session that cannot reach a view owned by another account says so, updates the Git copy, and gives the owner the Git link. The next session in the account that owns the view republishes it from the Git copy.
5. **The resume line ends every reply (owner rule).** The owner's standing preference asks for the one-line handoff for his other account at the end of each turn, and on 2026-11-08 he reported that new chats still left it out ("new chats are still not giving me the account handoff line at the end for some reason"). So in his project work every final answer, a new chat's first turn included, ends with the resume line, followed only by the `GH handoff:` line (`patterns/owner-requested-terminal-github-handoff.md`). Where the session wrote the handoff note, the line names the note. Where it couldn't, for example in a chat that can't reach the computer that holds the folder, the line says so and names the Git checkpoint instead, so it still works from the other account. When nothing could be saved, the line says what wasn't saved and why. A self-contained answer, such as a translation or a quick fact, needs neither line.

## Bounds

- This adds no gate and grants no authority. It sets where state lives.
- A Git copy or handoff note records state; it does not make a decision or an approval valid. Approvals still come from the owner, in the session that acts on them.
- No repository rule reaches a session that never loaded UDA.

## Reference implementation (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)

The owner's local handoff folder is `~/claude-acceptance-transfer/handoffs/` on his laptop. Its `README.md` holds the index table (work, note, writer) and the resume line: "Continue my <work name> work: on my laptop, read ~/claude-acceptance-transfer/handoffs/<file> and carry on from its next step." A Claude session in either of his accounts reaches the folder through Claude Code on the laptop or through Desktop Commander. A chat that can't reach the laptop ends with "Continue my <work name> work: read <link to the Git checkpoint> and carry on from its next step (this chat couldn't update the laptop note)."
