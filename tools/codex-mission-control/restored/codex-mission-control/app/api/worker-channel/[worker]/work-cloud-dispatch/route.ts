import { daemonFetch, daemonMutationHeaders } from "@/lib/daemon-client";
import { parseGitHubReceiptPolicy } from "@/lib/github-decision-receipts";
import { authenticateIngestProducer } from "@/lib/ingestion-credentials";
import type { AuthenticatedProducer } from "@/lib/ingestion-auth";
import { prepareWorkCloudAutoDispatch } from "@/lib/chatgpt-work-cloud-autodispatch";
import type { StoredEvent } from "@/lib/schema";

interface WorkCloudDispatchRequestBody {
  sourceChatTitle: string;
  sourceChatUrl: string;
  sourceChatBrowserUrl?: string | null;
  chatgptProjectId?: string | null;
  capabilityEvidence: {
    observedAt: string;
    appVersion: string;
    createThreadTargetAvailable: boolean;
    sendMessageToThreadAvailable: boolean;
    nativeSurfaceVerificationAvailable: boolean;
  };
}

export async function POST(request: Request, context: { params: Promise<{ worker: string }> }) {
  const { worker } = await context.params;
  const authentication = authenticateIngestProducer(
    process.env.MISSION_CONTROL_INGEST_CREDENTIALS,
    request.headers.get("x-mission-control-producer-id"),
    request.headers.get("authorization"),
  );
  const policy = parseGitHubReceiptPolicy();
  const trustedRelays = new Set(policy?.requestBound?.relayProducerIds ?? []);
  if (!authentication.ok || authentication.producer.kind !== "COLLECTOR"
    || !trustedRelays.has(authentication.producer.id)
    || !authentication.producer.workerScopes.includes("*") && !authentication.producer.workerScopes.includes(worker)) {
    return Response.json({ error: "Unauthorized native Work dispatch request." }, { status: authentication.ok ? 403 : 401 });
  }

  try {
    if (!policy) throw new Error("GitHub supervisory receipt policy is not configured.");
    const body = parseBody(await request.json());
    const historyResponse = await daemonFetch("/events");
    if (!historyResponse.ok) throw new Error("Mission Control event history is unavailable.");
    const historyBody = await historyResponse.json() as { events?: StoredEvent[] };
    if (!Array.isArray(historyBody.events)) throw new Error("Mission Control event history is invalid.");

    const now = new Date().toISOString();
    const systemProducer: AuthenticatedProducer = {
      id: "system:chatgpt-work-cloud-dispatch",
      kind: "SYSTEM",
      workerScopes: [worker],
      taskScopes: ["*"],
    };
    const prepared = prepareWorkCloudAutoDispatch(historyBody.events, {
      worker,
      sourceChatTitle: body.sourceChatTitle,
      sourceChatUrl: body.sourceChatUrl,
      sourceChatBrowserUrl: body.sourceChatBrowserUrl ?? null,
      chatgptProjectId: body.chatgptProjectId ?? null,
      capabilityEvidence: {
        observedAt: body.capabilityEvidence.observedAt,
        appVersion: body.capabilityEvidence.appVersion,
        createThreadTargetAvailable: body.capabilityEvidence.createThreadTargetAvailable,
        sendMessageToThreadAvailable: body.capabilityEvidence.sendMessageToThreadAvailable,
        nativeSurfaceVerificationAvailable: body.capabilityEvidence.nativeSurfaceVerificationAvailable,
      },
      receiptTarget: `https://github.com/${policy.repository}/issues/${policy.stageIssueNumber}`,
      requestedAt: now,
      producerId: systemProducer.id,
    });

    const existingRequest = historyBody.events.find((event) => event.eventId === prepared.requestEnvelope.event_id);
    const requestAlreadyExisted = Boolean(existingRequest);
    if (!existingRequest) {
      const upstream = await daemonFetch("/events", {
        method: "POST",
        headers: daemonMutationHeaders(systemProducer, { "content-type": "application/json" }),
        body: JSON.stringify(prepared.requestEnvelope),
      });
      const payload = await upstream.json().catch(() => ({})) as { event?: unknown; error?: string };
      if (!upstream.ok) {
        return Response.json({ error: payload.error ?? "Mission Control could not persist the native Work dispatch request." }, { status: upstream.status });
      }
    }

    return Response.json({
      dispatchId: prepared.dispatchId,
      requestAlreadyExisted,
      status: prepared.existingExecutionReceipt ? "EXECUTION_RECEIPT_RECORDED"
        : prepared.existingResult?.status ?? "REQUESTED",
      requestedWorkTitle: prepared.requestEnvelope.data.type === "chatgpt_work_cloud_dispatch_requested"
        ? prepared.requestEnvelope.data.requested_work_title : null,
      workPromptSha256: prepared.workPromptSha256,
      handoffPrompt: prepared.existingResult ? null : prepared.handoffPrompt,
      receiptTarget: prepared.receiptTarget,
      dispatchResult: prepared.existingResult,
      executionReceipt: prepared.existingExecutionReceipt,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid native Work dispatch request." }, { status: 400 });
  }
}

function parseBody(value: unknown): WorkCloudDispatchRequestBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Native Work dispatch body must be an object.");
  const body = value as Record<string, unknown>;
  const sourceChatTitle = nonEmpty(body.sourceChatTitle, "sourceChatTitle");
  const sourceChatUrl = nonEmpty(body.sourceChatUrl, "sourceChatUrl");
  if (!/^chatgpt-conversation:\/\/[A-Za-z0-9-]+$/.test(sourceChatUrl)) throw new Error("sourceChatUrl must be an exact chatgpt-conversation URI.");
  const sourceChatBrowserUrl = body.sourceChatBrowserUrl === null || body.sourceChatBrowserUrl === undefined
    ? null : nonEmpty(body.sourceChatBrowserUrl, "sourceChatBrowserUrl");
  if (sourceChatBrowserUrl && !sourceChatBrowserUrl.startsWith("https://chatgpt.com/")) throw new Error("sourceChatBrowserUrl must be a ChatGPT HTTPS URL.");
  const chatgptProjectId = body.chatgptProjectId === null || body.chatgptProjectId === undefined
    ? null : nonEmpty(body.chatgptProjectId, "chatgptProjectId");
  const capability = body.capabilityEvidence;
  if (!capability || typeof capability !== "object" || Array.isArray(capability)) throw new Error("capabilityEvidence is required.");
  const evidence = capability as Record<string, unknown>;
  const observedAt = nonEmpty(evidence.observedAt, "capabilityEvidence.observedAt");
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error("capabilityEvidence.observedAt must be an ISO timestamp.");
  return {
    sourceChatTitle,
    sourceChatUrl,
    sourceChatBrowserUrl,
    chatgptProjectId,
    capabilityEvidence: {
      observedAt,
      appVersion: nonEmpty(evidence.appVersion, "capabilityEvidence.appVersion"),
      createThreadTargetAvailable: bool(evidence.createThreadTargetAvailable, "createThreadTargetAvailable"),
      sendMessageToThreadAvailable: bool(evidence.sendMessageToThreadAvailable, "sendMessageToThreadAvailable"),
      nativeSurfaceVerificationAvailable: bool(evidence.nativeSurfaceVerificationAvailable, "nativeSurfaceVerificationAvailable"),
    },
  };
}

function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
  return value;
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} must be boolean.`);
  return value;
}
