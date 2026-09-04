import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  pendingDecisionRequests,
  providerSessionSummary,
  publicCapabilityChallenge,
  stageLivenessSummary,
  type GitHubReceiptPolicy,
} from "./github-decision-receipts";
import type { StoredEvent } from "./schema";

export const publicMcpToolNames = [
  "get_capability_challenge",
  "get_supervisory_request_binding",
  "get_stage_liveness_state",
] as const;

export interface PublicMcpDependencies {
  loadEvents: () => Promise<StoredEvent[]>;
  loadPolicy: () => GitHubReceiptPolicy | null;
  now?: () => string;
  recordAccess?: (event: PublicMcpAccessEvent) => void | Promise<void>;
}

export interface PublicMcpAccessEvent {
  event: "mission_control_public_mcp_tool_call";
  tool: typeof publicMcpToolNames[number];
  challenge_id?: string;
  request_id?: string;
  supervisor_id?: string;
  provider_session_id?: string;
  worker_id?: string;
  chat_id?: string;
  status: "OK" | "NOT_FOUND" | "UNAVAILABLE";
  occurred_at: string;
}

export interface PublicMcpBindingTransportAttempt {
  request_id: string;
  supervisor_id: string;
  provider_session_id: string;
  argument_keys: string[];
}

export function publicMcpBindingTransportAttempt(value: unknown): PublicMcpBindingTransportAttempt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const request = value as Record<string, unknown>;
  const params = request.params;
  if (request.method !== "tools/call" || !params || typeof params !== "object" || Array.isArray(params)) return null;
  const call = params as Record<string, unknown>;
  if (call.name !== "get_supervisory_request_binding" || !call.arguments || typeof call.arguments !== "object" || Array.isArray(call.arguments)) return null;
  const args = call.arguments as Record<string, unknown>;
  if (typeof args.request_id !== "string" || typeof args.supervisor_id !== "string" || typeof args.provider_session_id !== "string") return null;
  return {
    request_id: args.request_id,
    supervisor_id: args.supervisor_id,
    provider_session_id: args.provider_session_id,
    argument_keys: Object.keys(args).sort(),
  };
}

export interface PublicSupervisoryRequestBinding {
  schema_version: 2;
  request_id: string;
  request_nonce: string;
  supervisor_id: string;
  provider_session_id: string;
  worker_id: string;
  reasoning_lane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED";
  queued_at: string;
  expires_at: string;
  evidence_capsule_id: string;
  evidence_capsule_sha256: string;
  owner_outcome_id: string;
  owner_outcome_epoch: number;
  owner_outcome_sha256: string;
  github_repository: string;
  decision_issue_number: number;
  stage_issue_number: number;
  decision_receipt_target: string;
  stage_receipt_target: string;
  admission_status: "ADMITTED_PENDING";
}

export interface PublicStageLivenessReceipt {
  status: "STAGE_COMPLETE" | "CONTINUE_REQUIRED";
  receipt_id: string;
  occurred_at: string;
  stage_provider_session_id: string;
}

