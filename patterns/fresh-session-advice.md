# Advise a fresh session when it saves tokens without losing intelligence

## Status

Current universal pattern. Origin: **OWNER** instruction, 2026-11-19: "can we add to UDA also that i'm automatically told to start a fresh convo if it would not harm the intelligence of the work and it would provide a significant savings in tokens? you can brainstorm the levels that make sense."

The behaviour is the owner's. The levels, thresholds, defaults and notification rules below are `ASSISTANT_PROPOSAL` starting values, to be calibrated from measurements. The saving thresholds never block or stop work. Only capacity or reliability can require a stop, under the applicable rollover rules.

## Problem

In an agentic session every model step reads the conversation's context again, so the tokens a step uses grow with the session. A session that has grown to several times the size of a fresh start uses several times the tokens for each remaining step, and a fresh session with a good handoff can do the same work on far fewer. Very long or mixed contexts can also hurt reliability, although restarting does not repair a wrong instruction, a wrong source or a failing method.

Usually only the owner can start the fresh session, and only if told at the right moment with everything ready. Two failures make the advice come late or not at all:

- **Repeated deferral.** The advice waits "until the running helpers report", while each turn starts more work that reports only to this session, so the safe moment never comes.
- **Advice that can't be acted on.** Without a current handoff, a ready resume line and the settings to choose, switching is a chore and gets skipped.

## Definitions

- **C (current context):** the input the next step of this session will read. Take it from the platform's own reading, or from the main session's last model response (its input, cache-read and cache-creation tokens, each counted once), never from helper rows or cumulative totals. Read it with a script that prints one number; never load the transcript itself into the context. Right after compaction the reading is stale until the next response. Where nothing reports it, estimate it from the text length (about 4 characters per token in English) and say "estimated".
- **F (fresh start):** the input a fresh session would need before its next step: its bootstrap, the handoff, and everything the remaining work needs it to read again (source files, documents, logs, evidence this session holds). Measure it from a recent fresh session of the same project and record it in the checkpoint. Until it is measured, use the smaller of 100k tokens and a quarter of the context window, and mark the advice "estimated". The default must not exclude material already known to be required. If F exceeds a quarter of the window, remove only unnecessary bootstrap material; keep all required sources and evidence in F, and recompute S using that value.
- **S (saving):** roughly how many times fewer tokens the rest of the work would use in a fresh session, assuming both sessions then grow by about F: **S = (C + F/2) / (1.5 × F)**. With a known growth G, S = (C + G/2) / (F + G/2). S leaves out the one-off cost of writing the handoff and of the fresh session's start (one reason short remaining work is excluded below), and it counts tokens, not money or allowance, which caching and pricing can change. Compare the unrounded S with the thresholds and show it rounded down to the nearest half. With the default growth, S >= 2 and S >= 3 are the same as C >= 2.5 × F and C >= 4 × F.
- **Floor:** C - F of at least 150k tokens, or 40% of the context window where that is smaller.

## Levels

Work out the level at the start of every turn, before a long run of steps without the owner, and before the final answer. Check in this order and stop at the first that applies:

1. **Capacity or reliability: level 3.** C has reached the point 10% of the window before the platform's automatic compaction (87% of the window when compaction is at 97%), and the saving rules below would otherwise give level 1 or 2; or, on a platform that does not compact by itself, C has reached 75% of the window; or the owner or a check has pointed out that this session cites superseded facts, confuses tasks or helpers, or has lost an owner decision.
2. **Stay: level 0.** The owner's whole request, not only the current piece of it, will be finished within about 20 more model steps (when that is unclear, assume the work continues); or C - F is below the floor; or the readings are too uncertain to give numbers.
3. **By S:** S >= 3 is level 2; S >= 2 is level 1; otherwise level 0.

When the session runs on an allowance that is verifiably the one that binds first (its meter is projected to run out before it resets at the current pace, or the owner has said it must last), use S >= 1.5 for level 1 and S >= 2 for level 2. The floor and the 20-step exit still apply, and scarcity never creates level 3.

