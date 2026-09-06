import { daemonFetch } from "@/lib/daemon-client";
import { evaluateFinalResponseAdmission } from "@/lib/final-response-gate";
import { authenticateIngestProducer } from "@/lib/ingestion-credentials";
import type { WorkerState } from "@/lib/projection";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ worker: string }> }) {
  const { worker } = await context.params;
  const authentication = authenticateIngestProducer(
    process.env.MISSION_CONTROL_INGEST_CREDENTIALS,
    request.headers.get("x-mission-control-producer-id"),
    request.headers.get("authorization"),
  );
  if (!authentication.ok || authentication.producer.kind !== "WORKER"
    || !authentication.producer.workerScopes.includes("*") && !authentication.producer.workerScopes.includes(worker)) {
    return Response.json({ error: "Unauthorized worker finalization request." }, { status: authentication.ok ? 403 : 401 });
  }

  try {
    // The worker supplies no terminal-status facts. Mission Control reads its own
    // current projected ledger so a checkpoint or response-context boundary
    // cannot self-authorize a terminal return.
    const upstream = await daemonFetch(`/workers/${encodeURIComponent(worker)}`);
    const payload = await upstream.json().catch(() => ({})) as { worker?: WorkerState; error?: string };
    if (!upstream.ok || !payload.worker) {
      return Response.json({ error: payload.error ?? "Mission Control worker state is unavailable." }, { status: upstream.status || 503 });
    }
    const result = evaluateFinalResponseAdmission(payload.worker);
    return Response.json(result, { status: result.terminalResponseAllowed ? 200 : 409 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Mission Control finalization gate failed." }, { status: 503 });
  }
}
