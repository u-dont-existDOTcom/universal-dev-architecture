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

## Multi-item decision pages (owner correction, 2026-10-23)

### When to use the interface

When the assistant delivers many independently actionable edit suggestions, review findings, alternative phrasings or structural proposals **and feedback item by item would be cumbersome in chat**, provide an actual interactive review page **in the same turn** as the recommendations. Do not leave a static report and ask the owner to reply to dozens of item numbers. Use a simple conversational question, not an artifact, when there is only one easy decision. For article work, reuse the existing project review interface instead of inventing a weaker replacement.

The interactive page is a **portable view** of the workstream's owner-questions and decision state; it must not create a competing canonical questions file. Once answers return, reconcile them into the existing Git authority. A reviewer critique remains advice and must never silently overturn an owner's explicit answer.

### Minimum review-page behavior

- Every independent recommendation has a **stable ID, concrete proposed operation, readable source context, exact placement or destination when relevant, and an explanation of what survives the change**. A vague row such as "tighten this section" is not an actionable proposal and should be replaced by an exact suggestion or withdrawn.
- Present **Approve / Revise / Reject / Pending** controls and an editable note for each; never infer approval from silence. Preserve comments on Pending items as well as explicit decisions. A broad structural approval is not a blanket approval of each linked sample rewrite.
- For prose replacements, show the original alongside the proposed wording. For moves or cuts, identify the source location, destination and any unique function, link, image or transition that must remain. Preserve owner edits and chronology when reviewer comments conflict.
- Long pages offer search, category/status filtering, progress, and access to unresolved items. Export **parseable JSON** with the review/source identity, stable IDs, explicit statuses, full owner notes and export time, even with Pending rows. Accept re-import of compatible, source-identical JSON. Validate identity on import; never guess mappings across revisions.
- Make the review usable offline without a required account-specific store. Local autosave is convenient, but JSON export and the workstream's Git decision record provide continuity across browsers/accounts.

### Rendered-text regression check

The 2026-10-23 failure was a review page whose comment boxes **saved the typed text but rendered it invisible**, because the fields had white backgrounds without an explicit foreground color and the user's browser chose light text. An export test alone missed the defect.

For editable inputs and textareas, set explicit **text, background, caret and placeholder colors**, including WebKit text-fill behavior where appropriate. Verify actual entered text is legible under both light and dark browser preferences. Test computed foreground/background contrast and visual rendering, not only whether the DOM value exists. A broken/reissued page must import all prior decisions **and notes on pending items** before delivery; never force the owner to retype work that already survived in JSON.

Before claiming success, test typing, visible contrast, approval/rejection/revision, filtering, JSON download and parse, and importing a prior response. Check local-file navigation and persistence if the test surface permits them; otherwise state precisely what was not tested. Reviewer annotations on a repaired page stay clearly marked as **advisory**, separate from the preserved owner responses.

### Limits

These controls reduce owner feedback friction; they do not expand the assistant's substantive editing, publishing, source-authority, or merge permissions. For complicated article changes, the project's stronger commentable-diff and owner-lock protocols still govern. Do not turn one simple question into a giant form.

Origin: owner request on 2026-10-23 for approve/revise/reject pages when ordinary feedback would be difficult, followed by the owner's report that a generated community-article review's note text was white on white. The interface repair restored 25 exact decisions and treated a separate model's review as advisory. This failure mode is portable across projects.

### Recurrent native-control failure: executable guard (2026-10-24)

A prior instruction-only fix remained on an unmerged branch and did not enter the next generated review. A saved rule is not an installed component. For light review forms, reuse `templates/review-form-controls.css` inline. It pairs foreground/background colors for inputs, textareas, selects/options/optgroups, carets and placeholders, including WebKit text fill, while retaining forced-colors accessibility. Do not apply this light palette silently to a deliberately dark product.

For article review generation, the consumer is `joel-articles/project-sources/review_interface_template.html.txt`; its generator selftest and browser test enforce the control style. Other standalone questionnaires must reuse this asset or an equivalent tested theme. Inspect closed select values and option text, and actually type into every distinct editable control class under light and dark browser preferences. Include a negative fixture recreating the original white-background/unspecified-text defect. Keep contrast/rendering and export/import results tied to the exact delivered bytes. JSON export alone cannot close a visibility defect.

A repaired page must preload the owner's returned answers verbatim, including stable case IDs, source identity, all notes and unresolved choices. Do not make the owner repeat completed review work. A review-branch fix remains proposed until its integration status is verified.
