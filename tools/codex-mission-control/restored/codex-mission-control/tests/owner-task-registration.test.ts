import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { randomBytes } from "node:crypto";

import { sha256 } from "../lib/canonical";
import { workerSnapshotFromEvents } from "../lib/dashboard-data";
import { enrollFleetSupervisorWatch } from "../lib/fleet-watch-enrollment";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";
import { ownerAttention, workerDisposition } from "../lib/owner-view";
import {
  OwnerTaskPassphraseGate, OWNER_TASK_PASSPHRASE_LOCK_MS, ownerTaskPassphraseFile, parseOwnerTaskPassphraseVerifier,
} from "../lib/owner-task-passphrase";
import {
  OWNER_TASK_SOURCE_LOCATOR_PREFIX, ownerTaskSourceDocument, parseOwnerTaskRegistration, registerOwnerTask, splitOwnerTaskSubmission,
} from "../lib/owner-task-registration";
import { OWNER_TASK_AWAITING_SUPERVISION_REASON, OWNER_TASK_STANDARD_TERMS } from "../lib/owner-task-source";
import { seedStore } from "../lib/seed";
import { EventStore } from "../lib/store";
import { compareTerminalState } from "../lib/terminal-comparator";
import { ownerActionForCard } from "../components/Dashboard";

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
// A test-only verifier (made with the laptop script's method, at the lowest accepted cost) and its passphrase.
const testPassphrase = "Café pilot passphrase";
const testVerifier = "mc-task-passphrase:v1:scrypt:14:8:1:ABEiM0RVZneImaq7zN3u_w:XqF9U2M6VkeN1XFrLFEYxfYKPI0Ew9-75l25iZ1gqQU";

function input() {
  const parsed = parseOwnerTaskRegistration(body);
  assert.notEqual(typeof parsed, "string", String(parsed));
  return parsed as Exclude<typeof parsed, string>;
}

test("the owner's answers are parsed exactly, one item per line, and the passphrase is split off before parsing", () => {
  assert.deepEqual(input(), {
    worker: "atlas-test-pilot", name: "Atlas test pilot", goal: body.goal,
    mayUse: ["Public sources", "The private ledger"], mustNever: ["Spend money", "Publish anything", "Count one person twice"],
    doneWhen: ["A first brief exists", "A re-run adds nothing"],
  });
  for (const bad of [
    null, [], "x", { ...body, worker: "Atlas" }, { ...body, worker: "../x" }, { ...body, worker: "" },
    { ...body, name: " " }, { ...body, goal: "" }, { ...body, may_use: "\n \n" }, { ...body, must_never: 3 },
    { ...body, done_when: "x".repeat(4_001) }, { ...body, must_never: Array.from({ length: 21 }, (_, i) => `line ${i}`).join("\n") },
    { ...body, producer: "UI" }, { ...body, owner_source_sha256: "0".repeat(64) }, { ...body, passphrase: "secret" },
  ]) {
    assert.equal(typeof parseOwnerTaskRegistration(bad), "string", JSON.stringify(bad)?.slice(0, 80));
  }
  const split = splitOwnerTaskSubmission({ ...body, passphrase: "secret words" });
  assert.ok(typeof split !== "string");
  assert.equal(split.passphrase, "secret words");
  assert.deepEqual(split.registration, body);
  assert.equal(typeof splitOwnerTaskSubmission([]), "string");
});

