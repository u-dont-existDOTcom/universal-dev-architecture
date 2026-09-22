import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createGatewayServer, DEFAULT_MODEL, VENICE_API_BASE } from "../src/server.mjs";

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function startGateway(t, fetchImpl, options = {}) {
  const server = createGatewayServer({
    veniceApiKey: "venice-secret",
    gatewayToken: "gateway-secret",
    fetchImpl,
    ...options,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

test("health is public and contains no secret", async (t) => {
  let calls = 0;
  const base = await startGateway(t, async () => { calls += 1; return jsonResponse({}); });
  const response = await fetch(`${base}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, provider: "venice", default_model: DEFAULT_MODEL });
  assert.equal(calls, 0);
});

test("chat completion requires gateway authentication", async (t) => {
  let calls = 0;
  const base = await startGateway(t, async () => { calls += 1; return jsonResponse({}); });
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [] }),
  });
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test("GPT-5.6 Sol alias maps to Venice and provider credential replaces caller auth", async (t) => {
  let captured;
  const base = await startGateway(t, async (url, init) => {
    captured = { url, init };
    return jsonResponse({ id: "chatcmpl-test", choices: [] });
  });
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: "Bearer gateway-secret", "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-5.6-sol", messages: [{ role: "user", content: "test" }] }),
  });
  assert.equal(response.status, 200);
  assert.equal(captured.url, `${VENICE_API_BASE}/chat/completions`);
  assert.equal(captured.init.headers.authorization, "Bearer venice-secret");
  assert.equal(JSON.parse(captured.init.body).model, DEFAULT_MODEL);
  assert.doesNotMatch(JSON.stringify(captured), /gateway-secret/);
});

test("explicit Venice model IDs pass through unchanged", async (t) => {
  let model;
  const base = await startGateway(t, async (_url, init) => {
    model = JSON.parse(init.body).model;
    return jsonResponse({ choices: [] });
  });
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: "Bearer gateway-secret", "content-type": "application/json" },
    body: JSON.stringify({ model: "openai-gpt-56-terra", messages: [] }),
  });
  assert.equal(response.status, 200);
  assert.equal(model, "openai-gpt-56-terra");
});

test("model catalogue uses the fixed Venice upstream", async (t) => {
  let captured;
  const base = await startGateway(t, async (url, init) => {
    captured = { url, init };
    return jsonResponse({ data: [] });
  });
  const response = await fetch(`${base}/v1/models`, {
    headers: { authorization: "Bearer gateway-secret" },
  });
  assert.equal(response.status, 200);
  assert.equal(captured.url, `${VENICE_API_BASE}/models`);
  assert.equal(captured.init.headers.authorization, "Bearer venice-secret");
});

test("provider errors cannot echo the Venice key", async (t) => {
  const base = await startGateway(t, async () => new Response("provider rejected venice-secret", {
    status: 401,
    headers: { "content-type": "text/plain" },
  }));
  const response = await fetch(`${base}/v1/models`, {
    headers: { authorization: "Bearer gateway-secret" },
  });
  const text = await response.text();
  assert.equal(response.status, 401);
  assert.doesNotMatch(text, /venice-secret/);
  assert.match(text, /\[REDACTED\]/);
});

test("oversized request bodies fail before provider transport", async (t) => {
  let calls = 0;
  const base = await startGateway(t, async () => { calls += 1; return jsonResponse({}); }, { maxBodyBytes: 32 });
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: "Bearer gateway-secret", "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "x".repeat(100) }] }),
  });
  assert.equal(response.status, 413);
  assert.equal(calls, 0);
});
