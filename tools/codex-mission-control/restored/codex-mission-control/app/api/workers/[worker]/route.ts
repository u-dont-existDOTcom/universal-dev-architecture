import { ensureDemoData } from "@/lib/dashboard-data";
import { projectWorker } from "@/lib/projection";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ worker: string }> }) {
  const { worker } = await context.params;
  const events = ensureDemoData().workerEvents(worker);
  if (events.length === 0) return Response.json({ error: "Worker not found" }, { status: 404 });
  return Response.json({ worker: projectWorker(events), generatedAt: new Date().toISOString() });
}
