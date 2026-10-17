import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { ownerTaskPassphraseFingerprint } from "../lib/owner-task-passphrase";
import { ownerTaskRegistrationEvents, parseOwnerTaskRegistration } from "../lib/owner-task-registration";

// The real daemon's registration route (PR #394 review, P2): only the owner producer with the owner's registration
// passphrase registers a task; a registration can't be forged through POST /events; and the install script writes
// the verifier the daemon reads. A test-only verifier and its passphrase (the laptop script's method, lowest cost):
const passphrase = "Café pilot passphrase";
const verifier = "mc-task-passphrase:v1:scrypt:14:8:1:ABEiM0RVZneImaq7zN3u_w:XqF9U2M6VkeN1XFrLFEYxfYKPI0Ew9-75l25iZ1gqQU";
const token = "registration-test-token-" + "x".repeat(40);
const registration = {
  worker: "atlas-daemon-test", name: "Atlas daemon test", goal: "Find neglected treatments and their harms.",
  may_use: "Public sources", must_never: "Spend money", done_when: "A first brief exists",
};

test("the daemon registers a task only for the owner with the registration passphrase, and refuses forged registrations", async () => {
  const port = await availablePort();
  const directory = mkdtempSync(join(tmpdir(), "mc-task-registration-"));
  const database = join(directory, "events.db");
  const child = spawn(process.execPath, ["--import", "tsx", "daemon/server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MISSION_CONTROL_DAEMON_HOST: "127.0.0.1",
      MISSION_CONTROL_DAEMON_PORT: String(port),
      MISSION_CONTROL_INTERNAL_TOKEN: token,
      MISSION_CONTROL_DB: database,
      MISSION_CONTROL_SKIP_SEED: "1",
      MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  let stdout = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    await waitForListening(child, () => stderr, (chunk) => { stdout += chunk; });
    const origin = `http://127.0.0.1:${port}`;
    const register = (submission: unknown, kind = "OWNER_AUTHORITY", raw?: string) => fetch(`${origin}/workers`, {
      method: "POST", headers: headers(kind), body: raw ?? JSON.stringify(submission),
    });
    const status = async (response: Response) => ({ status: response.status, body: await response.json() as { error?: string; status?: string } });

    assert.equal((await fetch(`${origin}/workers`, { method: "POST", body: "{}" })).status, 401, "no internal token");
    assert.equal((await register({ ...registration, passphrase }, "SUPERVISOR")).status, 403, "not the owner producer");
    const invalid = await status(await register(null, "OWNER_AUTHORITY", `{"worker": "x", "passphrase": "${passphrase}`));
    assert.equal(invalid.status, 400);
    assert.doesNotMatch(JSON.stringify(invalid.body) + stderr + stdout, /Café/, "an invalid body is neither echoed nor logged");
    assert.equal((await register({ ...registration, worker: "Bad Id", passphrase })).status, 400);
    const unset = await status(await register({ ...registration, passphrase }));
    assert.deepEqual(unset, { status: 503, body: { error: "Registering tasks is off until the owner sets a registration passphrase." } });
    const passphraseStatus = async () => await (await fetch(`${origin}/owner-task-registration`)).json() as {
      passphraseSet: boolean; setAt: string | null; fingerprint: string | null; wrongAttempts: number; lockedUntil: string | null;
    };
    assert.deepEqual(await passphraseStatus(), { passphraseSet: false, setAt: null, fingerprint: null, wrongAttempts: 0, lockedUntil: null });

    // The install script: a malformed verifier changes nothing; a well-formed one is written for this user only.
    const install = (input: string) => spawnSync(process.execPath, ["--import", "tsx", "scripts/set-owner-task-passphrase.ts"], {
      cwd: process.cwd(), env: { ...process.env, MISSION_CONTROL_DB: database }, input, encoding: "utf8",
    });
    const file = join(directory, "owner-task-passphrase.verifier");
    const refused = install("my passphrase in clear\n");
    assert.equal(refused.status, 1);
    assert.doesNotMatch(refused.stdout + refused.stderr, /my passphrase/);
    assert.equal(existsSync(file), false);
    const installed = install(`${verifier}\n`);
    assert.equal(installed.status, 0, installed.stderr);
    const fingerprint = ownerTaskPassphraseFingerprint(verifier);
    assert.equal(installed.stdout, `OWNER_TASK_PASSPHRASE_SET ${fingerprint}\n`);
    assert.equal(readFileSync(file, "utf8"), `${verifier}\n`);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const afterInstall = await passphraseStatus();
    assert.equal(afterInstall.passphraseSet, true);
    assert.equal(afterInstall.fingerprint, fingerprint);

    assert.equal((await status(await register(registration))).status, 400, "no passphrase");
    const wrong = await status(await register({ ...registration, passphrase: "a guess" }));
    assert.deepEqual(wrong, { status: 403, body: { error: "That registration passphrase is wrong." } });
    assert.equal((await fetch(`${origin}/workers/${registration.worker}`)).status, 404, "a refused registration records nothing");

    const created = await status(await register({ ...registration, passphrase }));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.status, "TASK_REGISTERED");
    const shown = await fetch(`${origin}/workers/${registration.worker}`);
    assert.equal(shown.status, 200);
    const worker = (await shown.json() as { worker: { correction: { ownerAction: { reason_code: string } }; sourceReceipt: { limitations: string[]; registeredOnForm: boolean } } }).worker;
    assert.equal(worker.correction.ownerAction.reason_code, "OWNER.TASK_REGISTERED_AWAITING_SUPERVISION");
    assert.equal(worker.sourceReceipt.registeredOnForm, true);
    assert.match(worker.sourceReceipt.limitations.join(" "), new RegExp(`fingerprint ${fingerprint}`), "the registration records which verifier checked it");
    const again = await status(await register({ ...registration, passphrase }));
    assert.deepEqual([again.status, again.body.status], [200, "TASK_ALREADY_REGISTERED"]);
    const changed = await status(await register({ ...registration, goal: "Something else.", passphrase }));
    assert.equal(changed.status, 409);
    assert.match(String(changed.body.error), /already registered with different answers/);
    assert.doesNotMatch(stderr + stdout, /Café pilot passphrase|a guess/, "the passphrase is never logged");

    // POST /events can't write a registration's records, under the owner's producer or any other.
    const forged = {
      schema_version: 2, event_id: "forged:source", mission_id: "mission-control", occurred_at: new Date().toISOString(), data: {
        type: "owner_source_recorded", worker: "forged-task", receipt_id: "owner-source:forged-task:registration",
        owner_request_id: "owner-request:forged-task:registration",
        canonical_locator: "mission-control://owner-session/task-registration/forged-task/0000000000000000",
        source_sha256: "a".repeat(64), worker_copy_sha256: "a".repeat(64), capture_integrity: "VERIFIED",
        acquisition_mode: "OWNER_REATTESTED", receipt_capability: "OWNER_REATTESTED", comparison: "MATCH", freshness: "CURRENT", limitations: [],
      },
    };
    const viaEvents = await fetch(`${origin}/events`, { method: "POST", headers: headers("OWNER_AUTHORITY"), body: JSON.stringify(forged) });
    assert.equal(viaEvents.status, 409);
    assert.match(String((await viaEvents.json() as { error: string }).error), /only from the owner's registration/);
    const byId = await fetch(`${origin}/events`, { method: "POST", headers: headers("OWNER_AUTHORITY"), body: JSON.stringify({
      ...forged, event_id: "owner-task-registration:forged-task:0000000000000000:source",
      data: { ...forged.data, canonical_locator: "https://example.invalid/source" },
    }) });
    assert.equal(byId.status, 409);
    // Nor can it redefine the registered task: a new outcome for it is refused.
    const injected = parseOwnerTaskRegistration({ ...registration, goal: "Words the owner never typed." });
    assert.ok(typeof injected !== "string");
    const outcome = ownerTaskRegistrationEvents(injected, new Date().toISOString())[1];
    const redefined = await fetch(`${origin}/events`, { method: "POST", headers: headers("OWNER_AUTHORITY"), body: JSON.stringify({ ...outcome, event_id: "injected:outcome" }) });
    assert.equal(redefined.status, 409);
    assert.match(String((await redefined.json() as { error: string }).error), /registered by the owner; its goal and limits can't be changed/);

    // Five wrong passphrases lock registration for a while, the right one included.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal((await register({ ...registration, worker: "atlas-other", passphrase: `guess ${attempt}` })).status, 403);
    }
    const locked = await status(await register({ ...registration, worker: "atlas-other", passphrase }));
    assert.equal(locked.status, 429);
    assert.match(String(locked.body.error), /Too many wrong passphrases/);
    const lockedStatus = await passphraseStatus();
    assert.equal(lockedStatus.wrongAttempts, 5);
    assert.ok(lockedStatus.lockedUntil, "the form can show the lock");
    assert.equal(statSync(`${file}.attempts.json`).mode & 0o777, 0o600);
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) await once(child, "exit");
    rmSync(directory, { recursive: true, force: true });
  }
});

function headers(kind: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-mission-control-producer-id": kind === "OWNER_AUTHORITY" ? "owner:primary" : `${kind.toLowerCase()}:test`,
    "x-mission-control-producer-kind": kind,
    "x-mission-control-worker-scopes": "*",
    "x-mission-control-task-scopes": "*",
  };
}

async function availablePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

async function waitForListening(child: ReturnType<typeof spawn>, currentStderr: () => string, onStdout: (chunk: string) => void): Promise<void> {
  let output = "";
  child.stdout!.setEncoding("utf8");
  child.stdout!.on("data", (chunk) => { output += chunk; onStdout(chunk); });
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (output.includes("Mission Control daemon listening")) return;
    if (child.exitCode !== null) throw new Error(`Daemon exited before listening: ${currentStderr()}`);
    await delay(25);
  }
  throw new Error(`Timed out waiting for daemon startup: ${currentStderr()}`);
}
