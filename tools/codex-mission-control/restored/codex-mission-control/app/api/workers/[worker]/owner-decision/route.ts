import { sha256 } from "@/lib/canonical";
import { daemonFetch, daemonMutationHeaders } from "@/lib/daemon-client";
import { parseGitHubReceiptPolicy } from "@/lib/github-decision-receipts";
import type { AuthenticatedProducer } from "@/lib/ingestion-auth";
import { authenticateOwnerRequest, ownerAuthFailure } from "@/lib/owner-auth";
import { buildOwnerAnswerContinuationRoute, ownerAnswerContinuationRoute, WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID } from "@/lib/owner-question-route";
import type { AppendEnvelope, StoredEvent } from "@/lib/schema";

export async function POST(request: Request, context: { params: Promise<{ worker: string }> }) {
  const authentication = authenticateOwnerRequest(request, true);
  if (!authentication.ok) return ownerAuthFailure(authentication);
  const { worker } = await context.params;
  try {
    const body = await request.json() as Record<string, unknown>;
    const decisionId = required(body.decision_id, "decision_id");
    const optionId = required(body.option_id, "option_id");
    let events = await workerEvents(worker);
    const ownerRequestEvent = [...events].reverse().find((event) =>
      event.worker === worker && event.data.type === "owner_decision_request_recorded"
      && event.data.owner_action.kind === "DECISION_REQUIRED" && event.data.owner_action.decision_id === decisionId);
    if (!ownerRequestEvent || ownerRequestEvent.data.type !== "owner_decision_request_recorded"
      || ownerRequestEvent.data.owner_action.kind !== "DECISION_REQUIRED") {
      return Response.json({ error: "Owner decision request is not current." }, { status: 409 });
    }
    const decisionRequest = ownerRequestEvent.data;
    const decisionRequestId = decisionRequest.request_id;
    const ownerAction = decisionRequest.owner_action;
    if (ownerAction.kind !== "DECISION_REQUIRED") return Response.json({ error: "Owner decision request has invalid authority shape." }, { status: 409 });
    if (ownerAction.status !== "OPEN") return Response.json({ error: "Owner decision request is no longer open." }, { status: 409 });
    const option = ownerAction.options.find((item) => item.option_id === optionId);
    if (!option) return Response.json({ error: "Selected owner option is not valid for this decision." }, { status: 400 });

    const origin = events.find((event) => event.worker === worker
      && event.data.type === "reasoning_message_recorded" && event.data.author_role === "ASSISTANT"
      && event.data.surface_role === "SUPERVISOR" && event.data.decision_request_id === decisionRequestId
      && event.data.parent_message_id === null);
    if (!origin || origin.data.type !== "reasoning_message_recorded" || !origin.data.stable_supervisor_id) {
      return Response.json({ error: "Supervisor decision origin is unavailable." }, { status: 409 });
    }
    const originData = origin.data;
    const originMessageId = originData.message_id;
    const exactText = optionId;
    const existingOwnerReplies = events.filter((event) => event.worker === worker
      && event.data.type === "reasoning_message_recorded" && event.data.author_role === "OWNER"
      && event.data.surface_role === "SUPERVISOR" && event.data.parent_message_id === originMessageId
      && event.data.decision_request_id === decisionRequestId);
    if (existingOwnerReplies.length > 0) {
      const exact = existingOwnerReplies.find((event) => event.data.type === "reasoning_message_recorded" && event.data.exact_visible_body === exactText);
      if (!exact) return Response.json({ error: "A different owner answer is already bound to this decision." }, { status: 409 });
    } else {
      const now = new Date().toISOString();
      const ownerProducer = { ...authentication.principal, workerScopes: [worker], taskScopes: ["task:" + worker] };
      const digest = sha256(exactText);
      const replyId = "owner-dashboard-reply:" + sha256(decisionRequestId + ":" + optionId).slice(0, 32);
      const ownerReply: AppendEnvelope = {
        schema_version: 2, event_id: replyId, mission_id: "mission-control-live", occurred_at: now,
        data: {
          type: "reasoning_message_recorded", worker, stable_supervisor_id: originData.stable_supervisor_id,
          message_id: replyId, thread_id: originData.thread_id, surface_role: "SUPERVISOR",
          provider_surface: "CHATGPT_CONSUMER", model_mode: "UNKNOWN", account_workspace: "MISSION_CONTROL_DASHBOARD",
          author_role: "OWNER", sent_at_source: now, received_at_mission_control: now, body_sha256: digest,
          exact_visible_body: exactText, immutable_provider_locator: null, parent_message_id: originMessageId,
          owner_direction_id: null, decision_request_id: decisionRequestId,
          acquisition_method: "OWNER_ATTESTED", provenance_status: "OWNER_ATTESTED",
          limitations: ["Owner selected the exact option_id through the authenticated Mission Control dashboard."],
          recorded_by: ownerProducer.id,
        },
      };
      const appended = await daemonFetch("/events", {
        method: "POST", headers: daemonMutationHeaders(ownerProducer, { "content-type": "application/json" }),
        body: JSON.stringify(ownerReply),
      });
      if (!appended.ok && appended.status !== 409) return Response.json({ error: "Owner reply could not be recorded." }, { status: appended.status });
      events = await workerEvents(worker);
    }

    const existingContinuation = ownerAnswerContinuationRoute(events, worker, decisionRequestId);
    if (existingContinuation) return Response.json({ status: "ROUTED_TO_SUPERVISOR", worker,
      decision_id: decisionId, option_id: optionId, decision_request_id: decisionRequestId,
      continuation_event_id: existingContinuation.eventId });

    const now = new Date().toISOString();
    const continuationRoute = buildOwnerAnswerContinuationRoute(events, {
      worker, resumeDecisionRequestId: decisionRequestId, recordedAt: now,
    }, parseGitHubReceiptPolicy());
    const systemProducer: AuthenticatedProducer = {
      id: WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID, kind: "SYSTEM", workerScopes: [worker],
      taskScopes: [decisionRequest.task_id, "task:" + worker],
    };
    const routed = await daemonFetch("/events", {
      method: "POST", headers: daemonMutationHeaders(systemProducer, { "content-type": "application/json" }),
      body: JSON.stringify(continuationRoute),
    });
    if (!routed.ok && routed.status !== 409) {
      return Response.json({ error: "Owner answer was recorded, but supervisor continuation could not be routed." }, { status: routed.status });
    }
    if (routed.status === 409 && !ownerAnswerContinuationRoute(await workerEvents(worker), worker, decisionRequestId)) {
      return Response.json({ error: "Owner answer was recorded, but no matching durable continuation exists." }, { status: 409 });
    }
    return Response.json({ status: "ROUTED_TO_SUPERVISOR", worker, decision_id: decisionId, option_id: optionId,
      decision_request_id: decisionRequestId, continuation_event_id: continuationRoute.event_id });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

async function workerEvents(worker: string): Promise<StoredEvent[]> {
  const response = await daemonFetch("/events");
  if (!response.ok) throw new Error("Mission Control event history is unavailable.");
  const payload = await response.json() as { events?: StoredEvent[] };
  if (!Array.isArray(payload.events)) throw new Error("Mission Control event history is invalid.");
  return payload.events.filter((event) => event.worker === worker);
}
function required(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 180) throw new Error(field + " is invalid.");
  return value;
}
