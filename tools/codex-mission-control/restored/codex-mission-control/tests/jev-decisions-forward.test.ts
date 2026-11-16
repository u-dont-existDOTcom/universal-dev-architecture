import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error plain ESM script without type declarations
import { DECISIONS_URL, forward, KEY_URL } from "../scripts/jev-decisions-forward.mjs";

const request = { model: "typesafe/jev-1.14", state: { a: 1 }, questions: { q: { type: "noul", instructions: "?" } },
  provider: { allow_fallbacks: false } };
const env = { OPENROUTER_API_KEY: "sk-or-v1-FORWARDTEST" };

function reply(status: number, body: unknown) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

test("the forwarder signs one pinned Jev request and returns typed fields only", async () => {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const out = await forward({ input: JSON.stringify(request), env, fetchImpl: async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return reply(200, { id: "gen-dec-1", model: "typesafe/jev-1.14-20261014", provider: "TypeSafe", secret_extra: "x",
      answers: { q: { type: "noul", noul: 0.1 } }, usage: { input_tokens: 10, cost: 0.0000004 } });
  } });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, DECISIONS_URL);
  assert.equal((seen[0].init.headers as Record<string, string>).Authorization, "Bearer sk-or-v1-FORWARDTEST");
  assert.deepEqual(JSON.parse(String(seen[0].init.body)), request);
  assert.deepEqual(out, { http_status: 200, body: { id: "gen-dec-1", model: "typesafe/jev-1.14-20261014",
    provider: "TypeSafe", usage: { input_tokens: 10, output_tokens: undefined, cost: 0.0000004 },
    answers: { q: { type: "noul", noul: 0.1 } } } });
  assert.doesNotMatch(JSON.stringify(out), /FORWARDTEST|secret_extra/);
});

test("the forwarder refuses anything but a pinned Jev request without fallbacks, and never echoes errors", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return reply(500, "provider error with details"); };
  for (const bad of [{ ...request, model: "~typesafe/jev-latest" }, { ...request, model: "openai/gpt-5" },
    { ...request, provider: { allow_fallbacks: true } }, { ...request, questions: undefined }]) {
    assert.deepEqual(await forward({ input: JSON.stringify(bad), env, fetchImpl }), { http_status: 0, error: "BAD_INPUT" });
  }
  assert.deepEqual(await forward({ input: "not json", env, fetchImpl }), { http_status: 0, error: "BAD_INPUT" });
  assert.deepEqual(await forward({ input: "x".repeat(40_000), env, fetchImpl }), { http_status: 0, error: "BAD_INPUT" });
  assert.equal(calls, 0);
  assert.deepEqual(await forward({ input: JSON.stringify(request), env: {}, fetchImpl }), { http_status: 0, error: "NO_KEY" });
  assert.deepEqual(await forward({ input: JSON.stringify(request), env, fetchImpl }), { http_status: 500, limit_source: null });
  const limited = await forward({ input: JSON.stringify(request), env,
    fetchImpl: async () => reply(402, { error: { message: "secret detail", metadata: { limit_source: "openrouter_key_limit" } } }) });
  assert.deepEqual(limited, { http_status: 402, limit_source: "openrouter_key_limit" });
  const cut = await forward({ input: JSON.stringify(request), env, fetchImpl: async () => { throw new TypeError("socket hang up"); } });
  assert.deepEqual(cut, { http_status: 0, error: "TRANSPORT" });
});

test("key status reports only the key's own remaining limit", async () => {
  const out = await forward({ argv: ["--key-status"], env, fetchImpl: async (url: string) => {
    assert.equal(url, KEY_URL);
    return reply(200, { data: { label: "private label", usage: 1.2, limit: null, limit_remaining: null } });
  } });
  assert.deepEqual(out, { http_status: 200, body: { data: { limit_remaining: null } } });
});
