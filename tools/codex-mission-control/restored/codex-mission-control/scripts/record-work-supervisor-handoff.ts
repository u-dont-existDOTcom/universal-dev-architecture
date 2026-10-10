#!/usr/bin/env tsx
import { sha256 } from "../lib/canonical";
import { daemonFetch, daemonMutationHeaders } from "../lib/daemon-client";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";
import {
  buildWorkSupervisorQuestionRoute,
  WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID,
  workSupervisorQuestionCollector,
} from "../lib/owner-question-route";
import { parseGitHubReceiptPolicy } from "../lib/github-decision-receipts";
import type { AppendEnvelope, StoredEvent } from "../lib/schema";

async function main() {
  const raw = await readStdin();
  const input = parseInput(JSON.parse(raw));
  const historyResponse = await daemonFetch("/events");
  if (!historyResponse.ok) throw new Error("Mission Control event history is unavailable.");
  const payload = await historyResponse.json() as { events?: StoredEvent[] };
  if (!Array.isArray(payload.events)) throw new Error("Mission Control event history is invalid.");
  const events = payload.events.filter((event) => event.worker === input.worker);

  const policy = parseGitHubReceiptPolicy();
  const built = buildWorkSupervisorQuestionRoute(events, {
    worker: input.worker,
    sourceDispatchId: input.dispatchId,
    workThreadId: input.workThreadId,
    questionId: input.questionId,
    exactQuestion: input.question,
    exactQuestionSha256: input.questionSha256,
    factualState: input.factualState,
    factualStateSha256: input.factualStateSha256,
    evidenceRefs: input.evidenceRefs,
    recordedAt: input.observedAt,
  }, policy);

  const request = [...events].reverse().find((event) => event.worker === input.worker
    && event.data.type === "chatgpt_work_cloud_dispatch_requested"
    && event.data.dispatch_id === input.dispatchId)?.data;
  if (!request || request.type !== "chatgpt_work_cloud_dispatch_requested") {
    throw new Error("Exact Work dispatch request is missing.");
  }
  const handoffId = "work-handoff:" + sha256(input.dispatchId + ":" + input.questionId + ":" + input.questionSha256).slice(0, 32);
  const handoff: AppendEnvelope = {
    schema_version: 2,
    event_id: "work-supervisor-handoff:" + sha256(handoffId).slice(0, 32),
    mission_id: "mission-control-live",
    occurred_at: input.observedAt,
    data: {
      type: "work_supervisor_handoff_recorded",
      worker: input.worker,
      dispatch_id: input.dispatchId,
      directive_id: request.directive_id,
      directive_revision: request.directive_revision,
      task_id: input.taskId,
      work_thread_id: input.workThreadId,
      handoff_id: handoffId,
      handoff_kind: "REASONING_REQUIRED",
      question: input.question,
      factual_state: input.factualState,
      evidence_refs: input.evidenceRefs,
      question_sha256: input.questionSha256,
      factual_state_sha256: input.factualStateSha256,
      semantic_authority: false,
      recorded_at: input.observedAt,
      producer_id: WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID,
      source: "CHATGPT_WORK_PRIVATE_HANDOFF",
    },
  };
  const system: AuthenticatedProducer = {
    id: WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID,
    kind: "SYSTEM",
    workerScopes: [input.worker],
    taskScopes: [input.taskId, "task:" + input.worker],
  };

  const appendedHandoff = await appendIdempotent(handoff, system);
  const appendedRoute = await appendIdempotent(built.route, system);
  const appendedProof = await appendIdempotent(built.provenance, workSupervisorQuestionCollector);
  process.stdout.write(JSON.stringify({
    status: "RECORDED",
    worker: input.worker,
    dispatchId: input.dispatchId,
    handoffEventId: appendedHandoff.eventId,
    routeEventId: appendedRoute.eventId,
    provenanceEventId: appendedProof.eventId,
    questionSha256: input.questionSha256,
  }) + "\n");
}

async function appendIdempotent(envelope: AppendEnvelope, producer: AuthenticatedProducer): Promise<StoredEvent> {
  const query = "/events?event_id=" + encodeURIComponent(envelope.event_id);
  const existing = await daemonFetch(query, { headers: daemonMutationHeaders(producer) });
  if (existing.ok) {
    const value = await existing.json() as { event?: StoredEvent };
    if (!value.event) throw new Error("Existing event lookup returned no event.");
    return value.event;
  }
  if (existing.status !== 404) throw new Error("Mission Control event lookup failed.");
  const response = await daemonFetch("/events", {
    method: "POST",
    headers: daemonMutationHeaders(producer, { "content-type": "application/json" }),
    body: JSON.stringify(envelope),
  });
  if (response.ok) {
    const value = await response.json() as { event?: StoredEvent };
    if (!value.event) throw new Error("Mission Control append returned no event.");
    return value.event;
  }
  if (response.status === 409) {
    const raced = await daemonFetch(query, { headers: daemonMutationHeaders(producer) });
    if (raced.ok) {
      const value = await raced.json() as { event?: StoredEvent };
      if (value.event) return value.event;
    }
  }
  const error = await response.text();
  throw new Error("Mission Control append failed: " + error.slice(0, 300));
}

interface PrivateHandoffInput {
  worker: string;
  dispatchId: string;
  workThreadId: string;
  taskId: string;
  questionId: string;
  question: string;
  questionSha256: string;
  factualState: string;
  factualStateSha256: string;
  evidenceRefs: string[];
  observedAt: string;
}

function parseInput(value: unknown): PrivateHandoffInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Private Work handoff input must be an object.");
  const item = value as Record<string, unknown>;
  const result: PrivateHandoffInput = {
    worker: text(item.worker, "worker", 180),
    dispatchId: text(item.dispatchId, "dispatchId", 180),
    workThreadId: text(item.workThreadId, "workThreadId", 300),
    taskId: text(item.taskId, "taskId", 180),
    questionId: text(item.questionId, "questionId", 180),
    question: text(item.question, "question", 8_000),
    questionSha256: digest(item.questionSha256, "questionSha256"),
    factualState: text(item.factualState, "factualState", 12_000),
    factualStateSha256: digest(item.factualStateSha256, "factualStateSha256"),
    evidenceRefs: stringArray(item.evidenceRefs, "evidenceRefs", 50, 2_000),
    observedAt: text(item.observedAt, "observedAt", 100),
  };
  if (sha256(result.question) !== result.questionSha256) throw new Error("questionSha256 mismatch.");
  if (sha256(result.factualState) !== result.factualStateSha256) throw new Error("factualStateSha256 mismatch.");
  if (!Number.isFinite(Date.parse(result.observedAt))) throw new Error("observedAt must be an ISO timestamp.");
  return result;
}
function text(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(field + " is invalid.");
  return value;
}
function digest(value: unknown, field: string): string {
  const result = text(value, field, 64);
  if (!/^[a-f0-9]{64}$/.test(result)) throw new Error(field + " must be SHA-256.");
  return result;
}
function stringArray(value: unknown, field: string, maximumItems: number, maximumText: number): string[] {
  if (!Array.isArray(value) || value.length > maximumItems
    || value.some((item) => typeof item !== "string" || !item.trim() || item.length > maximumText)) {
    throw new Error(field + " is invalid.");
  }
  return value as string[];
}
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const value = Buffer.concat(chunks).toString("utf8");
  if (!value.trim()) throw new Error("Private Work handoff stdin is empty.");
  return value;
}

main().catch((error: unknown) => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
