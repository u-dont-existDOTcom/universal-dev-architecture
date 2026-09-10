# Worker directive delivery

Current universal rule: `../patterns/worker-directive-delivery-and-chat-output-budget.md`.

When a reasoning chat selects Codex/Work as the next execution surface, the same turn must either perform the supported handoff with the complete bounded directive or deliver a complete owner-runnable directive. Do not stop at commentary about what the worker should be told.

Short directives may be delivered in one fenced code block. Long reusable operational payloads that exceed roughly a couple of rendered pages or materially bloat chat history should be materialized as `.md`/text artifacts and linked with only a concise owner-facing summary.
