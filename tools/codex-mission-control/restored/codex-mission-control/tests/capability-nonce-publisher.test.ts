import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { request as httpRequest, RequestOptions } from "node:http";
import { nonceFixtureBody } from "../lib/capability-rotation";
import {
  FixedBusCapabilityNoncePublisher, UnixCapabilityNoncePublisher, capabilityNonceBody, capabilityNoncePrefix,
  capabilityNonceErrorCode, dispatchCapabilityNonceBrokerRequest, requestCapabilityNonceBroker,
  capabilityNonceDiscoverySince, capabilityNonceMaximumLifetimeMs,
  type CapabilityNonceFixture, type CapabilityNoncePublisher, type PublicationProof,
} from "../lib/capability-nonce-publisher";

// Synthetic credential accepted only by injected mocks. No environment, auth files,
// real GitHub, Unix sockets, browser/relay, subprocesses, or publication in this suite.
const credential = "github_pat_" + "testonly_".repeat(5);
const now = Date.parse("2026-09-13T02:00:00.000Z");
const fixture: CapabilityNonceFixture = { challengeId: "mc-capability-example", chatId: "mc-supervisor-test", githubNonce: "public_test_nonce_".repeat(3), expiresAt: "2026-09-14T02:00:00.000Z" };
const repository = "u-dont-existDOTcom/universal-dev-architecture";
const api = `https://api.github.com/repos/${repository}`;
const issueApi = `${api}/issues/60`;
const issueWeb = `https://github.com/${repository}/issues/60`;
const proof: PublicationProof = { commentId: 123, immutableUrl: `${issueWeb}#issuecomment-123`, bodySha256: createHash("sha256").update(nonceFixtureBody(fixture)).digest("hex"), authorLogin: "u-dont-existDOTcom", createdAt: "2026-09-13T01:59:59Z" };
function comment(overrides: Record<string, unknown> = {}) {
  return { id: proof.commentId, url: `${api}/issues/comments/123`, issue_url: issueApi, html_url: proof.immutableUrl,
    user: { login: proof.authorLogin }, created_at: proof.createdAt, body: capabilityNonceBody(fixture), ...overrides };
}
function response(value: unknown, status = 200, headers: Record<string, string> = {}) { return new Response(JSON.stringify(value), { status, headers }); }
interface Step { method?: string; url: string; value?: unknown; status?: number; headers?: Record<string, string>; error?: string; response?: Response }
function github(steps: Step[], options: { maxPages?: number; timeoutMs?: number; maxResponseBytes?: number } = {}) {
  if (steps.some(step => step.method === "POST")) steps.unshift({ url: "https://api.github.com/user", value: { login: proof.authorLogin } });
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input); calls.push({ url, init });
    const next = steps.shift(); assert.ok(next, "unexpected GitHub operation");
    assert.equal(url, next.url); assert.equal(init.method, next.method ?? "GET");
    assert.equal(init.redirect, "error"); assert.equal((init.headers as Record<string, string>).authorization, `Bearer ${credential}`);
    assert.ok(init.signal);
    if (next.error) throw new Error(next.error);
    return next.response ?? response(next.value, next.status ?? 200, next.headers);
  };
  const publisher = new FixedBusCapabilityNoncePublisher(credential, { fetch: fetcher, now: () => now, ...options });
  return { publisher, calls, steps };
}
const list = (page = 1) => `${issueApi}/comments?per_page=100&page=${page}&since=${encodeURIComponent(capabilityNonceDiscoverySince(fixture))}`;
const get = `${api}/issues/comments/123`;

test("public fixture shares main serializer, exact prefix and five schema keys only", () => {
  assert.equal(capabilityNonceBody(fixture), nonceFixtureBody(fixture));
  assert.deepEqual(Object.keys(JSON.parse(capabilityNonceBody(fixture).slice(capabilityNoncePrefix.length))), ["schema_version", "challenge_id", "chat_id", "github_nonce", "expires_at"]);
  assert.equal(capabilityNonceBody(fixture).includes("mc_nonce"), false);
});

for (const change of [
  { mcNonce: "DO_NOT_LEAK" }, { token: "DO_NOT_LEAK" }, { repository: "foreign/repo" }, { issue: 59 }, { body: "arbitrary" },
  { chatId: "https://chatgpt.com/c/DO_NOT_LEAK" }, { chatId: "12345-raw-target-id" }, { chatId: "a/b" },
  { challengeId: "../../escape" }, { githubNonce: "short" }, { githubNonce: "a".repeat(32) + "\n" },
  { expiresAt: "2026-02-31T00:00:00Z" }, { expiresAt: "yesterday" },
]) test(`reject fixture ${Object.keys(change).join()} before network`, async () => {
  const { publisher, calls } = github([]);
  await assert.rejects(publisher.publish({ ...fixture, ...change }), /CAPABILITY_/);
  assert.equal(calls.length, 0);
});

