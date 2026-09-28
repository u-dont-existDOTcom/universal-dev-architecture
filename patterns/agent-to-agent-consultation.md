# Agent-to-agent consultation

## Status

Current universal pattern. Origin: **OWNER** instruction, 2026-09-28. The owner had to carry messages between Claude and Codex twice to settle how Codex behaves. His correction: Claude "should have been able to talk to codex instead of assuming things", and the fix belongs in this architecture.

## Problem

Agents often make claims about each other: which model a route runs, whether a sandbox has network, what a command can set, what another agent concluded. The claim may be checked, but only in the checking agent's own runtime. Asked separately by the owner, the other agent answers from its runtime, which can differ in configuration, sandbox, account or surface. The answers then seem to conflict, and the owner ends up relaying messages until the two are reconciled.

Causal mechanism, in this architecture's terms (`AGENTS.md` → **Causal failure diagnosis**):

- **Missing route.** Nothing routed an agent to consult the agent a claim is about. `patterns/cross-family-reasoning-check.md` routes costly, reasoning-heavy conclusions to the other model family. Its trigger excludes claims that a test can settle, and it does not cover disagreements between agents.
- **Unscoped capability claims.** A claim verified for one invocation was presented as a property of the other agent in general. `templates/MISSION-CONTROL-GLOBAL-PM-BOOTSTRAP.md` already treats every capability as an exact source → destination edge; this applies the same discipline to claims about agents.
- **The owner as the channel.** With no direct channel, the owner became the transport between agents. That spends his attention on work agents can do.

## Existing-work basis

This adapts existing rules; it adds no new theory:

- `patterns/cross-family-reasoning-check.md`: the reviewer routes, the minimal packet, one reconciliation round, and presenting a surviving disagreement with both positions.
- `patterns/independent-evaluation-separation.md`: a consulted agent's answer is evidence, not a ruling.
- `patterns/codex-supervision-resource-routing-account-failover-and-browser-hygiene.md` and `patterns/chat-work-execution-routing-threshold.md`: do not assume capability parity between accounts or clients; verify the capability.

## Rule

1. **Scope every claim about another agent.** When a claim about another agent's capabilities, configuration or behavior feeds an owner decision or a workflow design, state the exact runtime it holds for. That means the invocation or surface, the configuration and sandbox, and the account or route. Never state it as a property of the agent in general.
2. **Settle it in that runtime.** A direct test in the same runtime settles what the runtime does. Ask the agent itself for what a test cannot show: its configuration options, how to invoke it, and its reasoning. An agent's report about itself is evidence, not proof. An effective model, for example, is read back from the run, not taken from the agent's word.
3. **Talk directly.** When an agent needs another agent's view, or two agents disagree, they exchange directly through the route below. Allow at most one reconciliation round. Then give the owner the agreed answer, or both positions with a recommendation. The owner never carries messages between agents.
4. **A relayed message means the route was missed.** When the owner does relay another agent's message, answer its substance. Then open the direct route for the rest of the task, and record the miss in the task record.

## Route

Consult non-interactively, with the smallest packet that answers the question. The consulted agent cannot write, and gets no network unless the question needs it; hosted tools such as web search count as network. A read-only sandbox can still let it read files outside the workspace, so on a machine that holds private data, limit its reads to the workspace where the tool allows it. Never include credentials or secrets. Send private material only across a provider boundary already authorized for it (`patterns/cross-family-reasoning-check.md` → **Reviewer**).

Current bindings (update them when the tools change; `--help` on the installed version is the check):

| Asking agent | Consulted agent | Command shape |
|---|---|---|
| Claude | Codex | `codex exec -s read-only -c web_search="disabled" --ephemeral --ignore-user-config -m <model> -c model_reasoning_effort="<effort>" -C <workspace> -o <answer-file> "<question>" < /dev/null` |
| Codex | Claude | `claude -p --model <model> --effort <effort> --tools "" --strict-mcp-config --no-session-persistence "<question>"` |

- Use the model and effort the question needs; the routing rules in `patterns/work-model-and-effort-routing.md` apply.
- Running the consulted agent needs network access and that agent's sign-in. An asking agent without them, such as a worker in a sandbox with no network, puts its question in its result. The agent that runs it then consults, and the owner still carries nothing.
- When a question is about the other agent's *runtime*, pair the question with a test in that runtime (Rule 2). Don't rely on the answer alone.
- When the owner talks with an agent outside the task, that agent writes what the others need to a shared notes file named in the deployment. The owner then only has to say that notes are there.

## Bounds

- Consult only when the answer can change a decision, a claim to the owner, or a workflow design. Routine facts that a lookup or test settles need no consultation.
- One question, one answer, and at most one reconciliation round per disagreement. Do not loop, and do not bring in a third agent to outvote either side.
- A consultation adds no authority. It cannot approve a merge, a deployment, spending or access; those gates stay where they are.

## Receipt

Record one line in the task record or final answer: the consulted agent, its model and effort, the question, and the outcome. Example: `Consulted Codex (gpt-5.6-sol, xhigh, read-only) — can cloud tasks pin a model? — no model field in the create-task request; runs use the account default — agreed`.

## Requirement-accretion declaration

- Origin: `OWNER` (2026-09-28).
- Decision it changes: whether a claim about another agent reaches the owner unscoped and unconsulted, and whether the owner has to relay messages between agents.
- Why the simpler standard is insufficient: checking a claim in one's own runtime does not reach the other agent's runtime, and the cross-family check does not trigger for testable capability claims or for disagreements between agents.
- Why it is scoped: the consultation triggers only when the answer can change a decision, a claim or a design, and one round bounds it.

## Example (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)

On 2026-09-28 Claude reported that Codex Cloud tasks created from the Codex CLI cannot pin a model, and that the laptop runner's sandbox has no network. Both claims were checked, the first in the CLI's source and the second with a sandbox test. The owner asked Codex, which answered from its own runtime, and then carried the answers between the two agents twice. Under this pattern, Claude would have stated the runtime of each claim and asked Codex directly before reporting. Later that day the route settled a runner question without the owner: Claude asked Codex how a caller can read back the model that served a `codex exec` run, and Codex's answer matched a test in the runner (no event carries the model, so the runner records the model it requested). The same test showed that the sandbox's "no network" covers the commands Codex runs, not its hosted web search, which is why the route now turns web search off. The deployment keeps its shared notes file on the owner's machine; its location stays in the private deployment notes, not in this repository.
