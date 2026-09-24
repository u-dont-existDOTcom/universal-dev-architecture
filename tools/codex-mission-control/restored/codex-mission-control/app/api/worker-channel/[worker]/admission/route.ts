import { daemonFetch, daemonMutationHeaders } from "@/lib/daemon-client";
import { authenticateIngestProducer } from "@/lib/ingestion-credentials";
import { parseGitHubReceiptPolicy, validateConfiguredDecisionLocation } from "@/lib/github-decision-receipts";
import { continuationIntentForAdmission, parseSupervisionAdmissionInput, evaluateSupervisionAdmission } from "@/lib/supervision-admission-runtime";
import {
  acknowledgeRequestBoundRoute,
  requestBoundRouteQueuedAt,
  requestRouteEventId,
  type RequestBoundRouteAcknowledgement,
} from "@/lib/request-bound-supervision";
import {
  buildTrustedTaskCreationSelectionEnvelope,
  buildWorkExecutionAuthorizationEnvelope,
  currentExecutionDirectiveProof,
} from "@/lib/work-execution-runtime";
import { parseWorkExecutionProfile } from "@/lib/work-execution-profile";
import { parseClaudeExecutionProfile, claudeExecutionProviderBindingSchema } from "@/lib/claude-execution-profile";
import { buildClaudeExecutionAuthorizationEnvelope } from "@/lib/claude-execution-runtime";
import type { AuthenticatedProducer } from "@/lib/ingestion-auth";

import { deriveOwnerResponseContinuation } from "@/lib/owner-response-continuation";
import type { StoredEvent } from "@/lib/schema";