test("create exactly once on #60 then independently GET the exact returned comment", async () => {
  const { publisher, calls } = github([{ url: `${issueApi}/comments`, method: "POST", status: 201, value: comment() }, { url: get, value: comment() }]);
  assert.deepEqual(await publisher.publish(fixture), proof);
  assert.equal(calls.filter(x => x.init.method === "POST").length, 1);
  assert.deepEqual(JSON.parse(calls[1].init.body as string), { body: nonceFixtureBody(fixture) });
});

test("find exhausts all pages and independently rechecks one matching comment", async () => {
  const { publisher, calls } = github([
    { url: list(), value: [comment()], headers: { link: `<${list(2)}>; rel="next", <${list(2)}>; rel="last"` } },
    { url: list(2), value: [{ body: "unrelated receipt" }] }, { url: get, value: comment() },
  ]);
  assert.deepEqual(await publisher.find(fixture), proof); assert.equal(calls.length, 3);
});
test("find absent on fully exhausted bus is null", async () => {
  const { publisher } = github([{ url: list(), value: [{ body: "unrelated" }] }]);
  assert.equal(await publisher.find(fixture), null);
});
test("find ignores malformed/unrelated and unauthorized comments without accepting them as proof", async () => {
  const { publisher } = github([{ url: list(), value: [
    null, {}, { body: null }, { body: capabilityNoncePrefix + "not json" },
    comment({ body: capabilityNoncePrefix + "not json" }),
    comment({ body: capabilityNoncePrefix + JSON.stringify({ challenge_id: "unrelated" }) }),
    comment({ user: { login: "attacker" } }),
    comment({ user: { login: "attacker" }, body: capabilityNoncePrefix + "not json" }),
    comment(),
  ] }, { url: get, value: comment() }]);
  assert.deepEqual(await publisher.find(fixture), proof);
});
test("unauthorized exact fixture by itself is not publication proof", async () => {
  const { publisher } = github([{ url: list(), value: [comment({ user: { login: "attacker" } })] }]);
  assert.equal(await publisher.find(fixture), null);
});
test("two authorized matching IDs with different nonce are a conflict, not unrelated noise", async () => {
  const { publisher } = github([{ url: list(), value: [comment(), comment({ body: nonceFixtureBody({ ...fixture, githubNonce: "conflicting_".repeat(4) }) })] }]);
  await assert.rejects(publisher.find(fixture), /PUBLICATION_INVALID/);
});
test("writer identity is hardlocked GET user, rejects mismatch before any POST", async () => {
  const { publisher, calls } = github([{ url: "https://api.github.com/user", value: { login: "wrong-user" } }]);
  await assert.rejects(publisher.publish(fixture), /PUBLICATION_INVALID/);
  assert.deepEqual(calls.map(call => [call.init.method, call.url]), [["GET", "https://api.github.com/user"]]);
});
test("verified writer identity is cached without implying token scope validation", async () => {
  const { publisher, calls } = github([{ url: "https://api.github.com/user", value: { login: proof.authorLogin }, headers: { "x-oauth-scopes": "repo,admin:org" } }]);
  await publisher.verifyWriter(); await publisher.verifyWriter(); assert.equal(calls.length, 1);
});
test("full page without Link is not exhaustion evidence", async () => {
  const { publisher, calls } = github([{ url: list(), value: Array.from({ length: 100 }, () => ({ body: "unrelated" })) }, { url: list(2), value: [] }]);
  assert.equal(await publisher.find(fixture), null); assert.equal(calls.length, 2);
});
test("bounded pagination overflow fails even after finding a match", async () => {
  const { publisher } = github([{ url: list(), value: [comment()], headers: { link: `<${list(2)}>; rel="next"` } }], { maxPages: 1 });
  await assert.rejects(publisher.find(fixture), /PAGINATION_INCOMPLETE/);
});
test("discovery queries only the admissible publication window, independent of historical bus size", async () => {
  assert.equal(capabilityNonceMaximumLifetimeMs, 172_800_000);
  assert.equal(capabilityNonceDiscoverySince(fixture), "2026-09-12T01:59:54.000Z");
  const { publisher, calls } = github([{ url: list(), value: [comment()] }, { url: get, value: comment() }]);
  assert.deepEqual(await publisher.find(fixture), proof);
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[0].url).searchParams.get("since"), "2026-09-12T01:59:54.000Z");
});
test("successor recovery works on a bus with more than 2000 historical comments", async () => {
  const history = Array.from({ length: 2500 }, () => ({ body: "historical receipt", updated_at: "2026-08-01T00:00:00Z" }));
  const records = [...history, { ...comment(), updated_at: proof.createdAt }];
  const calls: string[] = [];
  const publisher = new FixedBusCapabilityNoncePublisher(credential, { now: () => now, fetch: async (input, init) => {
    const url = new URL(String(input)); calls.push(String(input)); assert.equal(init?.method, "GET");
    if (String(input) === get) return response(comment());
    assert.equal(url.origin + url.pathname, `${issueApi}/comments`);
    const since = url.searchParams.get("since"); assert.ok(since, "must exclude irrelevant historical accumulation");
    const eligible = records.filter(record => Date.parse(record.updated_at) > Date.parse(since));
    const page = Number(url.searchParams.get("page"));
    return response(eligible.slice((page - 1) * 100, page * 100));
  } });
  assert.deepEqual(await publisher.find(fixture), proof); assert.equal(calls.length, 2);
});
test("old proof outside recovery window is rejected before exact GET", async () => {
  const { publisher, calls } = github([]);
  await assert.rejects(publisher.verify(fixture, { ...proof, createdAt: "2026-09-12T01:59:54Z" }), /PUBLICATION_INVALID/);
  assert.equal(calls.length, 0);
});
test("oldest admissible proof stays inside since filter and is independently verified", async () => {
  const boundary = comment({ created_at: "2026-09-12T01:59:55Z" });
  const { publisher } = github([{ url: list(), value: [boundary] }, { url: get, value: boundary }]);
  assert.equal((await publisher.find(fixture))?.createdAt, "2026-09-12T01:59:55Z");
});
test("recent-window overflow without match cannot return null or trigger publication", async () => {
  const { publisher, calls } = github([{ url: list(), value: Array.from({ length: 100 }, () => ({ body: "recent receipt" })) }], { maxPages: 1 });
  await assert.rejects(publisher.find(fixture), /PAGINATION_INCOMPLETE/);
  assert.deepEqual(calls.map(call => call.init.method), ["GET"]);
});
test("retained publication proof recovery bypasses discovery cap with exact comment GET", async () => {
  const { publisher, calls } = github([{ url: get, value: comment() }], { maxPages: 1 });
  assert.deepEqual(await publisher.verify(fixture, proof), proof);
  assert.deepEqual(calls.map(call => call.url), [get]);
});
test("publisher rejects TTL above the recovery bound without network", async () => {
  const { publisher, calls } = github([]);
  await assert.rejects(publisher.publish({ ...fixture, expiresAt: new Date(now + capabilityNonceMaximumLifetimeMs + 1).toISOString() }), /PUBLICATION_INVALID/);
  assert.equal(calls.length, 0);
});
test("duplicate fixtures fail closed across pages, never select first", async () => {
  const { publisher } = github([{ url: list(), value: [comment()], headers: { link: `<${list(2)}>; rel="next"` } }, { url: list(2), value: [comment()] }]);
  await assert.rejects(publisher.find(fixture), /PUBLICATION_AMBIGUOUS/);
});
for (const link of [
  '<https://private.invalid/path>; rel="next"', `<${list(3)}>; rel="next"`,
  `<${list(2)}&token=DO_NOT_LEAK>; rel="next"`, `<${list(2)}>; rel="next", <${list(2)}>; rel="next"`,
  `<${api}/issues/59/comments?per_page=100&page=2>; rel="next"`, "malformed",
  `<${issueApi}/comments?per_page=100&page=2>; rel="next"`,
  `<${list(2).replace(encodeURIComponent(capabilityNonceDiscoverySince(fixture)), "2020-01-01T00%3A00%3A00.000Z")}>; rel="next"`,
]) test(`reject unsafe or incomplete pagination: ${link.slice(0, 65)}`, async () => {
  const { publisher, calls } = github([{ url: list(), value: [], headers: { link } }]);
  await assert.rejects(publisher.find(fixture), /PAGINATION_INCOMPLETE/); assert.equal(calls.length, 1);
});

