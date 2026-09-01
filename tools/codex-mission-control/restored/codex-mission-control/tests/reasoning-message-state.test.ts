import assert from "node:assert/strict";
import test from "node:test";
import { decisionRouteStates, latestVerifiedReasoningMessage } from "../lib/reasoning-message-state";
import type { MissionControlEventV2, StoredEvent } from "../lib/schema";

function reasoningEvent(sequence: number, data: Partial<Extract<MissionControlEventV2, { type: "reasoning_message_recorded" }>> & Pick<Extract<MissionControlEventV2, { type: "reasoning_message_recorded" }>, "message_id" | "surface_role" | "author_role" | "body_sha256">): StoredEvent {
  const message: Extract<MissionControlEventV2, { type: "reasoning_message_recorded" }> = {
    type: "reasoning_message_recorded",
    worker: "somatic-humanization",
    thread_id: data.surface_role === "SUPERVISOR" ? "thread:supervisor" : "thread:pm",
    provider_surface: "CHATGPT_CONSUMER",
    model_mode: data.author_role === "OWNER" ? "UNKNOWN" : "GPT-5.6 Pro",
    account_workspace: "owner-primary",
    sent_at_source: `2026-09-01T13:0${sequence}:00.000Z`,
    received_at_mission_control: `2026-09-01T13:0${sequence}:02.000Z`,
    exact_visible_body: `message ${sequence}`,
    immutable_provider_locator: `https://chatgpt.com/c/test#${data.message_id}`,
    parent_message_id: null,
    owner_direction_id: "direction:somatic:001",
    decision_request_id: "decision-request:somatic:001",
    acquisition_method: "PROVIDER_DIRECT",
    provenance_status: "VERIFIED",
    limitations: [],
    recorded_by: "collector:chatgpt",
    ...data,
  };
  return {
    id: sequence,
    sequence,
    eventId: `event:${sequence}`,
    schemaVersion: 2,
    missionId: "mission-control-live",
    worker: message.worker,
    type: message.type,
    occurredAt: message.received_at_mission_control,
    receivedAt: message.received_at_mission_control,
    previousHash: null,
    eventHash: String(sequence).padStart(64, "0"),
    producerId: message.recorded_by,
    producerKind: "COLLECTOR",
    data: message,
  };
}

test("direct owner reply requires a later supervisor resolution", () => {
  const request = reasoningEvent(1, {
    message_id: "message:request",
    surface_role: "SUPERVISOR",
    author_role: "ASSISTANT",
    body_sha256: "a".repeat(64),
  });
  const owner = reasoningEvent(2, {
    message_id: "message:owner-direct",
    surface_role: "SUPERVISOR",
    author_role: "OWNER",
    parent_message_id: "message:request",
    body_sha256: "b".repeat(64),
  });
  assert.equal(decisionRouteStates([request, owner])[0].status, "SUPERVISOR_RESOLUTION_REQUIRED");
  const resolution = reasoningEvent(3, {
    message_id: "message:resolution",
    surface_role: "SUPERVISOR",
    author_role: "ASSISTANT",
    parent_message_id: "message:owner-direct",
    body_sha256: "c".repeat(64),
  });
  assert.equal(decisionRouteStates([request, owner, resolution])[0].status, "RESOLVED");
});

test("PM reply must be copied verbatim into the supervisor thread", () => {
  const request = reasoningEvent(1, {
    message_id: "message:request",
    surface_role: "SUPERVISOR",
    author_role: "ASSISTANT",
    body_sha256: "a".repeat(64),
  });
  const pmResponse = reasoningEvent(2, {
    message_id: "message:owner-pm",
    surface_role: "PROJECT_MANAGER",
    author_role: "OWNER",
    parent_message_id: "message:request",
    body_sha256: "b".repeat(64),
  });
  assert.equal(decisionRouteStates([request, pmResponse])[0].status, "VERBATIM_FORWARD_REQUIRED");
  const alteredForward = reasoningEvent(3, {
    message_id: "message:altered-forward",
    surface_role: "SUPERVISOR",
    author_role: "OWNER",
    parent_message_id: "message:owner-pm",
    body_sha256: "d".repeat(64),
  });
  assert.equal(decisionRouteStates([request, pmResponse, alteredForward])[0].status, "INVALID_BINDING");
  const verbatimForward = reasoningEvent(3, {
    message_id: "message:verbatim-forward",
    surface_role: "SUPERVISOR",
    author_role: "OWNER",
    parent_message_id: "message:owner-pm",
    body_sha256: "b".repeat(64),
  });
  assert.equal(decisionRouteStates([request, pmResponse, verbatimForward])[0].status, "SUPERVISOR_RESOLUTION_REQUIRED");
});

test("verified chat ordering uses source sent time rather than repository event time", () => {
  const laterLedgerEarlierMessage = reasoningEvent(2, {
    message_id: "message:older",
    surface_role: "PROJECT_MANAGER",
    author_role: "ASSISTANT",
    body_sha256: "a".repeat(64),
    sent_at_source: "2026-09-01T12:00:00.000Z",
  });
  const earlierLedgerNewerMessage = reasoningEvent(1, {
    message_id: "message:newer",
    surface_role: "PROJECT_MANAGER",
    author_role: "ASSISTANT",
    body_sha256: "b".repeat(64),
    sent_at_source: "2026-09-01T13:00:00.000Z",
  });
  assert.equal(latestVerifiedReasoningMessage([laterLedgerEarlierMessage, earlierLedgerNewerMessage])?.data.message_id, "message:newer");
});
