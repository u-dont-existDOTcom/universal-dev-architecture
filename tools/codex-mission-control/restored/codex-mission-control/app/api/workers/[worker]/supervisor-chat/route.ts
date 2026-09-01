import { daemonMutationHeaders, relayJson } from "@/lib/daemon-client";
import { authenticateOwnerRequest, ownerAuthFailure } from "@/lib/owner-auth";

export async function POST(request: Request, context: { params: Promise<{ worker: string }> }) {
  const authentication = authenticateOwnerRequest(request, true);
  if (!authentication.ok) return ownerAuthFailure(authentication);
  const { worker } = await context.params;
  return relayJson(`/workers/${encodeURIComponent(worker)}/supervisor-chat`, {
    method: "POST",
    headers: daemonMutationHeaders({ id: `ui:${authentication.principal.id}`, kind: "UI", workerScopes: [worker], taskScopes: [`task:${worker}`] }, { "content-type": "application/json" }),
    body: await request.text(),
  });
}
