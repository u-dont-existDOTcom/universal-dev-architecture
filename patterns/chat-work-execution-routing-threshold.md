# Chat / Work Execution Routing Threshold

Status: REQUIRED OWNER CORRECTION
Date: 2026-09-02
Updated: 2026-09-20

Authority addendum: `docs/requirements/2026-09-12-chat-session-timestamp-work-reasoning-budget.owner-requirement.json`.
Additional owner requirement: `docs/requirements/2026-09-12-work-thinking-budget.owner-requirement.json`.
Work-thread lineage naming requirement: `docs/requirements/2026-09-18-work-thread-lineage-naming.owner-requirement.json`.
Work origin-chat backlink requirement: `docs/requirements/2026-09-18-work-receipt-origin-chat-backlink.owner-requirement.json`.
Work human-gate assist requirement: `docs/requirements/2026-09-18-work-human-gate-assist.owner-requirement.json`.
ChatGPT multi-surface recovery requirement: `docs/requirements/2026-09-19-chatgpt-multi-surface-thread-recovery.owner-requirement.json`.
ChatGPT Work cloud dispatch requirement: `docs/requirements/2026-09-19-chatgpt-work-cloud-dispatch.owner-requirement.json`.
Direct-Chat execution capability requirement: `docs/requirements/2026-09-19-chat-direct-execution-capability-preflight.owner-requirement.json`.

## Controlling rule

**Chat owns reasoning and ordinary GitHub work. Work/Codex is an execution surface, not a preferred reasoning surface.**

Do not hand a task to Work merely because Work could help, because the task mentions GitHub, because a repository contains many files, or because Work has terminal/browser tooling.

The routing question is not:

> Would Work be useful?

It is:

> Can the current Chat surface reliably perform the next bounded action with its own authorized tools, including any directly exposed terminal, filesystem, browser, computer-use, remote-desktop, or connected-device tool? If not, is the missing execution capability or sustained statefulness substantial enough to justify Work/Codex?

If Chat can perform the action directly and reliably, keep the action in Chat. Action category alone is never a Work trigger.

### Work admission requires current-turn direct-capability discovery

Before proposing or creating a Work/Codex handoff for terminal, filesystem, SSH,
VPS, deployment, browser, GUI, remote-desktop, Docker, Coolify, or comparable
execution, perform an actual current-turn capability preflight for the exact
bounded action. **Do not equate "not present in the initially expanded tool
schema" with "unavailable to Chat."** When the surface exposes deferred tools,
connector/plugin discovery, Code Mode tool catalogs, or another capability
lookup, inspect that catalog before making the routing decision.

A directly authorized connected computer or Remote Desktop Commander path counts
as Chat execution even when the ultimate target is another machine. If Chat can
reach an authorized computer and that computer can SSH to the VPS, run the
deployment command, edit the filesystem, or operate the required UI, the action
remains in Chat unless the operation is genuinely too long-range/stateful to be
practical here. VPS administration, SSH, Docker/Coolify operations, local
builds/tests, and deployment are therefore **not Work triggers by category**.

When a mixed task contains substantive prose, architecture, scientific/safety
judgment, or an exact patch that Chat can resolve, finish that semantic work in
Chat before considering any residual execution handoff. Do not make Work invent
content merely because Work might later perform a mechanical deployment step.

If Work is still selected after this preflight, the handoff must be explainable
in the form:

```text
CHAT_DIRECT_EXECUTION_PREFLIGHT:
  residual_action: <exact bounded action>
  direct_chat_route: unavailable | unreliable | impractical_for_sustained_state
  evidence: <specific missing capability or concrete impracticality>
```

"This needs SSH," "this is on a VPS," "this requires deployment," or "Work has a
terminal" is never sufficient evidence by itself. If a usable direct Chat route
is discovered, Work admission fails and Chat performs the action.

