import { randomUUID } from "node:crypto";

const baseUrl = argument("--base-url") ?? "http://127.0.0.1:3000";
const workerToken = argument("--worker-token") ?? process.env.MISSION_CONTROL_WORKER_TOKEN;
const ownerToken = argument("--owner-token") ?? process.env.MISSION_CONTROL_OWNER_TOKEN;
if (!workerToken || workerToken.length < 32 || !ownerToken || ownerToken.length < 32) throw new Error("Scoped worker and owner tokens are required.");
const currentResponse = await fetch(`${baseUrl.replace(/\/$/, "")}/api/workers/mission-control-live-slice`, { headers: { authorization: `Bearer ${ownerToken}` } });
const currentBody = await currentResponse.json().catch(() => ({}));
if (!currentResponse.ok) throw new Error(`${currentResponse.status} ${currentBody.error ?? currentResponse.statusText}`);
const current = currentBody.worker.channel;
const now = new Date().toISOString();
const suffix = randomUUID();
const queueRevisionId = `queue:mission-control:hermes-scored:${suffix}`;
const items = current.queue.map((item) => ({
  item_id: item.itemId, title: item.title,
  detail: item.itemId === "MC-EXP-HERMES-001"
    ? "COMPLETED_PROVIDER_INDEPENDENT: 18 official-runtime matched runs achieved full fidelity but failed the adoption gate (no recovery-time or correction improvement). Decision: DO_NOT_ADOPT_KEEP_BASELINE. LLM-backed semantic runs remain blocked on an experiment-only provider credential."
    : item.detail,
  status: item.itemId === "MC-EXP-HERMES-001" ? "DONE" : item.status,
  priority: item.priority, ordinal: item.ordinal, depends_on: item.dependsOn,
  created_at: item.createdAt, updated_at: now,
}));
const event = (event_id, data) => ({ schema_version: 2, event_id, mission_id: "mission-control-live", occurred_at: now, data });
const events = [
  event(`mission-control:hermes-queue:${suffix}`, {
    type: "work_queue_published", worker: "mission-control-live-slice", project_id: "project:mission-control", task_id: "task:mission-control-live-slice",
    queue_revision_id: queueRevisionId, revision: current.queue[0].revision + 1, previous_queue_revision_id: current.queueRevisionId,
    direction_id: current.latestDirectionId, published_at: now, items,
  }),
  event(`mission-control:hermes-reconcile:${suffix}`, {
    type: "direction_reconciled", worker: "mission-control-live-slice", reconciliation_id: `reconcile:mission-control:hermes:${suffix}`,
    direction_id: current.latestDirectionId, queue_revision_id: queueRevisionId, status: "INCORPORATED",
    summary: "Hermes experiment scored automatically as DO_NOT_ADOPT_KEEP_BASELINE; n8n remains waiting on recurring-burden evidence.", reconciled_at: now,
  }),
];
const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/worker-channel/mission-control-live-slice/events`, {
  method: "POST", headers: { authorization: `Bearer ${workerToken}`, "x-mission-control-producer-id": "worker:mission-control-live-slice", "content-type": "application/json" }, body: JSON.stringify({ events }),
});
const body = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`${response.status} ${body.error ?? response.statusText}`);
process.stdout.write(`${JSON.stringify({ status: "RECORDED", queueRevisionId, decision: "DO_NOT_ADOPT_KEEP_BASELINE" }, null, 2)}\n`);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}