for (const [label, patch] of Object.entries({
  "wrong issue": { issue_url: `${api}/issues/59` }, "wrong repository": { issue_url: "https://api.github.com/repos/foreign/repo/issues/60" },
  "wrong API URL": { url: `${api}/issues/comments/124` }, "wrong web URL": { html_url: `${issueWeb}#issuecomment-124` },
  "wrong chat": { body: nonceFixtureBody({ ...fixture, chatId: "another-chat" }) },
  "wrong nonce": { body: nonceFixtureBody({ ...fixture, githubNonce: "other_nonce_".repeat(4) }) },
  "additional public keys": { body: capabilityNoncePrefix + JSON.stringify({ ...JSON.parse(nonceFixtureBody(fixture).slice(capabilityNoncePrefix.length)), mc_nonce: "DO_NOT_LEAK" }) },
  "future creation": { created_at: "2026-09-13T02:00:01Z" }, "expired creation": { created_at: fixture.expiresAt },
  "invalid creation": { created_at: "not a timestamp" }, "unsafe numeric id": { id: Number.MAX_SAFE_INTEGER + 1 },
})) test(`find rejects exact-ID match with ${label}`, async () => {
  const { publisher, calls } = github([{ url: list(), value: [comment(patch)] }]);
  await assert.rejects(publisher.find(fixture), /CAPABILITY_/); assert.equal(calls.length, 1);
});

