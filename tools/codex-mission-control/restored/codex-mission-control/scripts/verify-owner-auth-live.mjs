import fs from "node:fs";
import path from "node:path";

const baseUrl = argument("--base-url") ?? "http://127.0.0.1:3000";
const output = argument("--output");
const ownerToken = process.env.MISSION_CONTROL_OWNER_TOKEN;
if (!ownerToken || ownerToken.length < 32) throw new Error("MISSION_CONTROL_OWNER_TOKEN is required.");
const origin = new URL(baseUrl).origin;
const statuses = {};
statuses.unauthenticatedRead = (await fetch(`${baseUrl}/api/workers`)).status;
statuses.wrongBearer = (await fetch(`${baseUrl}/api/workers`, { headers: { authorization: "Bearer definitely-not-the-owner" } })).status;
statuses.wrongLogin = (await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST", redirect: "manual", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: "wrong-owner-token-000000000000000000000" }),
})).status;
const login = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST", redirect: "manual", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: ownerToken }),
});
statuses.login = login.status;
const setCookies = login.headers.getSetCookie();
const cookie = setCookies.map((value) => value.split(";", 1)[0]).join("; ");
const csrf = decodeURIComponent(cookie.split("; ").find((value) => value.startsWith("mc_owner_csrf="))?.split("=").slice(1).join("=") ?? "");
statuses.sessionRead = (await fetch(`${baseUrl}/api/workers`, { headers: { cookie } })).status;
statuses.missingCsrf = (await fetch(`${baseUrl}/api/viewed`, { method: "POST", headers: { cookie, origin } })).status;
statuses.foreignOrigin = (await fetch(`${baseUrl}/api/viewed`, { method: "POST", headers: { cookie, origin: "https://attacker.invalid", "x-mission-control-csrf": csrf } })).status;
statuses.validMutation = (await fetch(`${baseUrl}/api/viewed`, { method: "POST", headers: { cookie, origin, "x-mission-control-csrf": csrf } })).status;
statuses.ownerBearerRead = (await fetch(`${baseUrl}/api/workers`, { headers: { authorization: `Bearer ${ownerToken}` } })).status;
const expected = { unauthenticatedRead: 401, wrongBearer: 401, wrongLogin: 401, login: 303, sessionRead: 200, missingCsrf: 403, foreignOrigin: 403, validMutation: 200, ownerBearerRead: 200 };
if (JSON.stringify(statuses) !== JSON.stringify(expected)) throw new Error(`Owner auth acceptance failed: ${JSON.stringify(statuses)}`);
const receipt = { acceptance: "PASS", checkedAt: new Date().toISOString(), statuses, controls: ["distinct owner principal", "signed HttpOnly SameSite session", "double-submit CSRF", "exact origin", "loopback default", "HTTPS required for non-loopback"] };
const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
if (output) {
  const target = path.resolve(output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, serialized, { flag: "wx" });
}
process.stdout.write(serialized);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}