For supervisory/control-plane chats, this is an automation invariant: **when the chat itself can read or write the required GitHub artifact, it must do that GitHub operation directly and must not delegate that operation to Work/Codex.** A Chat -> Work handoff requires explicit user acceptance; delegating a routine GitHub receipt, issue comment, PR update, or evidence read therefore inserts an avoidable human gate and can make an otherwise unattended Mission Control cycle invisible to the owner.

## Per-turn chat timestamp and bootstrap reactivation

Every assistant turn must begin its final user-visible answer with a **visible date-and-time stamp** so the owner can identify when that turn occurred without reconstructing chronology later.

- Use the owner's local timezone when it is known and reliable.
- Otherwise use the best current platform/session time available and include an explicit timezone or UTC offset.
- Do not invent a precision or timezone that is not available.
- A timestamp shown only in reasoning, analysis, tool commentary, or another intermediate surface does not count; repeat it as the first line of the final user-visible answer.
- Conversation ordering, remembered history, Git commit time, browser observation time, or later reconstruction is not a substitute for the required visible per-turn stamp.
- When the owner's bootstrap requires live Universal GitHub authority, re-fetch the current default-branch root `AGENTS.md` on every user turn before task reasoning, artifact composition, task execution, or answering. Tool discovery, clock checks, and bootstrap retrieval itself are permitted prerequisites. Prior-turn retrieval or remembered copies do not count as current-turn activation.

This requirement applies to ordinary reasoning chats, supervisory chats, independent-review chats, follow-up turns, and chats used as part of a Mission Control/controller workflow unless a higher-priority product constraint makes the final user-visible response impossible to control.

## Keep in Chat

Chat normally retains:

- architecture and implementation design;
- strategy, methodology, prioritization, and tradeoff selection;
- owner-intent interpretation;
- supervisory review and verdicts;
- scientific, safety, therapy, editorial, and product judgment;
- substantive prose;
- ordinary GitHub reads and searches;
- creating/updating GitHub issues and pull requests;
- ordinary GitHub file reads/writes when the active Chat surface supports them;
- bounded branch/file edits that can be performed directly with Chat's GitHub tools;
- bounded terminal, filesystem, browser, GUI, OS, or connected-computer actions when the current Chat surface exposes a direct authorized tool that can reliably perform them;
- code/diff review;
- deciding whether a Work run is needed and authoring its exact directive;
- reviewing Work receipts and selecting the next consequential step.

GitHub availability in Work is **not** an execution requirement when Chat already has adequate GitHub actions. The same rule applies to other execution capabilities: a remote-desktop, connected-computer, terminal, filesystem, or browser tool exposed directly to Chat counts as Chat execution even when it operates on another machine. Do not delegate merely because the action is local, GUI-based, terminal-based, or remote.

For a Chat-supervised Mission Control cycle, prefer GitHub as the durable mailbox between reasoning chats and the execution controller: the current chat writes its source-bound artifact to GitHub; Codex/controller waits for that artifact, reads it after the chat turn finishes, transports the exact required data to the next registered reasoning chat, waits for that chat's GitHub artifact, and then continues the authorized route. This is controller-mediated Chat <-> GitHub <-> controller <-> Chat coordination, not native Chat-to-Chat or Work-to-Chat communication. The reasoning chat must not offload its own required GitHub write to Work merely because Work can access GitHub.

## Use Work / Codex

Invoke Work/Codex only when the bounded action genuinely requires execution that the current Chat surface cannot reliably perform, or sustained stateful execution that is genuinely impractical to keep in Chat. Examples include:

- terminal commands when no adequate terminal/connected-computer tool is available to Chat;
- local filesystem or worktree operations unavailable to Chat;
- SSH or remote-shell execution when no direct authorized Chat tool exposes the required host/action;
- browser/computer/OS automation unavailable to Chat's current direct tools;
- local builds, tests, runtime/process inspection, or dependency installation that Chat cannot reliably execute with its current tools;
- deployment mechanics requiring an execution surface Chat does not have;
- genuinely long-range repository implementation where many stateful edits/commands make Chat-level direct execution impractical.

