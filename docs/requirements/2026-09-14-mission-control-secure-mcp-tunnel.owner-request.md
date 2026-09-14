NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT

# Mission Control architecture decision — approved

Establish exactly **one outbound Secure MCP Tunnel from Netcup PRIMARY** to the existing constrained Mission Control MCP endpoint:

`http://127.0.0.1:3000/mcp`

Register/reconnect exactly one private developer-mode ChatGPT app named **Mission Control** in the current supervisor workspace/account.

The connected app must expose **exactly these three read-only tools and no others**:

- `get_capability_challenge`
- `get_supervisory_request_binding`
- `get_stage_liveness_state`

Those are the complete tool set currently defined by the constrained MCP surface.

**Do not connect `/api/mcp`.** That is the broader authenticated supervisor interface and is outside this approval.

Preserve:

- no inbound public Mission Control port;
- Netcup PRIMARY / Hostinger SECONDARY fencing;
- existing global send queue and pacing;
- exact MC-only supervisor registrations;
- zero provider sends during tunnel/app setup;
- no workstation browser/clipboard automation;
- no secrets, tunnel credentials, runtime keys, private chat locators, or target IDs in Git or logs.

Any OpenAI tunnel association/authorization step that the product requires may be completed as the bounded owner-level setup action. Do not broaden its permissions.

After connection, verify mechanically:

1. ChatGPT sees the private **Mission Control** app.
2. Its tool catalog is exactly the three tools above.
3. All three are read-only.
4. `get_capability_challenge` succeeds for the exact current challenge/chat binding.
5. The fresh capability proof completes through the existing GitHub capability bus.
6. The old/stale capability receipt remains invalid.
7. No extra provider send or duplicate queue item is created.

Only after those checks pass may the singular preserved `PRECLICK_RETRY_PENDING` v3 item resume.

This approval **does not authorize merging PR #108 by itself** and does not reopen issue #90.
