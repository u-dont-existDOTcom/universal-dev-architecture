import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { GET as getWorkers } from "../app/api/workers/route";
import { GET as getWorker } from "../app/api/workers/[worker]/route";

test("workers relay forwards only the explicit recent timeline opt-in", async (context) => {
  const previousToken = process.env.MISSION_CONTROL_OWNER_TOKEN;
  const token = randomBytes(32).toString("hex");
  process.env.MISSION_CONTROL_OWNER_TOKEN = token;
  context.after(() => {
    if (previousToken === undefined) delete process.env.MISSION_CONTROL_OWNER_TOKEN;
    else process.env.MISSION_CONTROL_OWNER_TOKEN = previousToken;
  });
  const requested: URL[] = [];
  const payload = { workers: [], generatedAt: "2026-10-09T00:00:00Z" };
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    requested.push(new URL(input instanceof Request ? input.url : input));
    return Response.json(payload);
  });
  for (const [query, expected] of [
    ["", "/snapshot"],
    ["?timeline=recent", "/snapshot?timeline=recent"],
    ["?timeline=full", "/snapshot"],
    ["?timeline=unknown", "/snapshot"],
    ["?timeline=recent&unrelated=value", "/snapshot?timeline=recent"],
  ]) {
    const response = await getWorkers(new Request(`https://app.test.invalid/api/workers${query}`, {
      headers: { authorization: `Bearer ${token}` },
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), payload);
    const url = requested.at(-1)!;
    assert.equal(url.pathname + url.search, expected);
  }
  const callsBeforeUnauthenticatedRead = requested.length;
  const denied = await getWorkers(new Request("https://app.test.invalid/api/workers?timeline=recent"));
  assert.ok([401, 503].includes(denied.status));
  assert.equal(requested.length, callsBeforeUnauthenticatedRead);
});

test("worker detail continues to relay the full dedicated worker endpoint", async (context) => {
  const previousToken = process.env.MISSION_CONTROL_OWNER_TOKEN;
  const token = randomBytes(32).toString("hex");
  process.env.MISSION_CONTROL_OWNER_TOKEN = token;
  context.after(() => {
    if (previousToken === undefined) delete process.env.MISSION_CONTROL_OWNER_TOKEN;
    else process.env.MISSION_CONTROL_OWNER_TOKEN = previousToken;
  });
  const worker = "worker-detail";
  const payload = { worker: { id: worker, timeline: Array.from({ length: 100 }, (_, sequence) => ({ sequence })) } };
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.pathname, `/workers/${worker}`);
    assert.equal(url.search, "");
    return Response.json(payload);
  });
  const response = await getWorker(new Request(`https://app.test.invalid/api/workers/${worker}`, {
    headers: { authorization: `Bearer ${token}` },
  }), { params: Promise.resolve({ worker }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), payload);
});
