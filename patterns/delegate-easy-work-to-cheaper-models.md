# Delegate easy work to cheaper models

## Status

Current universal pattern. Origin: **OWNER** instruction, 2026-09-29: "the highest intelligence settings/models should farm out the easy work to lower models if easy and quick to do that. so for claude opus max for example it should farm easy stuff out to sonnet or codex if it would save a lot of tokens... codex has fairly high intelligence compared to sonnet while still being cheap (except astra) but sometimes claude is easier to continue in claude etc ... i notice i'm having to give these instructions to each worker".

## Problem

A high-tier setting spends the scarcest allowance. Examples are Claude Opus at high or max effort, GPT-6 Astra, any model at Extra High or Max, and Pro modes. Much of a task needs no top-tier judgment: searching, bulk reading, mechanical edits, test runs, data collection, formatting, boilerplate, or applying a fix that is already decided. Doing that at the top tier uses allowance without improving the result.

Causal mechanism, in this architecture's terms (`AGENTS.md` → **Causal failure diagnosis**):

- **Missing route.** `patterns/chat-work-execution-routing-threshold.md` and `patterns/work-model-and-effort-routing.md` send bounded execution to the lowest sufficient ChatGPT Work tier. Nothing told a high-tier reasoning supervisor when to hand off easy execution across providers, or covered Claude models at all.
- **Instruction carried by hand.** With no route, the owner repeated the instruction to each worker.

## Existing-work basis

This extends existing rules; it adds no new theory:

- `patterns/chat-work-execution-routing-threshold.md`: Chat keeps the reasoning and hands Work only the bounded execution residue, at the minimum sufficient thinking.
- `patterns/work-model-and-effort-routing.md`: use the lowest expected-sufficient tier, and escalate only after a qualified failure.
- `patterns/worker-directive-delivery-and-chat-output-budget.md`: a delegate gets a runnable, self-contained directive.
- `patterns/agent-to-agent-consultation.md`: invocation routes between agents, and the rule that another agent's work adds no authority.

## Rule

The authorized reasoning supervisor makes delegation decisions. A Codex/Work worker may identify an easy candidate subtask inside its directive and return it to Chat, but may not launch a delegate or decide admission. Chat decides whether to delegate and issues any new Chat-authored Work directive through the existing admission route.

1. **Split before doing.** At the start of substantial work, and at each new phase, a high-tier reasoning supervisor separates the judgment from the execution residue. Judgment is what to build, how, and what counts as done. The residue is searching, bulk reading, mechanical edits, test runs, data collection, formatting and boilerplate.
2. **Delegate a piece when it pays.** Delegate when all three hold:
   - a cheaper model can do the piece from a short brief with a clear acceptance check;
   - the piece needs little judgment, or the judgment is already made and written into the brief;
   - the piece would use much more top-tier allowance than writing the brief and checking the result.
   Before Chat delegates any piece to Work/Codex, apply the current-turn direct-capability preflight in `patterns/chat-work-execution-routing-threshold.md` for that bounded action. If Chat can reliably execute it with its authorized tools, keep it in Chat even when delegation would save allowance.
3. **Keep it when continuing is cheaper.** Keep a piece when:
   - the context is already loaded and the change is small;
   - judgment and execution are interleaved, as in hard debugging or design exploration;
   - the brief would have to carry most of the context;
   - the material may not go to that model or provider;
   - or checking the result would cost about as much as doing it.
4. **Pick the cheapest sufficient delegate.** Current bindings (update them when models or prices change):
   - Inside a Claude session: a Sonnet subagent for moderate, well-scoped work that is easier to continue in Claude (same tools, skills and files), and a Haiku subagent for trivial sweeps and extraction.
   - Repository code and tests: Codex at the current Sol model, following `patterns/work-model-and-effort-routing.md`: Low or Medium for simple or ordinary work, Sol High only for the ladder's intermediate tier below `GENUINELY_DIFFICULT`, and Sol XHigh first for `GENUINELY_DIFFICULT` work during the active calibration. Don't delegate to GPT-6 Astra; it is expensive, and the Work ladder keeps it as the challenger after a qualified failure.
   - ChatGPT Chat to Work: the ladder in `patterns/work-model-and-effort-routing.md`.
   - Prefer the provider whose allowance is known to be less constrained. A non-ephemeral Codex run records plan usage in its session `rate_limits` (percent used, window and reset time); Claude Code 2.1.285 has no plan-usage command, so use an owner report or a usage-limit error (reset time).
5. **Own the result.** The delegating reasoning supervisor checks the result with the check named in the brief: tests, a diff review, or a sample. It fixes small misses or delegates them again, and takes back only the part that needs judgment. It redoes delegated work only when the check fails.
6. **Delegation adds no authority.** Merge, deployment, spending, access, publication and private-data boundaries stay where they are. A delegate gets only the access its piece needs.
7. **Record it.** Write one line per delegation in the task record: the delegate, its model and effort, the piece, the check, and the outcome. The routing is tuned from these lines.

## Bounds

- Don't split work so finely that briefing costs more than doing.
- Delegation doesn't replace thinking. The reasoning supervisor owns the plan, acceptance criteria, delegation decision and final verification; a Codex/Work worker returns a candidate subtask for Chat-authored admission.
- During a controlled matched Sol/Astra trial attempt (`patterns/work-model-and-effort-routing.md`), use the assigned model for the whole bounded task: no cross-model delegation, including mechanical portions. If another model contributes execution, record the run as mixed-model and exclude it from matched Sol-versus-Astra results.
- After a delegate fails a check, diagnose the cause (transient tool error, correctable brief, or execution shortfall) and re-evaluate whether another bounded cheap attempt still saves allowance. Do not use a fixed failure count or cycle through models without evidence.

## Requirement-accretion declaration

- Origin: `OWNER` (2026-09-29).
- Decision it changes: which model does each piece of a task, and whether top-tier allowance is spent on execution residue.
- Why the simpler standard is insufficient: the existing routing covers ChatGPT Chat and Work only. Claude reasoning supervisors lacked a cross-provider rule, and top-tier Codex workers lacked an explicit route for candidate subtasks, so the owner repeated the instruction to each worker.
- Why it is scoped: it applies only when a piece is well-specified and the saving is large. It preserves the existing Chat/Work admission gate and controlled-trial comparison boundary.

## Example (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)

On 2026-09-28 and 2026-09-29, Claude Opus at max effort designed fixes and judged review findings. The owner's laptop runner gave the implementation to Codex (GPT-6 Sol, extra high): the edits, the tests and the gate runs. Opus then checked the results against the gates and the diff. Small edits in files Opus already had open stayed with Opus, because briefing them would have cost more than making them.
