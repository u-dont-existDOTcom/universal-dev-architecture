# Chat-to-Work terminal routing owner-policy audit — 2026-08-24

## Decision and source

Joel supplied a standing cross-chat workflow preference while supervising an article task: Chat should remain the conversational and editorial supervisor, and it should automatically delegate a bounded task to ChatGPT Work when terminal execution is genuinely required. Joel then corrected the first formulation: repository involvement alone is not a reason to delegate; the trigger is an actual terminal/shell or otherwise unavailable execution capability.

The normalized contract is: Repository involvement alone is not a reason to create a separate Work task. When the next step genuinely requires terminal or shell execution, local-filesystem tooling unavailable in Chat, tests or scripts, command-line Git, or another execution-heavy capability Chat does not have, create one bounded ChatGPT Work task and return its result to the originating Chat.

## Transfer rationale

The capability boundary recurs across Joel's article, research, and development chats. Encoding it once prevents two opposite failures: leaving Chat to simulate terminal work it cannot perform, and fragmenting ordinary repository reading or editorial reasoning into unnecessary Work tasks.

## Limits

This is owner-authored operational policy rather than independently benchmarked evidence. It applies to Joel's workflows where ChatGPT Work and task coordination are available. It does not claim that this split is optimal for every user, does not require delegation when Chat already has the needed capability, and does not broaden scope, permissions, spending, publication, or destructive-action authority.

## Durable projections

- Global operational agreement: `AGENTS.md`
- Reusable repository-agent template: `templates/AGENTS-CODEX.md`
- Universal pattern: `patterns/chat-work-terminal-routing.md`
- Lesson route: `LESSON-INDEX.md`
- Causal documentation regression: `tests/test_chat_work_terminal_routing.py`
- Personal Codex projection: `~/.codex/AGENTS.md` outside this repository

ChatGPT cross-chat persistence belongs in account Personalization/custom instructions or memory. That account setting is an external product surface rather than repository state and must be verified separately; the repository does not claim it is active merely because this policy exists here.