export async function POST(request: Request, context: { params: Promise<{ worker: string }> }) {
  const { worker } = await context.params;
  const authentication = authenticateIngestProducer(
    process.env.MISSION_CONTROL_INGEST_CREDENTIALS,
    request.headers.get("x-mission-control-producer-id"),
    request.headers.get("authorization"),
  );
  if (!authentication.ok || authentication.producer.kind !== "WORKER"
    || !authentication.producer.workerScopes.includes("*") && !authentication.producer.workerScopes.includes(worker)) {
    return Response.json({ error: "Unauthorized worker admission request." }, { status: authentication.ok ? 403 : 401 });
  }

  try {
    const requestedBody = await request.json();
    const cycleLocation = supervisoryCycleLocation(requestedBody);
    const policy = parseGitHubReceiptPolicy();
    if (cycleLocation) {
      validateConfiguredDecisionLocation(
        cycleLocation.repository,
        cycleLocation.issueNumber,
        policy,
      );
    }
    const body = cycleLocation && policy ? withConfiguredStageIssue(requestedBody, policy.stageIssueNumber) : requestedBody;
    const now = new Date().toISOString();
    const parsedInput = parseSupervisionAdmissionInput(body);
    const requestedInBand = parsedInput.factualPacket?.supervisoryCycle?.bindingProtocol === "IN_BAND_REQUEST_BINDING_V1";
    if (requestedInBand && !policy?.requestBound?.enabled) {
      throw new Error("In-band request binding requires the trusted requestBound relay policy.");
    }
    const requestBoundEventId = policy?.requestBound?.enabled
      && parsedInput.request.internalRoute
      && parsedInput.factualPacket?.supervisoryCycle
      ? requestRouteEventId(parsedInput.request.requestId, requestedInBand ? 6 : 5)
      : null;
    const existingRouteEvent = requestBoundEventId
      ? await readExactRouteEvent(requestBoundEventId, authentication.producer)
      : null;
    const evaluationTime = existingRouteEvent && requestBoundEventId
      ? requestBoundRouteQueuedAt(existingRouteEvent, {
        eventId: requestBoundEventId,
        requestId: parsedInput.request.requestId,
        worker,
        producerId: authentication.producer.id,
        producerKind: authentication.producer.kind,
      })
      : now;
    const needsDirectiveProof = parsedInput.request.action === "EXECUTE_BOUNDED_TASK"
      && parsedInput.request.directiveSchemaVersion === 3;
    let historyEvents: StoredEvent[] = [];
    if (parsedInput.resumeDecisionRequestId !== undefined || needsDirectiveProof) {
      const history = await daemonFetch("/events");
      if (!history.ok) throw new Error("Mission Control event history is unavailable for admission derivation.");
      const payload = await history.json() as { events?: StoredEvent[] };
      if (!Array.isArray(payload.events)) throw new Error("Mission Control admission history is invalid.");
      historyEvents = payload.events;
    }
    const evaluateAt = (at: string) => {
      const intent = continuationIntentForAdmission(worker, parsedInput, at);
      const continuation = intent ? deriveOwnerResponseContinuation(historyEvents, intent, at) : undefined;
      const directiveProof = needsDirectiveProof ? currentExecutionDirectiveProof(worker, historyEvents) : null;
      return evaluateSupervisionAdmission(worker, authentication.producer, body, at, continuation, directiveProof,
        requestedInBand ? "IN_BAND_REQUEST_BINDING_V1" : policy?.requestBound?.enabled ? "PER_REQUEST_V1" : "SPLIT_SESSION_V4");
    };
    let result = evaluateAt(evaluationTime);
    if (existingRouteEvent) {
      if (!result.routeEnvelope) {
        throw new Error("Request-bound admission replay conflicts with the original routed action.");
      }
      const routeAcknowledgement = acknowledgeRequestBoundRoute(existingRouteEvent, result.routeEnvelope, now);
      return Response.json({
        ...result,
        routeEnvelope: undefined,
        routeEvent: existingRouteEvent,
        routeAcknowledgement,
        profileAuthorizationEvent: null,
        setterEvidenceId: null,
        setterEvidenceEvent: null,
      }, { status: admissionStatus(result) });
    }
    let profileAuthorizationEvent = null;
    let claudeProfileAuthorizationEvent = null;
    if (result.mayExecute && result.authorizedWorkExecutionProfile) {
      const authorizedProfile = parseWorkExecutionProfile(result.authorizedWorkExecutionProfile);
      const binding = parsedInput.request.executionDirectiveBinding;
      if (!binding) throw new Error("Admitted execution is missing its directive binding.");
      const systemProducer: AuthenticatedProducer = {
        id: "system:work-profile-admission",
        kind: "SYSTEM",
        workerScopes: [worker],
        taskScopes: [binding.taskId],
      };
      const upstream = await daemonFetch("/events", {
        method: "POST",
        headers: daemonMutationHeaders(systemProducer, { "content-type": "application/json" }),
        body: JSON.stringify(buildWorkExecutionAuthorizationEnvelope({
          worker,
          request: parsedInput.request,
          authorizedProfile,
          now,
        })),
      });
      const payload = await upstream.json().catch(() => ({})) as { event?: unknown; error?: string };
      if (!upstream.ok) {
        return Response.json({
          ...result,
          admitted: false,
          mayExecute: false,
          authorizedWorkExecutionProfile: null,
          profileAuthorizationId: null,
          error: payload.error ?? "Mission Control could not persist the Work execution profile authorization.",
        }, { status: upstream.status });
      }
      profileAuthorizationEvent = payload.event ?? null;
    }
    if (result.mayExecute && result.authorizedClaudeExecutionProfile && result.executionProviderBinding
      && result.claudeProfileAuthorizationId) {
      const authorizedProfile = parseClaudeExecutionProfile(result.authorizedClaudeExecutionProfile);
      const providerBinding = claudeExecutionProviderBindingSchema.parse(result.executionProviderBinding);
      const binding = parsedInput.request.executionDirectiveBinding;
      if (!binding) throw new Error("Admitted Claude execution is missing its directive binding.");
      const systemProducer: AuthenticatedProducer = {
        id: "system:claude-profile-admission",
        kind: "SYSTEM",
        workerScopes: [worker],
        taskScopes: [binding.taskId],
      };
      const upstream = await daemonFetch("/events", {
        method: "POST",
        headers: daemonMutationHeaders(systemProducer, { "content-type": "application/json" }),
        body: JSON.stringify(buildClaudeExecutionAuthorizationEnvelope({
          worker, request: parsedInput.request, authorizedProfile, providerBinding, now,
        })),
      });
      const payload = await upstream.json().catch(() => ({})) as { event?: unknown; error?: string };
      if (!upstream.ok) {
        return Response.json({
          ...result, admitted: false, mayExecute: false, authorizedClaudeExecutionProfile: null,
          claudeProfileAuthorizationId: null,
          error: payload.error ?? "Mission Control could not persist the Claude execution profile authorization.",
        }, { status: upstream.status });
      }
      claudeProfileAuthorizationEvent = payload.event ?? null;
    }
    let routeEvent = null;
    let routeAcknowledgement: RequestBoundRouteAcknowledgement | null = null;
    let setterEvidenceEvent = null;
    let setterEvidenceId = null;
    if (result.mayExecute && result.authorizedWorkExecutionProfile && result.profileAuthorizationId) {
      const binding = parsedInput.request.executionDirectiveBinding;
      if (!binding) throw new Error("Admitted execution is missing its directive binding.");
      const authorizedProfile = parseWorkExecutionProfile(result.authorizedWorkExecutionProfile);
      const setterEnvelope = buildTrustedTaskCreationSelectionEnvelope({
        worker,
        authorizationId: result.profileAuthorizationId,
        directiveId: binding.directiveId,
        directiveRevision: binding.directiveRevision,
        taskId: binding.taskId,
        authorizedProfile,
        now,
      });
      const systemProducer: AuthenticatedProducer = {
        id: "system:trusted-task-creation",
        kind: "SYSTEM",
        workerScopes: [worker],
        taskScopes: [binding.taskId],
      };
      const upstream = await daemonFetch("/events", {
        method: "POST",
        headers: daemonMutationHeaders(systemProducer, { "content-type": "application/json" }),
        body: JSON.stringify(setterEnvelope),
      });
      const payload = await upstream.json().catch(() => ({})) as { event?: unknown; error?: string };
      if (!upstream.ok) {
        return Response.json({
          ...result,
          admitted: false,
          mayExecute: false,
          setterEvidenceId: null,
          error: payload.error ?? "Mission Control could not persist trusted task-creation setter evidence.",
        }, { status: upstream.status });
      }
      setterEvidenceEvent = payload.event ?? null;
      setterEvidenceId = setterEnvelope.data.type === "work_task_creation_selection_applied"
        ? setterEnvelope.data.evidence_id
        : null;
    }
    if (result.routeEnvelope) {
      const upstream = await daemonFetch("/events", {
        method: "POST",
        headers: daemonMutationHeaders(authentication.producer, { "content-type": "application/json" }),
        body: JSON.stringify(result.routeEnvelope),
      });
      const payload = await upstream.json().catch(() => ({})) as { event?: unknown; error?: string };
      if (!upstream.ok && requestBoundEventId && upstream.status === 409) {
        const racedRouteEvent = await readExactRouteEvent(requestBoundEventId, authentication.producer);
        if (racedRouteEvent) {
          const racedQueuedAt = requestBoundRouteQueuedAt(racedRouteEvent, {
            eventId: requestBoundEventId,
            requestId: parsedInput.request.requestId,
            worker,
            producerId: authentication.producer.id,
            producerKind: authentication.producer.kind,
          });
          result = evaluateAt(racedQueuedAt);
          if (!result.routeEnvelope) {
            throw new Error("Request-bound admission race conflicts with the original routed action.");
          }
          routeAcknowledgement = acknowledgeRequestBoundRoute(racedRouteEvent, result.routeEnvelope, now);
          return Response.json({
            ...result,
            routeEnvelope: undefined,
            routeEvent: racedRouteEvent,
            routeAcknowledgement,
            profileAuthorizationEvent,
            claudeProfileAuthorizationEvent,
            setterEvidenceId,
            setterEvidenceEvent,
          }, { status: admissionStatus(result) });
        }
      }
      if (!upstream.ok) {
        return Response.json({
          ...result,
          providerDeliveryState: "ROUTE_REJECTED",
          routeEnvelope: undefined,
          error: payload.error ?? "Mission Control could not persist the internal supervisor route.",
        }, { status: upstream.status });
      }
      routeEvent = payload.event ?? null;
      if (requestBoundEventId) {
        if (!routeEvent) throw new Error("Mission Control did not return the persisted request-bound route.");
        routeAcknowledgement = acknowledgeRequestBoundRoute(routeEvent as StoredEvent, result.routeEnvelope, now);
      }
    }
    return Response.json({
      ...result,
      routeEnvelope: undefined,
      routeEvent,
      routeAcknowledgement,
      profileAuthorizationEvent,
      claudeProfileAuthorizationEvent,
      setterEvidenceId,
      setterEvidenceEvent,
    }, { status: admissionStatus(result) });
  } catch (error) {
    const status = error instanceof Error && "statusCode" in error && (error.statusCode === 400 || error.statusCode === 403)
      ? error.statusCode
      : 400;
    return Response.json({ error: error instanceof Error ? error.message : "Invalid supervision admission request." }, { status });
  }
}

