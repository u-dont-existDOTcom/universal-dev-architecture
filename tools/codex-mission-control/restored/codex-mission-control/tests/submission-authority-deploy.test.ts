import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("VPS container keeps one loopback single-writer stack, durable state, and no embedded credentials", () => {
  const dockerfile = read("deploy/Dockerfile");
  const compose = read("deploy/compose.example.yaml");
  const healthcheck = read("deploy/healthcheck.mjs");
  const launcher = read("scripts/run-stack.mjs");
  assert.match(dockerfile, /FROM node:22\.23\.2-bookworm-slim/);
  assert.match(dockerfile, /apt-get install -y --no-install-recommends git=1:2\.39\.5-0\+deb12u3/);
  assert.match(dockerfile, /rm -rf \/var\/lib\/apt\/lists\/\*/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /PATH=\/app\/node_modules\/\.bin:\$PATH/);
  assert.match(dockerfile, /MISSION_CONTROL_DAEMON_HOST=127\.0\.0\.1/);
  assert.match(dockerfile, /CMD \["node", "scripts\/run-stack\.mjs", "start"\]/);
  assert.equal((dockerfile.match(/^CMD /gm) ?? []).length, 1);
  assert.match(compose, /network_mode: host/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /mission-control-state:\/data/);
  assert.match(compose, /no-new-privileges:true/);
  assert.match(healthcheck, /submissionAuthoritySchedulerState !== "ACTIVE_LEASE"/);
  assert.match(healthcheck, /submissionAuthorityLedger\?\.valid !== true/);
  assert.match(launcher, /Production start requires explicit owner-only runtime configuration/);
  assert.match(launcher, /MISSION_CONTROL_OWNER_TOKEN is required/);
  assert.doesNotMatch(launcher, /Mission Control local owner token|console\.(?:log|error).*OWNER_TOKEN/);
  for (const content of [dockerfile, compose, healthcheck, launcher]) {
    assert.doesNotMatch(content, /Bearer\s+[A-Za-z0-9_-]{20,}/);
    assert.doesNotMatch(content, /https:\/\/chatgpt\.com\/c\//);
  }
});

function read(relative: string) {
  return readFileSync(path.join(root, relative), "utf8");
}
