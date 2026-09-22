# Venice external-model gateway

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT**

- Parent owner outcome: SATISFIED — this owner's standard UDA-controlled external-model API calls now have a canonical Venice-backed gateway path instead of ad-hoc OpenRouter calls where the required model/capability is available.
- Assurance lane: release for the authenticated gateway deployment and merge boundary.
- Gateway: fixed Venice upstream, separate caller bearer token, no provider-key disclosure, and alias `gpt-5.6-sol` -> Venice `openai-gpt-56-sol`.
- Compatibility boundary: keep the OpenRouter-only TypeSafe Jev Decisions API unchanged because it is not a standard chat-completions endpoint.
- UDA caller: add a provider-neutral client using `UDA_MODEL_GATEWAY_URL` and `UDA_MODEL_GATEWAY_TOKEN`; never commit their live values.
- Live verification: exact gateway branch deployment healthy; public health returned 200; unauthenticated chat returned 401; one authenticated paid smoke returned HTTP 200, model `openai-gpt-56-sol`, and exact content `VENICE_GATEWAY_OK`.
- Repository state: PR #225 passed the required hosted checks and merged to canonical `main` as `c89bf0417353fbf480bae82afecd3a1a3d921248`; the obsolete task branch was removed.
- Runtime closeout: Railway is sourced from canonical `main`; the merge-commit deployment succeeded, the public health endpoint returned 200, and unauthenticated chat requests remained rejected with 401.
- Remaining: NONE for this owner outcome.
