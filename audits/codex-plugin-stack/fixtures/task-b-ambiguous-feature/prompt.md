# Task B — Ambiguous feature

Add `ServiceRegistry.resolve(requested, options)`.

Requirements:

- Return the exact registered service when `requested` exists.
- Otherwise return `options.fallback` when that service exists.
- Otherwise throw `Unknown service: <requested>`.
- Resolution must not mutate the registry.
- Keep registration and lookup behavior backward compatible.

Choose a simple public API, implement it, add representative tests, and verify
the whole suite. The requirements contain enough information to proceed without
asking the owner to choose an implementation.
