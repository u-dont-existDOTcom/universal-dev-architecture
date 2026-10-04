import type { AuthenticatedProducer } from "./ingestion-auth";
import type { EventStore } from "./store";

export const jevShadowSummaryTool = {
  name: "mission_control_get_jev_shadow_summary",
  description: "Read durable, non-authoritative Jev shadow counts, agreement, owner signals, latency, cost and checkpoints.",
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};

export function jevShadowSummaryForProducer(store: Pick<EventStore, "jevShadowSummary">, producer: AuthenticatedProducer) {
  if (!["OWNER_AUTHORITY", "SUPERVISOR", "UI"].includes(producer.kind)) return null;
  return store.jevShadowSummary();
}
