import type { MissionControlEventV2 } from "./schema";

export const producerKinds = [
  "OWNER_AUTHORITY", "WORKER", "SUPERVISOR", "COLLECTOR", "VERIFIER", "SYSTEM", "UI",
] as const;

export type ProducerKind = typeof producerKinds[number];

export const authenticatedEventTypes = [
  "owner_source_recorded", "owner_outcome_recorded", "task_contract_recorded", "objective_reconciliation_recorded",
  "worker_checkpoint_recorded", "supervisor_assessment_recorded", "evidence_receipt_recorded", "finding_recorded",
  "finding_status_changed", "correction_lifecycle_recorded", "verification_validity_recorded", "completion_claim_recorded",
  "owner_decision_recorded", "supervision_route_recorded", "research_verdict_recorded", "reasoning_supervision_recorded",
  "execution_directive_recorded", "codex_execution_started", "execution_receipt_recorded", "outcome_progress_recorded",
  "supervision_alert_recorded", "supervision_design_feedback_recorded", "symphony_runtime_observed",
  "live_worker_evidence_observed", "symphony_adapter_diagnostic_recorded", "review_marked", "supervisor_chat_link_set",
] as const satisfies readonly MissionControlEventV2["type"][];

export interface AuthenticatedProducer {
  id: string;
  kind: ProducerKind;
  workerScopes: string[];
  taskScopes: string[];
}

const authorityEvents = new Set<MissionControlEventV2["type"]>([
  "owner_source_recorded", "owner_outcome_recorded", "task_contract_recorded",
  "objective_reconciliation_recorded", "owner_decision_recorded",
]);
const workerEvents = new Set<MissionControlEventV2["type"]>([
  "worker_checkpoint_recorded", "completion_claim_recorded", "codex_execution_started", "execution_receipt_recorded",
]);
const supervisorEvents = new Set<MissionControlEventV2["type"]>([
  "supervisor_assessment_recorded", "finding_recorded", "finding_status_changed",
  "correction_lifecycle_recorded", "supervision_route_recorded", "supervision_design_feedback_recorded",
  "reasoning_supervision_recorded", "execution_directive_recorded", "outcome_progress_recorded",
  "supervision_alert_recorded",
]);
const collectorEvents = new Set<MissionControlEventV2["type"]>([
  "evidence_receipt_recorded", "symphony_runtime_observed", "live_worker_evidence_observed", "symphony_adapter_diagnostic_recorded",
]);
const verifierEvents = new Set<MissionControlEventV2["type"]>([
  "evidence_receipt_recorded", "verification_validity_recorded", "finding_status_changed",
  "correction_lifecycle_recorded", "research_verdict_recorded",
]);

export function producerMayEmit(producer: AuthenticatedProducer, event: MissionControlEventV2): boolean {
  if (!scopeMatches(producer.workerScopes, event.worker)) return false;
  if (!scopeMatches(producer.taskScopes, eventTaskId(event))) return false;
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

function eventTaskId(event: MissionControlEventV2): string {
  if ("task_id" in event && typeof event.task_id === "string") return event.task_id;
  return `task:${event.worker ?? "mission-control"}`;
}

function scopeMatches(scopes: string[], value: string | null): boolean {
  return scopes.includes("*") || Boolean(value && scopes.includes(value));
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
