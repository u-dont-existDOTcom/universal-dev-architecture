import { daemonMutationHeaders, relayJson } from "@/lib/daemon-client";
import { authenticateOwnerRequest, ownerAuthFailure } from "@/lib/owner-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authentication = authenticateOwnerRequest(request, true);
  if (!authentication.ok) return ownerAuthFailure(authentication);

  const body = await request.text();
  if (body.length !== 0) {
    return Response.json(
      { error: "GitHub reconciliation recovery accepts no request body." },
      { status: 400 },
    );
  }

  return relayJson("/github/decision-receipts/reconcile", {
    method: "POST",
    headers: daemonMutationHeaders(authentication.principal),
  });
}