export interface PublicStageLivenessState {
  schema_version: 3;
  request_id: string;
  supervisor_id: string;
  binding_provider_session_id: string;
  extra_high_reader: PublicStageLivenessReceipt | null;
  pro_decision_stage: PublicStageLivenessReceipt | null;
  extra_high_reader_continue_required_count: number;
  pro_decision_stage_continue_required_count: number;
  semantic_authority: false;
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const noAuthMeta = { securitySchemes: [{ type: "noauth" }] };
const exactId = (description: string) => z.string().min(1).max(180).describe(description);

export function createPublicMissionControlMcpServer(dependencies: PublicMcpDependencies) {
  const server = new McpServer({ name: "mission-control", version: "1.0.0" }, {
    capabilities: { tools: { listChanged: false } },
  });

  server.registerTool(publicMcpToolNames[0], {
    title: "Get capability challenge",
    description: "Read one exact current Mission Control capability challenge bound to one exact registered chat. This tool cannot list challenges or mutate Mission Control.",
    inputSchema: {
      challenge_id: exactId("Exact configured Mission Control capability challenge ID."),
      chat_id: exactId("Exact registered Mission Control supervisor chat ID."),
    },
    outputSchema: {
      schema_version: z.literal(1),
      challenge_id: z.string(),
      chat_id: z.string(),
      mc_nonce: z.string(),
      github_nonce_sha256: z.string(),
      github_nonce_source: z.string(),
      receipt_target: z.string(),
      expires_at: z.string(),
    },
    annotations: readOnlyAnnotations,
    _meta: noAuthMeta,
  }, async ({ challenge_id, chat_id }) => {
    const now = currentTime(dependencies);
    try {
      const result = publicCapabilityChallenge(dependencies.loadPolicy(), challenge_id, now);
      if (!result || result.chat_id !== chat_id) {
        await access(dependencies, { tool: publicMcpToolNames[0], challenge_id, chat_id, status: "NOT_FOUND", occurred_at: now });
        throw notFound();
      }
      await access(dependencies, { tool: publicMcpToolNames[0], challenge_id, chat_id, status: "OK", occurred_at: now });
      return structuredResult(result, "The exact current capability challenge metadata is in structuredContent.");
    } catch (error) {
      if (error instanceof McpError) throw error;
      await access(dependencies, { tool: publicMcpToolNames[0], challenge_id, chat_id, status: "UNAVAILABLE", occurred_at: now });
      throw unavailable();
    }
  });

  server.registerTool(publicMcpToolNames[1], {
    title: "Always call to preload the live supervisory request binding",
    description: "ALWAYS call this tool when a selected Mission Control message supplies an exact supervisory request_id, supervisor_id, and provider_session_id and asks to preload or read the live request binding. Never substitute prompt or context values for this live call. It is a read-only lookup of the current exact binding and exposes no evidence body, transcript, owner message, or private worker state.",
    inputSchema: {
      request_id: exactId("Exact pending Mission Control supervisory request ID."),
      supervisor_id: exactId("Exact stable Mission Control supervisor ID."),
      provider_session_id: exactId("Exact fresh provider-session ID allocated to this request."),
    },
    outputSchema: {
      schema_version: z.literal(2), request_id: z.string(), request_nonce: z.string(), supervisor_id: z.string(), provider_session_id: z.string(),
      worker_id: z.string(), reasoning_lane: z.enum(["EXTRA_HIGH_DIRECT", "PRO_ESCALATED"]), queued_at: z.string(), expires_at: z.string(),
      evidence_capsule_id: z.string(), evidence_capsule_sha256: z.string(), owner_outcome_id: z.string(), owner_outcome_epoch: z.number().int(), owner_outcome_sha256: z.string(),
      github_repository: z.string(), decision_issue_number: z.number().int(), stage_issue_number: z.number().int(),
      decision_receipt_target: z.string(), stage_receipt_target: z.string(), admission_status: z.literal("ADMITTED_PENDING"),
    },
    annotations: readOnlyAnnotations,
    _meta: noAuthMeta,
  }, async ({ request_id, supervisor_id, provider_session_id }) => {
    const now = currentTime(dependencies);
    try {
      const events = await dependencies.loadEvents();
      const result = publicSupervisoryRequestBinding(events, dependencies.loadPolicy(), request_id, supervisor_id, provider_session_id, now);
      if (!result) {
        const pending = pendingDecisionRequests(events).find((request) => request.routeSchemaVersion === 3
          && request.requestId === request_id && request.supervisorId === supervisor_id);
        await access(dependencies, { tool: publicMcpToolNames[1], request_id, supervisor_id, provider_session_id, worker_id: pending?.worker, status: "NOT_FOUND", occurred_at: now });
        throw notFound();
      }
      await access(dependencies, { tool: publicMcpToolNames[1], request_id, supervisor_id, provider_session_id, worker_id: result.worker_id, status: "OK", occurred_at: now });
      return structuredResult(result, "The exact current supervisory request binding is in structuredContent.");
    } catch (error) {
      if (error instanceof McpError) throw error;
      await access(dependencies, { tool: publicMcpToolNames[1], request_id, supervisor_id, provider_session_id, status: "UNAVAILABLE", occurred_at: now });
      throw unavailable();
    }
  });

  server.registerTool(publicMcpToolNames[2], {
    title: "Get stage liveness state",
    description: "Read receipt IDs, stage-provider-session IDs, statuses, timestamps, and CONTINUE_REQUIRED counts for one exact current escalated binding provider session. This optional diagnostic has no semantic authority and contains no decision or assistant content.",
    inputSchema: {
      request_id: exactId("Exact pending Mission Control supervisory request ID."),
      supervisor_id: exactId("Exact stable Mission Control supervisor ID."),
      provider_session_id: exactId("Exact binding provider-session ID allocated to this request."),
    },
    outputSchema: {
      schema_version: z.literal(3), request_id: z.string(), supervisor_id: z.string(), binding_provider_session_id: z.string(),
      extra_high_reader: z.object({ status: z.enum(["STAGE_COMPLETE", "CONTINUE_REQUIRED"]), receipt_id: z.string(), occurred_at: z.string(), stage_provider_session_id: z.string() }).nullable(),
      pro_decision_stage: z.object({ status: z.enum(["STAGE_COMPLETE", "CONTINUE_REQUIRED"]), receipt_id: z.string(), occurred_at: z.string(), stage_provider_session_id: z.string() }).nullable(),
      extra_high_reader_continue_required_count: z.number().int().nonnegative(),
      pro_decision_stage_continue_required_count: z.number().int().nonnegative(),
      semantic_authority: z.literal(false),
    },
    annotations: readOnlyAnnotations,
    _meta: noAuthMeta,
  }, async ({ request_id, supervisor_id, provider_session_id }) => {
    const now = currentTime(dependencies);
    try {
      const events = await dependencies.loadEvents();
      const pending = pendingDecisionRequests(events).find((request) => request.routeSchemaVersion === 3
        && request.requestId === request_id && request.supervisorId === supervisor_id);
      const result = pending?.reasoningLane === "PRO_ESCALATED"
        && hasBindingProviderSession(events, request_id, supervisor_id, provider_session_id, pending.queuedAt, now, ["ACTIVE", "COMPLETE"])
        ? publicStageLivenessState(events, request_id, supervisor_id, provider_session_id, pending.queuedAt, pending.expiresAt, now)
        : null;
      if (!result) {
        await access(dependencies, { tool: publicMcpToolNames[2], request_id, supervisor_id, provider_session_id, status: "NOT_FOUND", occurred_at: now });
        throw notFound();
      }
      await access(dependencies, { tool: publicMcpToolNames[2], request_id, supervisor_id, provider_session_id, worker_id: pending!.worker, status: "OK", occurred_at: now });
      return structuredResult(result, "The exact current stage-liveness metadata is in structuredContent; semantic_authority is false.");
    } catch (error) {
      if (error instanceof McpError) throw error;
      await access(dependencies, { tool: publicMcpToolNames[2], request_id, supervisor_id, provider_session_id, status: "UNAVAILABLE", occurred_at: now });
      throw unavailable();
    }
  });

  return server;
}

export async function handlePublicMissionControlMcpRequest(request: Request, dependencies: PublicMcpDependencies): Promise<Response> {
  const server = createPublicMissionControlMcpServer(dependencies);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    await transport.close();
    await server.close();
  }
}

