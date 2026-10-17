import { RegisterTask } from "@/components/RegisterTask";
import { ownerSessionCookie, verifyOwnerSessionToken } from "@/lib/owner-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RegisterTaskPage() {
  if (!verifyOwnerSessionToken((await cookies()).get(ownerSessionCookie)?.value)) redirect("/login");
  return <RegisterTask />;
}
