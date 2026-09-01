import { relayJson } from "@/lib/daemon-client";
import { authenticateOwnerRequest, ownerAuthFailure } from "@/lib/owner-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ worker: string }> }) {
  const authentication = authenticateOwnerRequest(request);
  if (!authentication.ok) return ownerAuthFailure(authentication);
  const { worker } = await context.params;
  return relayJson(`/workers/${encodeURIComponent(worker)}`);
}
