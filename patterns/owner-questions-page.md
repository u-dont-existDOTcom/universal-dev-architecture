# Owner questions page

## Status

Current universal pattern. Origin: **OWNER**, 2026-09-30. For questions waiting on him, the owner asked every agent to use the AskRigor worker's method: one continuously updated page of the tradeoffs he has to weigh, instead of chat messages about pull request numbers. He asked for it to become a standard method here, because otherwise it is hard to understand exactly what he needs to do. Owner requirement: `docs/requirements/2026-09-30-owner-questions-page.owner-requirement.json`. The sentences under **For you to do** about exact links, grouping, and recurring actions were added 2026-10-03 from `patterns/agent-completable-merge-gates.md`; they come from an observed failure, not from the owner's statement. Rule 2 changed on 2026-10-10 at the owner's request, after a session in his other account could not open a page that existed only as an artifact: the file in Git is now the page's authoritative copy, and a published artifact is a view of it (`patterns/cross-account-continuity.md`, `docs/requirements/2026-10-10-cross-account-continuity.owner-requirement.json`). Rule 9 was added the same day, after the page's Git copy lost its colours: the owner could no longer see at a glance what was a question, what was for him to do and what was done (`docs/requirements/2026-10-10-owner-page-status-colours.owner-requirement.json`).

## Problem

An agent that needs the owner tends to ask in the middle of a status message, name the thing by its pull request, and move on. Its questions then sit in several chat messages and pull request descriptions. Before the owner can answer, he has to work out what each one is about, what the options are, and what happens after each answer. Questions get missed, and answered ones get asked again.

## Rule

1. **One page per workstream.** An agent or workstream that can need the owner keeps one owner questions page. It updates the page in place whenever a question is added, answered, or changes. The page is the complete list of what that workstream needs from the owner. Chat messages carry status and point to the page. A question that appears only in chat has not been asked.
2. **Where the page lives.** The page's authoritative copy is one file, `OWNER-QUESTIONS.md`, in Git, so a session in any of the owner's accounts can read and update it (`patterns/cross-account-continuity.md`). Keep it in the workstream's repository, or in a private repository of the owner's when the workstream's repository is public and the page holds his private details. Where the surface can publish a page the owner can open from any device, also publish the file as a page; on Claude, that is a published artifact. The published page is a view: update the file first, then republish it. Only the account that published a view can republish it. A session in another account updates the file and gives the owner the file's link, and the next session in the publishing account republishes the view from the file. Before creating a page, look for the workstream's existing file and published view, and update them. Never start a second page.
3. **Sections, in this order:**
   - **Open questions.** Each question has a number that is never reused.
   - **For you to do (no decision needed).** Actions only the owner can take, with the steps, the time they take, how to tell they worked, and an exact link to every target. When several actions belong together, group them into one step. An action that comes back on every pull request or run is asked about once: it becomes one open question about removing or automating it (`patterns/agent-completable-merge-gates.md`). Until it is removed or automated, each instance that still needs the owner stays listed here, grouped into one step with exact links.
   - **Decided.** Each answer in the owner's words, with what was done about it, so he can check it was understood.
   - **Coming up (not a question yet).** Work that may need him later, with the default that applies if nothing changes.
4. **What each open question says:**
   - a title that names the decision in plain words, never a pull request, branch or issue number;
   - what the question is about, and why it needs the owner rather than the agent;
   - the options, each with what it gets and what it costs;
   - the agent's recommendation and why, and the default if the owner doesn't answer, when a default is safe;
   - what happens after each answer, and when;
   - how to answer, for example `4: B`.

   Links to pull requests, issues, and commits come after the plain explanation, as places to look.
5. **Before a question goes on the page,** resolve whatever the agent can decide itself (the minimum-owner-choice rule in root `AGENTS.md`). When the question is about a change to another project, that project's own agent decides first, through its lane (`patterns/suggested-fix-queue.md`). Merge questions that turn on the same consequence.
6. **When the owner answers,** act on the answer, move the question to Decided with his words, and update the page in the same turn.
7. **The header** says when the page was last updated, how many questions are open, and how to answer. A reply that changes the page says so in one line.
8. **Private data.** A page can be shared by its link. Keep secrets, credentials, and other people's private details off it. A file in a public repository is public: when the page holds the owner's own private details, its file goes in a private repository (rule 2).
9. **Status at a glance.** Colour-code every item, so the owner sees at once what is a question for him, what is for him to do, what is next or in progress, and what is done or decided. Use the same colours throughout, and explain them in a one-line legend under the header. In a Git file, use what the host renders: on GitHub, a coloured callout under each section heading (`> [!IMPORTANT]` for open questions, `> [!WARNING]` for things to do, `> [!TIP]` for decisions, `> [!NOTE]` for what's coming up) and a coloured marker at the start of each item's heading (🟣 question, 🟠 to do, 🔵 next or in progress, 🟢 done or decided). A published view keeps the same colours.

## Bounds

- The page adds no gate and grants no authority. A decision that belongs to the agent stays with the agent.
- A gate that a project declares still applies; the page is where the gate's question is asked.
- Status that needs nothing from the owner belongs in chat or the task checkpoint. It reaches the page only as a one-line result under Decided.

## Reference implementation (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)

The model is the AskRigor worker's "AskRigor owner questions" page, a published Claude artifact that the worker updates whenever a question is added or answered. It has numbered open questions with lettered options and a recommendation, owner tasks with steps, decisions quoted back, and upcoming work with its defaults. Its header says: "Everything else in my messages is status; nothing that needs you is left out of here."