A long-range repository operation means sustained execution complexity, not simply a large repository or a multi-file idea. Prefer Chat for a bounded multi-file change when Chat can safely make and review the edits itself.

## Work-thread lineage naming

When Chat creates a new Work/Codex conversation, give it a deterministic owner-facing lineage title:

```text
Work — <originating Chat title>
```

Apply the title at the handoff boundary:

1. If the handoff surface exposes a title or name field, set that field directly.
2. If it does not, put the exact requested title at the start of the runnable Work directive and instruct Work to apply it before substantive execution when that surface supports renaming.
3. Use the actual originating Chat title when it is exposed. If the UI title is not available to the current Chat, use the explicit source-chat title already established in the current conversation; do not invent or claim an unseen UI title.
4. Keep the prefix and source title stable across the handoff. This naming convention is for owner traceability only; it does not transfer semantic authority, prove execution identity, or create a new permission or completion gate.
5. If the platform cannot set or rename the Work title, proceed with the authorized handoff and report that title-setting limitation rather than blocking otherwise valid execution.

## Originating Chat backlink

Every ChatGPT-to-Work directive must carry a clearly labeled source locator for the reasoning thread:

```text
Originating Chat title: <exact source Chat title>
Originating Chat URL: <exact source conversation URL>
Receipt backlink: REQUIRED
```

Resolve the exact conversation URL at the handoff boundary from the current authorized UI/controller/browser surface when it is available. Do not invent, shorten, rewrite, or substitute another chat URL. An opaque session ID is useful metadata but is not a substitute for the owner-clickable source conversation URL.

Work must preserve those values unchanged and include the backlink in **every** owner-facing receipt, including completed, partial, blocked, failed, and not-attempted results:

```text
Originating Chat: [<exact source Chat title>](<exact source conversation URL>)
```

The receipt echoes the directive value; Work must not rediscover or replace it. For a ChatGPT source conversation with a stable URL, omitting the URL makes the handoff incomplete. If the handoff creator cannot resolve it through an authorized current surface, do not fabricate one: classify `HANDOFF_BLOCKED_SOURCE_CHAT_URL` unless the owner explicitly authorizes proceeding without the backlink.

The backlink is navigation/provenance only. It does not create a native Work -> originating Chat messaging edge or transfer semantic authority.

## Multi-surface ChatGPT capability and recovery

Apply `patterns/chatgpt-client-surface-capability-and-thread-recovery.md` whenever routing or recovering work across consumer ChatGPT web, desktop-app, ordinary Chat, Work, or branch/thread surfaces.

Do not assume capability parity or conversation visibility between clients. When a prior thread appears missing, search the exact source backlink/durable locator first, then every authorized local surface index that could contain it, before asking the owner to search manually. Prefer exact URLs/native thread URIs and IDs over title-only matches.

Treat current differences in loading behavior, Work creation/opening, branching, search quality, local-machine access, and cross-client visibility as version-dated evidence rather than permanent product truth.

## Mixed tasks

When a task contains both reasoning and execution:

```text
Chat reasons first and removes as much semantic/strategic uncertainty as practical
-> Chat defines the exact bounded residual execution directive and stop conditions
-> Chat selects the lowest Work/Codex thinking level reasonably expected to execute that residual directive successfully
-> Work/Codex independently sanity-checks the actual configured thinking level before substantive execution
-> Work/Codex executes only that residue
-> Work/Codex returns facts, diffs, logs, tests, and blockers
-> Chat reviews the receipt and decides what happens next
```

Do not send the whole task to Work and ask it to decide the architecture while implementing it. Do not leave avoidable reasoning, prose, strategy, acceptance criteria, or foreseeable failure handling to Work merely because Work is already being invoked for execution.

The Work/Codex reasoning level is chosen from the **residual execution task after Chat reasoning**, not from the difficulty of the original owner request and not from the reasoning level Chat itself needed.

