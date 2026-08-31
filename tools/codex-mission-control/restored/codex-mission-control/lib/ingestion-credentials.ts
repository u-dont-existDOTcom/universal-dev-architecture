import { timingSafeEqual } from "node:crypto";
import { producerKinds, type AuthenticatedProducer, type ProducerKind } from "./ingestion-auth";

export type IngestAuthentication =
  | { ok: true; producer: AuthenticatedProducer }
  | { ok: false; reason: "DISABLED" | "MISCONFIGURED" | "UNAUTHORIZED" };

export function authenticateIngestProducer(
  serializedCredentials: string | undefined,
  producerId: string | null,
  authorization: string | null,
): IngestAuthentication {
  if (!serializedCredentials) return { ok: false, reason: "DISABLED" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedCredentials);
  } catch {
    return { ok: false, reason: "MISCONFIGURED" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !producerId) {
    return { ok: false, reason: producerId ? "MISCONFIGURED" : "UNAUTHORIZED" };
  }
  const entry = (parsed as Record<string, unknown>)[producerId];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return { ok: false, reason: "UNAUTHORIZED" };
  const kind = (entry as Record<string, unknown>).kind;
  const token = (entry as Record<string, unknown>).token;
  if (typeof kind !== "string" || !producerKinds.includes(kind as ProducerKind)
    || typeof token !== "string" || token.length < 32) {
    return { ok: false, reason: "MISCONFIGURED" };
  }
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expectedBuffer = Buffer.from(token);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return { ok: false, reason: "UNAUTHORIZED" };
  }
  return { ok: true, producer: { id: producerId, kind: kind as ProducerKind } };
}
