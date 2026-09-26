import { canonicalJson } from "./canonical";
import { inBandRequestRoutePrefix } from "./in-band-request-binding";
import { FLEET_SUPERVISOR_ROUTER_PRODUCER_ID } from "./fleet-router-producer";
import type { StoredEvent } from "./schema";

const TASK_EVIDENCE_FAMILIES = new Set([
  "task_contract_recorded",
  "execution_directive_recorded",
  "execution_receipt_recorded",
  "chatgpt_work_cloud_execution_receipt_recorded",
  "worker_checkpoint_recorded",
  "live_worker_evidence_observed",
  "structured_blocker_recorded",
  "outcome_progress_recorded",
  "reasoning_supervision_recorded",
  "github_decision_receipt_ingested",
]);

function isFleetReviewArtifact(event: StoredEvent, taskId: string): boolean {
  if (event.data.type === "github_decision_receipt_ingested") {
    return event.data.task_id === taskId && event.data.request_id.startsWith("fleet-watch:");
  }
  if (event.data.type === "execution_directive_recorded") {
    return event.data.task_id === taskId
      && Boolean(event.data.validated_decision_proof?.request_id?.startsWith("fleet-watch:"));
  }
  return false;
}

export interface FleetEvidenceRef { event_id: string; event_hash: string }
export interface TrustedFleetRoute {
  requestId: string;
  expiresAt: string;
  boundary: FleetEvidenceRef[];
  event: StoredEvent;
}

export function fleetTaskEvidenceBoundary(
  events: readonly StoredEvent[], worker: string, taskId: string,
): FleetEvidenceRef[] {
  const latest = new Map<string, StoredEvent>();
  for (const event of events) {
    if (event.worker !== worker || !TASK_EVIDENCE_FAMILIES.has(event.data.type)
      || isFleetReviewArtifact(event, taskId)) continue;
    if ("task_id" in event.data && event.data.task_id !== taskId) continue;
    if (event.data.type === "worker_checkpoint_recorded"
      && !events.some(start => start.worker === worker && start.data.type === "codex_execution_started"
        && start.data.worker_run_id === event.data.worker_run_id && start.data.task_id === taskId)) continue;
    const suffix = event.data.type === "structured_blocker_recorded" ? event.data.blocker_id : "";
    latest.set(`${event.data.type}:${suffix}`, event);
  }
  return [...latest.values()].map(event => ({ event_id: event.eventId, event_hash: event.eventHash }));
}

export function sameFleetEvidenceBoundary(a: readonly FleetEvidenceRef[], b: readonly FleetEvidenceRef[]) {
  return canonicalJson(a) === canonicalJson(b);
}

export function trustedFleetRoute(
  event: StoredEvent, worker: string, taskId: string,
): TrustedFleetRoute | null {
  if (event.worker !== worker || event.producerKind !== "SYSTEM"
    || event.producerId !== FLEET_SUPERVISOR_ROUTER_PRODUCER_ID
    || event.data.type !== "worker_message_recorded"
    || !event.data.body.startsWith(inBandRequestRoutePrefix)) return null;
  try {
    const root = JSON.parse(event.data.body.slice(inBandRequestRoutePrefix.length)) as Record<string, any>;
    if (typeof root.requestId !== "string" || !root.requestId.startsWith("fleet-watch:")
      || root.schemaVersion !== 6 || root.packetKind !== "PROVIDER_SESSION_SUPERVISORY_CYCLE") return null;
    const factualPacket = root.factualPacket as Record<string, any>;
    if (!factualPacket || factualPacket.taskId !== taskId || typeof factualPacket.exactFactualState !== "string") return null;
    const factual = JSON.parse(factualPacket.exactFactualState) as Record<string, any>;
    if (factual.task_id !== taskId || factual.worker !== worker || !Array.isArray(factual.boundary)) return null;
    const boundary = factual.boundary.map((item: any) => {
      if (!item || typeof item.event_id !== "string" || typeof item.event_hash !== "string") throw new Error("invalid boundary");
      return { event_id: item.event_id, event_hash: item.event_hash };
    });
    if (typeof root.expiresAt !== "string" || !Number.isFinite(Date.parse(root.expiresAt))) return null;
    return { requestId: root.requestId, expiresAt: root.expiresAt, boundary, event };
  } catch {
    return null;
  }
}

export function trustedFleetRoutes(events: readonly StoredEvent[], worker: string, taskId: string) {
  return events.flatMap(event => {
    const route = trustedFleetRoute(event, worker, taskId);
    return route ? [route] : [];
  });
}
