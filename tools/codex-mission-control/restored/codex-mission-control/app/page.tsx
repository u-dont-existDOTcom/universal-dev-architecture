import { Dashboard } from "@/components/Dashboard";
import { ownerSessionCookie, verifyOwnerSessionToken } from "@/lib/owner-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  if (!verifyOwnerSessionToken((await cookies()).get(ownerSessionCookie)?.value)) redirect("/login");
  return <Dashboard />;
}