async function readExactRouteEvent(eventId: string, producer: AuthenticatedProducer): Promise<StoredEvent | null> {
  const upstream = await daemonFetch(`/events?event_id=${encodeURIComponent(eventId)}`, {
    headers: daemonMutationHeaders(producer),
  });
  const payload = await upstream.json().catch(() => ({})) as { event?: StoredEvent; error?: string };
  if (upstream.status === 404) return null;
  if (!upstream.ok) {
    const error = new Error(payload.error ?? "Mission Control exact event lookup failed.");
    Object.assign(error, { statusCode: upstream.status === 403 ? 403 : 400 });
    throw error;
  }
  if (!payload.event || payload.event.eventId !== eventId) {
    throw new Error("Mission Control exact event lookup returned an invalid event.");
  }
  return payload.event;
}

function admissionStatus(result: { mayExecute: boolean; admitted: boolean }): number {
  return result.mayExecute ? 200 : result.admitted ? 202 : 409;
}

function withConfiguredStageIssue(value: unknown, stageIssueNumber: number): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const root = value as Record<string, unknown>;
  const factualPacket = root.factualPacket as Record<string, unknown>;
  const supervisoryCycle = factualPacket.supervisoryCycle as Record<string, unknown>;
  const githubReceipt = supervisoryCycle.githubReceipt as Record<string, unknown>;
  return {
    ...root,
    factualPacket: {
      ...factualPacket,
      supervisoryCycle: {
        ...supervisoryCycle,
        githubReceipt: { ...githubReceipt, stageIssueNumber },
      },
    },
  };
}

function supervisoryCycleLocation(value: unknown): { repository: string; issueNumber: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const factualPacket = (value as Record<string, unknown>).factualPacket;
  if (!factualPacket || typeof factualPacket !== "object" || Array.isArray(factualPacket)) return null;
  const supervisoryCycle = (factualPacket as Record<string, unknown>).supervisoryCycle;
  if (!supervisoryCycle || typeof supervisoryCycle !== "object" || Array.isArray(supervisoryCycle)) return null;
  const githubReceipt = (supervisoryCycle as Record<string, unknown>).githubReceipt;
  if (!githubReceipt || typeof githubReceipt !== "object" || Array.isArray(githubReceipt)) return null;
  const repository = (githubReceipt as Record<string, unknown>).repository;
  const issueNumber = (githubReceipt as Record<string, unknown>).issueNumber;
  if (typeof repository !== "string" || !Number.isInteger(issueNumber)) {
    throw new Error("Provider-session supervisory cycles require an exact GitHub repository and issue number.");
  }
  return { repository, issueNumber: Number(issueNumber) };
}