test("publication response alone is insufficient; changed read-after-write fails closed", async () => {
  const { publisher, calls } = github([{ url: `${issueApi}/comments`, method: "POST", status: 201, value: comment() }, { url: get, value: comment({ issue_url: `${api}/issues/61` }) }]);
  await assert.rejects(publisher.publish(fixture), /PUBLICATION_AMBIGUOUS/);
  assert.equal(calls.filter(x => x.init.method === "POST").length, 1);
});
for (const status of [301, 401, 403, 429, 500, 503]) test(`POST status ${status} is ambiguous, never retried or echoed`, async () => {
  const { publisher, calls } = github([{ url: `${issueApi}/comments`, method: "POST", status, value: { error: "DO_NOT_LEAK " + credential } }]);
  await assert.rejects(publisher.publish(fixture), { message: "CAPABILITY_PUBLICATION_AMBIGUOUS" }); assert.equal(calls.length, 2);
});
test("lost POST response is ambiguous, then fresh instance find recovers without another POST", async () => {
  const first = github([{ url: `${issueApi}/comments`, method: "POST", error: "DO_NOT_LEAK " + credential }]);
  await assert.rejects(first.publisher.publish(fixture), { message: "CAPABILITY_PUBLICATION_AMBIGUOUS" });
  const restarted = github([{ url: list(), value: [comment()] }, { url: get, value: comment() }]);
  assert.deepEqual(await restarted.publisher.find(fixture), proof);
  assert.equal(restarted.calls.some(x => x.init.method === "POST"), false);
});
test("verify after restart always performs GET and matches persisted createdAt exactly", async () => {
  const good = github([{ url: get, value: comment() }]); assert.deepEqual(await good.publisher.verify(fixture, proof), proof);
  const changed = github([{ url: get, value: comment({ created_at: "2026-09-13T01:59:58Z" }) }]);
  await assert.rejects(changed.publisher.verify(fixture, proof), /PUBLICATION_INVALID/);
});
test("unsafe proof cannot choose another GitHub location or GET", async () => {
  const { publisher, calls } = github([]);
  await assert.rejects(publisher.verify(fixture, { ...proof, immutableUrl: "https://private.invalid/token" }), /PUBLICATION_INVALID/);
  assert.equal(calls.length, 0);
});
test("publish refuses expired fixture before POST", async () => {
  const { publisher, calls } = github([]);
  await assert.rejects(publisher.publish({ ...fixture, expiresAt: new Date(now).toISOString() }), /PUBLICATION_INVALID/); assert.equal(calls.length, 0);
});
test("GET failure bodies and thrown errors are replaced with fixed codes", async () => {
  const first = github([{ url: list(), value: { token: "DO_NOT_LEAK" }, status: 403 }]);
  await assert.rejects(first.publisher.find(fixture), { message: "CAPABILITY_PUBLICATION_INVALID" });
  const second = github([{ url: list(), error: "DO_NOT_LEAK" }]);
  await assert.rejects(second.publisher.find(fixture), { message: "CAPABILITY_PUBLISHER_UNAVAILABLE" });
});
test("GET response size includes streamed body, not merely Content-Length", async () => {
  const { publisher } = github([{ url: list(), value: [{ body: "x".repeat(1000) }] }], { maxResponseBytes: 100 });
  await assert.rejects(publisher.find(fixture), /RESPONSE_TOO_LARGE/);
});
test("GET Content-Length over limit is rejected", async () => {
  const { publisher } = github([{ url: list(), value: [], headers: { "content-length": "9000" } }], { maxResponseBytes: 100 });
  await assert.rejects(publisher.find(fixture), /RESPONSE_TOO_LARGE/);
});
test("GitHub timeout is absolute even when injected fetch ignores abort", async () => {
  let calls = 0;
  const publisher = new FixedBusCapabilityNoncePublisher(credential, { timeoutMs: 10, fetch: async () => { calls++; return new Promise<Response>(() => {}); } });
  await assert.rejects(publisher.find(fixture), { message: "CAPABILITY_PUBLISHER_TIMEOUT" }); assert.equal(calls, 1);
});
test("classic or ambient token values are rejected; credentials do not serialize", () => {
  for (const token of ["", "ghp_" + "x".repeat(40), "workstation-gh-token"]) assert.throws(() => new FixedBusCapabilityNoncePublisher(token), /UNAVAILABLE/);
  assert.equal(JSON.stringify(new FixedBusCapabilityNoncePublisher(credential)).includes(credential), false);
  assert.equal(capabilityNonceErrorCode(new Error("DO_NOT_LEAK")), "CAPABILITY_PUBLISHER_UNAVAILABLE");
});

