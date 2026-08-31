import { daemonMutationHeaders, relayJson } from "@/lib/daemon-client";
import { authenticateIngestProducer } from "@/lib/ingestion-credentials";

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
    return Response.json({ error: "Unauthorized worker outbox." }, { status: authentication.ok ? 403 : 401 });
  }
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  return relayJson(`/workers/${encodeURIComponent(worker)}/outbox${limit ? `?limit=${encodeURIComponent(limit)}` : ""}`, {
    headers: daemonMutationHeaders(authentication.producer),
  });
}