test("registration records the owner's words and the standard lines shown on the form, and nothing else", () => {
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
    const [source, outcome, contract, reconciliation] = result.events.map((event) => event.data);
    // The source hash covers the answers and the standard lines.
    assert.equal(result.sourceSha256, sha256(ownerTaskSourceDocument(input())));
    assert.deepEqual(JSON.parse(ownerTaskSourceDocument(input())).standard_terms, OWNER_TASK_STANDARD_TERMS);
    assert.ok(source.type === "owner_source_recorded" && source.source_sha256 === result.sourceSha256
      && source.canonical_locator.startsWith(OWNER_TASK_SOURCE_LOCATOR_PREFIX) && source.receipt_capability === "OWNER_REATTESTED");
    assert.match(source.limitations.join(" "), /registration passphrase/);
    assert.ok(outcome.type === "owner_outcome_recorded" && outcome.verbatim_owner_request[0] === body.goal
      && outcome.owner_source_sha256 === result.sourceSha256);
    assert.ok(contract.type === "task_contract_recorded" && reconciliation.type === "objective_reconciliation_recorded");
    assert.equal(contract.goal, body.goal);
    assert.deepEqual(contract.allowed_scope, ["Public sources", "The private ledger"]);
    assert.deepEqual(contract.forbidden_scope, ["Spend money", "Publish anything", "Count one person twice"]);
    assert.deepEqual(contract.acceptance_criteria, ["A first brief exists", "A re-run adds nothing"]);
    // Every text in the owner-authority records is an answer, the done-when lines joined, or a standard line.
    const answers = input();
    const allowed = new Set([
      answers.name, answers.goal, ...answers.mayUse, ...answers.mustNever, ...answers.doneWhen, answers.doneWhen.join("\n"),
      ...OWNER_TASK_STANDARD_TERMS.not_proof_of_done, OWNER_TASK_STANDARD_TERMS.starting_gap, OWNER_TASK_STANDARD_TERMS.first_step,
    ]);
    const prose = [
      ...outcome.verbatim_owner_request, outcome.normalized_result, ...outcome.required_outcomes.map((item) => item.text),
      ...outcome.non_satisfying_proxies, outcome.current_gap,
      contract.worker_name, contract.goal, ...contract.acceptance_criteria, ...contract.allowed_scope, ...contract.forbidden_scope,
      contract.effective_finish_line,
      ...reconciliation.matrix.flatMap((row) => [row.owner_requirement, row.worker_interpretation, row.task_criterion]),
      reconciliation.current_gap, ...reconciliation.non_satisfying_proxies, reconciliation.proposed_required_directive,
    ];
    for (const text of prose) assert.ok(allowed.has(text), `not the owner's words or a standard line: ${text}`);
  } finally { store.close(); }
});

test("a registered task shows as waiting for its supervisor, not as an alarm or a decision", () => {
  const store = new EventStore(":memory:");
  try {
    registerOwnerTask(store, input(), owner, store.allEvents(), at);
    const snapshot = workerSnapshotFromEvents(store.allEvents(), "atlas-test-pilot", { includeFixtureOnly: false });
    assert.ok(snapshot, "a live dashboard (fixtures hidden) shows the registered task");
    const worker = snapshot.worker;
    assert.equal(worker.connection.state, "OFFLINE_CONFIGURED");
    assert.equal(worker.contractToOwnerAlignment, "MATCH");
    assert.equal(worker.correction.ownerAction.reason_code, OWNER_TASK_AWAITING_SUPERVISION_REASON);
    assert.doesNotMatch(worker.correction.ownerAction.exact_text, /telemetry|observability/i);
    assert.equal(ownerAttention(worker), null);
    assert.equal(workerDisposition(worker), "Registered · waiting for its supervisor");
    assert.match(ownerActionForCard(worker), /waiting for its supervisor/);
    // Once anything else is recorded for it, the ordinary rules apply again.
    const workerProducer: AuthenticatedProducer = { id: "worker:atlas-test-pilot", kind: "WORKER", workerScopes: ["atlas-test-pilot"], taskScopes: ["*"] };
    store.append({ schema_version: 2, event_id: "message:1", mission_id: "mission-control", occurred_at: at, data: {
      type: "worker_message_recorded", worker: "atlas-test-pilot", message_id: "message:1", thread_id: "thread:atlas-test-pilot",
      message_kind: "QUESTION", body: "x", reply_to_message_id: null, direction_id: null,
    } }, undefined, workerProducer, store.allEvents());
    const later = workerSnapshotFromEvents(store.allEvents(), "atlas-test-pilot", { includeFixtureOnly: false });
    assert.equal(later?.worker.correction.ownerAction.reason_code, "OWNER.ACTION_TELEMETRY_MISSING");
  } finally { store.close(); }
});

