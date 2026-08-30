import { getStore, ContractInvariantError } from "@/lib/store";
import { supervisorChatLinkSetSchema } from "@/lib/schema";
import { ZodError } from "zod";

export async function POST(request: Request, context: { params: Promise<{ worker: string }> }) {
  try {
    const { worker } = await context.params;
    const body = await request.json();
    const event = supervisorChatLinkSetSchema.parse({
      type: "supervisor_chat_link_set",
      worker,
      supervisor_chat_url: body.supervisor_chat_url,
      supervisor_chat_label: body.supervisor_chat_label,
      reason: body.reason,
    });
    const stored = getStore().append(event);
    return Response.json({ event: stored }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: "Invalid supervisor chat link", issues: error.issues }, { status: 400 });
    if (error instanceof ContractInvariantError) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: "Unable to store supervisor chat link" }, { status: 500 });
  }
}