export function publicSupervisoryRequestBinding(
  events: StoredEvent[],
  policy: GitHubReceiptPolicy | null,
  requestId: string,
  supervisorId: string,
  providerSessionId: string,
  now: string,
): PublicSupervisoryRequestBinding | null {
  if (!policy || !Number.isFinite(Date.parse(now))) return null;
  const matches = pendingDecisionRequests(events).filter((request) => request.requestId === requestId
    && request.routeSchemaVersion === 3 && request.supervisorId === supervisorId);
  if (matches.length !== 1) return null;
  const request = matches[0]!;
  if (Date.parse(request.queuedAt) > Date.parse(now) || Date.parse(request.expiresAt) <= Date.parse(now)) return null;
  if (request.repository.toLowerCase() !== policy.repository.toLowerCase() || request.issueNumber !== policy.decisionIssueNumber) return null;
  const currentOutcome = [...events].reverse().find((event) => event.worker === request.worker && event.data.type === "owner_outcome_recorded")?.data;
  if (currentOutcome?.type !== "owner_outcome_recorded"
    || currentOutcome.owner_outcome_id !== request.ownerOutcome.id
    || currentOutcome.epoch !== request.ownerOutcome.epoch
    || currentOutcome.owner_outcome_sha256 !== request.ownerOutcome.sha256) return null;
  if (!hasBindingProviderSession(events, requestId, supervisorId, providerSessionId, request.queuedAt, now, ["ACTIVE"])) return null;
  const issueBase = `https://github.com/${policy.repository}/issues`;
  return {
    schema_version: 2,
    request_id: request.requestId,
    request_nonce: request.nonce,
    supervisor_id: request.supervisorId,
    provider_session_id: providerSessionId,
    worker_id: request.worker,
    reasoning_lane: request.reasoningLane,
    queued_at: request.queuedAt,
    expires_at: request.expiresAt,
    evidence_capsule_id: request.evidenceCapsule.id,
    evidence_capsule_sha256: request.evidenceCapsule.sha256,
    owner_outcome_id: request.ownerOutcome.id,
    owner_outcome_epoch: request.ownerOutcome.epoch,
    owner_outcome_sha256: request.ownerOutcome.sha256,
    github_repository: policy.repository,
    decision_issue_number: policy.decisionIssueNumber,
    stage_issue_number: policy.stageIssueNumber,
    decision_receipt_target: `${issueBase}/${policy.decisionIssueNumber}`,
    stage_receipt_target: `${issueBase}/${policy.stageIssueNumber}`,
    admission_status: "ADMITTED_PENDING",
  };
}

