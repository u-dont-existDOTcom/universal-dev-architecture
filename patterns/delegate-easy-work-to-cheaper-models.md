# Delegate easy work to cheaper models

## Status

Current universal pattern. Origin: **OWNER** instruction, 2026-09-29: "the highest intelligence settings/models should farm out the easy work to lower models if easy and quick to do that. so for claude opus max for example it should farm easy stuff out to sonnet or codex if it would save a lot of tokens... codex has fairly high intelligence compared to sonnet while still being cheap (except astra) but sometimes claude is easier to continue in claude etc ... i notice i'm having to give these instructions to each worker".

## Problem

A high-tier setting spends the scarcest allowance. Examples are Claude Opus at high or max effort, GPT-6 Astra, any model at Extra High or Max, and Pro modes. Much of a task needs no top-tier judgment: searching, bulk reading, mechanical edits, test runs, data collection, formatting, boilerplate, or applying a fix that is already decided. Doing that at the top tier uses allowance without improving the result.

Causal mechanism, in this architecture's terms (`AGENTS.md` → **Causal failure diagnosis**):

- **Missing route.** `patterns/chat-work-execution-routing-threshold.md` and `patterns/work-model-and-effort-routing.md` send bounded execution to the lowest sufficient ChatGPT Work tier. Nothing routed a high-tier agent to hand off its own execution work, across providers, or covered Claude models at all.
- **Instruction carried by hand.** With no route, the owner repeated the instruction to each worker.

## Existing-work basis

This extends existing rules; it adds no new theory:

- `patterns/chat-work-execution-routing-threshold.md`: Chat keeps the reasoning and hands Work only the bounded execution residue, at the minimum sufficient thinking.
- `patterns/work-model-and-effort-routing.md`: use the lowest expected-sufficient tier, and escalate only after a qualified failure.
- `patterns/worker-directive-delivery-and-chat-output-budget.md`: a delegate gets a runnable, self-contained directive.
- `patterns/agent-to-agent-consultation.md`: invocation routes between agents, and the rule that another agent's work adds no authority.

## Rule

1. **Split before doing.** At the start of substantial work, and at each new phase, a high-tier agent separates the judgment from the execution residue. Judgment is what to build, how, and what counts as done. The residue is searching, bulk reading, mechanical edits, test runs, data collection, formatting and boilerplate.
2. **Delegate a piece when it pays.** Delegate when all three hold:
   - a cheaper model can do the piece from a short brief with a clear acceptance check;
   - the piece needs little judgment, or the judgment is already made and written into the brief;
   - the piece would use much more top-tier allowance than writing the brief and checking the result.
3. **Keep it when continuing is cheaper.** Keep a piece when:
   - the context is already loaded and the change is small;
   - judgment and execution are interleaved, as in hard debugging or design exploration;
   - the brief would have to carry most of the context;
   - the material may not go to that model or provider;
   - or checking the result would cost about as much as doing it.
4. **Pick the cheapest sufficient delegate.** Current bindings (update them when models or prices change):
   - Inside a Claude session: a Sonnet subagent for moderate, well-scoped work that is easier to continue in Claude (same tools, skills and files), and a Haiku subagent for trivial sweeps and extraction.
   - Repository code and tests: Codex at the current Sol model, at low or medium effort for mechanical work and high or extra high when the execution itself is hard. Don't delegate to GPT-6 Astra; it is expensive, and the Work ladder keeps it as the challenger after a qualified failure.
   - ChatGPT Chat to Work: the ladder in `patterns/work-model-and-effort-routing.md`.
   - Prefer the provider whose allowance is less constrained at the moment. For example, when Claude usage is low, send execution to Codex.
5. **Own the result.** The delegating agent checks the result with the check named in the brief: tests, a diff review, or a sample. It fixes small misses or delegates them again, and takes back only the part that needs judgment. It redoes delegated work only when the check fails.
6. **Delegation adds no authority.** Merge, deployment, spending, access, publication and private-data boundaries stay where they are. A delegate gets only the access its piece needs.
7. **Record it.** Write one line per delegation in the task record: the delegate, its model and effort, the piece, the check, and the outcome. The routing is tuned from these lines.

## Bounds

- Don't split work so finely that briefing costs more than doing.
- Delegation doesn't replace thinking. The high-tier agent still owns the plan, the acceptance criteria and the final verification.
- A delegate that fails the check twice on the same piece returns it to the delegating agent. Don't cycle through models.

## Requirement-accretion declaration

- Origin: `OWNER` (2026-09-29).
- Decision it changes: which model does each piece of a task, and whether top-tier allowance is spent on execution residue.
- Why the simpler standard is insufficient: the existing routing covers ChatGPT Chat and Work only. Claude workers, and Codex at a top tier, had no rule, so the owner repeated the instruction to each worker.
- Why it is scoped: it applies only when a piece is well-specified and the saving is large. It adds no gate and blocks nothing.

## Example (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)

On 2026-09-28 and 2026-09-29, Claude Opus at max effort designed fixes and judged review findings. The owner's laptop runner gave the implementation to Codex (GPT-6 Sol, extra high): the edits, the tests and the gate runs. Opus then checked the results against the gates and the diff. Small edits in files Opus already had open stayed with Opus, because briefing them would have cost more than making them.
