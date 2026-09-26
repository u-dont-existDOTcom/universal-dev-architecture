import assert from "node:assert/strict";
import test from "node:test";

import {
  dispatchChatGptWorkCloud,
  type WorkCloudAppExecutor,
  type WorkCloudDispatchInput,
  type WorkCloudExecutorOutcome,
} from "../lib/chatgpt-work-cloud-dispatch";

const now = "2026-09-26T00:00:00.000Z";

function input(): WorkCloudDispatchInput {
  return {
    dispatchId: "dispatch:approval-state:test",
    mode: "CREATE",
    binding: {
      worker: "approval-state-test",
      directiveId: "directive:approval-state:test",
      directiveRevision: 1,
      taskId: "task:approval-state:test",
      directiveArtifactSha256: "1".repeat(64),
      sourceMessageId: "source:approval-state:test",
      sourceBodySha256: "2".repeat(64),
    },
    sourceChatTitle: "Approval-state test",
    sourceChatUrl: "chatgpt-conversation://approval-state-test",
    requestedWorkTitle: "Work — Approval-state test",
    chatgptProjectId: null,
    existingWorkThreadId: null,
    prompt: "Execute the bounded test directive.",
    capabilityEvidence: {
      observedAt: now,
      appVersion: "test",
      createThreadTargetAvailable: true,
      sendMessageToThreadAvailable: true,
      nativeSurfaceVerificationAvailable: true,
    },
    requestedAt: now,
    producerId: "system:chatgpt-work-cloud-dispatch",
  };
}

function executor(outcome: WorkCloudExecutorOutcome): WorkCloudAppExecutor {
  return {
    createThread: async () => outcome,
    sendMessageToThread: async () => outcome,
  };
}

test("PENDING_SETUP does not imply owner approval", async () => {
  const result = await dispatchChatGptWorkCloud(
    input(),
    executor({ kind: "PENDING_SETUP", clientThreadId: "local-chatgpt:test" }),
  );
  assert.equal(result.result.data.type, "chatgpt_work_cloud_dispatch_recorded");
  if (result.result.data.type !== "chatgpt_work_cloud_dispatch_recorded") return;
  assert.equal(result.result.data.status, "PENDING_SETUP");
  assert.equal(result.result.data.approval_state, "NOT_REQUIRED");
});

test("explicit PENDING_APPROVAL remains an owner approval gate", async () => {
  const result = await dispatchChatGptWorkCloud(
    input(),
    executor({ kind: "PENDING_APPROVAL" }),
  );
  assert.equal(result.result.data.type, "chatgpt_work_cloud_dispatch_recorded");
  if (result.result.data.type !== "chatgpt_work_cloud_dispatch_recorded") return;
  assert.equal(result.result.data.status, "PENDING_APPROVAL");
  assert.equal(result.result.data.approval_state, "PENDING_OWNER_ACCEPT");
});
