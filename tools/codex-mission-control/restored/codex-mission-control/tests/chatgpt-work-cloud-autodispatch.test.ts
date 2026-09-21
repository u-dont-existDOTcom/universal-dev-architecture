import assert from "node:assert/strict";
import test from "node:test";

import { sha256 } from "../lib/canonical";
import {
  prepareWorkCloudAutoDispatch,
  WORK_CLOUD_DISPATCH_RECEIPT_PREFIX,
  WORK_CLOUD_EXECUTION_RECEIPT_PREFIX,
} from "../lib/chatgpt-work-cloud-autodispatch";
import type { StoredEvent } from "../lib/schema";

const worker = "mission-control-live-slice";
const directiveId = "directive:work-cloud";
const taskId = "task:work-cloud";
const receiptEventId = "receipt:event";

function baseEvents(): StoredEvent[] {
  return [
    {
      eventId: receiptEventId,
      missionId: "mission-control-live",
      worker,
      sequence: 1,
      occurredAt: "2026-09-19T19:00:00.000Z",
      type: "github_decision_receipt_ingested",
      data: {
        type: "github_decision_receipt_ingested",
        bounded_execution: {
          job_id: "job-work-cloud",
          task_id: taskId,
          objective_id: "objective-work-cloud",
          direct_owner_outcome: "Finish the implementation.",
          job_type: "CORRECTION",
          execution_surface: "CHATGPT_WORK_CLOUD",
          scope: { repos: ["u-dont-existDOTcom/universal-dev-architecture"], files: [], services: [], systems: [] },
          objective: "Implement the bounded change.",
          exact_owner_requirements: ["No manual copy paste."],
          explicit_non_goals: [],
          acceptance_criteria: ["Receipt returns to Mission Control."],
          required_tests: ["focused tests"],
          security_risks: [],
          data_risks: [],
          migration_risks: [],
          allowed_tactical_freedom: ["implementation detail"],
          forbidden_actions: ["change owner intent"],
          stop_triggers: ["receipt recorded"],
          required_receipt: ["status"],
          semantic_authority: "NONE",
          prompt: "RUN THE EXACT BOUNDED WORK DIRECTIVE",
          deadline: "2026-09-20T00:00:00.000Z",
          work_execution_profile: {
            profileId: "sol-medium",
            model: "GPT-5.6 Sol",
            effort: "medium",
            routingTier: "ORDINARY",
            assuranceRequirement: "SET_REQUEST_SUFFICIENT",
            fastModeRequest: "DO_NOT_ENABLE_FAST",
            rationale: "bounded implementation",
          },
        },
      },
    },
    {
      eventId: "directive:event",
      missionId: "mission-control-live",
      worker,
      sequence: 2,
      occurredAt: "2026-09-19T19:01:00.000Z",
      type: "execution_directive_recorded",
      data: {
        type: "execution_directive_recorded",
        worker,
        directive_id: directiveId,
        directive_revision: 1,
        task_id: taskId,
        directive_schema_version: 3,
        source_message_id: "message:source",
        source_body_sha256: "1".repeat(64),
        directive_artifact_sha256: "2".repeat(64),
        directive_artifact_ref: "github://directive",
        execution_surface: "CHATGPT_WORK_CLOUD",
        execution_objective: "Implement bounded change.",
        allowed_actions: ["bounded implementation"],
        forbidden_actions: ["scope expansion"],
        allowed_tactical_freedom: ["implementation detail"],
        stop_triggers: ["receipt recorded"],
        required_evidence: ["tests"],
        assumptions: [],
        executor_semantic_authority: "NONE",
        issued_at: "2026-09-19T19:01:00.000Z",
        expires_at: "2026-09-20T00:00:00.000Z",
        validated_decision_proof: {
          authority_path: "VALIDATED_GITHUB_SUPERVISORY_DECISION",
          receipt_event_id: receiptEventId,
          receipt_id: "receipt-1",
          receipt_sha256: "3".repeat(64),
          github_comment_id: 1,
          github_immutable_url: "https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/59#issuecomment-1",
          github_author_login: "u-dont-existDOTcom",
          decision_block_sha256: "4".repeat(64),
          bounded_execution_sha256: "5".repeat(64),
        },
        work_execution_profile: {
          profileId: "sol-medium",
          model: "GPT-5.6 Sol",
          effort: "medium",
          routingTier: "ORDINARY",
          assuranceRequirement: "SET_REQUEST_SUFFICIENT",
          fastModeRequest: "DO_NOT_ENABLE_FAST",
          rationale: "bounded implementation",
        },
        status: "ACTIVE",
      },
    },
  ] as unknown as StoredEvent[];
}