test("Unix client sends only exact operation, fixture and optional validated proof", async () => {
  const requests: Record<string, unknown>[] = [];
  const client = new UnixCapabilityNoncePublisher("/run/nonce/publisher.sock", { now: () => now, request: async (request) => {
    assert.equal(request.socketPath, "/run/nonce/publisher.sock"); assert.ok(request.timeoutMs > 0); assert.equal(request.maxResponseBytes, 8192);
    requests.push(JSON.parse(request.body)); return { ok: true, proof };
  } });
  assert.deepEqual(await client.find(fixture), proof); assert.deepEqual(await client.publish(fixture), proof); assert.deepEqual(await client.verify(fixture, proof), proof);
  assert.deepEqual(requests, [{ operation: "find", fixture }, { operation: "publish", fixture }, { operation: "verify", fixture, proof }]);
  assert.equal(JSON.stringify(requests).includes("mcNonce"), false); assert.equal(JSON.stringify(requests).includes(credential), false);
});
test("Unix absence is an unavailable gate and never falls back to GitHub", async () => {
  const client = new UnixCapabilityNoncePublisher("");
  await assert.rejects(client.find(fixture), { message: "CAPABILITY_PUBLISHER_UNAVAILABLE" });
});
test("Unix unknown errors are never echoed", async () => {
  const client = new UnixCapabilityNoncePublisher("/run/nonce/publisher.sock", { request: async () => { throw new Error("DO_NOT_LEAK"); } });
  await assert.rejects(client.find(fixture), { message: "CAPABILITY_PUBLISHER_UNAVAILABLE" });
});
test("Unix deadline awaits timeout even when injected transport never settles", async () => {
  const client = new UnixCapabilityNoncePublisher("/run/nonce/publisher.sock", { timeoutMs: 10, request: async () => new Promise(() => {}) });
  await assert.rejects(client.find(fixture), { message: "CAPABILITY_PUBLISHER_TIMEOUT" });
});
test("Unix oversized envelope rejected before interpretation", async () => {
  const client = new UnixCapabilityNoncePublisher("/run/nonce/publisher.sock", { request: async () => ({ ok: false, error: "DO_NOT_LEAK".repeat(1000) }) });
  await assert.rejects(client.find(fixture), /RESPONSE_TOO_LARGE/);
});
for (const [label, envelope] of Object.entries({
  "unknown error": { ok: false, error: "DO_NOT_LEAK" }, "extra fields": { ok: true, proof, token: "DO_NOT_LEAK" },
  "wrong author": { ok: true, proof: { ...proof, authorLogin: "attacker" } },
  "wrong body": { ok: true, proof: { ...proof, bodySha256: "a".repeat(64) } },
  "wrong issue": { ok: true, proof: { ...proof, immutableUrl: proof.immutableUrl.replace("/60#", "/59#") } },
  "extra proof": { ok: true, proof: { ...proof, rawBody: "DO_NOT_LEAK" } },
})) test(`Unix response rejects ${label}`, async () => {
  const client = new UnixCapabilityNoncePublisher("/run/nonce/publisher.sock", { now: () => now, request: async () => envelope });
  await assert.rejects(client.find(fixture), /CAPABILITY_/);
});
test("Unix null proof only permitted for find", async () => {
  const client = new UnixCapabilityNoncePublisher("/run/nonce/publisher.sock", { request: async () => ({ ok: true, proof: null }) });
  assert.equal(await client.find(fixture), null);
  await assert.rejects(client.publish(fixture), /PUBLICATION_INVALID/);
});

test("strict dispatch exposes only find/publish/verify, never arbitrary GitHub operations", async () => {
  const calls: string[] = [];
  const publisher: CapabilityNoncePublisher = { find: async () => { calls.push("find"); return null; }, publish: async () => { calls.push("publish"); return proof; }, verify: async () => { calls.push("verify"); return proof; } };
  for (const request of [
    { operation: "DELETE", fixture }, { operation: "publish", fixture, repository: "foreign/repo" },
    { operation: "publish", fixture, issue: 59 }, { operation: "publish", fixture, body: "arbitrary" },
    { operation: "publish", fixture: { ...fixture, mcNonce: "DO_NOT_LEAK" } }, { operation: "verify", fixture },
  ]) await assert.rejects(dispatchCapabilityNonceBrokerRequest(request, publisher), /CAPABILITY_/);
  assert.equal(calls.length, 0);
  assert.equal(await dispatchCapabilityNonceBrokerRequest({ operation: "find", fixture }, publisher), null);
  assert.deepEqual(await dispatchCapabilityNonceBrokerRequest({ operation: "publish", fixture }, publisher), proof);
  assert.deepEqual(await dispatchCapabilityNonceBrokerRequest({ operation: "verify", fixture, proof }, publisher), proof);
  assert.deepEqual(calls, ["find", "publish", "verify"]);
});

