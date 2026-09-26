import { daemonMutationHeaders, relayJson } from "@/lib/daemon-client";
import { FLEET_PROJECT_ID, parseFleetWatchUpdate } from "@/lib/fleet-watch-update";
import { authenticateOwnerRequest, ownerAuthFailure } from "@/lib/owner-auth";

export const dynamic = "force-dynamic";

// Owner-facing capability for the existing daemon mutation POST /fleet-supervisor/:projectId.
// The owner/internal credentials stay server-side: this route authenticates the owner (bearer, or
// session + same-origin + CSRF), forwards only the two existing watch fields under the owner
// principal, and returns the daemon's watch readback. It is not a generic authenticated proxy.
function invalid(error: string): Response {
  return Response.json({ error }, { status: 400 });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const authentication = authenticateOwnerRequest(request, true);
  if (!authentication.ok) return ownerAuthFailure(authentication);

  const { projectId } = await context.params;
  if (typeof projectId !== "string" || !FLEET_PROJECT_ID.test(projectId)) return invalid("Invalid project id.");

  const update = parseFleetWatchUpdate(await request.text());
  if (typeof update === "string") return invalid(update);

  return relayJson(`/fleet-supervisor/${encodeURIComponent(projectId)}`, {
    method: "POST",
    headers: daemonMutationHeaders(authentication.principal, { "content-type": "application/json" }),
    body: JSON.stringify(update),
  });
}
