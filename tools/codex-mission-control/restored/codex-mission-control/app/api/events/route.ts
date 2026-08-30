import { getStore, ContractInvariantError } from "@/lib/store";
import { ZodError } from "zod";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ events: getStore().allEvents() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const stored = getStore().append(body);
    return Response.json({ event: stored }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: "Invalid event", issues: error.issues }, { status: 400 });
    if (error instanceof ContractInvariantError) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: "Unable to append event" }, { status: 500 });
  }
}
