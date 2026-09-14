import { daemonFetch } from "@/lib/daemon-client";
import { authenticateIngestProducer } from "@/lib/ingestion-credentials";
import type { StoredEvent } from "@/lib/schema";
import { currentExecutionDirectiveProof } from "@/lib/work-execution-runtime";
import { workExecutionProfilesEqual } from "@/lib/work-execution-profile";

/** Selection authority is loaded from durable Chat authorization, never supplied by Work. */
export async function GET(request: Request, context: { params: Promise<{ worker: string }> }) {
  const { worker } = await context.params;
  const auth = authenticateIngestProducer(process.env.MISSION_CONTROL_INGEST_CREDENTIALS,
    request.headers.get("x-mission-control-producer-id"), request.headers.get("authorization"));
  if (!auth.ok || auth.producer.kind !== "SYSTEM"
    || !auth.producer.workerScopes.some((scope) => scope === "*" || scope === worker))
    return Response.json({ error: "Trusted task creator required." }, { status: auth.ok ? 403 : 401 });
  const history = await daemonFetch("/events");
  if (!history.ok) return Response.json({ error: "Durable authority unavailable." }, { status: 503 });
  const payload = await history.json() as { events?: StoredEvent[] };
  if (!Array.isArray(payload.events)) return Response.json({ error: "Invalid durable authority." }, { status: 503 });
  const id = new URL(request.url).searchParams.get("authorizationId");
  const event = payload.events.find((event) => event.data.type === "work_execution_profile_authorized"
    && event.data.worker === worker && event.data.authorization_id === id);
  const data = event?.data;
  const directive = currentExecutionDirectiveProof(worker, payload.events);
  if (!data || data.type !== "work_execution_profile_authorized" || !directive
    || directive.directiveId !== data.directive_id || directive.directiveRevision !== data.directive_revision
    || directive.taskId !== data.task_id || directive.directiveArtifactSha256 !== data.directive_artifact_sha256
    || !directive.workExecutionProfile || !workExecutionProfilesEqual(directive.workExecutionProfile, data.authorized_profile)
    || !auth.producer.taskScopes.some((scope) => scope === "*" || scope === data.task_id))
    return Response.json({ error: "Current source-bound launch authorization unavailable." }, { status: 409 });
  return Response.json({ authorization: data });
}
