# ChatGPT Developer-MCP Chat Lifecycle

## Problem

A developer MCP/custom app can be correctly registered and callable in newly created ChatGPT conversations while an older conversation remains unable to execute it.

This can be misleading because an older conversation may still discover or display the MCP tool schemas after an explicit `@` invocation. Tool visibility therefore does **not** prove that the conversation runtime has permission to execute the developer MCP.

Observed failure mode:

```text
FORBIDDEN: This conversation does not support developer MCPs
```

Reconfiguring a working MCP server, changing its endpoint, or blaming Project membership can waste time when the actual boundary is the conversation lifecycle.

## Universal pattern

### 1. Treat developer-MCP capability as conversation-lifecycle-bound

After adding/registering a developer MCP or custom MCP app in ChatGPT, assume that conversations created **before** that registration may retain an older capability set.

Do not assume an existing conversation will gain executable MCP capability retroactively merely because:

- the app now exists globally;
- the user can `@`-mention it;
- the conversation can see the MCP's tool names/schemas;
- the conversation is moved into or out of a Project;
- the same account can execute the MCP elsewhere.

The operational test is actual tool execution.

### 2. Use a fresh post-registration chat as the first diagnostic

When an existing conversation reports that it does not support developer MCPs:

1. confirm the MCP/custom app is registered;
2. create a **new normal conversation after registration**;
3. explicitly invoke the MCP there;
4. run a minimal read-only smoke test;
5. compare the result with the older conversation.

If the fresh conversation executes successfully while the older conversation returns `FORBIDDEN`, treat the old conversation as lifecycle-incompatible. Do **not** reconfigure a working server merely to repair that old thread.

### 3. Separate discovery from execution

Use three distinct states:

- **not surfaced** — the conversation cannot see the MCP/app/tool definitions;
- **surfaced but not executable** — tool definitions are visible, but calls are rejected by the ChatGPT runtime;
- **executable** — an actual tool call succeeds.

Never collapse `surfaced` into `working`.

An `@` invocation can move a conversation from `not surfaced` to `surfaced but not executable` without changing its execution capability.

### 4. Do not misdiagnose Project membership from this symptom alone

Project membership is not sufficient evidence of the cause.

A conversation that was created before MCP registration may remain blocked even after being removed from a Project. Conversely, a fresh conversation created after registration can execute the same MCP successfully.

Therefore, when the distinguishing variable is conversation creation time relative to MCP registration, prefer the lifecycle explanation over a Project-specific explanation unless independent evidence demonstrates a Project restriction.

### 5. Preserve durable workflows outside conversation capability

For important engineering/research workflows, do not make the project's reproducibility depend on whether one particular ChatGPT conversation can execute a developer MCP.

Prefer:

- direct provider/MCP clients in the project when reproducibility matters;
- repository-persisted inputs/results/checkpoints;
- ChatGPT MCP execution as a convenience layer, not the only execution path.

If a new chat is required for a newly registered MCP, project continuity should be recoverable from Git rather than from the old thread.

## Fast diagnostic rule

> After registering a new developer MCP in ChatGPT, test it in a newly created conversation before debugging the server. If an older conversation can see the MCP but returns `FORBIDDEN: This conversation does not support developer MCPs`, while the fresh post-registration chat works, treat the old chat as retaining its pre-registration capability set. Creating a fresh chat is the fix; moving the old chat between Projects is not.

## Origin / evidence

Promoted 2026-08-16 from a live ChatGPT/Creative Tail Sampling integration session involving two independent developer MCPs: Exa Search and Parallel Search.

Observed sequence:

1. Exa and Parallel remote MCP endpoints were independently verified to work through a standard direct MCP client in `u-dont-existDOTcom/creativeTailSampling`.
2. The MCP custom apps were then registered in ChatGPT.
3. An already-existing conversation created before registration could discover both MCP tool surfaces after explicit `@` invocation, but actual calls to both independently returned `FORBIDDEN: This conversation does not support developer MCPs`.
4. A fresh normal conversation created after registration successfully executed the same MCPs under the same account.
5. Removing the older conversation from its Project did not change the failure; it remained unable to execute both MCPs.

This isolates conversation creation timing relative to MCP registration as the operative boundary in the observed product behavior, rather than MCP endpoint validity, account permission, or Project membership.

Source repository context: `u-dont-existDOTcom/creativeTailSampling`, retrieval-ensemble integration completed on 2026-08-16. The behavioral evidence itself arose from ChatGPT conversation/runtime tests rather than a repository commit.

## Limits

- This is an empirically validated ChatGPT product behavior as observed on 2026-08-16; product capability binding may change in future releases.
- It applies to developer/custom MCP execution in ChatGPT. Do not automatically generalize it to native connectors, built-in tools, or ordinary marketplace plugins.
- A fresh-chat success establishes that the server/account path works; it does not prove every model, mode, workspace, or future conversation will expose the same tool surface.
- Tool-schema discovery alone is never sufficient evidence of execution permission.
- If a fresh post-registration chat also fails, continue normal endpoint/auth/account/runtime diagnosis rather than attributing the failure to chat age.
