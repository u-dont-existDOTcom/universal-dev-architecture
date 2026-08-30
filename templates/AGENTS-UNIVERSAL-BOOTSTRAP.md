# Universal Project Bootstrap

Before substantive work, load the current cross-project guidance from `u-dont-existDOTcom/universal-dev-architecture`, starting with `LESSON-INDEX.md`. Follow only the task-relevant current patterns/templates. Do not rely on remembered lesson lists from prior chats.

Authority order:

1. current owner instructions and current project requirements;
2. verified current state/evidence in this repository;
3. current universal guidance from `u-dont-existDOTcom/universal-dev-architecture`;
4. older summaries, stale checkpoints, and remembered chat context.

## Owner-facing operational references

In user-facing prose, explain the thing before its repository or automation identifier. On first use—or after a topic shift—write the plain-language role first and the pull-request number, issue number, branch name, commit SHA, workflow/run/job ID, artifact ID, or similar handle, for example `the local Playwright Pangram GUI runner (PR #78)` rather than `PR #78` alone.

When an owner decision is required, state the substantive choice, consequences, and recommended default in ordinary language. Never ask the owner to choose among opaque PR numbers, branches, commits, or run IDs as though those identifiers were the decision itself. Follow `patterns/human-readable-operational-references.md` for the complete rule.

## Test efficiency

For non-trivial software tasks where repeated tests can materially affect task time, load `patterns/test-efficiency-and-verification-budget.md` before the implementation loop. Start telemetry before substantive implementation using the project's equivalent of `scripts/test_efficiency.py`.

If no project-local equivalent exists, vendor the current canonical observer from `u-dont-existDOTcom/universal-dev-architecture`, or execute the current canonical observer from a checked-out universal repository with `--root <PROJECT>`. Do not silently skip telemetry because the project lacks the file; a missing observer is not a valid `not_applicable` reason.

Use focused/affected tests in the inner loop. Run the full relevant suite at explicit integration/completion checkpoints rather than after every edit. Do not rerun an unchanged green full or mutation suite merely for reassurance. Mutation testing requires an explicit test-quality, high-risk, survivor-followup, owner, or release trigger. Required final/CI gates still run at their proper checkpoint.

## Specialist design architecture

When the task materially involves UI/UX, frontend visual implementation, website or application design/redesign, long-form reading experience, visual hierarchy, typography, color, layout, motion, interaction design, component design, design systems, design critique/study, accessibility/responsive visual review, or design-production auditing, recover the current `u-dont-existDOTcom/design` repository before substantive design work.

Start with the live default-branch `skills/design/SKILL.md` and apply the universal `patterns/canonical-design-os-bootstrap.md` rule. The live design repository outranks remembered design guidance or stale generated adapters, but remains subordinate to current owner instructions, project-specific product/content truth, verified project state, and universal development architecture.

Do not load the design dependency for backend-only or otherwise non-design work. If it is inaccessible, do not invent or reconstruct its current contents from memory; continue from current local authority and record the missing specialist dependency.

## Durable continuity

Treat conversation/context as disposable working memory. Treat the repository as durable project memory and Git history as the audit trail.

For long-running, multi-step, autonomous, or multi-session work, maintain one obvious project-local current-state checkpoint (`CURRENT-STATE.md`, `state/CURRENT-STATE.md`, or an existing project equivalent). It must be concise enough for a fresh competent worker to recover the goal, active decisions/constraints, completed work, current step, remaining work, blockers, relevant evidence/tests/branches/commits, and next safe action without the old transcript.

Update that checkpoint at meaningful durable boundaries, including consequential decisions, milestones, blockers, handoffs, and before claiming multi-step work complete.

After interruption, a fresh thread, context compaction, or model switch, inspect actual repository state and recent relevant commits/artifacts first. Reconcile the checkpoint, identify exactly what survived, repair stale entries, and resume from the latest verified durable boundary without repeating completed work.

Never let a stale checkpoint or remembered chat state outrank newer owner instructions or verified repository state.

## Supervised long-task handoffs

For any long work task that needs supervision, keep the originating Chat as the owner-facing supervisor and GitHub as the canonical durable state. Before handing execution to a fresh Codex worker or requesting higher-level supervision, write the task instructions and a full self-contained handoff into the task's canonical GitHub issue, pull request, or committed recovery artifact. Include the goal and acceptance criteria, authority and constraints, relevant background and decisions, completed/current/remaining work, exact evidence and repository locations, blockers and uncertainty, and the next safe action. The handoff must support resumption without the old chat while still obeying existing secret, privacy, and data-sharing rules.

Give the owner one very short paste-ready bootstrap instruction: `Resume the long task from <GitHub handoff URL/path>; verify current state and continue until complete unless a genuine owner tradeoff is required.`

When higher-level supervision is needed and the supervisor does not need direct GitHub access, use Brave to open a new Pro chat and paste the complete handoff and all context needed for judgment into that chat; a GitHub link alone is insufficient because Pro chats in Brave cannot reliably access GitHub. If the supervisor must access GitHub, use GPT with extra-high reasoning instead of Pro. Also use extra-high without Pro when the task is not complex enough to justify Pro. Default therapy-bot work to Pro for therapy or clinical-conceptual considerations, AskRigor work to Pro for research-methodology or scientific considerations, and article work to extra-high without Pro unless it is unusually complex.

Stop only when the Pro supervisor identifies a genuine owner decision involving material tradeoffs or another existing authority boundary requires owner input. Surface the choice, consequences, and recommended default to the owner, and do not cross the affected boundary. Otherwise apply the supervision and continue automatically without asking for approval. Write supervisory decisions and updated status back to the canonical GitHub handoff before continuing. If Brave or Pro is unavailable, record the exact capability failure in the GitHub handoff, use an available GPT extra-high route when adequate, and continue; pause only when required supervision remains unavailable or another genuine pause boundary applies.

## Learning closeout

For substantive work, follow the current universal lesson-closeout pattern. Preserve project-specific evidence here and promote genuinely transferable lessons to the universal repository with provenance and limits.

If the universal repository cannot be accessed, do not invent or reconstruct its current contents from memory. Continue only under current local project requirements and this bootstrap, and record the missing dependency for the next worker.
