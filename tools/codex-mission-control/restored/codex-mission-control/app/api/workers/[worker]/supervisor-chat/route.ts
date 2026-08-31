import { daemonMutationHeaders, relayJson, sameOriginMutation } from "@/lib/daemon-client";

export async function POST(request: Request, context: RouteContext<"/api/workers/[worker]/supervisor-chat">) {
  if (!sameOriginMutation(request)) return Response.json({ error: "Cross-origin mutation rejected." }, { status: 403 });
  const { worker } = await context.params;
  return relayJson(`/workers/${encodeURIComponent(worker)}/supervisor-chat`, {
    method: "POST",
    headers: daemonMutationHeaders({ id: "ui:dashboard", kind: "UI" }, { "content-type": "application/json" }),
    body: await request.text(),
  });
}