| Level | What the agent does |
|---|---|
| 0: stay | Nothing. |
| 1: worth it at the next break | Once, in the first final answer that ends a piece of work and passes the gate: the advice line. From then on, anything started is handoff-ready: its result goes to a file the checkpoint names, and its brief is saved so a fresh session could restart it. |
| 2: recommended now | The advice line on entering the level, and again whenever S has grown by 1 since it was last given. Keep doing owed work until the owner switches; start nothing that binds this session (a helper or wait that reports only here, a sign-in, an approval); update the handoff after each piece of work. |
| 3: hand off now | A warning at the top of every final answer, after any first line the project requires, with the real reason (the share of the window used, or the sign the session showed). Complete the handoff, finish or exactly record the current step, and start nothing new. If the owner is away, say exactly what is waiting; don't report the work as done. |

After compaction, discard the stale C reading and recompute the level when a fresh reading is available. Compaction alone does not clear a reliability-triggered level 3; recheck and resolve the identified failure first.

## The intelligence gate

Recommend a switch only when the session the owner would start (its model, effort, tools, folder and account) can carry on with the judgment, evidence and capabilities the work needs. The agent is judging its own handoff, so it checks against the actual state, not against a summary of it:

1. **State and evidence.** The handoff holds the owner's latest words verbatim; every correction or standing instruction given in this session; the decisions with their reasons; the approaches tried and rejected, with why; open questions and obligations; uncertainties; the rules and gates the task loaded, by name, so the next session reloads them; and the exact next step. Source material a summary can't replace (files, images or text the owner pasted, unsaved tool results) is saved where the successor can open it, and private material only in a private place. Decisions, reasons and evidence are recorded, not private chain of thought.
2. **Nothing the work needs exists only here.** Each in-flight helper or job writes its result to a file the handoff names and can finish without this session, or has a saved brief so the fresh session can restart it; the advice says which, and whether to leave this chat open until it lands. Uncommitted work is committed or listed with its path. Scratch files, timers and monitors, running local servers, sign-ins and browser state are each saved or listed as "recreate". Record existing owner authorizations with their scope and source, and verify the successor's actual access. Ask again only if the authorization's scope changes or the platform requires a fresh approval. The handoff names which session owns each in-flight item and each branch or file being written.
3. **No large re-read.** If the remaining work depends on material this session has loaded and is still comparing or combining (a document set under review, logs in a debugging run, a module read in full), finish that piece or write down its findings first. If the fresh session would still have to load most of it again, count it in F.
4. **The successor can do the work.** The recommended session has the same or a sufficient model and effort, the tools, files and access the next steps need, and the same working folder. A fresh-session recommendation never downgrades capability.

When a check fails, name the item, fix it within existing authority, and look again when it lands; never defer behind a vague "after the helpers finish". When it can't be fixed, don't recommend switching; at level 2 or 3 still say in one line what each step costs here, what a fresh session would lose, and when it will be safe. The one silent case is a conversation whose value is the exchange itself, such as a personal or therapeutic one: say nothing until it reaches a natural end. Unrelated work in it may still move to a fresh session.

When a sign of degradation triggered level 3, write the handoff from the repository and the checkpoint rather than from the session's memory, and say in it that it was written by a session that showed that sign.

The fresh session's first act is to check the handoff against the repository and to list anything it could not find; each missing item is a lesson for the next handoff (`patterns/context-compaction-resilience.md`).

## The advice

One plain line, above the resume or handoff lines, with the numbers and nothing to decide:

> Fresh session [worth it at your next break | recommended now]: each step here reads about C tokens, against about F in a new session, so the rest of this work would use roughly S times fewer tokens. The handoff has what the next step needs[; not carried over: X]. Start a new session[ in <folder>, with <model and effort>], paste the resume line[, and leave this chat open until <item> lands].

At level 3, lead with the real reason instead of the saving: "this chat is at N% of its window, and compaction would drop detail", or "this chat has started to <sign>".

