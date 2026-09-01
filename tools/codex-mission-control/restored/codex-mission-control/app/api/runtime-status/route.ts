import { daemonFetch } from "@/lib/daemon-client";

export const dynamic = "force-dynamic";

interface HealthPayload {
  status?: string;
  latestSequence?: number;
  chain?: { valid?: boolean; errors?: string[] };
}

interface SnapshotPayload {
  workers?: Array<{
    connection?: { state?: string };
    supervisorChatUrl?: string;
    supervisorChatIsPlaceholder?: boolean;
    timeline?: Array<{
      occurredAt?: string;
      data?: {
        type?: string;
        surface_role?: "PROJECT_MANAGER" | "SUPERVISOR";
        provenance_status?: string;
        sent_at_source?: string | null;
      };
    }>;
  }>;
  generatedAt?: string;
}

export async function GET() {
  try {
    const [healthResponse, snapshotResponse] = await Promise.all([
      daemonFetch("/health"),
      daemonFetch("/snapshot"),
    ]);
    if (!healthResponse.ok || !snapshotResponse.ok) {
      return Response.json({
        status: "degraded",
        daemonHealthStatus: healthResponse.status,
        snapshotStatus: snapshotResponse.status,
      }, { status: 503, headers: { "cache-control": "no-store" } });
    }

    const health = await healthResponse.json() as HealthPayload;
    const snapshot = await snapshotResponse.json() as SnapshotPayload;
    const workers = snapshot.workers ?? [];
    const reasoningMessages = workers.flatMap((worker) => worker.timeline ?? [])
      .filter((event) => event.data?.type === "reasoning_message_recorded");
    const projectManagerMessages = reasoningMessages
      .filter((event) => event.data?.surface_role === "PROJECT_MANAGER");
    const supervisorMessages = reasoningMessages
      .filter((event) => event.data?.surface_role === "SUPERVISOR");
    const verifiedReasoningMessages = reasoningMessages
      .filter((event) => event.data?.provenance_status === "VERIFIED" && event.data.sent_at_source);
    const realSupervisorLinks = workers.filter((worker) =>
      !worker.supervisorChatIsPlaceholder
      && typeof worker.supervisorChatUrl === "string"
      && worker.supervisorChatUrl.startsWith("https://"));

    const databasePath = process.env.MISSION_CONTROL_DB ?? "";
    const configuredVolumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH ?? "";
    const volumeEvidence = Boolean(configuredVolumePath && databasePath.startsWith(`${configuredVolumePath}/`));

    return Response.json({
      status: health.status === "ok" && health.chain?.valid !== false ? "ok" : "degraded",
      checkedAt: new Date().toISOString(),
      build: {
        railwayGitCommitSha: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
        railwayDeploymentId: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
      },
      ledger: {
        latestSequence: health.latestSequence ?? null,
        chainValid: health.chain?.valid ?? null,
        chainErrorCount: health.chain?.errors?.length ?? 0,
        databaseConfiguredUnderData: databasePath.startsWith("/data/"),
        persistentVolumeEvidence: volumeEvidence,
      },
      fleet: {
        workers: workers.length,
        connected: workers.filter((worker) => worker.connection?.state === "CONNECTED").length,
        offlineConfigured: workers.filter((worker) => worker.connection?.state === "OFFLINE_CONFIGURED").length,
        fixtureOnly: workers.filter((worker) => worker.connection?.state === "FIXTURE_ONLY").length,
      },
      supervision: {
        projectManagerMessages: projectManagerMessages.length,
        supervisorMessages: supervisorMessages.length,
        verifiedSourceTimedMessages: verifiedReasoningMessages.length,
        realSupervisorLinks: realSupervisorLinks.length,
        placeholderOrMissingSupervisorLinks: workers.length - realSupervisorLinks.length,
        supervisionDirectoryRoute: "/supervision",
        providerBoundChatTransportObserved: verifiedReasoningMessages.length > 0,
        inlineProjectManagerComposerAvailable: false,
        ownerWorkerComposerAvailable: true,
      },
      generatedAt: snapshot.generatedAt ?? null,
    }, {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      },
    });
  } catch {
    return Response.json({ status: "unavailable" }, {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
}
