import { daemonMutationHeaders, relayJson, sameOriginMutation } from "@/lib/daemon-client";

export async function POST(request: Request, context: { params: Promise<{ worker: string }> }) {
  if (!sameOriginMutation(request)) return Response.json({ error: "Cross-origin mutation rejected." }, { status: 403 });
  const { worker } = await context.params;
  return relayJson(`/workers/${encodeURIComponent(worker)}/messages`, {
    method: "POST",
    headers: daemonMutationHeaders({
      id: "owner:dashboard",
      kind: "UI",
      workerScopes: [worker],
      taskScopes: [`task:${worker}`],
    }, { "content-type": "application/json" }),
    body: await request.text(),
  });
}
