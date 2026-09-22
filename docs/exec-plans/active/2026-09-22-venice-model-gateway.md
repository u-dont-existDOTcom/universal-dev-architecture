# Venice external-model gateway

- Parent owner outcome: OPEN — use the existing Venice API key for UDA-controlled external model calls instead of duplicating OpenRouter credentials.
- Remaining gap: the key exists only in the Railway humanization project; UDA has no generic external-model API boundary.
- Assurance lane: iteration, with a targeted security gate for gateway authentication and secret non-disclosure.
- Implement a small fixed-destination HTTP gateway that forwards OpenAI-compatible chat-completion requests to Venice.
- Default model alias: `gpt-5.6-sol` -> Venice `openai-gpt-56-sol`; callers may request another Venice model explicitly.
- Require a separate gateway bearer token. Never return, log, or commit `VENICE_API_KEY`.
- Keep the OpenRouter-only TypeSafe Jev Decisions integration unchanged because Venice does not expose that vendor-specific API.
- Add focused tests for authentication, model mapping, fixed upstream destination, provider error handling, and secret non-disclosure.
- Deploy only the new gateway service into the Railway project that already owns the Venice key; do not mutate Mission Control production in this pass.