function mockHttp(body: string, emitBody: string | null, statusCode = 200) {
  const request = new EventEmitter() as EventEmitter & { end: (body: string) => void; destroy: () => void };
  let destroyed = false;
  request.destroy = () => { destroyed = true; };
  const response = Object.assign(new PassThrough(), { statusCode, headers: { "content-type": "application/json" } });
  const impl = ((options: RequestOptions, callback: (response: unknown) => void) => {
    assert.equal(options.path, "/v1/capability-nonce"); assert.equal(options.method, "POST"); assert.equal(options.socketPath, "/run/nonce/publisher.sock");
    assert.equal(options.host, undefined); assert.equal(options.hostname, undefined);
    request.end = (sent: string) => { assert.equal(sent, body); queueMicrotask(() => { callback(response); if (emitBody !== null) response.end(emitBody); }); };
    return request;
  }) as typeof httpRequest;
  return { impl, destroyed: () => destroyed };
}
test("real Unix transport implementation bounds streaming response and destroys oversize request", async () => {
  const options = { socketPath: "/run/nonce/publisher.sock", body: "{}", timeoutMs: 100, maxResponseBytes: 20 };
  const mock = mockHttp("{}", "x".repeat(21));
  await assert.rejects(requestCapabilityNonceBroker(options, mock.impl), /RESPONSE_TOO_LARGE/); assert.equal(mock.destroyed(), true);
});
test("real Unix transport absolute timer also covers a stalled response body", async () => {
  const mock = mockHttp("{}", null);
  await assert.rejects(requestCapabilityNonceBroker({ socketPath: "/run/nonce/publisher.sock", body: "{}", timeoutMs: 10, maxResponseBytes: 20 }, mock.impl), /TIMEOUT/);
  assert.equal(mock.destroyed(), true);
});
test("real Unix transport rejects redirect/status without following any location", async () => {
  const mock = mockHttp("{}", "DO_NOT_LEAK", 302);
  await assert.rejects(requestCapabilityNonceBroker({ socketPath: "/run/nonce/publisher.sock", body: "{}", timeoutMs: 100, maxResponseBytes: 100 }, mock.impl), /UNAVAILABLE/);
});

// Dynamic import keeps the .mjs executable outside the app's TS declaration graph.
const brokerModulePath = "../scripts/run-capability-nonce-broker.mjs";
test("broker CLI accepts only the two protected local paths", async () => {
  const { parseBrokerArguments } = await import(brokerModulePath);
  const env = { CREDENTIALS_DIRECTORY:"/run/credentials/mission-control-capability-nonce-publisher.service",MISSION_CONTROL_CAPABILITY_GITHUB_TOKEN_FILE: "/run/credentials/mission-control-capability-nonce-publisher.service/github-token" };
  const socket = "/run/mission-control-capability-publisher/broker/publisher.sock";
  assert.deepEqual(parseBrokerArguments([], env), { socket, credentialFile: env.MISSION_CONTROL_CAPABILITY_GITHUB_TOKEN_FILE });
  assert.deepEqual(parseBrokerArguments(["--socket", socket], env), { socket, credentialFile: env.MISSION_CONTROL_CAPABILITY_GITHUB_TOKEN_FILE });
  assert.throws(() => parseBrokerArguments(["--socket", "/run/mission-control-capability-publisher/publisher.sock"], env), /UNAVAILABLE/);
  assert.throws(() => parseBrokerArguments([], {}), /UNAVAILABLE/);
  for (const args of [["--socket", "relative"], ["--credential-file", "/run/token"], ["--socket", "/run/a", "--url", "https://private.invalid"], ["--socket", "/run/a", "--socket", "/run/b"]]) assert.throws(() => parseBrokerArguments(args, env), /UNAVAILABLE/);
});

test("runtime directory requires stable root-owned parent and private runtime-managed child", async () => {
  const { validateBrokerRuntimeDirectory, brokerSocketPath } = await import(brokerModulePath);
  const parent = "/run/mission-control-capability-publisher", child = `${parent}/broker`;
  const entry = (uid: number, gid: number, mode: number) => ({ isDirectory: () => true, isSymbolicLink: () => false, uid, gid, mode });
  const io = { lstat: async (path: string) => path === child ? entry(1234, 1000, 0o40750) : entry(0, 1000, 0o40750) };
  await validateBrokerRuntimeDirectory(brokerSocketPath, io, 1234, 1000);
  for (const [path, patch] of [[parent, { uid: 1234 }], [child, { uid: 0 }], [child, { gid: 0 }], [child, { mode: 0o40770 }], [parent, { isSymbolicLink: () => true }]] as const) {
    await assert.rejects(validateBrokerRuntimeDirectory(brokerSocketPath, { lstat: async (selected: string) => ({ ...await io.lstat(selected), ...(selected === path ? patch : {}) }) }, 1234, 1000), /UNAVAILABLE/);
  }
  await assert.rejects(validateBrokerRuntimeDirectory(brokerSocketPath, io, 1234, 2000), /UNAVAILABLE/);
});

