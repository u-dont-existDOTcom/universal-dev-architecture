import { relayJson } from "@/lib/daemon-client";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ worker: string }> }) {
  const { worker } = await context.params;
  return relayJson(`/workers/${encodeURIComponent(worker)}`);
}
