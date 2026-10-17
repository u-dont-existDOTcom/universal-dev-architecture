import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { randomBytes } from "node:crypto";

import { sha256 } from "../lib/canonical";
import { snapshotFromStore, workerSnapshotFromEvents } from "../lib/dashboard-data";
import { enrollFleetSupervisorWatch } from "../lib/fleet-watch-enrollment";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";
import {
  OWNER_TASK_SOURCE_LOCATOR_PREFIX, ownerTaskSourceDocument, parseOwnerTaskRegistration, registerOwnerTask,
} from "../lib/owner-task-registration";
import { seedStore } from "../lib/seed";
import { EventStore } from "../lib/store";

const owner: AuthenticatedProducer = { id: "owner:primary", kind: "OWNER_AUTHORITY", workerScopes: ["*"], taskScopes: ["*"] };
const at = "2026-10-17T12:00:00.000Z";
const body = {
  worker: "atlas-test-pilot",
  name: "Atlas test pilot",
  goal: "Find neglected treatments with large patient-important benefits, and their harms.",
  may_use: "Public sources\nThe private ledger\n",
  must_never: "Spend money\nPublish anything\nCount one person twice",
  done_when: "A first brief exists\nA re-run adds nothing",
};

function input() {
  const parsed = parseOwnerTaskRegistration(body);
  assert.notEqual(typeof parsed, "string", String(parsed));
  return parsed as Exclude<typeof parsed, string>;
}

test("the owner's answers are parsed exactly, one item per line, and nothing else is accepted", () => {
  assert.deepEqual(input(), {
    worker: "atlas-test-pilot", name: "Atlas test pilot", goal: body.goal,
    mayUse: ["Public sources", "The private ledger"], mustNever: ["Spend money", "Publish anything", "Count one person twice"],
    doneWhen: ["A first brief exists", "A re-run adds nothing"],
  });
  for (const bad of [
    null, [], "x", { ...body, worker: "Atlas" }, { ...body, worker: "../x" }, { ...body, worker: "" },
    { ...body, name: " " }, { ...body, goal: "" }, { ...body, may_use: "\n \n" }, { ...body, must_never: 3 },
    { ...body, done_when: "x".repeat(4_001) }, { ...body, must_never: Array.from({ length: 21 }, (_, i) => `line ${i}`).join("\n") },
    { ...body, producer: "UI" }, { ...body, owner_source_sha256: "0".repeat(64) },
  ]) {
    assert.equal(typeof parseOwnerTaskRegistration(bad), "string", JSON.stringify(bad)?.slice(0, 80));
  }
});

test("registration records the owner's exact words as source, outcome, contract and reconciliation, and shows the task", () => {
  const store = new EventStore(":memory:");
  try {
    const result = registerOwnerTask(store, input(), owner, store.allEvents(), at);
    assert.equal(result.status, "TASK_REGISTERED");
    assert.equal(result.contractId, "contract:atlas-test-pilot");
    assert.deepEqual(result.events.map((event) => event.data.type), [
      "owner_source_recorded", "owner_outcome_recorded", "task_contract_recorded", "objective_reconciliation_recorded",
      "worker_connection_observed",
    ]);
    assert.deepEqual(result.events.map((event) => event.producerKind), ["OWNER_AUTHORITY", "OWNER_AUTHORITY", "OWNER_AUTHORITY", "OWNER_AUTHORITY", "SYSTEM"]);
    const [source, outcome, contract] = result.events.map((event) => event.data);
    assert.equal(result.sourceSha256, sha256(ownerTaskSourceDocument(input())));
    assert.ok(source.type === "owner_source_recorded" && source.source_sha256 === result.sourceSha256
      && source.canonical_locator.startsWith(OWNER_TASK_SOURCE_LOCATOR_PREFIX) && source.receipt_capability === "OWNER_REATTESTED");
    assert.ok(outcome.type === "owner_outcome_recorded" && outcome.verbatim_owner_request[0] === body.goal
      && outcome.owner_source_sha256 === result.sourceSha256);
    assert.ok(contract.type === "task_contract_recorded");
    assert.equal(contract.goal, body.goal);
    assert.deepEqual(contract.allowed_scope, ["Public sources", "The private ledger"]);
    assert.deepEqual(contract.forbidden_scope, ["Spend money", "Publish anything", "Count one person twice"]);
    assert.deepEqual(contract.acceptance_criteria, ["A first brief exists", "A re-run adds nothing"]);
    const snapshot = workerSnapshotFromEvents(store.allEvents(), "atlas-test-pilot", { includeFixtureOnly: false });
    assert.ok(snapshot, "a live dashboard (fixtures hidden) shows the registered task");
    assert.equal(snapshot.worker.connection.state, "OFFLINE_CONFIGURED");
    assert.equal(snapshot.worker.contractToOwnerAlignment, "MATCH");
  } finally { store.close(); }
});

