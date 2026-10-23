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

test("reasoning replacement posts only the exact bounded identity and sealed failure digest", async () => {
  await withServer(async (base, seen) => {
    const requestId = `fleet-review:${"a".repeat(32)}`;
    const failureReceiptSha256 = "b".repeat(64);
    const result = await run(["reasoning-replace", "--project", "project:hrp-discern-eval", "--request", requestId,
      "--failure-receipt-sha", failureReceiptSha256], env(base));
    assert.equal(result.code, 0, result.stderr);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].method, "POST");
    assert.equal(seen[0].url, "/fleet-supervisor/project%3Ahrp-discern-eval/reasoning-replace");
    assert.deepEqual(JSON.parse(seen[0].body), {
      request_id: requestId, failure_receipt_sha256: failureReceiptSha256, reason_code: "PROVIDER_EMPTY_COMPLETION",
    });
    assert.equal(seen[0].headers["x-mission-control-producer-kind"], "OWNER_AUTHORITY");
    assert.ok(!result.stdout.includes(INTERNAL_TOKEN) && !result.stdout.includes(OWNER_TOKEN));
  });
});

test("reasoning replacement accepts only the explicit invalid-canonical reason enum", async () => {
  await withServer(async (base, seen) => {
    const requestId = `fleet-review:${"c".repeat(32)}`;
    const failureReceiptSha256 = "d".repeat(64);
    const result = await run(["reasoning-replace", "--project", "project:askrigor", "--request", requestId,
      "--failure-receipt-sha", failureReceiptSha256, "--reason-code", "PROVIDER_INVALID_CANONICAL_DECISION"], env(base));
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(seen[0].body), {
      request_id: requestId, failure_receipt_sha256: failureReceiptSha256,
      reason_code: "PROVIDER_INVALID_CANONICAL_DECISION",
    });
    const rejected = await run(["reasoning-replace", "--project", "project:askrigor", "--request", requestId,
      "--failure-receipt-sha", failureReceiptSha256, "--reason-code", "RETIRED_UNSENT"], env(base));
    assert.equal(rejected.code, 2);
    assert.match(rejected.stderr, /--reason-code must be/);
    assert.equal(seen.length, 1);
  });
});

test("work-question reissue posts only the worker and, when named, the exact request id", async () => {
  await withServer(async (base, seen) => {
    const requestId = `work-question:${"e".repeat(32)}`;
    const named = await run(["work-question-reissue", "--worker", "mission-control-development", "--request", requestId], env(base));
    assert.equal(named.code, 0, named.stderr);
    const only = await run(["work-question-reissue", "--worker", "mission-control-development"], env(base));
    assert.equal(only.code, 0, only.stderr);
    assert.deepEqual(seen.map((s) => `${s.method} ${s.url}`), [
      "POST /workers/mission-control-development/work-questions/reissue-expired",
      "POST /workers/mission-control-development/work-questions/reissue-expired",
    ]);
    assert.deepEqual(JSON.parse(seen[0].body), { request_id: requestId });
    assert.deepEqual(JSON.parse(seen[1].body), {});
    for (const request of seen) assert.equal(request.headers["x-mission-control-producer-kind"], "OWNER_AUTHORITY");
    for (const output of [named.stdout, only.stdout]) assert.ok(!output.includes(INTERNAL_TOKEN) && !output.includes(OWNER_TOKEN));
    for (const args of [["work-question-reissue"], ["work-question-reissue", "--worker", "../x"],
      ["work-question-reissue", "--worker", "w", "--request", `fleet-review:${"a".repeat(32)}`],
      ["work-question-reissue", "--worker", "w", "--request", "work-question:short"],
      ["work-question-reissue", "--worker", "w", "--project", "project:x"]]) {
      const refused = await run(args, env(base));
      assert.equal(refused.code, 2, `${args.join(" ")}: ${refused.stderr}`);
    }
    assert.equal(seen.length, 2);
  });
});

test("work-question re-send posts the exact request id, and the discard only when the owner says yes", async () => {
  await withServer(async (base, seen) => {
    const requestId = `work-question:${"e".repeat(32)}`;
    const plain = await run(["work-question-resend", "--worker", "mission-control-development", "--request", requestId], env(base));
    assert.equal(plain.code, 0, plain.stderr);
    const discard = await run(["work-question-resend", "--worker", "mission-control-development", "--request", requestId,
      "--discard-finished-reply", "yes"], env(base));
    assert.equal(discard.code, 0, discard.stderr);
    assert.deepEqual(seen.map((s) => `${s.method} ${s.url}`), [
      "POST /workers/mission-control-development/work-questions/resend-sent",
      "POST /workers/mission-control-development/work-questions/resend-sent",
    ]);
    assert.deepEqual(JSON.parse(seen[0].body), { request_id: requestId });
    assert.deepEqual(JSON.parse(seen[1].body), { request_id: requestId, discard_finished_reply: true });
    for (const request of seen) assert.equal(request.headers["x-mission-control-producer-kind"], "OWNER_AUTHORITY");
    for (const args of [["work-question-resend", "--worker", "w", "--request", requestId, "--discard-finished-reply", "no"],
      ["work-question-resend", "--worker", "w", "--request", requestId, "--discard-finished-reply"],
      ["work-question-resend", "--worker", "w", "--request", requestId, "--discard-finished-reply", "true"]]) {
      const refused = await run(args, env(base));
      assert.equal(refused.code, 2, `${args.join(" ")}: ${refused.stderr}`);
    }
    assert.equal(seen.length, 2);
  });
});

