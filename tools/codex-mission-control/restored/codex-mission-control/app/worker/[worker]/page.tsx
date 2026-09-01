import { WorkerDetail } from "@/components/WorkerDetail";
import { ownerSessionCookie, verifyOwnerSessionToken } from "@/lib/owner-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function WorkerPage({ params }: { params: Promise<{ worker: string }> }) {
  if (!verifyOwnerSessionToken((await cookies()).get(ownerSessionCookie)?.value)) redirect("/login");
  const { worker } = await params;
  return <WorkerDetail workerId={worker} />;
}
