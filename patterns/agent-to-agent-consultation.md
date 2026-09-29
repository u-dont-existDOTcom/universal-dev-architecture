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
3. **Talk directly when the route is available.** When an agent needs another agent's view, or two agents disagree, they exchange directly through the route below. Allow at most one reconciliation round. Then give the owner the agreed answer, or both positions with a recommendation. If the route is unavailable, use the explicit unavailable path below. The owner never carries messages between agents.
4. **A relayed message means the route was missed.** When the owner does relay another agent's message, answer its substance. Then open the direct route for the rest of the task if available, or use the unavailable path, and record the miss in the task record.

## Route

Consult non-interactively, with the smallest packet that answers the question. The consulted agent's task tools run read-only and get no network unless the question needs it; hosted tools such as web search count as network. Never include credentials or secrets in the packet. Send private material only across a provider boundary already authorized for it (`patterns/cross-family-reasoning-check.md` → **Reviewer**).

For the Codex command below, `-C <workspace>` sets the working root; it does not enforce a filesystem read boundary. `-s read-only` also permits reads outside that root. On a host with private files outside the workspace, run the command only inside an external filesystem sandbox or container that exposes the workspace as its sole readable task-data mount, plus only non-private runtime files and an empty answer-output location. Place `<answer-file>` in that output location. Do not expose the host home, credential stores, or other private paths. If that boundary and the needed sign-in cannot both be provided, the Codex consultation route is unavailable; do not run the command directly on that host.

For Claude consultations and independent Claude Code checks, create `<neutral-workspace>` as an empty directory outside the checkout and its instruction-bearing parents. Supply the approved question and evidence in the packet; do not add the checkout as a directory. Run with `--safe-mode` to exclude `CLAUDE.md` and other project memory while retaining the normal sign-in route. Verify this flag in the installed CLI's `--help` before using the binding.

Current bindings (update them when the tools change; `--help` on the installed version is the check):

| Asking agent | Consulted agent | Command shape (inside the required filesystem boundary) |
|---|---|---|
| Claude | Codex | `codex exec -s read-only -c web_search="disabled" --ephemeral --ignore-user-config -m <model> -c model_reasoning_effort="<effort>" -C <workspace> -o <answer-file> "<question>" < /dev/null` |
| Codex | Claude | `(cd <neutral-workspace> && claude -p --safe-mode --model <model> --effort <effort> --tools "" --strict-mcp-config --no-session-persistence "<question>")` |

- Use the model and effort the question needs; the routing rules in `patterns/work-model-and-effort-routing.md` apply.
- Running the consulted agent needs network access and that agent's sign-in. If the asking agent lacks them, a separate authorized agent may consult only if it has the required route and read boundary. If there is no separate executor, or no safe route has both access and the boundary, report the scoped claim as unresolved, hold only actions that depend on the answer, and continue independent work. State the access reason and what remains dependent; do not ask the owner to relay messages or imply that a later executor exists.
- When a question is about the other agent's *runtime*, pair the question with a test in that runtime (Rule 2). Don't rely on the answer alone.
- When the owner talks with an agent outside the task, that agent writes what the others need to a shared notes file named in the deployment. The owner then only has to say that notes are there.

## Bounds

- Consult only when the answer can change a decision, a claim to the owner, or a workflow design. Routine facts that a lookup or test settles need no consultation.
- One question, one answer, and at most one reconciliation round per disagreement. Do not loop, and do not bring in a third agent to outvote either side.
- A consultation adds no authority. It cannot approve a merge, a deployment, spending or access; those gates stay where they are.

## Receipt

Record one line in the task record or final answer: the consulted agent, its requested model and effort, its effective model and effort if independently read back, the question, and the outcome. On a setter-only surface, record the requested model and effort and mark effective model and effort as unknown (`null` in telemetry). For every capability, configuration or behavior conclusion, the receipt must also state the exact runtime tuple: invocation or surface, account or route, and configuration and sandbox. Include paired-test evidence whenever Rule 2 makes a same-runtime test applicable; without it, the receipt is incomplete. Example: `Consulted Codex — requested model=gpt-5.6-sol; requested effort=xhigh; effective model=unknown; effective effort=unknown — runtime: invocation or surface=codex exec, Codex CLI 0.158.0, on the owner's laptop; account or route=the owner's ChatGPT sign-in; configuration and sandbox=--ignore-user-config, read-only sandbox — how can a caller read back the model that served a run? — it cannot: no event or output names the model, so the caller records the model it requested — paired-test evidence: a --json run in the same runtime carried no model field — agreed`.

If consultation was unavailable, record that status and the reason, the scoped unresolved claim, and the dependent actions held. Do not write a consultation receipt as though an exchange occurred.

## Requirement-accretion declaration

- Origin: `OWNER` (2026-09-28).
- Decision it changes: whether a claim about another agent reaches the owner unscoped and unconsulted, and whether the owner has to relay messages between agents.
- Why the simpler standard is insufficient: checking a claim in one's own runtime does not reach the other agent's runtime, and the cross-family check does not trigger for testable capability claims or for disagreements between agents.
- Why it is scoped: the consultation triggers only when the answer can change a decision, a claim or a design, and one round bounds it.

## Example (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)

On 2026-09-28 Claude reported that Codex Cloud tasks created from the Codex CLI cannot pin a model, and that the laptop runner's sandbox has no network. Both claims were checked, the first in the CLI's source and the second with a sandbox test. The owner asked Codex, which answered from its own runtime, and then carried the answers between the two agents twice. Under this pattern, Claude would have stated the runtime of each claim and asked Codex directly before reporting. Later that day the route settled a runner question without the owner: Claude asked Codex how a caller can read back the model that served a `codex exec` run, and Codex's answer matched a test in the runner (no event carries the model, so the runner records the model it requested). The same test showed that the sandbox's "no network" covers the commands Codex runs, not its hosted web search, which is why the route now turns web search off. The deployment keeps its shared notes file on the owner's machine; its location stays in the private deployment notes, not in this repository.
