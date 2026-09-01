# n8n adapter evaluation

n8n is queued for an eight-hour pass-through adapter evaluation. It is not a database, source of truth, reasoning authority, scheduler, or worker supervisor.

Export captured direct-adapter and n8n-adapter event streams as JSON arrays or JSONL, then compare them:

```sh
npm run evaluate:n8n -- --direct direct-events.jsonl --candidate n8n-events.jsonl
```

The evaluator fails when event identity, canonical payload, or order differs. Operational value (setup time, failure recovery, observability, ongoing burden) must still be recorded separately before any adoption decision.