function credentialIO(overrides: Record<string, unknown> = {}, checked: Record<string, unknown> = {}) {
  const entry = { isFile: () => true, isSymbolicLink: () => false, uid: 1234, gid:1000, mode: 0o100600, size: credential.length, nlink: 1, dev: 1, ino: 2, ...overrides };
  let opened = false, closed = false;
  return { opened: () => opened, closed: () => closed, io: {
    readFile: async (path: string): Promise<string> => {
      if (path === "/proc/self/limits") return "Limit                     Soft Limit           Hard Limit           Units\nMax core file size        0                    0                    bytes\n";
      if (path === "/proc/self/coredump_filter") return "00000000\n";
      if (path === "/proc/sys/kernel/core_pattern") return "core\n";
      assert.fail("unexpected filesystem read");
    },
    lstat: async (path: string) => path === "/run/secrets/nonce" ? entry : { isDirectory: () => true, isSymbolicLink: () => false, uid: 0, mode: 0o40755 },
    open: async () => { opened = true; return { stat: async () => ({ ...entry, ...checked }), close: async () => { closed = true; },
      read: async (buffer: Buffer) => { buffer.write(credential); return { bytesRead: credential.length }; } }; },
  } };
}
test("broker credential read is pinned to protected inode and never obtains ambient auth", async () => {
  const { readProtectedBrokerCredential } = await import(brokerModulePath);
  const mock = credentialIO();
  assert.equal(await readProtectedBrokerCredential("/run/secrets/nonce", mock.io, 1234), credential); assert.equal(mock.closed(), true);
});
for (const [label, patch] of Object.entries({
  "group/world readable": { mode: 0o100644 }, "root-owned credential for unprivileged broker": { uid: 0 },
  "symlink": { isSymbolicLink: () => true }, "hard link": { nlink: 2 }, "oversized file": { size: 301 },
  "not regular": { isFile: () => false },
})) test(`broker rejects ${label} before opening credential`, async () => {
  const { readProtectedBrokerCredential } = await import(brokerModulePath);
  const mock = credentialIO(patch);
  await assert.rejects(readProtectedBrokerCredential("/run/secrets/nonce", mock.io, 1234), /UNAVAILABLE/); assert.equal(mock.opened(), false);
});
test("broker rejects inode replacement after open and closes descriptor", async () => {
  const { readProtectedBrokerCredential } = await import(brokerModulePath);
  const mock = credentialIO({}, { ino: 99 });
  await assert.rejects(readProtectedBrokerCredential("/run/secrets/nonce", mock.io, 1234), /UNAVAILABLE/); assert.equal(mock.closed(), true);
});
test("broker refuses root execution and world-writable ancestors", async () => {
  const { readProtectedBrokerCredential } = await import(brokerModulePath);
  await assert.rejects(readProtectedBrokerCredential("/run/secrets/nonce", credentialIO().io, 0), /UNAVAILABLE/);
  const mock = credentialIO();
  mock.io.lstat = async () => ({ isDirectory: () => true, isSymbolicLink: () => false, uid: 0, mode: 0o40777 }) as never;
  await assert.rejects(readProtectedBrokerCredential("/run/secrets/nonce", mock.io, 1234), /UNAVAILABLE/); assert.equal(mock.opened(), false);
});

test("dump gate reads only fixed proc state and accepts effective zero limits with nonpipe safe filename", async () => {
  const { verifyBrokerDumpProtection } = await import(brokerModulePath);
  const mock = credentialIO(), calls: string[] = [];
  for (const pattern of ["core\n", "core", "core.dump-001\n"]) {
    calls.length = 0;
    await verifyBrokerDumpProtection({ readFile: async (path: string, encoding: string) => {
      assert.equal(encoding, "utf8"); calls.push(path);
      return path === "/proc/sys/kernel/core_pattern" ? pattern : mock.io.readFile(path);
    } });
    assert.deepEqual(calls, ["/proc/self/limits", "/proc/self/coredump_filter", "/proc/sys/kernel/core_pattern"]);
  }
});
for (const [label, path, value] of [
  ["nonzero soft limit", "/proc/self/limits", "Max core file size 1 0 bytes\n"],
  ["nonzero hard limit", "/proc/self/limits", "Max core file size 0 1 bytes\n"],
  ["unlimited hard limit", "/proc/self/limits", "Max core file size 0 unlimited bytes\n"],
  ["missing limit", "/proc/self/limits", "Max open files 1024 4096 files\n"],
  ["ambiguous duplicate limit", "/proc/self/limits", "Max core file size 0 0 bytes\nMax core file size 0 0 bytes\n"],
  ["oversized limits", "/proc/self/limits", "x".repeat(8193)],
  ["nonzero filter", "/proc/self/coredump_filter", "00000033\n"],
  ["malformed filter", "/proc/self/coredump_filter", "0x0\n"],
  ["pipe handler", "/proc/sys/kernel/core_pattern", "|/usr/lib/systemd/systemd-coredump %P\n"],
  ["absolute path", "/proc/sys/kernel/core_pattern", "/tmp/core\n"],
  ["relative path", "/proc/sys/kernel/core_pattern", "../core\n"],
  ["substitution", "/proc/sys/kernel/core_pattern", "core.%p\n"],
  ["multiple lines", "/proc/sys/kernel/core_pattern", "core\ncore\n"],
  ["arguments", "/proc/sys/kernel/core_pattern", "core dump\n"],
  ["empty pattern", "/proc/sys/kernel/core_pattern", "\n"],
  ["oversized pattern", "/proc/sys/kernel/core_pattern", "a".repeat(129)],
] as const) test(`effective dump gate blocks ${label} before credential stat/open`, async () => {
  const { readProtectedBrokerCredential } = await import(brokerModulePath);
  const mock = credentialIO(), read = mock.io.readFile;
  let statCalled = false;
  mock.io.readFile = async (selected: string) => selected === path ? value : read(selected);
  mock.io.lstat = async () => { statCalled = true; throw new Error("credential metadata must remain unread"); };
  await assert.rejects(readProtectedBrokerCredential("/run/secrets/nonce", mock.io, 1234), /UNAVAILABLE/);
  assert.equal(statCalled, false); assert.equal(mock.opened(), false);
});
test("unreadable process dump state fails closed before credential access", async () => {
  const { readProtectedBrokerCredential } = await import(brokerModulePath);
  for (const blockedPath of ["/proc/self/limits", "/proc/self/coredump_filter", "/proc/sys/kernel/core_pattern"]) {
    const mock = credentialIO(), read = mock.io.readFile;
    mock.io.readFile = async (path: string) => { if (path === blockedPath) throw new Error("proc visibility unavailable"); return read(path); };
    await assert.rejects(readProtectedBrokerCredential("/run/secrets/nonce", mock.io, 1234));
    assert.equal(mock.opened(), false);
  }
});

