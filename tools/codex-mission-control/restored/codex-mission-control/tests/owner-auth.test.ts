import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { POST as login } from "../app/api/auth/login/route";
import {
  authenticateOwnerRequest, createOwnerSession, csrfCookieOptions, ownerCookieOptions,
  ownerCsrfCookie, ownerSessionCookie, verifyOwnerSessionToken,
} from "../lib/owner-auth";

const yearSeconds = 31_536_000;
const yearMilliseconds = yearSeconds * 1000;
const issuedAt = Date.parse("2026-10-09T00:00:00Z");
const origin = "https://mission-control.example";

function configureOwner(t: TestContext) {
  const settings = {
    MISSION_CONTROL_OWNER_TOKEN: randomBytes(32).toString("hex"),
    MISSION_CONTROL_SESSION_SECRET: randomBytes(32).toString("hex"),
    MISSION_CONTROL_OWNER_ID: "owner:test",
    MISSION_CONTROL_PUBLIC_ORIGIN: origin,
    MISSION_CONTROL_SECURE_COOKIES: undefined,
  };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  t.mock.method(Date, "now", () => issuedAt);
  return settings;
}

function loginRequest(token: string) {
  return new Request(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

test("documented local startup exports the session secret before starting the stack", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const setup = readme.match(/## Run locally[\s\S]*?```bash\n([\s\S]*?)```/);
  assert.ok(setup, "The local setup must include a shell example.");
  const secretExport = setup[1].match(/^export MISSION_CONTROL_SESSION_SECRET=['"][^'"]+['"]$/m);
  assert.ok(secretExport, "Local startup must supply a reusable session-signing secret.");
  const startup = setup[1].indexOf("npm run dev");
  assert.ok(startup >= 0 && setup[1].indexOf(secretExport[0]) < startup);
});

test("new owner sessions and default cookie options last exactly 365 days", (t) => {
  configureOwner(t);
  const session = createOwnerSession();
  assert.equal(session.maxAge, yearSeconds);
  assert.equal(ownerCookieOptions(), "Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000; Secure");
  assert.equal(csrfCookieOptions(), "Path=/; SameSite=Strict; Max-Age=31536000; Secure");
  assert.deepEqual(verifyOwnerSessionToken(session.token), {
    type: "owner_session", sub: "owner:test", issued_at: issuedAt, expires_at: issuedAt + yearMilliseconds,
  });

  t.mock.method(Date, "now", () => issuedAt + yearMilliseconds - 1);
  assert.ok(verifyOwnerSessionToken(session.token));
});

test("login issues session and CSRF cookies with Max-Age=31536000", async (t) => {
  const settings = configureOwner(t);
  const response = await login(loginRequest(settings.MISSION_CONTROL_OWNER_TOKEN));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${origin}/`);
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  for (const name of [ownerSessionCookie, ownerCsrfCookie]) {
    const cookie = cookies.find((value) => value.startsWith(`${name}=`));
    assert.ok(cookie);
    const [pair, ...options] = cookie.split("; ");
    assert.deepEqual(options, name === ownerSessionCookie
      ? ["Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=31536000", "Secure"]
      : ["Path=/", "SameSite=Strict", "Max-Age=31536000", "Secure"]);
    if (name === ownerSessionCookie) {
      const payload = verifyOwnerSessionToken(decodeURIComponent(pair.slice(name.length + 1)));
      assert.ok(payload);
      assert.equal(payload.issued_at, issuedAt);
      assert.equal(payload.expires_at - payload.issued_at, yearMilliseconds);
    }
  }
});

test("owner sessions are rejected at and after their one-year expiry", (t) => {
  configureOwner(t);
  const session = createOwnerSession();
  for (const now of [issuedAt + yearMilliseconds, issuedAt + yearMilliseconds + 1]) {
    t.mock.method(Date, "now", () => now);
    assert.equal(verifyOwnerSessionToken(session.token), null);
    const authentication = authenticateOwnerRequest(new Request(`${origin}/api/workers`, {
      headers: { cookie: `${ownerSessionCookie}=${session.token}` },
    }));
    assert.equal(authentication.ok, false);
    if (!authentication.ok) assert.equal(authentication.status, 401);
  }
});

test("owner sessions reject a tampered signed payload or signature", (t) => {
  configureOwner(t);
  const session = createOwnerSession();
  const [body, signature] = session.token.split(".");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  payload.expires_at += yearMilliseconds;
  const tamperedBody = Buffer.from(JSON.stringify(payload)).toString("base64url");
  assert.equal(verifyOwnerSessionToken(`${tamperedBody}.${signature}`), null);
  assert.equal(verifyOwnerSessionToken(`${body}.${signature}x`), null);
});

test("login refuses a wrong owner token without issuing either cookie", async (t) => {
  const settings = configureOwner(t);
  const response = await login(loginRequest(`${settings.MISSION_CONTROL_OWNER_TOKEN}x`));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Invalid owner credential." });
  assert.deepEqual(response.headers.getSetCookie(), []);
});