Say the handoff has what the next step needs only after checking it; never say "nothing is lost". Name a model or effort only through the project's routing rules. Where the platform lets the agent open or offer the fresh session itself with the handoff attached, do that within its existing authority instead of asking the owner to paste.

## Bounds

- **Advice is not a stop.** Cost never cancels owed work or creates a wait for the owner; the pre-final continuation invariant in `AGENTS.md` still applies.
- **Don't nag.** Level 1 once; level 2 on entering it and whenever S has grown by 1; level 3 while it holds.
- **When the owner says to keep going here,** state the cost once and drop the advice until the level rises. A level 3 warning is always given.
- **After the owner switches,** the old session starts nothing, writes nothing to shared branches or files, and only lets its running helpers finish writing their files. The fresh session doesn't write where an old writer still can until that writer has finished or handed over.
- **Don't overstate.** Give C and F, use the formula, round down, and say "estimated" when a number is.
- **Helpers.** A helper never gives this advice; it reports its context size to its parent. Prefer a fresh helper with a short brief to resuming one whose context is large when the floor and the gate are met; a small helper that already holds what the next step needs is cheaper to resume.
- **Scope.** The cost levels apply where usage is metered or limited and the work runs to many steps; elsewhere only level 3 applies. This pattern grants no new authority to commit, publish, switch accounts or providers, change access, or expose the owner's words.
- **Other rules keep their scope.** For supervision chats, `patterns/codex-supervision-intelligence-routing-and-context-lifecycle.md` section 10 governs window pressure and rollover. Durable recovery stays with `patterns/context-compaction-resilience.md`, and choosing a cheaper model with `patterns/delegate-easy-work-to-cheaper-models.md`.

## Mechanical support

Compute the reading mechanically where the platform allows, not from memory. In Claude Code a hook can read the main session's last usage from the transcript and add one line with C, F, S and the candidate level to the context: when the owner sends a message (`UserPromptSubmit`) and, because context grows fastest in long runs without the owner, when the level rises during a turn (for example after a tool call). The hook:

- reads only the transcript's tail, under a short deadline, and copies none of its content;
- treats a missing or stale reading (after compaction or a reset) as unknown, never as small;
- prints nothing at level 0, and at level 1 only when the level rises;
- fails open: on any error or timeout it prints nothing and lets the prompt proceed;
- never blocks a prompt, resets a conversation, stops a helper, changes permissions, or declares the gate passed. Its line is a reading; the agent still applies the gate.

Check a new hook on fresh, resumed, compacted, malformed, wrong-session and boundary cases before saying it works. A delivered reminder shows delivery, not that the advice was given.

## Requirement-accretion declaration

- Origin: `OWNER` request for automatic fresh-session advice, 2026-11-19.
- Proposed implementation: `ASSISTANT_PROPOSAL` levels, thresholds, defaults and notification rules.
- Decision it changes: when the owner is told that continuing in a fresh session would save tokens, and how the agent starts new work once that advice is due.
- Why the simpler standard is insufficient: a single threshold with a deferral clause, checked from memory, was postponed every turn while new session-bound work kept moving the handover point.
- Why it is scoped: it advises only for at least a twofold saving that is also large in absolute terms, only when the successor can carry on with what the work needs, and it adds no cost-triggered stop and grants no new spending, publication or access authority.

## Example (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)

On 2026-11-18 and 19 a Claude Code session on the owner's scarcest model noted "propose a fresh session" at 285k, 303k, 342k and later readings, each time "once the running helpers have reported", and started new helpers each time. It advised a fresh session at 780k tokens, after the app's process had ended and stopped four helpers mid-way, and put the saving at "about ten times" by comparing one step with an assumed small fresh start. The next session read about 270k at its first check, after a bootstrap that included a large Inbox export and some task work; a lean bootstrap for that project is about 150k. So the rest of the work would have used roughly 2.3 times (F = 270k) to 3.8 times (F = 150k) fewer tokens: well worth it, but not ten. Under this pattern, with the owner's statement that the scarce model must last the week, that session would have been told once at about 300k and again on entering level 2 at about 375k, and from then on would have started only handoff-ready work.