test("checkpoint-verify posts only the exact file, commit and SHA-256 for one worker", async () => {
  await withServer(async (base, seen) => {
    const commit = "c".repeat(40);
    const sha = "d".repeat(64);
    const ok = await run(["checkpoint-verify", "--worker", "atlas-test-pilot", "--file", "checkpoints/preflight-v1.json",
      "--commit", commit, "--sha256", sha], env(base));
    assert.equal(ok.code, 0, ok.stderr);
    assert.deepEqual(seen.map((s) => `${s.method} ${s.url}`), ["POST /workers/atlas-test-pilot/task-checkpoints/verify"]);
    assert.deepEqual(JSON.parse(seen[0].body), { path: "checkpoints/preflight-v1.json", commit, sha256: sha });
    assert.equal(seen[0].headers["x-mission-control-producer-kind"], "OWNER_AUTHORITY");
    for (const args of [
      ["checkpoint-verify", "--worker", "atlas-test-pilot", "--file", "/etc/passwd", "--commit", commit, "--sha256", sha],
      ["checkpoint-verify", "--worker", "atlas-test-pilot", "--file", "a/../b", "--commit", commit, "--sha256", sha],
      ["checkpoint-verify", "--worker", "atlas-test-pilot", "--file", "a.json", "--commit", "main", "--sha256", sha],
      ["checkpoint-verify", "--worker", "atlas-test-pilot", "--file", "a.json", "--commit", commit, "--sha256", "D".repeat(64)],
      ["checkpoint-verify", "--worker", "Atlas", "--file", "a.json", "--commit", commit, "--sha256", sha],
      ["checkpoint-verify", "--worker", "atlas-test-pilot", "--file", "a.json", "--commit", commit],
      ["checkpoint-verify", "--worker", "atlas-test-pilot", "--file", "a.json", "--commit", commit, "--sha256", sha, "--repository", "x/y"],
    ]) {
      const refused = await run(args, env(base));
      assert.equal(refused.code, 2, `${args.join(" ")}: ${refused.stderr}`);
    }
    assert.equal(seen.length, 1);
  });
});

test("work-start-retry posts to one fixed route for one exact worker, with no body (#385, 22 Oct)", async () => {
  await withServer(async (base, seen) => {
    const ok = await run(["work-start-retry", "--worker", "atlas-living-pilot"], env(base));
    assert.equal(ok.code, 0, ok.stderr);
    assert.deepEqual(seen.map((s) => `${s.method} ${s.url}`), ["POST /workers/atlas-living-pilot/work-cloud-dispatches/retry-failed"]);
    assert.equal(seen[0].body, "");
    assert.equal(seen[0].headers["x-mission-control-producer-kind"], "OWNER_AUTHORITY");
    for (const args of [["work-start-retry"], ["work-start-retry", "--worker", "Atlas"], ["work-start-retry", "--worker", "../x"],
      ["work-start-retry", "--worker", "atlas-living-pilot", "--dispatch", "work-cloud:x"]]) {
      const refused = await run(args, env(base));
      assert.equal(refused.code, 2, `${args.join(" ")}: ${refused.stderr}`);
    }
    assert.equal(seen.length, 1);
  });
});

test("there is no action that forwards caller-supplied content under the owner credential", async () => {
  await withServer(async (base, seen) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "owner-action-"));
    const file = path.join(dir, "request.json");
    fs.writeFileSync(file, JSON.stringify({ task_id: "task:x", decision_requested: "self-authored instruction" }));
    const result = await run(["source-review", "--worker", "askrigor-system-alignment", "--request", file], env(base));
    assert.equal(result.code, 2);
    assert.match(result.stderr, /Unknown action source-review/);
    assert.equal(seen.length, 0);
    const source = fs.readFileSync(path.join(process.cwd(), "scripts/owner-action.ts"), "utf8");
    assert.ok(!source.includes("MISSION_CONTROL_OWNER_TOKEN") || !/fetch\(/.test(source), "owner bearer must not be attached to any outbound fetch");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test("bad input, unknown actions and a missing runtime credential are refused before any request", async () => {
  await withServer(async (base, seen) => {
    for (const args of [["watch-set", "--project", "project:askrigor", "--state", "RUNNING"], ["deploy"], [],
      ["watches", "--path", "/events"], ["watch-enroll", "--project", "askrigor", "--worker", "w", "--task", "t"],
      ["watch-set", "--project", "project:askrigor", "--cadence-ms", "12x"],
      ["reasoning-replace", "--project", "project:askrigor", "--request", "fleet-review:short", "--failure-receipt-sha", "b".repeat(64)],
      ["reasoning-replace", "--project", "project:askrigor", "--request", `fleet-review:${"a".repeat(32)}`, "--failure-receipt-sha", "NOT-A-SHA"],
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
