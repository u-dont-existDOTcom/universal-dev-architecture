import type { AuthenticatedProducer } from "./ingestion-auth";

const daemonBase = process.env.MISSION_CONTROL_DAEMON_URL ?? "http://127.0.0.1:4100";
const internalToken = process.env.MISSION_CONTROL_INTERNAL_TOKEN;

export async function daemonFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(new URL(path, daemonBase), {
    ...init,
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...init?.headers,
    },
  });
}

export function daemonMutationHeaders(producer: AuthenticatedProducer, headers: HeadersInit = {}): HeadersInit {
  if (!internalToken) throw new Error("MISSION_CONTROL_INTERNAL_TOKEN is required for daemon mutations.");
  return {
    ...headers,
    authorization: `Bearer ${internalToken}`,
    "x-mission-control-producer-id": producer.id,
    "x-mission-control-producer-kind": producer.kind,
    "x-mission-control-worker-scopes": producer.workerScopes.join(","),
    "x-mission-control-task-scopes": producer.taskScopes.join(","),
  };
}

export function sameOriginMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  const configuredOrigin = process.env.MISSION_CONTROL_PUBLIC_ORIGIN;
  if (configuredOrigin) {
    try {
      return originUrl.origin === new URL(configuredOrigin).origin;
    } catch {
      return false;
    }
  }
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
  const effectiveHost = forwardedHost || request.headers.get("host") || requestUrl.host;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  const effectiveProtocol = `${forwardedProtocol || requestUrl.protocol.replace(/:$/, "")}:`;
  return originUrl.host === effectiveHost && originUrl.protocol === effectiveProtocol;
}

export async function relayJson(path: string, init?: RequestInit): Promise<Response> {
  try {
    const upstream = await daemonFetch(path, init);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json({ error: "Mission Control daemon is unavailable." }, { status: 503 });
  }
}
