# Global Project Manager developer-MCP capability blocker

Date: 2026-09-08

Scope: `mc-project-manager` only. This does not alter or invalidate the accepted specialist route-v4 evidence for `mc-hotfix-specialist`.

## Observed result

The required live `get_capability_challenge` operation failed closed because the registered Project Manager provider conversation did not support developer MCP execution for the required Mission Control call. No GitHub verification/write was attempted and no `MISSION_CONTROL_CHAT_CAPABILITY_RECEIPT_V1` was created.

This disproves the exact PM capability edge required by the current PM bootstrap path. Do not retry the same PM→Mission-Control developer-MCP path as though the failure were a transient missing receipt.

## Architecture consequence

For the PM path, Mission Control read/binding must move out of the reasoning chat. The stable Project Manager identity remains `mc-project-manager`, but its semantic provider session must receive an exact Mission-Control-produced binding/evidence capsule through a separately verified control-plane delivery path rather than being required to call Mission Control itself.

Do not weaken the accepted specialist route-v4 MCP-binding path globally. Prefer a distinct PM/controller-delivered binding route/version so existing specialist acceptance remains intact.

## Next discriminating test

Before implementing the replacement route, verify the exact remaining return edge with one harmless fresh PM provider session:

`mc-project-manager provider session -> GitHub read/write`

The test must use GitHub only, with no Mission Control/developer-MCP selection or call. Success requires an actual authorized GitHub receipt/comment from the PM provider session. Generation completion or prose claiming GitHub access is not evidence.

If that GitHub edge passes, implement a controller-delivered PM binding path that:

1. derives and durably records the exact binding envelope in Mission Control;
2. delivers that envelope verbatim to the PM provider session with exact prompt/session/model transport evidence;
3. has the PM read immutable GitHub evidence and write the canonical decision in the same GitHub-capable first message;
4. validates the returned decision against the pending request, exact controller-produced binding envelope/hash, PM provider-session transport evidence, and GitHub receipt window;
5. does not require `MISSION_CONTROL_READ` or fabricate an MCP tool receipt.

If the GitHub edge fails, stop before implementation and choose a different PM return channel. Reading/copying assistant output remains outside the current privacy boundary and would require a separate owner decision.

Production remains outside the authorization boundary.