test("a registered task is under the current supervision rules from the start", () => {
  const store = new EventStore(":memory:");
  try {
    registerOwnerTask(store, input(), owner, store.allEvents(), at);
    const comparison = compareTerminalState(store.allEvents().filter((event) => event.worker === "atlas-test-pilot"));
    for (const code of ["REASONING_SUPERVISOR_MISSING", "SUPERVISION_DIRECTIVE_MISSING", "OUTCOME_PROGRESS_UNMEASURED"]) {
      assert.ok(comparison.reasonCodes.includes(code), `${code} in ${comparison.reasonCodes.join(", ")}`);
    }
    const worker: AuthenticatedProducer = { id: "worker:atlas-test-pilot", kind: "WORKER", workerScopes: ["atlas-test-pilot"], taskScopes: ["*"] };
    const envelope = (eventId: string, data: object) => ({ schema_version: 2, event_id: eventId, mission_id: "mission-control", occurred_at: at, data });
    assert.throws(() => store.append(envelope("checkpoint:1", {
      type: "worker_checkpoint_recorded", worker: "atlas-test-pilot", worker_run_id: "run-1", status: "working", current_step: "A self-directed step",
      completed_steps: [], next_steps: [], files_touched: [], tests: { passing: 0, failing: 0, lint: "not_run", build: "not_run" },
      plan_changed: false, plan_change_reason: null, blocker: null, assumptions: [], diff_lines: 0, referenced_directive_ids: [],
    }), undefined, worker, store.allEvents()), /directive-bound Codex execution start/);
  } finally { store.close(); }
});

