# Owner correction — worker directives and chat output size

Date: 2026-09-10

Acceptance criteria:

- Once a reasoning chat determines that Codex/Work should execute the next concrete step, it must provide the actual complete worker directive in that same turn rather than only discussing what the worker should be told.
- The owner should not have to ask a second time for Codex instructions after the chat already selected Codex execution.
- Long reusable operational instructions should be delivered as a `.md`/text artifact rather than pasted into chat when they exceed roughly a couple of pages or materially bloat scrollback.
- Short operational instructions may remain in one fenced code block.
- Chat should remain concise but must still expose consequential decisions and caveats; the long artifact should not be duplicated inline.
- These rules are universal defaults across development repositories unless a current repo-specific requirement explicitly overrides them.
