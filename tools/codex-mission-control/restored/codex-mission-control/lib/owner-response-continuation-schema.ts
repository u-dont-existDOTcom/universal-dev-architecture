import { z } from "zod";
import { canonicalJson, sha256 } from "./canonical";

const id = z.string().min(1).max(180).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const messageFields = { event_id: id, message_id: id, body_sha256: digest };

// Separate from the historical route-v4 binding capsule. No defaults or text.
export const ownerResponseContinuationBindingSchema = z.object({
  schema_version: z.literal(1),
  kind: z.literal("OWNER_RESPONSE_CONTINUATION"),
  continuation_id: digest,
  worker: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/),
  decision_request_id: id,
  supervisor_id: id,
  path: z.enum(["DIRECT", "PROJECT_MANAGER"]),
  originating_supervisor_message: z.object(messageFields).strict(),
  owner_input: z.object({ ...messageFields, parent_message_id: id, surface_role: z.enum(["SUPERVISOR", "PROJECT_MANAGER"]) }).strict(),
  supervisor_delivery: z.object({ ...messageFields, parent_message_id: id }).strict(),
  owner_outcome: z.object({ id, epoch: z.number().int().positive(), sha256: digest }).strict(),
  evidence_capsule: z.object({ id, sha256: digest }).strict(),
  issued_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }),
}).strict();

export type OwnerResponseContinuationBinding = z.infer<typeof ownerResponseContinuationBindingSchema>;
export interface OwnerResponseContinuation {
  binding: OwnerResponseContinuationBinding;
  digest: string;
  exactOwnerResponseText: string;
}

// An owner answer stays consumed across retry windows and evidence/outcome changes.
export function continuationId(binding: Omit<OwnerResponseContinuationBinding, "continuation_id">): string {
  const { owner_outcome, evidence_capsule, issued_at, expires_at, ...causal } = binding;
  void owner_outcome; void evidence_capsule; void issued_at; void expires_at;
  return sha256(canonicalJson(causal));
}

export function validateContinuationBinding(value: unknown, expectedDigest: unknown): OwnerResponseContinuationBinding {
  const binding = ownerResponseContinuationBindingSchema.parse(value);
  if (expectedDigest !== sha256(canonicalJson(binding))) throw new Error("Continuation binding digest mismatch.");
  const { continuation_id, ...fields } = binding;
  if (continuation_id !== continuationId(fields)) throw new Error("Continuation causal identity mismatch.");
  if (Date.parse(binding.expires_at) <= Date.parse(binding.issued_at)) throw new Error("Continuation expiry must follow its Mission Control issue time.");
  const origin = binding.originating_supervisor_message, owner = binding.owner_input, delivery = binding.supervisor_delivery;
  if (owner.parent_message_id !== origin.message_id || owner.body_sha256 !== delivery.body_sha256) {
    throw new Error("Continuation OWNER parent/body binding mismatch.");
  }
  if (binding.path === "DIRECT"
    ? owner.surface_role !== "SUPERVISOR" || owner.event_id !== delivery.event_id || owner.message_id !== delivery.message_id || delivery.parent_message_id !== origin.message_id
    : owner.surface_role !== "PROJECT_MANAGER" || owner.event_id === delivery.event_id || owner.message_id === delivery.message_id || delivery.parent_message_id !== owner.message_id) {
    throw new Error("Continuation direct/PM causal path mismatch.");
  }
  return binding;
}

export function parseRouteContinuation(route: Record<string, unknown>): OwnerResponseContinuation | undefined {
  const fields = ["continuationBinding", "continuationBindingSha256", "continuationOwnerResponseExactText"];
  if (!fields.some((field) => Object.hasOwn(route, field))) return undefined;
  if (route.schemaVersion !== 4 || !fields.every((field) => Object.hasOwn(route, field))) {
    throw new Error("Continuation requires all three private route-v4 fields.");
  }
  const binding = validateContinuationBinding(route.continuationBinding, route.continuationBindingSha256);
  const text = route.continuationOwnerResponseExactText;
  if (typeof text !== "string" || !text.length || sha256(text) !== binding.supervisor_delivery.body_sha256) {
    throw new Error("Continuation exact OWNER response text/hash mismatch.");
  }
  if (route.destinationSupervisorId !== binding.supervisor_id
    || canonicalJson(route.ownerOutcome) !== canonicalJson(binding.owner_outcome)
    || canonicalJson(route.evidenceCapsule) !== canonicalJson(binding.evidence_capsule)
    || route.queuedAt !== binding.issued_at || route.expiresAt !== binding.expires_at) {
    throw new Error("Continuation does not match the current route binding.");
  }
  return { binding, digest: route.continuationBindingSha256 as string, exactOwnerResponseText: text };
}
