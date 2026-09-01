import { daemonMutationHeaders, relayJson } from "@/lib/daemon-client";
import { authenticateOwnerRequest, ownerAuthFailure } from "@/lib/owner-auth";

export async function POST(request: Request, context: { params: Promise<{ worker: string }> }) {
  const authentication = authenticateOwnerRequest(request, true);
  if (!authentication.ok) return ownerAuthFailure(authentication);
  const { worker } = await context.params;
  return relayJson(`/workers/${encodeURIComponent(worker)}/messages`, {
    method: "POST",
    headers: daemonMutationHeaders({ ...authentication.principal, workerScopes: [worker], taskScopes: [`task:${worker}`] }, { "content-type": "application/json" }),
    body: await request.text(),
  });
}
