import type { StoredEvent } from "./schema";

type ReasoningMessageData = Extract<StoredEvent["data"], { type: "reasoning_message_recorded" }>;
export type ReasoningMessageStoredEvent = StoredEvent & { data: ReasoningMessageData };

export type DecisionRouteStatus =
  | "OWNER_RESPONSE_REQUIRED"
  | "VERBATIM_FORWARD_REQUIRED"
  | "SUPERVISOR_RESOLUTION_REQUIRED"
  | "RESOLVED"
  | "INVALID_BINDING";

export interface DecisionRouteState {
  decisionRequestId: string;
  request: ReasoningMessageStoredEvent;
  projectManagerResponse: ReasoningMessageStoredEvent | null;
  supervisorResponse: ReasoningMessageStoredEvent | null;
  resolution: ReasoningMessageStoredEvent | null;
  status: DecisionRouteStatus;
  directChatUrl: string | null;
}

export function reasoningMessages(timeline: StoredEvent[]): ReasoningMessageStoredEvent[] {
  return timeline
    .filter((event): event is ReasoningMessageStoredEvent => event.data.type === "reasoning_message_recorded")
    .sort((left, right) => messageTime(left).localeCompare(messageTime(right)) || left.sequence - right.sequence);
}

export function latestVerifiedReasoningMessage(timeline: StoredEvent[]): ReasoningMessageStoredEvent | null {
  return [...reasoningMessages(timeline)].reverse().find((event) => event.data.provenance_status === "VERIFIED"
    && Boolean(event.data.sent_at_source)) ?? null;
}

export function decisionRouteStates(timeline: StoredEvent[]): DecisionRouteState[] {
  const messages = reasoningMessages(timeline);
  const requestIds = [...new Set(messages
    .filter(isSupervisorRequest)
    .map((event) => event.data.decision_request_id!))];

  return requestIds.map((decisionRequestId) => {
    const related = messages.filter((event) => event.data.decision_request_id === decisionRequestId);
    const request = related.find(isSupervisorRequest)!;
    const later = related.filter((event) => event.sequence > request.sequence);
    const ownerMessages = later.filter((event) => event.data.author_role === "OWNER");
    const direct = ownerMessages.find((event) => event.data.surface_role === "SUPERVISOR"
      && event.data.parent_message_id === request.data.message_id) ?? null;
    const projectManagerResponse = ownerMessages.find((event) => event.data.surface_role === "PROJECT_MANAGER"
      && event.data.parent_message_id === request.data.message_id) ?? null;
    const forwarded = projectManagerResponse
      ? ownerMessages.find((event) => event.data.surface_role === "SUPERVISOR"
        && event.data.parent_message_id === projectManagerResponse.data.message_id
        && event.data.body_sha256 === projectManagerResponse.data.body_sha256) ?? null
      : null;
    const supervisorResponse = direct ?? forwarded;
    const invalidOwnerBinding = ownerMessages.length > 0 && !direct && !projectManagerResponse;
    const invalidForward = Boolean(projectManagerResponse
      && ownerMessages.some((event) => event.data.surface_role === "SUPERVISOR"
        && event.data.parent_message_id === projectManagerResponse.data.message_id
        && event.data.body_sha256 !== projectManagerResponse.data.body_sha256));
    const resolution = supervisorResponse
      ? later.find((event) => event.data.author_role === "ASSISTANT"
        && event.data.surface_role === "SUPERVISOR"
        && event.data.parent_message_id === supervisorResponse.data.message_id
        && event.sequence > supervisorResponse.sequence) ?? null
      : null;

    const status: DecisionRouteStatus = invalidOwnerBinding || invalidForward
      ? "INVALID_BINDING"
      : !direct && !projectManagerResponse
        ? "OWNER_RESPONSE_REQUIRED"
        : projectManagerResponse && !forwarded
          ? "VERBATIM_FORWARD_REQUIRED"
          : !resolution
            ? "SUPERVISOR_RESOLUTION_REQUIRED"
            : "RESOLVED";

    return {
      decisionRequestId,
      request,
      projectManagerResponse,
      supervisorResponse,
      resolution,
      status,
      directChatUrl: request.data.immutable_provider_locator,
    };
  });
}

function isSupervisorRequest(event: ReasoningMessageStoredEvent): boolean {
  return event.data.author_role === "ASSISTANT"
    && event.data.surface_role === "SUPERVISOR"
    && Boolean(event.data.decision_request_id)
    && event.data.parent_message_id === null;
}

function messageTime(event: ReasoningMessageStoredEvent): string {
  return event.data.sent_at_source ?? event.data.received_at_mission_control ?? event.occurredAt;
}