test("auto-dispatch derives exact Work lineage and privacy-safe receipt wrappers", () => {
  const prepared = prepareWorkCloudAutoDispatch(baseEvents(), {
    worker,
    sourceChatTitle: "Goal Alignment",
    sourceChatUrl: "chatgpt-conversation://abc-123",
    sourceChatBrowserUrl: "https://chatgpt.com/c/abc-123",
    chatgptProjectId: null,
    capabilityEvidence: {
      observedAt: "2026-09-19T19:05:00.000Z",
      appVersion: "VERSIONED_PRODUCT_SCHEMA_2026-09-19",
      createThreadTargetAvailable: true,
      sendMessageToThreadAvailable: true,
      nativeSurfaceVerificationAvailable: true,
    },
    receiptTarget: "https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/61",
    requestedAt: "2026-09-19T19:05:00.000Z",
    producerId: "system:chatgpt-work-cloud-dispatch",
  });
  assert.equal(prepared.requestEnvelope.data.type, "chatgpt_work_cloud_dispatch_requested");
  if (prepared.requestEnvelope.data.type !== "chatgpt_work_cloud_dispatch_requested") return;
  assert.equal(prepared.requestEnvelope.data.source, "MISSION_CONTROL_SUPERVISOR_WORK_DISPATCH");
  assert.equal(prepared.requestEnvelope.data.requested_work_title, "Work — Goal Alignment");
  assert.equal(prepared.requestEnvelope.data.source_chat_browser_url, "https://chatgpt.com/c/abc-123");
  assert.equal(prepared.requestEnvelope.data.prompt_sha256, sha256(prepared.workPrompt));
  assert.equal(prepared.workPromptSha256, sha256(prepared.workPrompt));
  assert.match(prepared.workPrompt, /RUN THE EXACT BOUNDED WORK DIRECTIVE/);
  assert.match(prepared.workPrompt, new RegExp(WORK_CLOUD_EXECUTION_RECEIPT_PREFIX.trim()));
  assert.match(prepared.handoffPrompt, new RegExp(WORK_CLOUD_DISPATCH_RECEIPT_PREFIX.trim()));
  assert.match(prepared.handoffPrompt, /Do not substitute Codex/);
});

test("auto-dispatch rejects a Codex/default execution surface", () => {
  const events = baseEvents() as unknown as Array<any>;
  events[1].data.execution_surface = "CODEX";
  assert.throws(() => prepareWorkCloudAutoDispatch(events as StoredEvent[], {
    worker,
    sourceChatTitle: "Goal Alignment",
    sourceChatUrl: "chatgpt-conversation://abc-123",
    sourceChatBrowserUrl: "https://chatgpt.com/c/abc-123",
    chatgptProjectId: null,
    capabilityEvidence: {
      observedAt: "2026-09-19T19:05:00.000Z",
      appVersion: "VERSIONED_PRODUCT_SCHEMA_2026-09-19",
      createThreadTargetAvailable: true,
      sendMessageToThreadAvailable: true,
      nativeSurfaceVerificationAvailable: true,
    },
    receiptTarget: "https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/61",
    requestedAt: "2026-09-19T19:05:00.000Z",
    producerId: "system:chatgpt-work-cloud-dispatch",
  }), /CHATGPT_WORK_CLOUD execution directive/);
});
