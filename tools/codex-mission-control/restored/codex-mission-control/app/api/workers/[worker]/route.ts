import { relayJson } from "@/lib/daemon-client";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/workers/[worker]">) {
  const { worker } = await context.params;
  return relayJson(`/workers/${encodeURIComponent(worker)}`);
}
