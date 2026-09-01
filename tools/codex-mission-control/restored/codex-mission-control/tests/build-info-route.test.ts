import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routePath = path.join(appRoot, "app/api/build-info/route.ts");

test("public build-info route exposes only non-secret release identity", () => {
  const source = fs.readFileSync(routePath, "utf8");

  for (const required of [
    'authorityGateVersion: "chat-work-authority-v1"',
    "RAILWAY_GIT_COMMIT_SHA",
    "RAILWAY_GIT_BRANCH",
    "RAILWAY_DEPLOYMENT_ID",
    "chatWorkAuthorityGate: true",
    "reasoningMessageTranscript: true",
    "automaticInternalSupervisorRoutingPolicy: true",
    '"Cache-Control": "no-store, max-age=0"',
  ]) {
    assert.ok(source.includes(required), `missing build identity field: ${required}`);
  }

  for (const forbidden of [
    "MISSION_CONTROL_OWNER_TOKEN",
    "MISSION_CONTROL_INGEST_TOKEN",
    "MISSION_CONTROL_OWNER_SESSION_SECRET",
    "process.env.OPENAI_API_KEY",
    "process.env.ANTHROPIC_API_KEY",
    "workerState",
    "eventBody",
  ]) {
    assert.equal(source.includes(forbidden), false, `public route exposes forbidden material: ${forbidden}`);
  }

  assert.ok(source.includes("does not prove that provider-bound ChatGPT transports"));
});
