import { daemonMutationHeaders, relayJson } from "@/lib/daemon-client";
import { FLEET_ENROLL_PROJECT_ID, parseFleetWatchEnrollment } from "@/lib/fleet-watch-enrollment";
import { authenticateOwnerRequest, ownerAuthFailure } from "@/lib/owner-auth";

export const dynamic = "force-dynamic";

// Owner-only enrollment of an existing worker/task under an owner-chosen project id. The daemon
// re-validates against the ledger (no invented worker or task) and returns the created watch.
function invalid(error: string): Response {
  return Response.json({ error }, { status: 400 });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const authentication = authenticateOwnerRequest(request, true);
  if (!authentication.ok) return ownerAuthFailure(authentication);

  const { projectId } = await context.params;
  if (typeof projectId !== "string" || !FLEET_ENROLL_PROJECT_ID.test(projectId)) return invalid("Invalid project id.");

  const raw = await request.text();
  if (raw.length === 0 || raw.length > 512) return invalid("Enrollment requires a small JSON body.");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return invalid("Enrollment must be JSON.");
  }
  const enrollment = parseFleetWatchEnrollment(value);
  if (typeof enrollment === "string") return invalid(enrollment);

  return relayJson(`/fleet-supervisor/${encodeURIComponent(projectId)}/enroll`, {
    method: "POST",
    headers: daemonMutationHeaders(authentication.principal, { "content-type": "application/json" }),
    body: JSON.stringify(enrollment),
  });
}
