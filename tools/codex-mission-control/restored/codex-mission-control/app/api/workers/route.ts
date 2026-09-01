import { relayJson } from "@/lib/daemon-client";
import { authenticateOwnerRequest, ownerAuthFailure } from "@/lib/owner-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authentication = authenticateOwnerRequest(request);
  if (!authentication.ok) return ownerAuthFailure(authentication);
  return relayJson("/snapshot");
}
