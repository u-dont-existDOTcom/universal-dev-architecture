# Chat-to-Work terminal routing

## Status

Current owner-authored cross-project workflow policy.

## Purpose

Use Chat and ChatGPT Work as one coordinated loop without creating a separate task merely because a repository is involved and without making the owner manually carry prompts, logs, files, or results between surfaces.

## Routing rule

Keep the originating Chat as the owner-facing supervisor for:

- discussion and clarification;
- editorial judgment and prose decisions;
- synthesis and source comparison;
- repository reading; and
- actions its current connectors or tools can perform directly.

Repository involvement alone is not a reason to create a separate Work task.

Create one bounded ChatGPT Work task when the next step genuinely requires a capability that Chat does not have, including:

- terminal or shell execution;
- local-filesystem tooling unavailable in Chat;
- running tests or scripts;
- command-line Git; or
- another clearly execution-heavy operation unavailable in the originating Chat.

Choose local Work when the task depends on files, applications, authentication, or runtime state on the owner's computer. Choose cloud Work only when the required context and permissions are available there and local machine state is unnecessary.

Give Work the smallest complete execution packet: objective, relevant context, exact inputs, constraints, expected artifacts, verification, and the return contract. Follow its progress, retrieve its result, and continue the reasoning and owner-facing conversation in the originating Chat without asking the owner to shuttle prompts, logs, files, or results.

## Standing authorization and limits

Joel grants standing permission to create the bounded Work task when the capability trigger above is satisfied and the task remains within the already-authorized outcome.

This rule does not:

- make repository involvement a delegation trigger;
- require delegation when Chat already has the needed capability;
- turn ordinary discussion or editorial judgment into a Work task;
- authorize duplicate workers to mutate the same state concurrently;
- broaden task scope, permissions, spending authority, publication authority, or destructive-action authority; or
- override a current owner instruction to stay in one surface, stop, or use a different execution environment.

The hand-back is coordinated rather than a literal conversion of one conversation between modes: the originating Chat remains the supervisor, consumes the Work result, and continues.

## Product grounding

OpenAI's current ChatGPT guidance distinguishes Chat for back-and-forth work from ChatGPT Work for carrying substantial tasks to reviewable results, and documents that Work can run code and shell commands. Its personalization guidance places cross-chat preferences in custom instructions and Codex-wide persistent instructions in the global `AGENTS.md`.

- https://learn.chatgpt.com/docs/use-chatgpt
- https://learn.chatgpt.com/docs/personalize
- https://learn.chatgpt.com/docs/agent-configuration/agents-md

Product availability, local/cloud environments, and tool access can vary by plan, platform, rollout, and workspace settings. If Work creation or the required environment is unavailable, state that exact capability boundary rather than pretending a handoff occurred.

## Provenance

Joel established and corrected this routing policy on 2026-08-24 while coordinating a Chat-supervised romance-article workflow. The correction narrowed the trigger from generic repository work to actual terminal/shell or otherwise unavailable execution capability. This is direct owner authority for Joel's workflows, not an empirical claim that every user or project should use the same surface split.
