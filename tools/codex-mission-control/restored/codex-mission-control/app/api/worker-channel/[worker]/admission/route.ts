import { daemonFetch, daemonMutationHeaders } from "@/lib/daemon-client";
import { authenticateIngestProducer } from "@/lib/ingestion-credentials";
import { parseGitHubReceiptPolicy, validateConfiguredDecisionLocation } from "@/lib/github-decision-receipts";
import { evaluateSupervisionAdmission } from "@/lib/supervision-admission-runtime";

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
    const result = evaluateSupervisionAdmission(worker, authentication.producer, body);
    let routeEvent = null;
    if (result.routeEnvelope) {
      const upstream = await daemonFetch("/events", {
        method: "POST",
        headers: daemonMutationHeaders(authentication.producer, { "content-type": "application/json" }),
        body: JSON.stringify(result.routeEnvelope),
      });
      const payload = await upstream.json().catch(() => ({})) as { event?: unknown; error?: string };
      if (!upstream.ok) {
        return Response.json({
          ...result,
          providerDeliveryState: "ROUTE_REJECTED",
          routeEnvelope: undefined,
          error: payload.error ?? "Mission Control could not persist the internal supervisor route.",
        }, { status: upstream.status });
      }
      routeEvent = payload.event ?? null;
    }
    const status = result.mayExecute ? 200 : result.admitted ? 202 : 409;
    return Response.json({ ...result, routeEnvelope: undefined, routeEvent }, { status });
  } catch (error) {
    const status = error instanceof Error && "statusCode" in error && (error.statusCode === 400 || error.statusCode === 403)
      ? error.statusCode
      : 400;
    return Response.json({ error: error instanceof Error ? error.message : "Invalid supervision admission request." }, { status });
  }
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
