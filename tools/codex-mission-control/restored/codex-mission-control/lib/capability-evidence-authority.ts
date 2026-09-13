import type { MissionControlEventV2, StoredEvent } from "./schema";

// These proofs are materialized inside the daemon only after canonical validation.
// A generic ingest credential must never be able to manufacture them.
export const canonicalCapabilityCollectorId = "collector:github-supervision-receipts";
export function isCanonicalCapabilityEvidence(data: MissionControlEventV2): boolean {
  return data.type === "evidence_receipt_recorded" && [
    "MISSION_CONTROL_CHAT_CAPABILITY_CHALLENGE_V1",
    "MISSION_CONTROL_CHAT_CAPABILITY_VERIFIED_V1",
  ].includes(data.summary);
}
export function capabilityProducerMatches(data: MissionControlEventV2, producer: {id:string;kind:string}): boolean {
  return data.type === "evidence_receipt_recorded"
    && producer.id === canonicalCapabilityCollectorId && producer.kind === "COLLECTOR"
    && data.producer_id === producer.id && data.producer_role === producer.kind;
}
export function hasCanonicalCapabilityProvenance(event: StoredEvent): boolean {
  return event.schemaVersion === 2 && capabilityProducerMatches(event.data as MissionControlEventV2,
    {id:event.producerId,kind:event.producerKind});
}
