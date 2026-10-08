# Suggested-fix lanes

## Status

Current universal pattern. Origin: **OWNER**, 2026-09-30. The owner proposed that every project have a suggested-fix lane that it checks whenever it does its other fixes. Then he would no longer copy suggestions between chats, and an agent working here would not have to update projects it isn't working on. Owner requirement: `docs/requirements/2026-09-30-suggested-fix-lanes.owner-requirement.json`.

Maintainer handoff for changes to this repository: **OWNER**, 2026-10-07. Owner requirement: `docs/requirements/2026-10-07-uda-lane-handoff.owner-requirement.json`.

Every-project lane coverage and bootstrap wiring: the second **OWNER** request, 2026-10-07, in the same requirement record.

## Problem

Agents working in one place keep finding fixes for other projects. Until now those fixes reached the other project in one of two ways, and both went wrong:

- **A pull request opened in the other project.** It waited for the owner, who was asked first about a change the project's own agent never saw.
- **A handoff file given to the owner.** He had to copy it into another chat.

Either way the owner was the channel between agents (`patterns/logic-failure-map.md`, LF-10.1). The project's own agent, which knows its constraints best, spoke last.

## Rule

1. **One lane per project, kept here.** Every project that uses this architecture's rules has a lane here, `suggested-fixes/<repository>/`, named as on GitHub. Its folder is created when the first item is filed. `suggested-fixes/README.md` lists the projects whose agents are wired, the item format, and the wiring text for step 7.
2. **Filing.** An agent with a suggestion for a project it isn't working on files an item in that project's lane. It does not open a pull request in the project or give the owner a file to relay. The exceptions are the one-time wiring pull request in step 7 and the `uda-lane` pull-request route in step 9. The latter replaces `suggested-fixes/universal-dev-architecture/`; do not file UDA suggestions in that directory. Each directory-lane suggestion is one file, named `<date>-<short-name>.md`, in the format in `suggested-fixes/README.md`: who it's for, where it came from, whether it is an owner request, what to do, why, what to check first, and the exact text when there is one. An item may point to a pull request that already exists in the project.
3. **Public by default.** This repository is public, so items must be safe to publish. Put anything private in the target repository, in an issue or pull request there, and link to it.
4. **Checking.** A project's agent reads its lane before starting other fixes in that project, once per work session, whether or not the folder exists yet. No folder means no items are waiting. It handles every item that its ledger doesn't list yet, together with that work.
5. **Deciding.** For each item the project's agent does one of five things: adopts it, adapts it, declines it with a reason, defers it until a named trigger, or puts a question with the tradeoffs on its owner questions page (`patterns/owner-questions-page.md`). Items are advice, and the project's own authority decides. The exception is an item marked as an owner request: the agent can adapt it, but it asks the owner before declining or deferring it.
6. **Recording.** The project keeps `docs/suggested-fixes-ledger.md`, with one row per item: the item, the outcome, where it landed (pull request or commit), the date, and a note. The row goes in with the change it describes, or on its own for a decline. When an adopted item brings a rule from this architecture into the project's runtime, it is also recorded as an import (`patterns/carrying-uda-into-standalone-projects.md`).
7. **Wiring.** Each project's `AGENTS.md` carries the short section given in `suggested-fixes/README.md`, unless its agents load this repository's root `AGENTS.md` every turn. When a project starts using these rules, the agent carrying them in adds the wiring section, replacing `<repository>` with the project's name. For an existing project that isn't wired yet, one pull request adds only that section to its `AGENTS.md`, because an unwired project cannot read its lane. The first agent to file an item for such a project opens that wiring pull request. Add the project to the README's wired-project table when the wiring is in place.
8. **Revising and closing.** A changed suggestion is a new item that names the one it replaces. Once a project's ledger records an item's outcome, an agent working here may move the item to `suggested-fixes/<repository>/done/`.
9. **Changes to this repository.** An agent with a change for this architecture opens a pull request here (a draft is fine), adds the `uda-lane` label, and leaves one comment saying what remains, such as an owner decision it couldn't get. The label hands the pull request to this repository's maintainer lane, which lists labeled pull requests at each of its check-ins, then reviews and merges them. After handing over, the filing agent changes the pull request only if the maintainer asks. Chats, handoff folders and files are not a handoff channel.

## Bounds

- A lane adds no authority and bypasses no gate. It carries advice to the agent that decides.
- Lanes are for suggestions to projects the filing agent isn't working on. An agent working in a project makes the change there.
- The owner can still talk to any project's agent directly. The lane replaces relaying, not the owner's own requests.

## Compact rules moved from root `AGENTS.md`

Before other fixes in a project, read its lane in `suggested-fixes/`; file suggestions for other projects there, not as pull requests in them: `patterns/suggested-fix-queue.md`.
