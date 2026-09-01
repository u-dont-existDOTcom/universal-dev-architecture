import { createOwnerSession, csrfCookieOptions, ownerCookieOptions, ownerCsrfCookie, ownerSessionCookie, validateOwnerCredential } from "@/lib/owner-auth";
import { sameOriginMutation } from "@/lib/daemon-client";

export async function POST(request: Request) {
  if (!sameOriginMutation(request)) return Response.json({ error: "Cross-origin login rejected." }, { status: 403 });
  const contentType = request.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await request.json() as { token?: unknown }
    : Object.fromEntries((await request.formData()).entries());
  if (!validateOwnerCredential(body.token)) return Response.json({ error: "Invalid owner credential." }, { status: 401 });
  const session = createOwnerSession();
  const response = new Response(null, { status: 303, headers: { location: new URL("/", request.url).toString() } });
  response.headers.append("set-cookie", `${ownerSessionCookie}=${encodeURIComponent(session.token)}; ${ownerCookieOptions(session.maxAge)}`);
  response.headers.append("set-cookie", `${ownerCsrfCookie}=${encodeURIComponent(session.csrf)}; ${csrfCookieOptions(session.maxAge)}`);
  return response;
}
