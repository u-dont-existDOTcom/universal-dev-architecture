import { WorkerDetail } from "@/components/WorkerDetail";

export default async function WorkerPage({ params }: { params: Promise<{ worker: string }> }) {
  const { worker } = await params;
  return <WorkerDetail workerId={worker} />;
}
