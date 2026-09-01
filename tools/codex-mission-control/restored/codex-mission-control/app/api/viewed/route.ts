import { daemonMutationHeaders, relayJson } from "@/lib/daemon-client";
import { authenticateOwnerRequest, ownerAuthFailure } from "@/lib/owner-auth";

export async function POST(request: Request) {
  const authentication = authenticateOwnerRequest(request, true);
  if (!authentication.ok) return ownerAuthFailure(authentication);
  return relayJson("/viewed", { method: "POST", headers: daemonMutationHeaders(authentication.principal) });
}
