# ChatGPT storage canary

Status: iteration tool, not a persistence guarantee.

## Purpose

Measure where a write fails when ChatGPT is asked to persist exact text through an external app. Keep these separate:

1. ChatGPT/app transport admitted the call;
2. the external backend received the request;
3. the backend durably wrote exact UTF-8 bytes;
4. a later read-back reproduced the same bytes and SHA-256.

A pass at one layer does not imply a pass at another. In particular, this tool must never be described as a way to bypass platform safety controls.

## Service contract

`tools/chatgpt_storage_canary.py` is dependency-free and stores records under a configured storage directory. It exposes:

- `POST /v1/records` — authenticated exact-text write with an idempotency key and optional expected SHA-256;
- `GET /v1/records/{record_id}` — authenticated exact read-back with verified SHA-256;
- `GET /openapi.json` — action schema for a later ChatGPT transport experiment;
- `GET /health` — content-free liveness only.

The store writes an individual record plus an idempotency mapping using temp-file + fsync + atomic rename. Reusing an idempotency key with different bytes fails closed. A stored record whose bytes no longer match its receipt fails read-back.

The service does not perform model inference, moderation, rewriting, analytics, publication, or automatic forwarding. It has no delete endpoint.

## Local verification

Run the repository test suite at the normal verification boundary. A standalone exact-byte self-test is also available:

`python3 tools/chatgpt_storage_canary.py self-test`

The self-test proves only backend storage mechanics. It does not test ChatGPT's app/tool transport.

## Deployment boundary

Do not expose this service publicly until all of the following are explicit:

- an owner-authorized host/deployment;
- a non-repository bearer token;
- a persistent storage mount if durability across redeploy is being claimed;
- HTTPS termination;
- a bounded synthetic test corpus with no private user material;
- an owner-authorized ChatGPT app/action connection.

For a public endpoint, bind the service only behind the deployment platform's authenticated/secret configuration. Never commit the bearer token or private storage contents.

## Transport experiment

Use the same exact synthetic payloads and expected hashes across each available route:

- connected GitHub write;
- connected Drive write;
- custom storage app/action;
- direct backend request.

Record each layer independently as `TRANSPORT_ADMITTED`, `TRANSPORT_REJECTED`, `BACKEND_RECEIVED`, `BACKEND_STORED`, and `READBACK_VERIFIED`. A direct-backend pass with a ChatGPT-app rejection proves a platform transport boundary; it does not prove the backend failed. A custom-app pass does not prove future arbitrary content will always be admitted.

## Related work

- Universal Dev Architecture issue #123 tracks the canary experiment.
- Inner Signal issue #61 tracks storage-first private therapy persistence and the ChatGPT/app ingress seam.
- AskRigor issue #225 tracks exact lesson-incident preservation across ChatGPT Action/app transport.
