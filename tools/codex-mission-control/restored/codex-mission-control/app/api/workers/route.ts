import { daemonMutationHeaders, relayJson } from "@/lib/daemon-client";
import { authenticateOwnerRequest, ownerAuthFailure } from "@/lib/owner-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authentication = authenticateOwnerRequest(request);
  if (!authentication.ok) return ownerAuthFailure(authentication);
  const timeline = new URL(request.url).searchParams.get("timeline");
  return relayJson(timeline === "recent" ? "/snapshot?timeline=recent" : "/snapshot");
}

// Registering a task carries the owner's own words, so only the owner's signed-in browser session may do it (with its
// same-origin and CSRF checks). The owner bearer token is refused here: anything holding it, such as the owner-action
// tool, runs commands others write, and must not be able to put words in the owner's mouth.
export async function POST(request: Request) {
  const authentication = authenticateOwnerRequest(request, true);
  if (!authentication.ok) return ownerAuthFailure(authentication);
  if (authentication.mode !== "SESSION") {
    return Response.json({ error: "Registering a task needs your signed-in dashboard session." }, { status: 403 });
  }
  return relayJson("/workers", {
    method: "POST",
    headers: daemonMutationHeaders(authentication.principal, {
      "content-type": "application/json",
      "x-mission-control-owner-auth-mode": "SESSION",
    }),
    body: await request.text(),
  });
}
