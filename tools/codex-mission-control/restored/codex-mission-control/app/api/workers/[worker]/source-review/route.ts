import { daemonFetch, daemonMutationHeaders } from "@/lib/daemon-client";
import { loadConfiguredSupervisorChats } from "@/lib/configured-supervisor-chats";
import { parseGitHubReceiptPolicy } from "@/lib/github-decision-receipts";
import type { AuthenticatedProducer } from "@/lib/ingestion-auth";
import { inBandRequestRoutePrefix } from "@/lib/in-band-request-binding";
import { authenticateOwnerRequest, ownerAuthFailure } from "@/lib/owner-auth";
import { acknowledgeRequestBoundRoute } from "@/lib/request-bound-supervision";
import {
  buildSourceReviewRouteEnvelope,
  SOURCE_REVIEW_ROUTER_PRODUCER_ID,
  type SourceReviewRouteEvidence,
} from "@/lib/source-review-route";
import type { StoredEvent } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ worker: string }> }) {
  const authentication = authenticateOwnerRequest(request, true);
  if (!authentication.ok) return ownerAuthFailure(authentication);

  try {
    const { worker } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const taskId = requiredString(body.task_id, "task_id");
    const priorRequestId = requiredString(body.prior_request_id, "prior_request_id");
    const exactFactualState = requiredString(body.exact_factual_state, "exact_factual_state");
    const decisionRequested = requiredString(body.decision_requested, "decision_requested");
    const reviewAttemptId = requiredString(body.review_attempt_id, "review_attempt_id");
    const evidence = parseEvidence(body.evidence);

    const policy = parseGitHubReceiptPolicy();
    if (!policy?.requestBound?.enabled) {
      return Response.json({ error: "Source review routing requires the configured in-band GitHub receipt policy." }, { status: 503 });
    }
    const historyResponse = await daemonFetch("/events");
    if (!historyResponse.ok) {
      return Response.json({ error: "Mission Control event history is unavailable for source review routing." }, { status: 503 });
    }
    const historyPayload = await historyResponse.json() as { events?: StoredEvent[] };
    if (!Array.isArray(historyPayload.events)) {
      return Response.json({ error: "Mission Control source review history is invalid." }, { status: 503 });
    }

    const buildAt = (recordedAt: string) => buildSourceReviewRouteEnvelope({
      events: historyPayload.events!,
      policy,
      worker,
      taskId,
      priorRequestId,
      evidence,
      exactFactualState,
      decisionRequested,
      recordedAt,
      reviewAttemptId,
    });
    const now = new Date().toISOString();
    let intended = buildAt(now);
    assertConfiguredSupervisor(intended, worker);

    const systemProducer: AuthenticatedProducer = {
      id: SOURCE_REVIEW_ROUTER_PRODUCER_ID,
      kind: "SYSTEM",
      workerScopes: [worker],
      taskScopes: [...new Set([taskId, "task:" + worker])],
    };

    const existingResponse = await daemonFetch("/events?event_id=" + encodeURIComponent(intended.event_id), {
      headers: daemonMutationHeaders(systemProducer),
    });
    if (existingResponse.ok) {
      const existingPayload = await existingResponse.json() as { event?: StoredEvent };
      if (!existingPayload.event) throw new Error("Existing source-review route lookup returned no event.");
      intended = buildAt(existingPayload.event.occurredAt);
      const routeAcknowledgement = acknowledgeRequestBoundRoute(existingPayload.event, intended, now);
      return Response.json({
        providerDeliveryState: routeAcknowledgement.sendEligible ? "QUEUED_FOR_PROVIDER_RELAY" : "EXPIRED",
        routeEvent: existingPayload.event,
        routeAcknowledgement,
      }, { status: 202 });
    }
    if (existingResponse.status !== 404) {
      const payload = await existingResponse.json().catch(() => ({})) as { error?: string };
      return Response.json({
        error: payload.error ?? "Mission Control could not check the source-review route.",
      }, { status: existingResponse.status });
    }

    const upstream = await daemonFetch("/events", {
      method: "POST",
      headers: daemonMutationHeaders(systemProducer, { "content-type": "application/json" }),
      body: JSON.stringify(intended),
    });
    const payload = await upstream.json().catch(() => ({})) as { event?: StoredEvent; error?: string };
    if (!upstream.ok && upstream.status === 409) {
      const racedResponse = await daemonFetch("/events?event_id=" + encodeURIComponent(intended.event_id), {
        headers: daemonMutationHeaders(systemProducer),
      });
      if (racedResponse.ok) {
        const racedPayload = await racedResponse.json() as { event?: StoredEvent };
        if (racedPayload.event) {
          intended = buildAt(racedPayload.event.occurredAt);
          const routeAcknowledgement = acknowledgeRequestBoundRoute(racedPayload.event, intended, now);
          return Response.json({
            providerDeliveryState: routeAcknowledgement.sendEligible ? "QUEUED_FOR_PROVIDER_RELAY" : "EXPIRED",
            routeEvent: racedPayload.event,
            routeAcknowledgement,
          }, { status: 202 });
        }
      }
    }
    if (!upstream.ok) {
      return Response.json({
        error: payload.error ?? "Mission Control could not persist the source-review route.",
      }, { status: upstream.status });
    }
    if (!payload.event) throw new Error("Mission Control source-review append returned no event.");
    const routeAcknowledgement = acknowledgeRequestBoundRoute(payload.event, intended, now);
    return Response.json({
      providerDeliveryState: "QUEUED_FOR_PROVIDER_RELAY",
      routeEvent: payload.event,
      routeAcknowledgement,
    }, { status: 202 });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Invalid source-review request.",
    }, { status: 400 });
  }
}

function assertConfiguredSupervisor(envelope: ReturnType<typeof buildSourceReviewRouteEnvelope>, worker: string) {
  if (envelope.data.type !== "worker_message_recorded"
    || !envelope.data.body.startsWith(inBandRequestRoutePrefix)) {
    throw new Error("Source review router did not produce a V6 supervisor route.");
  }
  const packet = JSON.parse(envelope.data.body.slice(inBandRequestRoutePrefix.length)) as Record<string, unknown>;
  const supervisorId = packet.destinationSupervisorId;
  const directory = loadConfiguredSupervisorChats();
  if (directory.configurationState !== "CONFIGURED" || typeof supervisorId !== "string") {
    throw new Error("The prior source-review supervisor is not currently registered.");
  }
  const chat = directory.entries.find((entry) => entry.supervisorId === supervisorId);
  if (!chat || (chat.scope !== "PROJECT_MANAGER" && chat.workerId !== worker)) {
    throw new Error("The prior source-review supervisor is not currently eligible for this worker.");
  }
}

function parseEvidence(value: unknown): SourceReviewRouteEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("evidence must be an object.");
  }
  const item = value as Record<string, unknown>;
  return {
    repository: requiredString(item.repository, "evidence.repository"),
    issueNumber: requiredInteger(item.issue_number, "evidence.issue_number"),
    commentId: requiredInteger(item.comment_id, "evidence.comment_id"),
    immutableUrl: requiredString(item.immutable_url, "evidence.immutable_url"),
    sha256: requiredString(item.sha256, "evidence.sha256"),
    candidateHead: requiredString(item.candidate_head, "evidence.candidate_head"),
    additionalRefs: item.additional_refs === undefined ? undefined : parseRefs(item.additional_refs),
  };
}

function parseRefs(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("evidence.additional_refs must be an array of strings.");
  }
  return value as string[];
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(field + " must be a non-empty string.");
  return value;
}

function requiredInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(field + " must be a positive integer.");
  return Number(value);
}
