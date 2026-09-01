import { daemonFetch, daemonMutationHeaders } from "@/lib/daemon-client";
import { authenticateIngestProducer } from "@/lib/ingestion-credentials";
import { evaluateSupervisionAdmission } from "@/lib/supervision-admission-runtime";

export async function POST(request: Request, context: { params: Promise<{ worker: string }> }) {
  const { worker } = await context.params;
  const authentication = authenticateIngestProducer(
    process.env.MISSION_CONTROL_INGEST_CREDENTIALS,
    request.headers.get("x-mission-control-producer-id"),
    request.headers.get("authorization"),
  );
  if (!authentication.ok || authentication.producer.kind !== "WORKER"
    || !authentication.producer.workerScopes.includes("*") && !authentication.producer.workerScopes.includes(worker)) {
    return Response.json({ error: "Unauthorized worker admission request." }, { status: authentication.ok ? 403 : 401 });
  }

  try {
    const result = evaluateSupervisionAdmission(worker, authentication.producer, await request.json());
    let routeEvent = null;
    if (result.routeEnvelope) {
      const upstream = await daemonFetch("/events", {
        method: "POST",
        headers: daemonMutationHeaders(authentication.producer, { "content-type": "application/json" }),
        body: JSON.stringify(result.routeEnvelope),
      });
      const payload = await upstream.json().catch(() => ({})) as { event?: unknown; error?: string };
      if (!upstream.ok) {
        return Response.json({
          ...result,
          providerDeliveryState: "ROUTE_REJECTED",
          routeEnvelope: undefined,
          error: payload.error ?? "Mission Control could not persist the internal supervisor route.",
        }, { status: upstream.status });
      }
      routeEvent = payload.event ?? null;
    }
    const status = result.mayExecute ? 200 : result.admitted ? 202 : 409;
    return Response.json({ ...result, routeEnvelope: undefined, routeEvent }, { status });
  } catch (error) {
    const status = error instanceof Error && "statusCode" in error && (error.statusCode === 400 || error.statusCode === 403)
      ? error.statusCode
      : 400;
    return Response.json({ error: error instanceof Error ? error.message : "Invalid supervision admission request." }, { status });
  }
}
