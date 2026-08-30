import { getStore } from "@/lib/store";

export async function POST() {
  return Response.json(getStore().markViewed());
}