test("records that look like a registration are refused on every other path", () => {
  const store = new EventStore(":memory:");
  try {
    const forged = (eventId: string, locator: string) => ({ schema_version: 2, event_id: eventId, mission_id: "mission-control", occurred_at: at, data: {
      type: "owner_source_recorded", worker: "forged-task", receipt_id: "owner-source:forged-task:registration", owner_request_id: "owner-request:forged-task:registration",
      canonical_locator: locator, source_sha256: "a".repeat(64), worker_copy_sha256: "a".repeat(64), capture_integrity: "VERIFIED",
      acquisition_mode: "OWNER_REATTESTED", receipt_capability: "OWNER_REATTESTED", comparison: "MATCH", freshness: "CURRENT", limitations: [],
    } });
    assert.throws(() => store.append(forged("owner-task-registration:forged-task:x:source", "https://example.invalid/x"), undefined, owner, store.allEvents()), /only from the owner's registration/);
    assert.throws(() => store.append(forged("forged:1", `${OWNER_TASK_SOURCE_LOCATOR_PREFIX}forged-task/x`), undefined, owner, store.allEvents()), /only from the owner's registration/);
    assert.throws(() => store.appendMany([{ event: forged("forged:2", `${OWNER_TASK_SOURCE_LOCATOR_PREFIX}forged-task/x`), producer: owner }], store.allEvents()), /only from the owner's registration/);
    assert.equal(store.allEvents().length, 0);
    // The registration itself, and an owner source with another locator, still go through.
    registerOwnerTask(store, input(), owner, store.allEvents(), at);
    store.append(forged("other-source:1", "https://example.invalid/x"), undefined, owner, store.allEvents());
  } finally { store.close(); }
});

test("a repeat of the same submission records nothing; other answers or an id already in use are refused, saying why", () => {
  const store = seeded();
  try {
    registerOwnerTask(store, input(), owner, store.allEvents(), at);
    const count = store.allEvents().length;
    const again = registerOwnerTask(store, input(), owner, store.allEvents(), "2026-10-17T12:05:00.000Z");
    assert.equal(again.duplicate, true);
    assert.equal(again.status, "TASK_ALREADY_REGISTERED");
    assert.equal(store.allEvents().length, count);
    const changed = parseOwnerTaskRegistration({ ...body, goal: "Something else." });
    assert.throws(() => registerOwnerTask(store, changed as never, owner, store.allEvents(), at), /already registered with different answers/);
    const seededWorker = store.allEvents().find((event) => event.worker && event.data.type === "task_contract_recorded")!.worker!;
    const takeover = parseOwnerTaskRegistration({ ...body, worker: seededWorker });
    assert.throws(() => registerOwnerTask(store, takeover as never, owner, store.allEvents(), at), /is already used by \d+ Mission Control records \(.*task_contract_recorded/);
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

test("a registered task can't be enrolled in the fleet watch before its supervisor publishes a work queue", () => {
  const store = seeded();
  try {
    registerOwnerTask(store, input(), owner, store.allEvents(), at);
    assert.throws(() => enrollFleetSupervisorWatch(store, "project:atlas-test", { worker: "atlas-test-pilot", taskId: "contract:atlas-test-pilot", cadenceMs: 86_400_000 }, at), /does not appear/);
  } finally { store.close(); }
});

test("the passphrase verifier format is bounded, and the gate checks it, normalizes it and locks after wrong ones", async () => {
  assert.ok(parseOwnerTaskPassphraseVerifier(testVerifier));
  const [prefix, , , , salt, key] = [testVerifier.split(":").slice(0, 3).join(":"), ...testVerifier.split(":").slice(3)];
  for (const bad of ["", "x", testVerifier.replace(":14:", ":13:"), testVerifier.replace(":14:", ":18:"), testVerifier.replace(":14:8:", ":14:16:"),
    `${prefix}:14:8:0:${salt}:${key}`, `${prefix}:14:8:5:${salt}:${key}`, `${prefix}:14:8:1:AAAA:${key}`, `${prefix}:14:8:1:${salt}:${key.slice(0, 40)}`]) {
    assert.equal(parseOwnerTaskPassphraseVerifier(bad), null, bad);
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mc-passphrase-"));
  try {
    const file = path.join(directory, "owner-task-passphrase.verifier");
    assert.equal(ownerTaskPassphraseFile({ MISSION_CONTROL_DB: path.join(directory, "events.db") }), file);
    assert.equal(ownerTaskPassphraseFile({ MISSION_CONTROL_DB: path.join(directory, "events.db"), MISSION_CONTROL_OWNER_TASK_PASSPHRASE_FILE: "/elsewhere" }), "/elsewhere");
    let now = Date.parse(at);
    const gate = new OwnerTaskPassphraseGate(file, () => now);
    assert.deepEqual(await gate.check(testPassphrase), { ok: false, status: 503, error: "Registering tasks is off until the owner sets a registration passphrase." });
    fs.writeFileSync(file, "not a verifier\n");
    assert.equal((await gate.check(testPassphrase) as { status: number }).status, 503);
    fs.writeFileSync(file, `${testVerifier}\n`);
    assert.equal((await gate.check(undefined) as { status: number }).status, 400);
    assert.equal((await gate.check("") as { status: number }).status, 400);
    assert.deepEqual(await gate.check(testPassphrase), { ok: true });
    assert.deepEqual(await gate.check(testPassphrase.normalize("NFD")), { ok: true }, "the same passphrase typed with combining accents");
    for (let attempt = 0; attempt < 5; attempt += 1) assert.equal((await gate.check(`wrong ${attempt}`) as { status: number }).status, 403);
    const locked = await gate.check(testPassphrase);
    assert.equal((locked as { status: number }).status, 429, "the right passphrase waits too while the lock lasts");
    assert.match((locked as { error: string }).error, /Try again in 15 minutes/);
    now += OWNER_TASK_PASSPHRASE_LOCK_MS;
    assert.deepEqual(await gate.check(testPassphrase), { ok: true });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

// The app route: the form's session only, never the owner bearer; the passphrase is passed on to the daemon unread.
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
  const submission = { ...body, passphrase: "typed by the owner" };
  const send = (headers: Record<string, string>) => POST(new Request(`${origin}/api/workers`, {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(submission),
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
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), submission);
});

function seeded() { const store = new EventStore(":memory:"); seedStore(store); return store; }
