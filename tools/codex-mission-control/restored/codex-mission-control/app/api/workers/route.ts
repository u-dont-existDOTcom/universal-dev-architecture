import { dashboardSnapshot } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(dashboardSnapshot());
}