If the current reasoning chat is expected to publish a GitHub decision/receipt as part of a larger controller-mediated cycle, that GitHub publication remains part of the Chat turn. Do not reinterpret the surrounding use of Codex/controller transport as permission to hand the GitHub publication itself to Work.

## Work reasoning-effort budget

Treat Work/Codex reasoning as a scarce execution resource. After Chat has completed all reasoning it can reliably perform, assign the **lowest reasoning/thinking level reasonably expected to succeed** on the bounded residual execution.

For the current GPT-5.6 Sol / GPT-6 Astra routing ladder, failure classification,
allowance-aware selection, and prospective calibration contract, apply
[`work-model-and-effort-routing.md`](work-model-and-effort-routing.md). That
pattern owns the exact model-plus-effort tiers; this section retains the generic
minimum-sufficient-effort rule.

Apply these rules:

1. **Reduce before routing.** Chat resolves architecture, strategy, methodology, owner intent, prioritization, acceptance criteria, substantive prose, decomposition, execution instructions, and predictable failure handling when those can be resolved reliably in Chat.
2. **Budget against the residue.** Estimate Work reasoning need from remaining execution-side ambiguity, branching, debugging difficulty, and tactical implementation freedom—not from the original task's stakes or apparent complexity.
3. **Do not mirror Chat's level.** A task that required high or very high reasoning in Chat may still need only low execution reasoning once converted into an exact directive.
4. **Spend more only for a concrete reason.** Increase Work reasoning only when a named unresolved execution-side uncertainty or implementation complexity makes the lower level materially less likely to succeed.
5. **Do not under-budget into predictable failure.** Credit conservation does not justify a level that is unlikely to execute the directive correctly; the objective is the minimum sufficient level, not the minimum possible level.
6. **Diagnose before escalating.** When Work fails, distinguish an execution-capability/reasoning shortfall from a bad or incomplete Chat-authored plan. If the failure challenges strategy, architecture, acceptance criteria, or task interpretation, return to Chat for diagnosis before increasing Work reasoning.
7. **Record the choice for consequential handoffs.** A nontrivial Work directive should state the selected reasoning level when the interface supports it and a short reason it is the lowest expected-sufficient level. If the interface does not expose a selectable reasoning level, do not fabricate one; still minimize the semantic burden delegated to Work.

The optimization target is successful execution per credit, not the lowest numerical setting in isolation.

### Work-side thinking-level preflight

The Chat-side budget is not enough by itself. **When Work/Codex receives a nontrivial task, it must independently compare the actual configured reasoning/thinking level, when that setting is observable, with the minimum expected-sufficient level for the residual execution task before substantive execution begins.** This check is two-sided: Work must catch both an underpowered setting and an unnecessarily expensive setting.

Classify the preflight as one of:

- `APPROPRIATE` — the current setting is reasonably matched to the residual task;
- `TOO_LOW_MATERIAL` — the current setting creates a material risk of execution failure, poor debugging, or incorrect handling of authorized tactical choices;
- `TOO_HIGH_MATERIAL` — the current setting is materially more expensive than the residual task warrants and lowering it is expected to save meaningful credits without materially reducing success probability;
- `MISMATCH_IMMATERIAL` — another level might be marginally more efficient or capable, but the expected capability or credit difference is too small to justify interrupting the owner;
- `LEVEL_UNOBSERVABLE` — Work cannot reliably determine its current configured setting from the execution surface.

Required behavior:

1. **If `TOO_LOW_MATERIAL`:** do not begin substantive execution. Tell the owner the current level is too low for the bounded task, name the lowest level Work expects to be sufficient using only level names actually available on that surface, give the short reason, and ask the owner to change the setting.
2. **If `TOO_HIGH_MATERIAL`:** do not silently burn credits. Tell the owner the current level is unnecessarily high for this task, name the lower expected-sufficient level, give the short reason, and ask the owner to lower it before execution.
3. **If `MISMATCH_IMMATERIAL`:** proceed without interrupting the owner. Do not create approval friction for negligible expected savings or negligible capability differences.
4. **If `APPROPRIATE`:** proceed normally and do not ask for confirmation merely to validate the level.
5. **If `LEVEL_UNOBSERVABLE`:** do not invent a current setting. If the task is materially sensitive to reasoning level, state that the level cannot be verified and give the recommended minimum; otherwise proceed under the bounded directive without a gratuitous owner interruption.