test("a repeat of the same submission records nothing; other words or an existing task id are refused", () => {
  const store = seeded();
  try {
    registerOwnerTask(store, input(), owner, store.allEvents(), at);
    const count = store.allEvents().length;
    const again = registerOwnerTask(store, input(), owner, store.allEvents(), "2026-10-17T12:05:00.000Z");
    assert.equal(again.duplicate, true);
    assert.equal(again.status, "TASK_ALREADY_REGISTERED");
    assert.equal(store.allEvents().length, count);
    const changed = parseOwnerTaskRegistration({ ...body, goal: "Something else." });
    assert.throws(() => registerOwnerTask(store, changed as never, owner, store.allEvents(), at), /already exists/);
    const seededWorker = store.allEvents().find((event) => event.worker && event.data.type === "task_contract_recorded")!.worker!;
    const takeover = parseOwnerTaskRegistration({ ...body, worker: seededWorker });
    assert.throws(() => registerOwnerTask(store, takeover as never, owner, store.allEvents(), at), /already exists/);
    assert.equal(store.allEvents().length, count);
  } finally { store.close(); }
});

test("only the owner producer may register, and a refused registration records nothing", () => {
  const store = new EventStore(":memory:");
  try {
    for (const kind of ["UI", "SUPERVISOR", "WORKER", "SYSTEM"] as const) {
      assert.throws(() => registerOwnerTask(store, input(), { ...owner, id: `${kind.toLowerCase()}:x`, kind }, store.allEvents(), at), /Only the owner/);
    }
    assert.equal(store.allEvents().length, 0);
  } finally { store.close(); }
});

test("a registered task can be enrolled in the fleet watch by its contract id, but not by an invented task", () => {
  const store = seeded();
  try {
    registerOwnerTask(store, input(), owner, store.allEvents(), at);
    const enrolled = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker: "atlas-test-pilot", taskId: "contract:atlas-test-pilot", cadenceMs: 86_400_000 }, at);
    assert.equal(enrolled.created, true);
    assert.equal(enrolled.watch.cadenceMs, 86_400_000);
    assert.throws(() => enrollFleetSupervisorWatch(store, "project:atlas-other", { worker: "atlas-test-pilot", taskId: "contract:invented", cadenceMs: 86_400_000 }, at), /does not appear/);
    const snapshot = snapshotFromStore(store) as unknown as { fleetSupervisor: { watches: Array<{ projectId: string }> } };
    assert.ok(snapshot.fleetSupervisor.watches.some((watch) => watch.projectId === "project:atlas-test"));
  } finally { store.close(); }
});

// The app route: only the owner's signed-in session, never the owner bearer.
const origin = "https://mission-control.example";
test("the app's registration route refuses the owner bearer and relays only a same-origin session with CSRF proof", async (t) => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  const ownerToken = randomBytes(32).toString("hex");
  Object.assign(process.env, {
    MISSION_CONTROL_OWNER_TOKEN: ownerToken, MISSION_CONTROL_SESSION_SECRET: randomBytes(32).toString("hex"),
    MISSION_CONTROL_INTERNAL_TOKEN: randomBytes(32).toString("hex"), MISSION_CONTROL_OWNER_ID: "owner:primary",
    MISSION_CONTROL_DAEMON_URL: "http://daemon.test.invalid", MISSION_CONTROL_PUBLIC_ORIGIN: origin,
  });
  t.after(() => {
    globalThis.fetch = realFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  });
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Response.json({ status: "TASK_REGISTERED" }, { status: 201 });
  }) as typeof fetch;
  // Imported only now: the daemon client reads its internal credential when it is first loaded.
  const { POST } = await import("../app/api/workers/route");
  const { createOwnerSession, ownerCsrfCookie, ownerSessionCookie } = await import("../lib/owner-auth");
  const send = (headers: Record<string, string>) => POST(new Request(`${origin}/api/workers`, {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  }));
  assert.equal((await send({})).status, 401);
  const bearer = await send({ authorization: `Bearer ${ownerToken}` });
  assert.equal(bearer.status, 403);
  assert.match(String((await bearer.json() as { error: string }).error), /signed-in dashboard session/);
  const session = createOwnerSession();
  const cookie = `${ownerSessionCookie}=${session.token}; ${ownerCsrfCookie}=${session.csrf}`;
  assert.equal((await send({ cookie, origin })).status, 403, "a session without the CSRF header is refused");
  assert.equal((await send({ cookie, origin: "https://elsewhere.example", "x-mission-control-csrf": session.csrf })).status, 403);
  assert.equal(calls.length, 0);
  const accepted = await send({ cookie, origin, "x-mission-control-csrf": session.csrf });
  assert.equal(accepted.status, 201);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://daemon.test.invalid/workers");
  const forwarded = new Headers(calls[0].init.headers);
  assert.equal(forwarded.get("x-mission-control-producer-kind"), "OWNER_AUTHORITY");
  assert.equal(forwarded.get("x-mission-control-owner-auth-mode"), "SESSION");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), body);
});

test("the daemon route takes only the owner with the session marker, and the owner-action tool cannot send it", () => {
  const daemon = fs.readFileSync(path.join(process.cwd(), "daemon/server.ts"), "utf8");
  assert.match(daemon, /request\.method === "POST" && url\.pathname === "\/workers"/);
  assert.match(daemon, /producer\.kind !== "OWNER_AUTHORITY" \|\| request\.headers\["x-mission-control-owner-auth-mode"\] !== "SESSION"/);
  assert.match(daemon, /registerOwnerTask\(store, input, producer, eventHistory\(\)\)/);
  const tool = fs.readFileSync(path.join(process.cwd(), "scripts/owner-action.ts"), "utf8");
  assert.doesNotMatch(tool, /owner-auth-mode/);
  assert.doesNotMatch(tool, /\/workers"/);
});

function seeded() { const store = new EventStore(":memory:"); seedStore(store); return store; }
