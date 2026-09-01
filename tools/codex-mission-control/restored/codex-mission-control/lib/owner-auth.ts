import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthenticatedProducer } from "./ingestion-auth";
import { sameOriginMutation } from "./daemon-client";

export const ownerSessionCookie = "mc_owner_session";
export const ownerCsrfCookie = "mc_owner_csrf";
const sessionLifetimeSeconds = 8 * 60 * 60;

interface SessionPayload {
  type: "owner_session";
  sub: string;
  issued_at: number;
  expires_at: number;
}

export type OwnerAuthentication =
  | { ok: true; mode: "BEARER" | "SESSION"; principal: AuthenticatedProducer }
  | { ok: false; status: 401 | 403 | 503; error: string };

export function authenticateOwnerRequest(request: Request, mutation = false): OwnerAuthentication {
  const ownerToken = process.env.MISSION_CONTROL_OWNER_TOKEN;
  const ownerId = process.env.MISSION_CONTROL_OWNER_ID ?? "owner:primary";
  const suppliedBearer = bearerToken(request.headers.get("authorization"));
  if (suppliedBearer) {
    if (!validSecret(ownerToken)) return unavailable();
    if (!constantEqual(suppliedBearer, ownerToken!)) return unauthorized();
    return authenticated(ownerId, "BEARER");
  }

  const session = cookie(request, ownerSessionCookie);
  const payload = verifyOwnerSessionToken(session);
  if (!payload) return validSecret(process.env.MISSION_CONTROL_SESSION_SECRET) ? unauthorized() : unavailable();
  if (mutation) {
    if (!sameOriginMutation(request)) return { ok: false, status: 403, error: "Cross-origin owner mutation rejected." };
    const cookieCsrf = cookie(request, ownerCsrfCookie);
    const headerCsrf = request.headers.get("x-mission-control-csrf") ?? "";
    if (!cookieCsrf || !constantEqual(cookieCsrf, headerCsrf)) {
      return { ok: false, status: 403, error: "Owner CSRF proof is missing or invalid." };
    }
  }
  return authenticated(payload.sub, "SESSION");
}

export function verifyOwnerSessionToken(token: string | undefined): SessionPayload | null {
  if (!token || !validSecret(process.env.MISSION_CONTROL_SESSION_SECRET)) return null;
  const parsed = verifySigned<SessionPayload>(token, process.env.MISSION_CONTROL_SESSION_SECRET!);
  if (!parsed || parsed.type !== "owner_session" || typeof parsed.sub !== "string"
    || typeof parsed.expires_at !== "number" || parsed.expires_at <= Date.now()) return null;
  return parsed;
}

export function createOwnerSession(ownerId = process.env.MISSION_CONTROL_OWNER_ID ?? "owner:primary") {
  const secret = process.env.MISSION_CONTROL_SESSION_SECRET;
  if (!validSecret(secret)) throw new Error("MISSION_CONTROL_SESSION_SECRET must contain at least 32 characters.");
  const issuedAt = Date.now();
  return {
    token: sign({ type: "owner_session", sub: ownerId, issued_at: issuedAt, expires_at: issuedAt + sessionLifetimeSeconds * 1000 }, secret!),
    csrf: randomBytes(32).toString("base64url"),
    maxAge: sessionLifetimeSeconds,
  };
}

export function validateOwnerCredential(value: unknown): boolean {
  return typeof value === "string" && validSecret(process.env.MISSION_CONTROL_OWNER_TOKEN)
    && constantEqual(value, process.env.MISSION_CONTROL_OWNER_TOKEN!);
}

export function ownerAuthFailure(authentication: Extract<OwnerAuthentication, { ok: false }>): Response {
  return Response.json({ error: authentication.error }, {
    status: authentication.status,
    headers: authentication.status === 401 ? { "www-authenticate": "Bearer realm=\"Mission Control owner\"" } : undefined,
  });
}

export function ownerCookieOptions(maxAge = sessionLifetimeSeconds): string {
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookiesRequired() ? "; Secure" : ""}`;
}

export function csrfCookieOptions(maxAge = sessionLifetimeSeconds): string {
  return `Path=/; SameSite=Strict; Max-Age=${maxAge}${secureCookiesRequired() ? "; Secure" : ""}`;
}

function secureCookiesRequired(): boolean {
  if (process.env.MISSION_CONTROL_SECURE_COOKIES === "1") return true;
  if (process.env.MISSION_CONTROL_SECURE_COOKIES === "0") return false;
  return process.env.MISSION_CONTROL_PUBLIC_ORIGIN?.startsWith("https://") ?? false;
}

function authenticated(id: string, mode: "BEARER" | "SESSION"): Extract<OwnerAuthentication, { ok: true }> {
  return { ok: true, mode, principal: { id, kind: "OWNER_AUTHORITY", workerScopes: ["*"], taskScopes: ["*"] } };
}

function unavailable(): Extract<OwnerAuthentication, { ok: false }> {
  return { ok: false, status: 503, error: "Mission Control owner authentication is not configured." };
}

function unauthorized(): Extract<OwnerAuthentication, { ok: false }> {
  return { ok: false, status: 401, error: "Owner authentication required." };
}

function bearerToken(value: string | null): string {
  return value?.startsWith("Bearer ") ? value.slice(7) : "";
}

function cookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function sign(payload: object, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

function verifySigned<T>(token: string, secret: string): T | null {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (!constantEqual(signature, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function constantEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validSecret(value: string | undefined): boolean {
  return typeof value === "string" && value.length >= 32;
}