For **simple deterministic execution**—for example exact file copying, application of an already-authored patch, running specified tests/build/lint/format commands, collecting exact logs, or hash/readback verification with no unresolved design choice—presume that an expensive high reasoning setting is unnecessary unless a concrete execution-side ambiguity or debugging problem justifies it. Work should explicitly warn the owner when such simple work is running at a materially wasteful level.

Do not use a fixed “one level difference” rule. Materiality depends on the expected change in execution reliability and expected credit consumption on the actual surface. Do not invent numeric savings when the platform does not expose them. The threshold is whether changing the level is meaningfully decision-relevant, not whether a different level could theoretically be slightly cheaper.

Re-run this preflight when the nature of the residual execution materially changes—for example when rote execution turns into difficult debugging, or a previously complex task becomes a deterministic replay. A level that was appropriate at task start is not automatically appropriate for every later phase.

## Long-running ChatGPT recovery

Any already-authorized long-running supervisor chat can stop making progress before its current objective is finished, including Extra High, Pro, Project Manager, and specialist turns. Mission Control may use the exact one-word message:

```text
continue
```

as a **same-chat transport recovery nudge**. It is not an execution verdict or mission-guard `CONTINUE` decision.

Use objective non-content liveness signals where available:

- a turn remains in active generation state beyond the configured liveness timeout;
- ChatGPT exposes a visible recovery control such as `Continue`, `Continue generating`, `Resume`, `Retry`, or `Try again`;
- a stage with an expected durable completion artifact returns to idle but that artifact remains absent after its grace interval.

Recovery preserves the current conversation and current model/mode unless the admitted workflow itself requires a model switch. Do not infer semantic completion merely because the composer is idle.

Apply bounded recovery:

- the underlying Chat objective must already be authorized;
- send only the minimal `continue` message; do not rewrite the task or introduce new semantic direction;
- record recovery as transport evidence without claiming assistant content or hidden backend model identity;
- cap consecutive automatic nudges to prevent quota-burning loops;
- a failed or ambiguous nudge is not automatically replayed;
- when liveness remains unresolved after the recovery ceiling, return control to Chat rather than silently replanning in Work;
- never use `continue` to bypass an owner decision, Mission Control admission gate, safety/release gate, ambiguity state, spend/access boundary, or a required model switch.

For consumer ChatGPT surfaces where assistant output is not programmatically extracted, durable stage-completion/continue-required receipts are preferred when UI liveness alone cannot distinguish a normal idle-but-incomplete turn from true semantic completion.

## Work authority exclusions

Work/Codex must not author or acquire authority for:

- methodology;
- project strategy;
- prioritization;
- architecture decisions unless Chat supplied the decision and Work is only materializing it;
- supervisory verdicts;
- owner decisions;
- scientific or safety conclusions;
- substantive supervisory prose;
- decisions that a requirement is satisfied, a task is aligned, or an owner outcome is achieved.

Low-level tactical choices unavoidable inside an authorized implementation remain allowed, provided they do not change the architecture, acceptance boundary, owner outcome, or strategy.

## Anti-patterns

Reject these routing rationales:

```text
"Work is better for GitHub."
"Work would help here."
"This involves a repo, so hand it to Work."
"Work can inspect more files, so let it decide what to change."
"Let Work figure out the architecture and implement it."
"I'll send the GitHub receipt/write to Work."
"Chat needed high reasoning, so Work should use high reasoning too."
"Use maximum Work thinking just to be safe."
"The task is simple, but leave Work on an expensive level because it is already selected."
```

Replace them with a bounded execution test:

```text
Can Chat make the required judgment and perform the next safe action directly with any authorized tool currently exposed to this Chat?
  YES -> stay in Chat and perform the action here, including bounded terminal/browser/remote-desktop execution when directly available.
  NO, because the required execution capability is not available or reliable in Chat -> delegate only that residue.
  NO, because the operation is genuinely long-range/stateful and impractical to keep in Chat -> delegate bounded execution, keep reasoning in Chat.

After Chat has reduced the task:
What is the lowest Work reasoning level reasonably expected to execute the remaining directive correctly?
  -> choose that level, not the original task's apparent difficulty.

When Work receives the task:
Is the actual configured level materially too low or materially more expensive than this residual execution warrants?
  TOO LOW -> ask the owner to raise it to the lowest expected-sufficient level.
  TOO HIGH -> tell the owner they are overspending on this task and ask them to lower it.
  DIFFERENCE IMMATERIAL -> proceed without interruption.
```

For an unattended supervisory cycle, add one more hard check:

```text
Would this Work handoff create a user-Accept gate for an operation Chat can already perform directly?
  YES -> do not hand it off.
```

When the owner specifically requests ChatGPT Work, do not use a Codex-only route merely because it avoids a visible Work approval or because it is easier to automate. Surface identity is part of the requested execution contract.

## Mission Control implication

Mission Control coordinates a gated, mediated cycle; do not model it as native Chat ↔ Work bidirectionality. The currently established topology for this architecture is:

- **Chat → ChatGPT Work cloud:** when the owner explicitly requests Work and the current authenticated app executor exposes the native Work-cloud target, use `create_thread(target.type="chatgptWorkCloud")` for a new Work task or `send_message_to_thread` for a verified existing Work task. Honor any product-level approval gate. Apply `patterns/chatgpt-work-cloud-dispatch.md`.
- **Chat → Codex:** Codex remains a separate execution surface. A Codex thread, including one titled `Work — ...`, is not proof of ChatGPT Work and must not be substituted silently when the owner requested visible Work.
- **Work ↔ Work:** native coordination may exist within Work once Work tasks exist.
- **Work → the originating Chat:** unavailable as a native semantic edge; preserve the existing controller/receipt route.
- **Chat ↔ GitHub:** ordinary supported GitHub reads/writes are performed directly by the reasoning Chat when available; do not insert Work between Chat and GitHub for routine supervisory artifacts.

The practical Mission Control reasoning loop is therefore controller-mediated: a reasoning Chat publishes an exact durable GitHub artifact; Codex/controller observes it after that Chat turn completes, transports the required source-bound data to the next registered reasoning Chat, waits for that Chat to publish its own GitHub artifact, and continues the admitted route. Codex/controller is a transport/execution coordinator in this loop, not the semantic author of the GitHub decision.

Mission Control should reuse native Work-internal coordination, while continuing to own autonomous control-plane routing of supervision and escalation plus durable control across the Chat/Work boundary through verified controller or relay routes. A queued, persisted, or delivered Mission Control record is evidence of that mediated route, not proof of a native Work → originating Chat edge. These facts are scoped to the current architecture and must not be generalized to other interfaces or future versions without verification.

A valid Work handoff records:

- originating Chat title and exact conversation URL, plus an explicit requirement that the final Work receipt echo them as an owner-clickable backlink;
- configured human-assist behavior for irreducible browser/UI gates, including `OWNER_INTERACTION_PENDING`, live-session preservation, and automatic resume after the gate clears;
- source Chat decision/receipt;
- exact execution objective;
- allowed and forbidden actions;
- allowed tactical freedom;
- stop/review triggers;
- required evidence/tests;
- selected Work/Codex reasoning level when configurable, plus why it is the lowest expected-sufficient level;
- explicit Work-side reasoning-level preflight result and recommended level when the current setting is observable;
- explicit semantic authority = none beyond the bounded implementation choices.

The execution receipt becomes input to Chat only through a verified Mission Control/controller route. It is not permission for Work to select the next consequential step.
