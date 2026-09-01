import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// npm runs this suite with the Mission Control package as cwd. Avoid
// import.meta.dirname here because tsx executes this package in CommonJS mode.
const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("the supervision console exposes overall and specialist ChatGPT truth without inventing a composer", () => {
  const source = read("components/SupervisionConsole.tsx");
  assert.match(source, /OVERALL PROJECT MANAGER CHAT/);
  assert.match(source, /Open specialist chat/);
  assert.match(source, /NO REAL CHAT LINK OR PROVIDER MESSAGE/);
  assert.match(source, /does not pretend to be an inline ChatGPT composer/);
  assert.match(source, /owner→worker messaging is a separate channel/i);
  assert.match(source, /immutable_provider_locator/);
  assert.match(source, /provenance_status/);
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
