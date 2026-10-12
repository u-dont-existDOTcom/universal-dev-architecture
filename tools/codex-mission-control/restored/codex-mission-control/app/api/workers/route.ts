import { relayJson } from "@/lib/daemon-client";
import { authenticateOwnerRequest, ownerAuthFailure } from "@/lib/owner-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authentication = authenticateOwnerRequest(request);
  if (!authentication.ok) return ownerAuthFailure(authentication);
  const timeline = new URL(request.url).searchParams.get("timeline");
  return relayJson(timeline === "recent" ? "/snapshot?timeline=recent" : "/snapshot");
}
