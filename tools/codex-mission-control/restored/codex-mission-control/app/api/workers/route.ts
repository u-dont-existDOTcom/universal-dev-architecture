import { relayJson } from "@/lib/daemon-client";

export const dynamic = "force-dynamic";

export async function GET() {
  return relayJson("/snapshot");
}
