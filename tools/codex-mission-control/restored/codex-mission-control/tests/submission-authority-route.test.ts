import assert from "node:assert/strict";
import test from "node:test";

test("submission-authority BFF authenticates a bound relay kind before forwarding to the daemon", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = {
    MISSION_CONTROL_INTERNAL_TOKEN: process.env.MISSION_CONTROL_INTERNAL_TOKEN,
    MISSION_CONTROL_INGEST_CREDENTIALS: process.env.MISSION_CONTROL_INGEST_CREDENTIALS,
    MISSION_CONTROL_DAEMON_URL: process.env.MISSION_CONTROL_DAEMON_URL,
  };
  const relayToken = "test-relay-token-" + "r".repeat(40);
  const workerToken = "test-worker-token-" + "w".repeat(40);
  process.env.MISSION_CONTROL_INTERNAL_TOKEN = "test-internal-token-" + "i".repeat(40);
  process.env.MISSION_CONTROL_DAEMON_URL = "http://daemon.test.invalid";
  process.env.MISSION_CONTROL_INGEST_CREDENTIALS = JSON.stringify({
    "collector:primary": { kind: "COLLECTOR", token: relayToken, workers: ["worker-a"], tasks: ["*"] },
    "worker:test": { kind: "WORKER", token: workerToken, workers: ["worker-a"], tasks: ["*"] },
  });
  try {
    const route = await import("../app/api/submission-authority/[...operation]/route");
    let forwarded = 0;
    globalThis.fetch = async (url, init) => {
      forwarded += 1;
      assert.ok(["/submission-authority/status", "/submission-authority/admissions"].includes(new URL(String(url)).pathname));
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("x-mission-control-producer-id"), "collector:primary");
      assert.equal(headers.get("x-mission-control-producer-kind"), "COLLECTOR");
      assert.equal(headers.get("x-mission-control-worker-scopes"), "worker-a");
      assert.equal(headers.get("x-mission-control-task-scopes"), "*");
      assert.ok(headers.get("authorization")?.startsWith("Bearer "));
      return Response.json({ authority: "MISSION_CONTROL_SINGLE_WRITER" });
    };

    const params = { params: Promise.resolve({ operation: ["status"] }) };
    const unauthorized = await route.GET(new Request("https://mission-control.example/api/submission-authority/status"), params);
    assert.equal(unauthorized.status, 401);
    const wrongKind = await route.GET(new Request("https://mission-control.example/api/submission-authority/status", {
      headers: { authorization: `Bearer ${workerToken}`, "x-mission-control-producer-id": "worker:test" },
    }), params);
    assert.equal(wrongKind.status, 403);
    assert.equal(forwarded, 0);

    const allowed = await route.GET(new Request("https://mission-control.example/api/submission-authority/status", {
      headers: { authorization: `Bearer ${relayToken}`, "x-mission-control-producer-id": "collector:primary" },
    }), params);
    assert.equal(allowed.status, 200);
    assert.equal(forwarded, 1);

    const posted = await route.POST(new Request("https://mission-control.example/api/submission-authority/admissions", {
      method: "POST",
      headers: { authorization: `Bearer ${relayToken}`, "x-mission-control-producer-id": "collector:primary", "content-type": "application/json" },
      body: "{}",
    }), { params: Promise.resolve({ operation: ["admissions"] }) });
    assert.equal(posted.status, 200);
    assert.equal(forwarded, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restore("MISSION_CONTROL_INTERNAL_TOKEN", originalEnvironment.MISSION_CONTROL_INTERNAL_TOKEN);
    restore("MISSION_CONTROL_INGEST_CREDENTIALS", originalEnvironment.MISSION_CONTROL_INGEST_CREDENTIALS);
    restore("MISSION_CONTROL_DAEMON_URL", originalEnvironment.MISSION_CONTROL_DAEMON_URL);
  }
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
