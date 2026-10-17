import { daemonMutationHeaders, relayJson } from "@/lib/daemon-client";
import { authenticateOwnerRequest, ownerAuthFailure } from "@/lib/owner-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authentication = authenticateOwnerRequest(request);
  if (!authentication.ok) return ownerAuthFailure(authentication);
  const timeline = new URL(request.url).searchParams.get("timeline");
  return relayJson(timeline === "recent" ? "/snapshot?timeline=recent" : "/snapshot");
}

// Registering a task carries the owner's own words. The form is the way to do it, so the app takes it only from the
// owner's signed-in dashboard session (same origin, CSRF proof) and refuses the owner bearer. That alone doesn't show the
// owner typed it: signing in takes the owner token, which scripts on the server hold too. The daemon decides, with the
// owner's registration passphrase in the body, which this route passes on unread (lib/owner-task-passphrase.ts).
export async function POST(request: Request) {
  const authentication = authenticateOwnerRequest(request, true);
  if (!authentication.ok) return ownerAuthFailure(authentication);
  if (authentication.mode !== "SESSION") {
    return Response.json({ error: "Registering a task needs your signed-in dashboard session." }, { status: 403 });
  }
  return relayJson("/workers", {
    method: "POST",
    headers: daemonMutationHeaders(authentication.principal, { "content-type": "application/json" }),
    body: await request.text(),
  });
}
