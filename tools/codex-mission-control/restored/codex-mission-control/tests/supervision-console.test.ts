import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// npm runs this suite with the Mission Control package as cwd. Avoid
// import.meta.dirname here because tsx executes this package in CommonJS mode.
const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("the supervision console exposes authenticated overall and specialist ChatGPT truth", () => {
  const source = read("components/SupervisionConsole.tsx");
  assert.match(source, /PERMANENT PROJECT MANAGER CHAT/);
  assert.match(source, /Open specialist chat/);
  assert.match(source, /REGISTERED · REACHABLE · SOURCE BOUND/);
  assert.match(source, /Fresh authenticated provider\/browser evidence is required/);
  assert.match(source, /Provider transport, reachability, source binding, route state, and reasoning age above come from authenticated Mission Control authority/);
  assert.match(source, /owner→worker messaging remains a separate channel/i);
  assert.match(source, /immutable_provider_locator/);
  assert.match(source, /provenance_status/);
  assert.doesNotMatch(source, /NOT_CONNECTED|NO REAL CHAT LINK OR PROVIDER MESSAGE|does not pretend to be an inline ChatGPT composer/);
});

test("global navigation makes the supervision console directly reachable", () => {
  const layout = read("app/layout.tsx");
  const page = read("app/supervision/page.tsx");
  assert.match(layout, /href="\/supervision"/);
  assert.match(layout, /Project Manager & supervisors/);
  assert.match(page, /SupervisionConsole/);
});

test("secret-free runtime status reports persistence and live supervision capability gaps", () => {
  const route = read("app/api/runtime-status/route.ts");
  assert.match(route, /persistentVolumeEvidence/);
  assert.match(route, /projectManagerMessages/);
  assert.match(route, /realSupervisorLinks/);
  assert.match(route, /providerBoundChatTransportObserved/);
  assert.match(route, /inlineProjectManagerComposerAvailable: false/);
  assert.doesNotMatch(route, /MISSION_CONTROL_OWNER_TOKEN/);
  assert.doesNotMatch(route, /MISSION_CONTROL_INTERNAL_TOKEN/);
});

test("the live operator-status BFF is owner-authenticated and uses an internal principal", () => {
  const route = read("app/api/operator-status/route.ts");
  assert.match(route, /authenticateOwnerRequest/);
  assert.match(route, /ownerAuthFailure/);
  assert.match(route, /daemonMutationHeaders\(authentication\.principal\)/);
  assert.match(route, /relayJson\("\/operator-status"/);
  assert.doesNotMatch(route, /MISSION_CONTROL_OWNER_TOKEN|MISSION_CONTROL_INTERNAL_TOKEN/);
});

test("the live owner-window probe covers fleet, supervision, one real worker, operator status, and SSE without printing secrets", () => {
  const script = read("scripts/verify-owner-supervision-live.mjs");
  assert.match(script, /fleet: "\/"/);
  assert.match(script, /supervision: "\/supervision"/);
  assert.match(script, /`\/worker\/\$\{encodeURIComponent\(worker\)\}`/);
  assert.match(script, /\/api\/operator-status/);
  assert.match(script, /\/api\/events\/stream/);
  assert.match(script, /MISSION_CONTROL_SINGLE_WRITER/);
  assert.match(script, /runtimeKind === "FIXTURE"/);
  assert.doesNotMatch(script, /process\.stdout\.write.*ownerToken|console\.log.*ownerToken/);
});