export function publicStageLivenessState(
  events: StoredEvent[],
  requestId: string,
  supervisorId: string,
  providerSessionId: string,
  queuedAt: string,
  expiresAt: string,
  now: string,
): PublicStageLivenessState | null {
  if (![queuedAt, expiresAt, now].every((value) => Number.isFinite(Date.parse(value)))) return null;
  const latest: Partial<Record<"EXTRA_HIGH_READER" | "PRO_DECISION_STAGE", PublicStageLivenessReceipt>> = {};
  const continueRequiredCount = { EXTRA_HIGH_READER: 0, PRO_DECISION_STAGE: 0 };
  for (const event of [...events].sort((left, right) => left.sequence - right.sequence)) {
    if (event.data.type !== "evidence_receipt_recorded" || event.data.summary !== stageLivenessSummary || !event.data.verified) continue;
    if (!event.data.refs.includes(`request:${requestId}`)
      || !event.data.refs.includes(`supervisor:${supervisorId}`)
      || !event.data.refs.includes(`binding_provider_session:${providerSessionId}`)) continue;
    const occurred = Date.parse(event.occurredAt);
    if (occurred < Date.parse(queuedAt) || occurred > Date.parse(expiresAt) || occurred > Date.parse(now)) continue;
    const stage = refValue(event.data.refs, "stage:");
    const status = refValue(event.data.refs, "status:");
    const stageProviderSessionId = refValue(event.data.refs, "stage_provider_session:");
    if ((stage !== "EXTRA_HIGH_READER" && stage !== "PRO_DECISION_STAGE") || !stageProviderSessionId
      || (status !== "STAGE_COMPLETE" && status !== "CONTINUE_REQUIRED")) continue;
    if (status === "CONTINUE_REQUIRED") continueRequiredCount[stage] += 1;
    latest[stage] = { status, receipt_id: event.data.receipt_id, occurred_at: event.occurredAt, stage_provider_session_id: stageProviderSessionId };
  }
  return {
    schema_version: 3,
    request_id: requestId,
    supervisor_id: supervisorId,
    binding_provider_session_id: providerSessionId,
    extra_high_reader: latest.EXTRA_HIGH_READER ?? null,
    pro_decision_stage: latest.PRO_DECISION_STAGE ?? null,
    extra_high_reader_continue_required_count: continueRequiredCount.EXTRA_HIGH_READER,
    pro_decision_stage_continue_required_count: continueRequiredCount.PRO_DECISION_STAGE,
    semantic_authority: false,
  };
}

function hasBindingProviderSession(
  events: StoredEvent[], requestId: string, supervisorId: string, providerSessionId: string, queuedAt: string, now: string,
  allowedLifecycles: Array<"ACTIVE" | "COMPLETE">,
) {
  const session = [...events].reverse().find((event) => event.data.type === "evidence_receipt_recorded"
    && event.data.summary === providerSessionSummary && event.data.verified
    && event.data.refs.includes(`request:${requestId}`) && event.data.refs.includes(`supervisor:${supervisorId}`)
    && event.data.refs.includes(`provider_session:${providerSessionId}`)
    && event.data.refs.includes(`binding_provider_session:${providerSessionId}`)
    && event.data.refs.includes("session_role:MC_BINDING_PRELOAD_SESSION")
    && Date.parse(event.occurredAt) >= Date.parse(queuedAt) && Date.parse(event.occurredAt) <= Date.parse(now));
  if (session?.data.type !== "evidence_receipt_recorded") return false;
  const refs = session.data.refs;
  return allowedLifecycles.some((status) => refs.includes(`lifecycle_status:${status}`));
}

function structuredResult<T extends object>(structuredContent: T, message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    structuredContent: { ...structuredContent } as Record<string, unknown>,
  };
}

function currentTime(dependencies: PublicMcpDependencies) {
  const value = dependencies.now?.() ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(value))) throw new Error("Mission Control clock is invalid.");
  return value;
}

async function access(dependencies: PublicMcpDependencies, event: Omit<PublicMcpAccessEvent, "event">) {
  await dependencies.recordAccess?.({ event: "mission_control_public_mcp_tool_call", ...event });
}

function refValue(refs: string[], prefix: string) {
  return refs.find((ref) => ref.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function notFound() {
  return new McpError(ErrorCode.InvalidParams, "Exact current Mission Control binding not found.");
}

function unavailable() {
  return new McpError(ErrorCode.InternalError, "Mission Control control-plane read is unavailable.");
}
