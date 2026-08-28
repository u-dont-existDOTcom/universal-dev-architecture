# Universal Project Bootstrap

Before substantive work, load the current cross-project guidance from `u-dont-existDOTcom/universal-dev-architecture`, starting with `LESSON-INDEX.md`. Follow only the task-relevant current patterns/templates. Do not rely on remembered lesson lists from prior chats.

Authority order:

1. current owner instructions and current project requirements;
2. verified current state/evidence in this repository;
3. current universal guidance from `u-dont-existDOTcom/universal-dev-architecture`;
4. older summaries, stale checkpoints, and remembered chat context.

## Autonomous routine execution

Across Chat, Work, Codex/agent execution, and browser or computer-use, once the requested outcome and authority are clear, continue through routine, reversible, in-scope execution. Do not ask for approval merely to inspect or edit in-scope files, run commands or tests, debug failures, browse for task-required information, validate results, or take the obvious next step.

Do not convert ordinary implementation decisions into owner decisions. Infer low-risk, reversible details from the stated goal, repository evidence, existing architecture, and conventions. An owner answer, correction, upload, or requested clarification is input to the active task, not a completion event. After incorporating it, continue automatically to the next safe in-scope action while the stated goal remains unfinished. Do not return only an acknowledgment or ask the owner what to do next when repository state, the task plan, or the request already determines that step.

Ask the owner only when materially different viable choices have consequential tradeoffs and the correct choice cannot reasonably be inferred; an action is destructive or difficult to reverse; an action has meaningful external consequences such as publishing, sending communications, purchases or spending, or security, account, or privacy consequences; the work requires material scope expansion or new authority; genuinely unavailable required information, permission, or credential blocks progress; or there is an explicit request to stop. These boundaries preserve applicable safety, access, and authorization controls.

When the execution environment or security sandbox presents an approval gate, do not add a redundant conversational approval request; use the environment's gate directly. The gate remains authoritative, and this rule never bypasses a required approval.

## Development assurance lane

For software/product work, load `patterns/development-assurance-lanes.md`.

Default to **Iteration** unless the owner or current project requirements actually establish a decision or release boundary. Ordinary requests such as “fix this,” “why is this worse?”, “try this approach,” “make the app better,” or “let me test it” do not by themselves authorize or require release-grade verification.

- **Iteration:** build the smallest reversible candidate, run focused/affected tests plus a few representative behavior cases, and get the actual candidate in front of the owner/product evaluator early.
- **Decision:** when a material architecture/product choice remains unresolved, run the smallest direct comparison that can settle it. Hold unrelated variables constant and stop when enough evidence exists for the next reversible implementation.
- **Release:** only when actually preparing to merge, release, publish, install, deploy, migrate, or cross another consequential boundary, run the complete applicable repository/CI/security/privacy/review/rollback/release gates.

High-risk behavior may require targeted hard gates during Iteration/Decision. Do not use one hard invariant to import every unrelated release gate into the inner loop.

Before expensive validation, require a concrete answer to: `What current decision can this result change?` If none, defer it. Optional model judges, hosted evaluation, or CI rate limits must not freeze unrelated safe development.

After a high-rigor task, return ordinary development to Iteration. Do not preserve a permanent assurance ratchet.

If an active task lock/checkpoint encodes stale release-grade completion and the owner explicitly returns the project to experimentation, supersede/update the task state rather than continuing the obsolete campaign.

## Owner-facing operational references

In user-facing prose, explain the thing before its repository or automation identifier. On first use—or after a topic shift—write the plain-language role first and the pull-request number, issue number, branch name, commit SHA, workflow/run/job ID, artifact ID, or similar handle, for example `the local Playwright Pangram GUI runner (PR #78)` rather than `PR #78` alone.

When an owner decision is required, state the substantive choice, consequences, and recommended default in ordinary language. Never ask the owner to choose among opaque PR numbers, branches, commits, or run IDs as though those identifiers were the decision itself. Follow `patterns/human-readable-operational-references.md` for the complete rule.

## Test efficiency

For non-trivial software tasks where repeated tests can materially affect task time, load `patterns/test-efficiency-and-verification-budget.md` before the implementation loop. Start telemetry before substantive implementation using the project's equivalent of `scripts/test_efficiency.py`.

If no project-local equivalent exists, vendor the current canonical observer from `u-dont-existDOTcom/universal-dev-architecture`, or execute the current canonical observer from a checked-out universal repository with `--root <PROJECT>`. Do not silently skip telemetry because the project lacks the file; a missing observer is not a valid `not_applicable` reason.

Use focused/affected tests in the inner loop. Run the full relevant suite at explicit integration/completion checkpoints appropriate to the active assurance lane rather than after every edit. Do not rerun an unchanged green full or mutation suite merely for reassurance. Mutation testing requires an explicit test-quality, high-risk, survivor-followup, owner, or release trigger. Required final/CI gates still run at their proper release/merge checkpoint.

## Specialist design architecture

When the task materially involves UI/UX, frontend visual implementation, website or application design/redesign, long-form reading experience, visual hierarchy, typography, color, layout, motion, interaction design, component design, design systems, design critique/study, accessibility/responsive visual review, or design-production auditing, recover the current `u-dont-existDOTcom/design` repository before substantive design work.

Start with the live default-branch `skills/design/SKILL.md` and apply the universal `patterns/canonical-design-os-bootstrap.md` rule. The live design repository outranks remembered design guidance or stale generated adapters, but remains subordinate to current owner instructions, project-specific product/content truth, verified project state, and universal development architecture.

Do not load the design dependency for backend-only or otherwise non-design work. If it is inaccessible, do not invent or reconstruct its current contents from memory; continue from current local authority and record the missing specialist dependency.

## Durable continuity

Treat conversation/context as disposable working memory. Treat the repository as durable project memory and Git history as the audit trail.

For long-running, multi-step, autonomous, or multi-session work, maintain one obvious project-local current-state checkpoint (`CURRENT-STATE.md`, `state/CURRENT-STATE.md`, or an existing project equivalent). It must be concise enough for a fresh competent worker to recover the goal, active assurance lane, active decisions/constraints, completed work, current step, remaining work, blockers, relevant evidence/tests/branches/commits, deferred release obligations, and next safe action without the old transcript.

Update that checkpoint at meaningful durable boundaries, including consequential decisions, milestones, blockers, handoffs, lane changes, and before claiming multi-step work complete at the current lane.

After interruption, a fresh thread, context compaction, or model switch, inspect actual repository state and recent relevant commits/artifacts first. Reconcile the checkpoint, identify exactly what survived, repair stale entries, and resume from the latest verified durable boundary without repeating completed work.

Never let a stale checkpoint or remembered chat state outrank newer owner instructions or verified repository state.

## Learning closeout

For substantive work, follow the current universal lesson-closeout pattern. Preserve project-specific evidence here and promote genuinely transferable lessons to the universal repository with provenance and limits.

If the universal repository cannot be accessed, do not invent or reconstruct its current contents from memory. Continue only under current local project requirements and this bootstrap, and record the missing dependency for the next worker.
