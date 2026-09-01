import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { ReasoningTranscript } from "../components/ReasoningTranscript";
import { producerMayEmit, type AuthenticatedProducer } from "../lib/ingestion-auth";
import { parseEventV2, type MissionControlEventV2, type StoredEvent } from "../lib/schema";

const exactBody = "The supervisor needs Joel to choose whether this experiment should continue or stop.";
const assistantMessage = {
  type: "reasoning_message_recorded",
  worker: "somatic-humanization",
  message_id: "chat-message:supervisor:001",
  thread_id: "chat-thread:somatic-supervisor",
  surface_role: "SUPERVISOR",
  provider_surface: "CHATGPT_CONSUMER",
  model_mode: "GPT-5.6 Pro",
  account_workspace: "owner-primary",
  author_role: "ASSISTANT",
  sent_at_source: "2026-09-01T13:12:34.000Z",
  received_at_mission_control: "2026-09-01T13:12:40.000Z",
  body_sha256: createHash("sha256").update(exactBody).digest("hex"),
  exact_visible_body: exactBody,
  immutable_provider_locator: "https://chatgpt.com/c/example#message-001",
  parent_message_id: null,
  owner_direction_id: "direction:somatic:001",
  decision_request_id: "decision-request:somatic:001",
  acquisition_method: "PROVIDER_DIRECT",
  provenance_status: "VERIFIED",
  limitations: [],
  recorded_by: "supervisor:somatic",
} as const;

const supervisor: AuthenticatedProducer = {
  id: "supervisor:somatic",
  kind: "SUPERVISOR",
  workerScopes: ["somatic-humanization"],
  taskScopes: ["*"],
};
const worker: AuthenticatedProducer = {
  id: "worker:somatic-humanization",
  kind: "WORKER",
  workerScopes: ["somatic-humanization"],
  taskScopes: ["*"],
};

test("verified supervisor messages are first-class while a Codex worker cannot impersonate the surface", () => {
  const parsed = parseEventV2(assistantMessage);
  assert.equal(parsed.type, "reasoning_message_recorded");
  assert.equal(producerMayEmit(supervisor, parsed), true);
  assert.equal(producerMayEmit(worker, parsed), false);
});

test("Codex-copied summaries cannot claim verified ChatGPT provenance", () => {
  assert.throws(() => parseEventV2({
    ...assistantMessage,
    acquisition_method: "CODEX_COPIED",
    provenance_status: "VERIFIED",
  }), /CODEX_COPIED/);
});

test("owner-attested owner messages are permitted but remain distinct from provider verification", () => {
  const ownerProducer: AuthenticatedProducer = {
    id: "owner:dashboard",
    kind: "OWNER_AUTHORITY",
    workerScopes: ["somatic-humanization"],
    taskScopes: ["*"],
  };
  const event = parseEventV2({
    ...assistantMessage,
    message_id: "chat-message:owner:001",
    author_role: "OWNER",
    acquisition_method: "OWNER_ATTESTED",
    provenance_status: "OWNER_ATTESTED",
    recorded_by: "owner:dashboard",
  });
  assert.equal(event.type, "reasoning_message_recorded");
  if (event.type !== "reasoning_message_recorded") throw new Error("Expected a reasoning_message_recorded event.");
  assert.equal(producerMayEmit(ownerProducer, event), true);
  assert.equal(event.provenance_status, "OWNER_ATTESTED");
});

test("the transcript renders exact Dakar source time, UTC provenance, body hash, and owner decision binding", () => {
  const data = parseEventV2(assistantMessage) as MissionControlEventV2;
  const stored: StoredEvent = {
    id: 1,
    sequence: 1,
    eventId: "event:reasoning-message:001",
    schemaVersion: 2,
    missionId: "mission-control-live",
    worker: "somatic-humanization",
    type: data.type,
    occurredAt: "2026-09-01T13:12:40.000Z",
    receivedAt: "2026-09-01T13:12:40.000Z",
    previousHash: null,
    eventHash: "a".repeat(64),
    producerId: supervisor.id,
    producerKind: supervisor.kind,
    data,
  };
  const html = renderToStaticMarkup(createElement(ReasoningTranscript, { timeline: [stored] }));
  assert.match(html, /2026-09-01 13:12:34 Africa\/Dakar/);
  assert.match(html, /2026-09-01T13:12:34\.000Z/);
  assert.match(html, /VERIFIED MESSAGE-LEVEL SOURCE TIME/);
  assert.match(html, /OWNER DECISION REQUEST/);
  assert.match(html, new RegExp(assistantMessage.body_sha256));
  assert.match(html, new RegExp(exactBody));
});
