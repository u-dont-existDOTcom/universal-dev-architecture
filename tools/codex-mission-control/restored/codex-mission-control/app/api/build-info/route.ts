import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Public, non-secret release identity used to prove which reviewed Mission
 * Control build is actually serving traffic. Never add credentials, runtime
 * configuration values, worker state, owner data, or event content here.
 */
export async function GET() {
  return NextResponse.json(
    {
      service: "mission-control",
      status: "READY",
      authorityGateVersion: "chat-work-authority-v1",
      git: {
        commitSha:
          process.env.RAILWAY_GIT_COMMIT_SHA ??
          process.env.MISSION_CONTROL_BUILD_SHA ??
          "UNKNOWN",
        branch:
          process.env.RAILWAY_GIT_BRANCH ??
          process.env.MISSION_CONTROL_BUILD_BRANCH ??
          "UNKNOWN",
      },
      deployment: {
        id: process.env.RAILWAY_DEPLOYMENT_ID ?? "UNKNOWN",
        environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? "UNKNOWN",
        service: process.env.RAILWAY_SERVICE_NAME ?? "UNKNOWN",
      },
      capabilities: {
        chatWorkAuthorityGate: true,
        reasoningMessageTranscript: true,
        projectManagerAndSupervisorRoutingModel: true,
        automaticInternalSupervisorRoutingPolicy: true,
        visibleSourceTimeContract: true,
      },
      limitations: [
        "This endpoint proves deployed code identity and declared capability only.",
        "It does not prove that provider-bound ChatGPT transports, chat links, or transcript events are currently connected.",
      ],
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
