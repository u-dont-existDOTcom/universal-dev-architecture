import { daemonMutationHeaders, relayJson, sameOriginMutation } from "@/lib/daemon-client";

export async function POST(request: Request) {
  if (!sameOriginMutation(request)) return Response.json({ error: "Cross-origin mutation rejected." }, { status: 403 });
  return relayJson("/viewed", { method: "POST", headers: daemonMutationHeaders({ id: "ui:dashboard", kind: "UI" }) });
}
