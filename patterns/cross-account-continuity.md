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
5. **The resume line ends every reply, as one line where one will do (owner rule).** The owner's standing preference asks for the one-line handoff for his other account at the end of each turn. On 2026-11-08 he reported that new chats still left it out ("new chats are still not giving me the account handoff line at the end for some reason"). On 2026-11-27 he reported the opposite problem ("why am i getting two github handoff lines with every turn?"): a lane whose handoff lives in GitHub ended with a resume line and a `GH handoff:` line that linked the same file. So in his project work every final answer, a new chat's first turn included, ends like this:
   - **One line when the resume line links the GitHub checkpoint.** Then the resume line is the `GH handoff:` line (`patterns/owner-requested-terminal-github-handoff.md`, rule 2): `GH handoff: Continue my <work name> work: read <link to the checkpoint> — Next: <one specific safe action>`. Any step the next session takes first goes in its `Next`, and anything it needs for that step is reachable from the checkpoint; finished work ends with `Closed:` instead, as that rule says. This is the case for a lane whose handoff lives in GitHub, and whenever a session can't update the local note for any reason, such as a computer it can't reach or a folder it can't write; then the line also says the local note wasn't updated.
   - **Two lines only for a local note, and only for open work.** When the resume line names the local handoff note, updated this turn, it comes just before the `GH handoff:` line, which links the checkpoint verified this turn: the note's GitHub copy only when that copy is the checkpoint, never a copy that lacks the current state and next action. When the note was updated but no GitHub checkpoint can be verified this turn, the resume line still comes first, and the `GH handoff:` line is that pattern's link-free line. A resume line never carries a second GitHub link.
   - **Never two lines that link the same file.**
   - **Finished work ends with one `Closed:` line** linking the final verified artifact, with no resume line.

   For open work, the line links the latest checkpoint verified this turn: the one saved this turn, or, when this turn's checkpoint couldn't be saved, read back or linked by a verified URL, the newest earlier checkpoint whose exact URL is verified this turn, with the failed step named in the same line. Only when no checkpoint can be verified this turn is it that pattern's link-free line (its rule 5), saying what wasn't saved and why. For finished work, the `Closed:` line links the final artifact verified this turn, never a checkpoint in its place; when that artifact can't be verified this turn, it is the link-free `Closed:` line. Either way there is no resume line. A self-contained answer, such as a translation or a quick fact, needs no line.

## Bounds

- This adds no gate and grants no authority. It sets where state lives.
- A Git copy or handoff note records state; it does not make a decision or an approval valid. Approvals still come from the owner, in the session that acts on them.
- No repository rule reaches a session that never loaded UDA.

## Reference implementation (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)

The owner's local handoff folder is `~/claude-acceptance-transfer/handoffs/` on his laptop. Its `README.md` holds the index table (work, note, writer) and the resume line: "Continue my <work name> work: on my laptop, read ~/claude-acceptance-transfer/handoffs/<file> and carry on from its next step." A Claude session in either of his accounts reaches the folder through Claude Code on the laptop or through Desktop Commander. A lane whose handoff lives in GitHub, or a chat that can't reach the laptop, ends with the one combined line: "GH handoff: Continue my <work name> work: read <link to the Git checkpoint> — Next: <first step, then carrying on from START HERE>". A session that couldn't update the laptop note adds "(the laptop note wasn't updated)".
