import type { MissionControlEventV2 } from "./schema";

export const producerKinds = [
  "OWNER_AUTHORITY", "WORKER", "SUPERVISOR", "COLLECTOR", "VERIFIER", "SYSTEM", "UI",
] as const;

export type ProducerKind = typeof producerKinds[number];

export interface AuthenticatedProducer {
  id: string;
  kind: ProducerKind;
}

const authorityEvents = new Set<MissionControlEventV2["type"]>([
  "owner_source_recorded", "owner_outcome_recorded", "task_contract_recorded",
  "objective_reconciliation_recorded", "owner_decision_recorded",
]);
const workerEvents = new Set<MissionControlEventV2["type"]>([
  "worker_checkpoint_recorded", "completion_claim_recorded",
]);
const supervisorEvents = new Set<MissionControlEventV2["type"]>([
  "supervisor_assessment_recorded", "finding_recorded", "finding_status_changed",
  "correction_lifecycle_recorded", "supervision_route_recorded", "supervision_design_feedback_recorded",
]);
const collectorEvents = new Set<MissionControlEventV2["type"]>([
  "evidence_receipt_recorded", "symphony_runtime_observed",
]);
const verifierEvents = new Set<MissionControlEventV2["type"]>([
  "evidence_receipt_recorded", "verification_validity_recorded", "finding_status_changed",
  "correction_lifecycle_recorded", "research_verdict_recorded",
]);

export function producerMayEmit(producer: AuthenticatedProducer, event: MissionControlEventV2): boolean {
  if (!embeddedIdentityMatches(producer, event)) return false;
  if (producer.kind === "OWNER_AUTHORITY") return authorityEvents.has(event.type);
  if (producer.kind === "WORKER") {
    return workerEvents.has(event.type) || event.type === "correction_lifecycle_recorded"
      && ["DIRECTIVE_ACKNOWLEDGED", "CORRECTION_STARTED", "CORRECTION_EVIDENCE_SUBMITTED"].includes(event.status)
      && ["WORKER", "AUTHORIZED_EXECUTOR"].includes(event.actor_role);
  }
  if (producer.kind === "SUPERVISOR") {
    return supervisorEvents.has(event.type) && !(event.type === "correction_lifecycle_recorded"
      && ["DIRECTIVE_DELIVERED", "DIRECTIVE_ACKNOWLEDGED", "CORRECTION_STARTED", "CORRECTION_VERIFIED"].includes(event.status));
  }
  if (producer.kind === "COLLECTOR") return collectorEvents.has(event.type);
  if (producer.kind === "VERIFIER") {
    return verifierEvents.has(event.type) && !(event.type === "correction_lifecycle_recorded"
      && !["CORRECTION_VERIFIED", "CORRECTION_EVIDENCE_REJECTED", "CORRECTION_REOPENED"].includes(event.status));
  }
  if (producer.kind === "SYSTEM") {
    return event.type === "correction_lifecycle_recorded"
      && ["DIRECTIVE_DELIVERED", "DIRECTIVE_DELIVERY_FAILED", "CORRECTION_REOPENED"].includes(event.status);
  }
  return event.type === "review_marked" || event.type === "supervisor_chat_link_set";
}

function embeddedIdentityMatches(producer: AuthenticatedProducer, event: MissionControlEventV2): boolean {
  if (event.type === "evidence_receipt_recorded") {
    return event.producer_id === producer.id && event.producer_role === producer.kind;
  }
  if (event.type === "finding_status_changed") {
    return event.actor_id === producer.id && event.actor_role === producer.kind;
  }
  if (event.type === "correction_lifecycle_recorded") {
    const allowedActorRoles: Partial<Record<ProducerKind, string[]>> = {
      WORKER: ["WORKER", "AUTHORIZED_EXECUTOR"],
      SUPERVISOR: ["SUPERVISOR", "CONTRACT_ISSUER"],
      VERIFIER: ["VERIFIER"],
      SYSTEM: ["SYSTEM"],
      OWNER_AUTHORITY: ["OWNER"],
    };
    return event.producer_id === producer.id && Boolean(allowedActorRoles[producer.kind]?.includes(event.actor_role));
  }
  if (producer.kind === "WORKER" && workerEvents.has(event.type)) {
    return producer.id === event.worker || producer.id === `worker:${event.worker}`;
  }
  if (event.type === "owner_decision_recorded") return event.authorized_by === producer.id;
  return true;
}
