import { relayJson } from "@/lib/daemon-client";
import { authenticateOwnerRequest, ownerAuthFailure } from "@/lib/owner-auth";

export const dynamic = "force-dynamic";

// For the Register a task page: whether a registration passphrase is set, when, its fingerprint, and recent wrong
// attempts or a lock (lib/owner-task-passphrase.ts). The owner's session or bearer may read it; it holds nothing secret.
export async function GET(request: Request) {
  const authentication = authenticateOwnerRequest(request);
  if (!authentication.ok) return ownerAuthFailure(authentication);
  return relayJson("/owner-task-registration");
}
