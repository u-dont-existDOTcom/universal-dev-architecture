import { canonicalJson } from "./canonical";
import { inBandRequestRoutePrefix } from "./in-band-request-binding";
import { requestRouteEventId } from "./request-bound-supervision";
import { FLEET_SUPERVISOR_ROUTER_PRODUCER_ID } from "./fleet-router-producer";
import type { StoredEvent } from "./schema";

const FLEET_REQUEST_PREFIX = "fleet-watch:";
const BOUNDARY_FAMILIES = new Set([
  "task_contract_recorded", "execution_directive_recorded", "execution_receipt_recorded",
  "chatgpt_work_cloud_execution_receipt_recorded", "worker_checkpoint_recorded",
  "live_worker_evidence_observed", "structured_blocker_recorded", "outcome_progress_recorded",
  "reasoning_supervision_recorded", "github_decision_receipt_ingested",
]);

function isFleetReviewArtifact(event: StoredEvent, taskId: string): boolean {
  if (event.data.type === "github_decision_receipt_ingested") {
    return event.data.task_id === taskId && event.data.request_id.startsWith(FLEET_REQUEST_PREFIX);
  }
  if (event.data.type === "execution_directive_recorded") {
    return event.data.task_id === taskId
      && Boolean(event.data.validated_decision_proof?.request_id?.startsWith(FLEET_REQUEST_PREFIX));
  }
  return false;
}

export function fleetEvidenceEvents(events: readonly StoredEvent[], taskId: string): StoredEvent[] {
  const latest = new Map<string, StoredEvent>();
  for (const event of events) {
    if (!BOUNDARY_FAMILIES.has(event.data.type) || isFleetReviewArtifact(event, taskId)) continue;
    if ("task_id" in event.data && event.data.task_id !== taskId) continue;
    const suffix = event.data.type === "structured_blocker_recorded" ? event.data.blocker_id : "";
    latest.set(`${event.data.type}:${suffix}`, event);
  }
  return [...latest.values()];
}

export function fleetEvidenceBoundary(events: readonly StoredEvent[], taskId: string) {
  return fleetEvidenceEvents(events, taskId)
    .map((event) => ({ event_id: event.eventId, event_hash: event.eventHash }));
}

export function fleetRequestEvidenceIsCurrent(
  events: readonly StoredEvent[],
  requestId: string,
  taskId: string,
): boolean {
  if (!requestId.startsWith(FLEET_REQUEST_PREFIX)) return false;
  const route = events.find((event) => event.eventId === requestRouteEventId(requestId, 6)
    && event.worker
    && event.data.type === "worker_message_recorded"
    && event.producerKind === "SYSTEM"
    && event.producerId === FLEET_SUPERVISOR_ROUTER_PRODUCER_ID);
  if (!route || route.data.type !== "worker_message_recorded"
    || !route.data.body.startsWith(inBandRequestRoutePrefix)) return false;
  try {
    const root = JSON.parse(route.data.body.slice(inBandRequestRoutePrefix.length)) as Record<string, unknown>;
    if (root.requestId !== requestId || root.producerId !== FLEET_SUPERVISOR_ROUTER_PRODUCER_ID) return false;
    const packet = asRecord(root.factualPacket);
    if (!packet || packet.taskId !== taskId || typeof packet.exactFactualState !== "string") return false;
    const factual = asRecord(JSON.parse(packet.exactFactualState));
    if (!factual || !Array.isArray(factual.boundary)) return false;
    return canonicalJson(factual.boundary) === canonicalJson(fleetEvidenceBoundary(events, taskId));
  } catch {
    return false;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
