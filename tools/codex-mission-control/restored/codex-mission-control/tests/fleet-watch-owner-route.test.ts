import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// Owner-facing fleet-watch capability: the owner (bearer, or session + same-origin + CSRF) can
// restore/configure an existing watch; credentials stay server-side; only state/cadenceMs pass.
const OWNER_TOKEN = "test-owner-credential-" + "o".repeat(40);
const INTERNAL_TOKEN = "test-internal-credential-" + "i".repeat(40);
const SESSION_SECRET = "test-session-secret-" + "s".repeat(40);
const ORIGIN = "https://mc.test.invalid";
const saved: Record<string, string | undefined> = {};
for (const key of ["MISSION_CONTROL_OWNER_TOKEN", "MISSION_CONTROL_INTERNAL_TOKEN", "MISSION_CONTROL_SESSION_SECRET",
  "MISSION_CONTROL_DAEMON_URL", "MISSION_CONTROL_PUBLIC_ORIGIN", "MISSION_CONTROL_OWNER_ID"]) saved[key] = process.env[key];
process.env.MISSION_CONTROL_OWNER_TOKEN = OWNER_TOKEN;
process.env.MISSION_CONTROL_INTERNAL_TOKEN = INTERNAL_TOKEN;
process.env.MISSION_CONTROL_SESSION_SECRET = SESSION_SECRET;
process.env.MISSION_CONTROL_DAEMON_URL = "http://daemon.test.invalid";
process.env.MISSION_CONTROL_PUBLIC_ORIGIN = ORIGIN;
process.env.MISSION_CONTROL_OWNER_ID = "owner:primary";

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];
const realFetch = globalThis.fetch;
const watch = { project_id: "project:askrigor", task_id: "task:askrigor-system-alignment", worker: "askrigor-system-alignment",
  state: "ACTIVE", cadence_ms: 3_600_000, next_tick_at: "2026-09-24T19:00:00.000Z" };
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: String(input), init: init ?? {} });
  return Response.json({ watch }, { status: 200 });
}) as typeof fetch;
test.after(() => {
  globalThis.fetch = realFetch;
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

async function route() {
  return import("../app/api/fleet-supervisor/[projectId]/route");
}
const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) });
function request(body: string, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/fleet-supervisor/x`, { method: "POST", headers, body });
}
async function sessionHeaders(origin = ORIGIN, csrfHeader?: string) {
  const { createOwnerSession, ownerCsrfCookie, ownerSessionCookie } = await import("../lib/owner-auth");
  const session = createOwnerSession();
  return {
    origin,
    cookie: `${ownerSessionCookie}=${session.token}; ${ownerCsrfCookie}=${session.csrf}`,
    "x-mission-control-csrf": csrfHeader ?? session.csrf,
  };
}
const good = JSON.stringify({ state: "ACTIVE", cadenceMs: 3_600_000 });

test("unauthenticated, wrong-bearer, missing-CSRF and cross-origin requests never reach the daemon", async () => {
  const { POST } = await route();
  calls.length = 0;
  assert.equal((await POST(request(good), params("project:askrigor"))).status, 401);
  assert.equal((await POST(request(good, { authorization: "Bearer wrong-" + "w".repeat(40) }), params("project:askrigor"))).status, 401);
  assert.equal((await POST(request(good, await sessionHeaders(ORIGIN, "not-the-csrf")), params("project:askrigor"))).status, 403);
  assert.equal((await POST(request(good, await sessionHeaders("https://evil.test.invalid")), params("project:askrigor"))).status, 403);
  const noCsrf = await sessionHeaders(); delete (noCsrf as Record<string, string>)["x-mission-control-csrf"];
  assert.equal((await POST(request(good, noCsrf), params("project:askrigor"))).status, 403);
  assert.equal(calls.length, 0);
});

test("owner bearer forwards only state/cadenceMs to the existing daemon mutation as OWNER_AUTHORITY", async () => {
  const { POST } = await route();
  calls.length = 0;
  const response = await POST(request(good, { authorization: `Bearer ${OWNER_TOKEN}` }), params("project:askrigor/v2"));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://daemon.test.invalid/fleet-supervisor/project%3Aaskrigor%2Fv2");
  assert.equal(calls[0].init.method, "POST");
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get("x-mission-control-producer-kind"), "OWNER_AUTHORITY");
  assert.equal(headers.get("x-mission-control-producer-id"), "owner:primary");
  assert.equal(headers.get("authorization"), `Bearer ${INTERNAL_TOKEN}`);
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { state: "ACTIVE", cadenceMs: 3_600_000 });
  const text = await response.text();
  assert.deepEqual(JSON.parse(text), { watch });
  for (const secret of [OWNER_TOKEN, INTERNAL_TOKEN, SESSION_SECRET]) assert.ok(!text.includes(secret));
});

test("owner session with same-origin CSRF proof is accepted", async () => {
  const { POST } = await route();
  calls.length = 0;
  const response = await POST(request(JSON.stringify({ state: "PAUSED" }), await sessionHeaders()), params("project:askrigor"));
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { state: "PAUSED" });
});

test("anything beyond the two bounded watch fields is rejected before the daemon", async () => {
  const { POST } = await route();
  calls.length = 0;
  const auth = { authorization: `Bearer ${OWNER_TOKEN}` };
  for (const body of ["", "[]", "null", "not json", "{}", JSON.stringify({ state: "RUNNING" }), JSON.stringify({ cadenceMs: 1_000 }),
    JSON.stringify({ cadenceMs: 604_800_001 }), JSON.stringify({ cadenceMs: 3_600_000.5 }), JSON.stringify({ state: "ACTIVE", producer: "UI" }),
    JSON.stringify({ state: "ACTIVE", path: "/github/decision-receipts" }), JSON.stringify({ state: "ACTIVE", pad: "x".repeat(600) })]) {
    assert.equal((await POST(request(body, auth), params("project:askrigor"))).status, 400, body);
  }
  for (const projectId of ["", "../events", "-leading", "a".repeat(181), "has space"]) {
    assert.equal((await POST(request(good, auth), params(projectId))).status, 400, projectId);
  }
  assert.equal(calls.length, 0);
});

test("route source holds no credential values and is not a generic proxy", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/api/fleet-supervisor/[projectId]/route.ts"), "utf8");
  assert.doesNotMatch(source, /process\.env/);
  assert.match(source, /authenticateOwnerRequest\(request, true\)/);
  assert.match(source, /daemonMutationHeaders\(authentication\.principal/);
  assert.match(source, /relayJson\(`\/fleet-supervisor\/\$\{encodeURIComponent\(projectId\)\}`/);
  assert.doesNotMatch(source, /export (const|function) (?!dynamic|POST)/);
});
