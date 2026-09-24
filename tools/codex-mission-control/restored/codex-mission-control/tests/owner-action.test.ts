import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// The owner-action tool runs inside the Mission Control runtime and performs named owner actions.
// A stand-in daemon/app records every request so we can check exact paths, identity and redaction.
const INTERNAL_TOKEN = "test-internal-credential-" + "i".repeat(40);
const OWNER_TOKEN = "test-owner-credential-" + "o".repeat(40);
type Seen = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string };

async function withServer(fn: (base: string, seen: Seen[]) => Promise<void>) {
  const seen: Seen[] = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      seen.push({ method: request.method ?? "", url: request.url ?? "", headers: request.headers, body });
      response.writeHead(request.url?.includes("/enroll") ? 201 : 200, { "content-type": "application/json" });
      // Echo the credential back to prove the tool redacts anything secret-shaped from its output.
      response.end(JSON.stringify({ ok: true, echoedAuthorization: request.headers.authorization }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try { await fn(`http://127.0.0.1:${port}`, seen); } finally { server.close(); }
}

function run(args: string[], env: Record<string, string>): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child: ChildProcess = spawn(process.execPath, ["--import", "tsx", "scripts/owner-action.ts", ...args],
      { cwd: process.cwd(), env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk; });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk; });
    child.on("close", (code: number | null) => resolve({ code, stdout, stderr }));
  });
}

const env = (base: string) => ({
  MISSION_CONTROL_INTERNAL_TOKEN: INTERNAL_TOKEN, MISSION_CONTROL_OWNER_TOKEN: OWNER_TOKEN,
  MISSION_CONTROL_DAEMON_URL: base, MISSION_CONTROL_OWNER_ACTION_APP_URL: base, MISSION_CONTROL_OWNER_ID: "owner:primary",
});

test("watches and watch-enroll call the fixed daemon routes as the owner and never print credentials", async () => {
  await withServer(async (base, seen) => {
    const list = await run(["watches"], env(base));
    assert.equal(list.code, 0, list.stderr);
    const enroll = await run(["watch-enroll", "--project", "project:askrigor", "--worker", "askrigor-system-alignment",
      "--task", "task:askrigor-system-alignment"], env(base));
    assert.equal(enroll.code, 0, enroll.stderr);
    assert.deepEqual(seen.map((s) => `${s.method} ${s.url}`),
      ["GET /fleet-supervisor", "POST /fleet-supervisor/project%3Aaskrigor/enroll"]);
    for (const request of seen) {
      assert.equal(request.headers["x-mission-control-producer-kind"], "OWNER_AUTHORITY");
      assert.equal(request.headers["x-mission-control-producer-id"], "owner:primary");
    }
    assert.deepEqual(JSON.parse(seen[1].body),
      { worker: "askrigor-system-alignment", taskId: "task:askrigor-system-alignment", cadenceMs: 3_600_000 });
    for (const output of [list.stdout, enroll.stdout]) {
      assert.ok(!output.includes(INTERNAL_TOKEN) && !output.includes(OWNER_TOKEN));
      assert.match(output, /\[redacted\]/);
    }
  });
});

test("source-review posts the request file to the fixed app route with the owner credential, output redacted", async () => {
  await withServer(async (base, seen) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "owner-action-"));
    const file = path.join(dir, "request.json");
    fs.writeFileSync(file, JSON.stringify({ task_id: "task:askrigor-system-alignment", review_attempt_id: "attempt:1" }));
    const result = await run(["source-review", "--worker", "askrigor-system-alignment", "--request", file], env(base));
    assert.equal(result.code, 0, result.stderr);
    assert.equal(seen.length, 1);
    assert.equal(`${seen[0].method} ${seen[0].url}`, "POST /api/workers/askrigor-system-alignment/source-review");
    assert.equal(seen[0].headers.authorization, `Bearer ${OWNER_TOKEN}`);
    assert.deepEqual(JSON.parse(seen[0].body), { task_id: "task:askrigor-system-alignment", review_attempt_id: "attempt:1" });
    assert.ok(!result.stdout.includes(OWNER_TOKEN));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test("bad input, unknown actions and a missing runtime credential are refused before any request", async () => {
  await withServer(async (base, seen) => {
    for (const args of [["watch-set", "--project", "project:askrigor", "--state", "RUNNING"], ["deploy"], [],
      ["watches", "--path", "/events"], ["watch-enroll", "--project", "askrigor", "--worker", "w", "--task", "t"],
      ["watch-set", "--project", "project:askrigor", "--cadence-ms", "12x"],
      ["source-review", "--worker", "../x", "--request", "/etc/hostname"]]) {
      const result = await run(args, env(base));
      assert.equal(result.code, 2, `${args.join(" ")}: ${result.stderr}`);
    }
    const noToken = await run(["watches"], { MISSION_CONTROL_DAEMON_URL: base });
    assert.equal(noToken.code, 2);
    assert.match(noToken.stderr, /inside the Mission Control runtime/);
    assert.equal(seen.length, 0);
  });
});

test("the tool exposes only named actions: no free-form path, URL or method option", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "scripts/owner-action.ts"), "utf8");
  for (const flag of ["\"path\"", "\"url\"", "\"method\"", "\"header\""]) assert.ok(!source.includes(flag), flag);
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts["owner:action"], "tsx scripts/owner-action.ts");
});
