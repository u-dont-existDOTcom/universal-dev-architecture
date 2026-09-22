# Venice external-model gateway

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT**

- Parent owner outcome: OPEN — route this owner's standard UDA-controlled external-model API calls through Venice instead of ad-hoc OpenRouter calls where the required model/capability is available.
- Assurance lane: release for the authenticated gateway deployment and merge boundary.
- Gateway: fixed Venice upstream, separate caller bearer token, no provider-key disclosure, and alias `gpt-5.6-sol` -> Venice `openai-gpt-56-sol`.
- Compatibility boundary: keep the OpenRouter-only TypeSafe Jev Decisions API unchanged because it is not a standard chat-completions endpoint.
- UDA caller: add a provider-neutral client using `UDA_MODEL_GATEWAY_URL` and `UDA_MODEL_GATEWAY_TOKEN`; never commit their live values.
- Live verification: exact gateway branch deployment healthy; public health returned 200; unauthenticated chat returned 401; one authenticated paid smoke returned HTTP 200, model `openai-gpt-56-sol`, and exact content `VENICE_GATEWAY_OK`.
- Repository state: branch rebased onto current rule-graph `main`; rerun focused/full/audit and hosted checks after the client/state additions.
- Remaining: publish the rebased head, let Railway deploy that exact branch, merge only after required checks are green, then bind Railway source to canonical `main` and verify health again.
