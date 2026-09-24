import { daemonFetch, daemonMutationHeaders } from "@/lib/daemon-client";
import { authenticateIngestProducer } from "@/lib/ingestion-credentials";
import type { AuthenticatedProducer } from "@/lib/ingestion-auth";
import type { StoredEvent } from "@/lib/schema";
import { evaluatePersistedClaudeExecutionPreflight } from "@/lib/claude-execution-runtime";

export async function POST(request: Request, context: { params: Promise<{ worker: string }> }) {
  const { worker } = await context.params;
  const authentication = authenticateIngestProducer(
    process.env.MISSION_CONTROL_INGEST_CREDENTIALS,
    request.headers.get("x-mission-control-producer-id"),
    request.headers.get("authorization"),
  );
  if (!authentication.ok || authentication.producer.kind !== "WORKER"
    || !authentication.producer.workerScopes.includes("*") && !authentication.producer.workerScopes.includes(worker)) {
    return Response.json({ error: "Unauthorized Claude execution preflight request." }, { status: authentication.ok ? 403 : 401 });
  }
  try {
    const history = await daemonFetch("/events");
    if (!history.ok) return Response.json({ error: "Mission Control event history is unavailable." }, { status: 503 });
    const historyBody = await history.json() as { events?: StoredEvent[] };
    if (!Array.isArray(historyBody.events)) return Response.json({ error: "Mission Control event history is invalid." }, { status: 503 });
    const evaluated = evaluatePersistedClaudeExecutionPreflight({
      worker, body: await request.json(), events: historyBody.events, now: new Date().toISOString(),
    });
    const taskId = evaluated.envelope.data.type === "claude_cli_launch_preflight_recorded"
      ? evaluated.envelope.data.task_id : `task:${worker}`;
    const systemProducer: AuthenticatedProducer = {
      id: "system:claude-execution-preflight", kind: "SYSTEM", workerScopes: [worker], taskScopes: [taskId],
    };
    const upstream = await daemonFetch("/events", {
      method: "POST", headers: daemonMutationHeaders(systemProducer, { "content-type": "application/json" }),
      body: JSON.stringify(evaluated.envelope),
    });
    const payload = await upstream.json().catch(() => ({})) as { event?: unknown; error?: string };
    if (!upstream.ok) return Response.json({ error: payload.error ?? "Mission Control could not persist the Claude execution preflight." }, { status: upstream.status });
    return Response.json({ ...evaluated.preflight, preflightEvent: payload.event ?? null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid Claude execution preflight request." }, { status: 400 });
  }
}
