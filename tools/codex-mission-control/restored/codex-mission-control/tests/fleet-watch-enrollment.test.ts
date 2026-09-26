import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { snapshotFromStore } from "../lib/dashboard-data";
import { enrollFleetSupervisorWatch, parseFleetWatchEnrollment } from "../lib/fleet-watch-enrollment";
import { seedStore } from "../lib/seed";
import { EventStore } from "../lib/store";

const now = "2026-09-24T18:40:00.000Z";
function seeded() { const store = new EventStore(":memory:"); seedStore(store); return store; }
const enrollment = (worker: string, taskId: string, cadenceMs = 3_600_000) => ({ worker, taskId, cadenceMs });

test("an owner can enroll an existing worker/task under a new project, hourly, and it shows in the snapshot", () => {
  const store = seeded();
  try {
    assert.equal(store.fleetSupervisorWatch("project:askrigor"), null);
    const first = enrollFleetSupervisorWatch(store, "project:askrigor", enrollment("askrigor", "task:askrigor"), now);
    assert.equal(first.created, true);
    assert.equal(first.watch.state, "ACTIVE");
    assert.equal(first.watch.cadenceMs, 3_600_000);
    assert.equal(first.watch.nextTickAt, "2026-09-24T19:40:00.000Z");
    const again = enrollFleetSupervisorWatch(store, "project:askrigor", enrollment("askrigor", "task:askrigor"), now);
    assert.equal(again.created, false);
    const snapshot = snapshotFromStore(store) as unknown as { fleetSupervisor: { watches: Array<{ projectId: string }> } };
    assert.ok(snapshot.fleetSupervisor.watches.some((watch) => watch.projectId === "project:askrigor"));
  } finally { store.close(); }
});

test("enrollment cannot invent a worker or task, collide with another watch, or use a malformed project id", () => {
  const store = seeded();
  try {
    assert.throws(() => enrollFleetSupervisorWatch(store, "project:ghost", enrollment("ghost-worker", "task:ghost"), now), /no Mission Control history/);
    assert.throws(() => enrollFleetSupervisorWatch(store, "project:askrigor", enrollment("askrigor", "task:invented"), now), /does not appear/);
    for (const bad of ["askrigor", "project:AskRigor", "project:", "project:a/b", "task:askrigor"]) {
      assert.throws(() => enrollFleetSupervisorWatch(store, bad, enrollment("askrigor", "task:askrigor"), now), /project:<lowercase-name>/, bad);
    }
    enrollFleetSupervisorWatch(store, "project:askrigor", enrollment("askrigor", "task:askrigor"), now);
    assert.throws(() => enrollFleetSupervisorWatch(store, "project:askrigor", enrollment("billing", "task:billing"), now), /already watched/);
    assert.throws(() => enrollFleetSupervisorWatch(store, "project:askrigor-two", enrollment("askrigor", "task:askrigor"), now), /already supervised/);
  } finally { store.close(); }
});

test("enrollment input accepts only worker, taskId and bounded cadence", () => {
  assert.deepEqual(parseFleetWatchEnrollment({ worker: "askrigor", taskId: "task:askrigor" }),
    { worker: "askrigor", taskId: "task:askrigor", cadenceMs: 3_600_000 });
  for (const bad of [null, [], "x", { worker: "askrigor" }, { taskId: "task:askrigor" },
    { worker: "askrigor", taskId: "task:askrigor", producer: "UI" }, { worker: "../x", taskId: "task:askrigor" },
    { worker: "askrigor", taskId: "task:askrigor", cadenceMs: 1_000 }, { worker: "askrigor", taskId: "task:askrigor", cadenceMs: 1.5 }]) {
    assert.equal(typeof parseFleetWatchEnrollment(bad), "string", JSON.stringify(bad));
  }
});

// Owner-facing enroll route: same authentication boundary as the fleet-watch route.
const OWNER_TOKEN = "test-owner-credential-" + "o".repeat(40);
const INTERNAL_TOKEN = "test-internal-credential-" + "i".repeat(40);
const ORIGIN = "https://mc.test.invalid";
test("enroll route requires the owner, validates the body, and forwards under the owner principal", async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  Object.assign(process.env, {
    MISSION_CONTROL_OWNER_TOKEN: OWNER_TOKEN, MISSION_CONTROL_INTERNAL_TOKEN: INTERNAL_TOKEN,
    MISSION_CONTROL_SESSION_SECRET: "test-session-secret-" + "s".repeat(40),
    MISSION_CONTROL_DAEMON_URL: "http://daemon.test.invalid", MISSION_CONTROL_PUBLIC_ORIGIN: ORIGIN,
  });
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Response.json({ created: true, watch: { projectId: "project:askrigor" } }, { status: 201 });
  }) as typeof fetch;
  try {
    const { POST } = await import("../app/api/fleet-supervisor/[projectId]/enroll/route");
    const params = { params: Promise.resolve({ projectId: "project:askrigor" }) };
    const body = JSON.stringify({ worker: "askrigor-system-alignment", taskId: "task:askrigor-system-alignment" });
    const post = (headers: Record<string, string>, payload = body) =>
      POST(new Request(`${ORIGIN}/api/fleet-supervisor/project%3Aaskrigor/enroll`, { method: "POST", headers, body: payload }), params);
    assert.equal((await post({})).status, 401);
    assert.equal((await post({ authorization: "Bearer wrong-" + "w".repeat(40) })).status, 401);
    assert.equal((await post({ authorization: `Bearer ${OWNER_TOKEN}` }, JSON.stringify({ worker: "askrigor", taskId: "t", producer: "UI" }))).status, 400);
    assert.equal(calls.length, 0);
    const response = await post({ authorization: `Bearer ${OWNER_TOKEN}` });
    assert.equal(response.status, 201);
    assert.equal(calls[0].url, "http://daemon.test.invalid/fleet-supervisor/project%3Aaskrigor/enroll");
    assert.equal(new Headers(calls[0].init.headers).get("x-mission-control-producer-kind"), "OWNER_AUTHORITY");
    assert.deepEqual(JSON.parse(String(calls[0].init.body)),
      { worker: "askrigor-system-alignment", taskId: "task:askrigor-system-alignment", cadenceMs: 3_600_000 });
    assert.ok(!(await response.text()).includes(INTERNAL_TOKEN));
  } finally {
    globalThis.fetch = realFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("daemon enroll route is owner/UI-only and delegates to the ledger-checked enrollment", () => {
  const daemon = fs.readFileSync(path.join(process.cwd(), "daemon/server.ts"), "utf8");
  assert.match(daemon, /\/\^\\\/fleet-supervisor\\\/\(\[\^\/\]\+\)\\\/enroll\$\//);
  assert.match(daemon, /Only an authenticated owner surface may enroll a fleet watch/);
  assert.match(daemon, /enrollFleetSupervisorWatch\(store, decodeURIComponent\(fleetEnrollMatch\[1\]\), enrollment\)/);
});
