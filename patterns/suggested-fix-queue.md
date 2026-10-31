# Suggested-fix lanes

## Status

Current universal pattern. Origin: **OWNER**, 2026-09-30. The owner proposed that every project have a suggested-fix lane that it checks whenever it does its other fixes. Then he would no longer copy suggestions between chats, and an agent working here would not have to update projects it isn't working on. Owner requirement: `docs/requirements/2026-09-30-suggested-fix-lanes.owner-requirement.json`.

Maintainer handoff for changes to this repository: **OWNER**, 2026-10-07. Owner requirement: `docs/requirements/2026-10-07-uda-lane-handoff.owner-requirement.json`.

Extracts instead of transcripts in filed items: **OWNER**, 2026-10-15. Owner requirement: `docs/requirements/2026-10-15-chat-github-write-extracts.owner-requirement.json`.

Every-project lane coverage and bootstrap wiring: the second **OWNER** request, 2026-10-07, in the same requirement record.

The mailbox, checked every turn: **OWNER**, 2026-10-31. Owner requirement: `docs/requirements/2026-10-31-lane-mailbox-every-turn.owner-requirement.json`.

## Problem

Agents working in one place keep finding fixes for other projects. Until now those fixes reached the other project in one of two ways, and both went wrong:

- **A pull request opened in the other project.** It waited for the owner, who was asked first about a change the project's own agent never saw.
- **A handoff file given to the owner.** He had to copy it into another chat.

Either way the owner was the channel between agents (`patterns/logic-failure-map.md`, LF-10.1). The project's own agent, which knows its constraints best, spoke last.

A lane also has to be read. Checking it "once per work session" or "at each check-in" still let mail wait: on 2026-10-31, 41 pull requests and 3 issues labeled `uda-lane` were open here, the oldest from 2026-10-09. The maintainer lane had stopped holding separate check-ins, and nothing at the start or end of its turns looked at the label. The owner found one of those pull requests by asking whether it had arrived.

## Rule

1. **One lane per project, kept here.** Every project that uses this architecture's rules has a lane here, `suggested-fixes/<repository>/`, named as on GitHub. Its folder is created when the first item is filed. `suggested-fixes/README.md` lists the projects whose agents are wired, the item format, and the wiring text for step 7.
2. **Filing.** An agent with a suggestion for a project it isn't working on files an item in that project's lane. It does not open a pull request in the project or give the owner a file to relay. The exceptions are the one-time wiring pull request in step 7 and the `uda-lane` pull-request route in step 9. The latter replaces `suggested-fixes/universal-dev-architecture/`; do not file UDA suggestions in that directory. Each directory-lane suggestion is one file, named `<date>-<short-name>.md`, in the format in `suggested-fixes/README.md`: who it's for, where it came from, whether it is an owner request, what to do, why, what to check first, and the exact text when there is one. An item may point to a pull request that already exists in the project.
3. **Public by default.** This repository is public, so items must be safe to publish. Put anything private in the target repository, in an issue or pull request there, and link to it.
   - **Write an extract, not a transcript.** An item or a `uda-lane` pull request filed from a chat gives the useful content in the filer's own words: what was asked, what went wrong, the evidence in summary, and the change wanted. It quotes only the short excerpts needed to show the failure, and it leaves out personal details. This applies to every filer, whatever its runtime, because this repository is public: a conversation's exact output is not safe to publish.
   - **ChatGPT note.** The owner observed on 2026-10-15 that a ChatGPT write to GitHub tends to fail when it carries exact conversation output, and that the same content goes through as such an extract. The cause is not known, and nothing here claims the same of other runtimes. If an extract is refused as content too, report that to the owner and do not retry the same content in another form or through another route. An ordinary failure (GitHub unavailable, a credential, connector or transport error) follows the usual publication recovery in `patterns/worker-github-publication-and-recovery.md`.
4. **Checking the mailbox, every turn.** At the start of every turn, before other work, a lane's agent checks its mailbox and lists what is new since its last check. Until 2026-10-31 this was once per work session.
   - **The mailbox** is every place where something addressed to the lane arrives. First, its lane here, which it reads whether or not the folder exists yet. No folder means no items are waiting. For this repository's maintainer lane, the lane is the open pull requests and issues labeled `uda-lane` (step 9). Then the open issues and pull requests in its own repositories that it didn't open, the edits others made to its handoff note and owner questions page since its last turn, and the messages its runtime queues for it. The lane's handoff note or `AGENTS.md` names these places.
   - **Nothing waits silently.** Each new item gets an outcome from step 5, or a next step and what it waits for, in that turn's handoff update. Items already waiting when a lane starts checking go into a backlog list with the same outcomes, worked oldest first with owner requests ahead; each turn's update says how many are left.
   - **Machinery where the lane has it.** A lane with an end-of-turn step makes it refuse to finish a turn whose mailbox wasn't checked, or whose new items have no outcome or next step.
   - It handles every item that its ledger doesn't list yet, together with its other work.
5. **Deciding.** For each item the project's agent does one of five things: adopts it, adapts it, declines it with a reason, defers it until a named trigger, or puts a question with the tradeoffs on its owner questions page (`patterns/owner-questions-page.md`). Items are advice, and the project's own authority decides. The exception is an item marked as an owner request: the agent can adapt it, but it asks the owner before declining or deferring it.
6. **Recording.** The project keeps `docs/suggested-fixes-ledger.md`, with one row per item: the item, the outcome, where it landed (pull request or commit), the date, and a note. The row goes in with the change it describes, or on its own for a decline. When an adopted item brings a rule from this architecture into the project's runtime, it is also recorded as an import (`patterns/carrying-uda-into-standalone-projects.md`).
7. **Wiring.** Each project's `AGENTS.md` carries the short section given in `suggested-fixes/README.md`, unless its agents load this repository's root `AGENTS.md` every turn. When a project starts using these rules, the agent carrying them in adds the wiring section, replacing `<repository>` with the project's name. For an existing project that isn't wired yet, one pull request adds only that section to its `AGENTS.md`, because an unwired project cannot read its lane. The first agent to file an item for such a project opens that wiring pull request. Add the project to the README's wired-project table when the wiring is in place.
8. **Revising and closing.** A changed suggestion is a new item that names the one it replaces. Once a project's ledger records an item's outcome, an agent working here may move the item to `suggested-fixes/<repository>/done/`.
9. **Changes to this repository.** An agent with a change for this architecture opens a pull request here (a draft is fine), adds the `uda-lane` label, and leaves one comment saying what remains, such as an owner decision it couldn't get. The label hands the pull request to this repository's maintainer lane, which lists labeled pull requests at the start of every turn (step 4), then reviews and merges them. After handing over, the filing agent changes the pull request only if the maintainer asks. Chats, handoff folders and files are not a handoff channel.

## Bounds

- A lane adds no authority and bypasses no gate. It carries advice to the agent that decides.
- Lanes are for suggestions to projects the filing agent isn't working on. An agent working in a project makes the change there.
- The owner can still talk to any project's agent directly. The lane replaces relaying, not the owner's own requests.

## Compact rules moved from root `AGENTS.md`

At the start of every turn, check your mailbox, including your lane in `suggested-fixes/`; file suggestions for other projects there, not as pull requests in them: `patterns/suggested-fix-queue.md`.
