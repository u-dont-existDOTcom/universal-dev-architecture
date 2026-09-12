# Mission Control owner supervision window

Classification: `NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT`

Status: active

Lane: release

Owner issue: #104
Base: `origin/main` at `25a26b52fed5d001a254dcf8edfd4559264734b3`

## Owner outcome

Give Joel one secure, obvious daily Mission Control window whose Fleet, Supervision, worker detail, and infrastructure/transport status are derived from current authenticated live evidence rather than demo fixtures or static claims. Preserve the completed issue #90 authority and deployment boundary.

## Frozen constraints

- Mission Control remains loopback-only on Netcup PRIMARY.
- Owner access uses an intentional SSH local forward; worker/controller/browser automation remains on the VPSes.
- No workstation browser or clipboard becomes a worker execution surface.
- No credentials, private host addresses, target IDs, or private chat locators enter Git or evidence artifacts.
- The daemon remains the sole durable SQLite writer and shared provider-send authority.
- Live health fails closed when authenticated evidence is absent or stale.

## Current live audit

- Netcup Mission Control is running and healthy on loopback.
- The durable authority and hash-chained ledgers report healthy.
- `MISSION_CONTROL_SKIP_SEED` is currently unset.
- The live Fleet contains only seeded fixture workers; no current worker is represented truthfully.
- The configured supervisor directory has one Project Manager and two specialist MC-only chats.
- Both relay hosts retain durable authority bindings, but the UI hard-codes `NOT_CONNECTED` and does not expose current authenticated host/browser health.
- SSH forwarding is allowed. No prior owner access route was configured, so a loopback-only local-forward alias is the simplest secure access path.

## Execution sequence

1. Add a privacy-safe authenticated operator projection for authority, pacing, relay bindings, chat delivery/source binding, and current host/browser/worker heartbeats.
2. Add relay health reporting through existing host-unique collector authentication and deploy bounded periodic reporters on both VPSes.
3. Stop future demo seeding and exclude fixture-only workers from production Fleet/Supervision responses without deleting historical append-only records.
4. Record the current issue #104 live worker contract and run its authenticated polling sidecar on Netcup so Fleet and worker detail show real work.
5. Update Fleet and Supervision to show plain-language task, attention, supervisor, wait, execution, review, and infrastructure/transport truth.
6. Run focused tests, then full Mission Control, relay, repository, audit, archive, and build gates using test telemetry.
7. Deploy the exact candidate to Netcup, update both relay health reporters, and verify `/`, `/supervision`, a live worker detail page, owner auth, SSE, pacing, and ledger integrity through the SSH owner route.
8. Open a PR, obtain review and exact-head hosted checks, inspect the final diff, merge normally, update the durable requirement/evidence, and close #104 only after live acceptance remains green.

## Rollback

- Application rollback: redeploy the prior immutable source archive while keeping the current database volume.
- Reporter rollback: stop and disable only the new health timers; missing heartbeats render UNKNOWN/UNAVAILABLE.
- Owner access rollback: terminate the SSH forward and remove only the task-specific SSH host entry.
- Never delete or rewrite the live event or submission-authority ledger.

## Acceptance evidence still required

- Exact-head local and hosted gates.
- Authenticated live dashboard, supervision, detail, and SSE evidence.
- Current live worker rather than fixture-only rows.
- Fresh health reports from both hosts with no secret fields.
- Direct MC-only chat links and truthful registered/reachable/source-bound labels.
- Final concise owner opening instruction.
