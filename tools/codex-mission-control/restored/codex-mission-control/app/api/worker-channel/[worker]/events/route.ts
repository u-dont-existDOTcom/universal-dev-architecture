import { daemonMutationHeaders, relayJson } from "@/lib/daemon-client";
import { authenticateIngestProducer } from "@/lib/ingestion-credentials";

export async function POST(request: Request, context: { params: Promise<{ worker: string }> }) {
  const { worker } = await context.params;
  const authentication = authenticateIngestProducer(
    process.env.MISSION_CONTROL_INGEST_CREDENTIALS,
    request.headers.get("x-mission-control-producer-id"),
    request.headers.get("authorization"),
  );
  if (!authentication.ok || authentication.producer.kind !== "WORKER"
    || !authentication.producer.workerScopes.includes("*") && !authentication.producer.workerScopes.includes(worker)) {
    return Response.json({ error: "Unauthorized worker channel." }, { status: authentication.ok ? 403 : 401 });
  }
  return relayJson(`/workers/${encodeURIComponent(worker)}/channel/events`, {
    method: "POST",
    headers: daemonMutationHeaders(authentication.producer, { "content-type": "application/json" }),
    body: await request.text(),
  });
}
