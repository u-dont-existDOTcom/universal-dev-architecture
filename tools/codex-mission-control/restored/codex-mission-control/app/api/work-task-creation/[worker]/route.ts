import { daemonFetch, daemonMutationHeaders } from "@/lib/daemon-client";
import { z } from "zod";
import { sha256 } from "@/lib/canonical";
import { authenticateIngestProducer } from "@/lib/ingestion-credentials";
import { workTaskCreationSelectionAppliedSchema, type StoredEvent } from "@/lib/schema";
import { parseSubmissionRelayBindings } from "@/lib/provider-submission-authority.mjs";
import { currentExecutionDirectiveProof } from "@/lib/work-execution-runtime";
import { launchSelectionFor, workExecutionProfilesEqual } from "@/lib/work-execution-profile";

/** Selection authority is loaded from durable Chat authorization, never supplied by Work. */
export async function GET(request: Request, context: { params: Promise<{ worker: string }> }) {
  const { worker } = await context.params;
  const auth = authenticateIngestProducer(process.env.MISSION_CONTROL_INGEST_CREDENTIALS,
    request.headers.get("x-mission-control-producer-id"), request.headers.get("authorization"));
  if (!auth.ok || !(auth.producer.kind === "SYSTEM" || boundRelay(auth.producer.kind, auth.producer.id))
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

function boundRelay(kind: string, id: string): { ownedTargetIds: string[]; automationWindowId: number } | null {
  if (kind !== "COLLECTOR") return null;
  try {
    const binding = parseSubmissionRelayBindings(JSON.parse(process.env.MISSION_CONTROL_SUBMISSION_RELAY_BINDINGS_JSON ?? "{}"))[id];
    return z.object({ ownedTargetIds:z.array(z.string()), automationWindowId:z.number().int().positive() }).parse(binding);
  }
  catch { return null; }
}

const browserRequest = z.object({
  selection: z.object({ status: z.literal("DOM_SELECTION_VERIFIED"), model: z.enum(["gpt-5.6-sol", "gpt-6-astra"]),
    effort: z.enum(["low", "medium", "high", "xhigh", "max"]), managed_target_verified: z.literal(true), fast_observed: z.null() }).strict(),
  locator: z.string().regex(/^https:\/\/chatgpt\.com\/c\/[A-Za-z0-9-]+$/),
  targetId: z.string().min(1).max(300), automationWindowId: z.number().int().positive(),
}).strict();

/** The registered MC relay is the UI actor; this server bridge is the SYSTEM producer. */
export async function POST(request: Request, context: { params: Promise<{ worker: string }> }) {
  const auth = authenticateIngestProducer(process.env.MISSION_CONTROL_INGEST_CREDENTIALS,
    request.headers.get("x-mission-control-producer-id"), request.headers.get("authorization"));
  const relay = auth.ok ? boundRelay(auth.producer.kind, auth.producer.id) : null;
  if (!auth.ok || !relay) return Response.json({ error: "Registered MC browser relay required." }, { status: auth.ok ? 403 : 401 });
  const authorityResponse = await GET(request, context);
  if (!authorityResponse.ok) return authorityResponse;
  try {
    const input = browserRequest.parse(await request.json());
    if (!relay.ownedTargetIds.includes(input.targetId) || relay.automationWindowId !== input.automationWindowId)
      return Response.json({ error: "Managed target binding mismatch." }, { status: 403 });
    const { authorization } = await authorityResponse.json();
    const expected = launchSelectionFor(authorization.authorized_profile);
    if (input.selection.model !== expected.model || input.selection.effort !== expected.thinking)
      return Response.json({ error: "Authorized UI selection mismatch." }, { status: 409 });
    const now = new Date().toISOString();
    const producerId = `system:browser-creator:${sha256(auth.producer.id).slice(0, 32)}`;
    const evidenceId = `browser-setter:${sha256(`${authorization.authorization_id}:${input.locator}`).slice(0, 32)}`;
    const data = workTaskCreationSelectionAppliedSchema.parse({ type: "work_task_creation_selection_applied",
      worker: authorization.worker, evidence_id: evidenceId, authorization_id: authorization.authorization_id,
      directive_id: authorization.directive_id, directive_revision: authorization.directive_revision, task_id: authorization.task_id,
      authorized_profile: authorization.authorized_profile, model_setter: input.selection.model, effort_setter: input.selection.effort,
      fast_request: authorization.authorized_profile.fastModeRequest, fast_setter: null, producer_id: producerId,
      source: "TRUSTED_MANAGED_BROWSER_TASK_CREATION_BOUNDARY", browser_selection: input.selection,
      provider_task_locator: input.locator, applied_at: now });
    const response = await daemonFetch("/events", { method: "POST",
      headers: daemonMutationHeaders({ id: producerId, kind: "SYSTEM", workerScopes: [authorization.worker], taskScopes: [authorization.task_id] }, { "content-type": "application/json" }),
      body: JSON.stringify({ schema_version: 2, event_id: evidenceId, mission_id: "mission-control-live", occurred_at: now, data }) });
    if (!response.ok) return Response.json({ error: "Trusted browser evidence was not persisted; do not replay the launch." }, { status: response.status });
    return Response.json(await response.json());
  } catch { return Response.json({ error: "Invalid bounded browser task-creation evidence." }, { status: 400 }); }
}
