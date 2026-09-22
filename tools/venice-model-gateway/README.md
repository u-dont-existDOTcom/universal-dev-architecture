# Venice model gateway

Authenticated fixed-destination proxy for UDA-controlled OpenAI-compatible model calls.

Runtime variables:

- `VENICE_API_KEY` — Venice provider credential; required and never returned or logged.
- `MODEL_GATEWAY_TOKEN` — separate bearer token required from UDA callers.
- `PORT` — Railway-provided listen port.

Endpoints:

- `GET /health` — non-secret readiness metadata.
- `GET /v1/models` — authenticated Venice model catalogue.
- `POST /v1/chat/completions` — authenticated OpenAI-compatible chat completion proxy.

The alias `gpt-5.6-sol` maps to Venice `openai-gpt-56-sol`. Other Venice model IDs pass through unchanged. The upstream origin is hard-coded to `https://api.venice.ai/api/v1`; callers cannot choose an arbitrary destination.

This gateway does not replace OpenRouter-only APIs such as TypeSafe Jev Decisions.