function systemdCredentialIO(patch: Record<string,unknown>={},checked: Record<string,unknown>={}) {
  const directory="/run/credentials/mission-control-capability-nonce-publisher.service",path=`${directory}/github-token`;
  const mock=credentialIO({uid:0,gid:0,mode:0o100440,...patch},checked),read=mock.io.readFile,stat=mock.io.lstat;
  mock.io.readFile=async(selected:string)=>selected==="/proc/self/mountinfo" ? `30 20 0:30 / ${directory} ro,nosuid,nodev,noexec - tmpfs tmpfs rw\n` : read(selected);
  mock.io.lstat=async(selected:string)=>selected===path ? stat("/run/secrets/nonce") : selected===directory
    ? {isDirectory:()=>true,isSymbolicLink:()=>false,uid:0,gid:0,mode:0o40550} as never : stat(selected);
  return {...mock,path,directory,env:{CREDENTIALS_DIRECTORY:directory}};
}
test("accepts exact root-managed readonly systemd credential copy under service identity",async()=>{
  const {readProtectedBrokerCredential}=await import(brokerModulePath);
  const mock=systemdCredentialIO();
  assert.equal(await readProtectedBrokerCredential(mock.path,mock.io,1234,mock.env),credential);
  assert.ok(mock.opened());assert.ok(mock.closed());
});
test("systemd exception rejects missing or foreign credential directory environment",async()=>{
  const {readProtectedBrokerCredential,parseBrokerArguments}=await import(brokerModulePath);
  for(const env of [{},{CREDENTIALS_DIRECTORY:"/run/credentials/other.service"}]) {
    const mock=systemdCredentialIO();await assert.rejects(readProtectedBrokerCredential(mock.path,mock.io,1234,env),/UNAVAILABLE/);assert.equal(mock.opened(),false);
    assert.throws(()=>parseBrokerArguments([],{...env,MISSION_CONTROL_CAPABILITY_GITHUB_TOKEN_FILE:mock.path}),/UNAVAILABLE/);
  }
});
for(const [label,patch] of Object.entries({"wrong group":{gid:1000},"world readable":{mode:0o100444},"writable":{mode:0o100640},"symlink":{isSymbolicLink:()=>true},"hardlink":{nlink:2}})) test(`systemd exception rejects ${label}`,async()=>{
  const {readProtectedBrokerCredential}=await import(brokerModulePath);const mock=systemdCredentialIO(patch);
  await assert.rejects(readProtectedBrokerCredential(mock.path,mock.io,1234,mock.env),/UNAVAILABLE/);assert.equal(mock.opened(),false);
});
for(const [label,mount] of Object.entries({"missing":"","writable":"rw,nosuid - tmpfs tmpfs rw","disk filesystem":"ro - ext4 disk ro","unknown":"ro - proc proc ro"})) test(`systemd exception rejects ${label} mount`,async()=>{
  const {readProtectedBrokerCredential}=await import(brokerModulePath);const mock=systemdCredentialIO(),read=mock.io.readFile;
  mock.io.readFile=async selected=>selected==="/proc/self/mountinfo" ? mount ? `30 20 0:30 / ${mock.directory} ${mount}\n` : "" : read(selected);
  await assert.rejects(readProtectedBrokerCredential(mock.path,mock.io,1234,mock.env),/UNAVAILABLE/);assert.equal(mock.opened(),false);
});
test("systemd exception pins file group and owner again after open",async()=>{
  const {readProtectedBrokerCredential}=await import(brokerModulePath);
  for(const checked of [{gid:1000},{uid:1234}]) {const mock=systemdCredentialIO({},checked);await assert.rejects(readProtectedBrokerCredential(mock.path,mock.io,1234,mock.env),/UNAVAILABLE/);assert.ok(mock.closed());}
});
