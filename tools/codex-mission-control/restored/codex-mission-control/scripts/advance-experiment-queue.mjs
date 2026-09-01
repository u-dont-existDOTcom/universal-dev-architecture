import { randomUUID } from "node:crypto";

const baseUrl = argument("--base-url") ?? "http://127.0.0.1:3000";
const token = argument("--token") ?? process.env.MISSION_CONTROL_WORKER_TOKEN;
const producerId = "worker:mission-control-live-slice";
if (!token || token.length < 32) throw new Error("Provide the scoped Mission Control worker token.");
const now = new Date().toISOString();
const suffix = randomUUID();
const directionId = "direction:mission-control:continuation";
const queueRevisionId = `queue:mission-control:live-accepted:${suffix}`;
const item = (item_id, title, detail, status, priority, ordinal, depends_on = []) => ({
  item_id, title, detail, status, priority, ordinal, depends_on, created_at: now, updated_at: now,
});
const envelope = (event_id, data) => ({ schema_version: 2, event_id, mission_id: "mission-control-live", occurred_at: now, data });
const events = [
  envelope(`mission-control:connection:${suffix}`, {
    type: "worker_connection_observed", worker: "mission-control-live-slice", connection_id: `connection:mission-control:${suffix}`,
    state: "CONNECTED", runtime_kind: "NATIVE_WORKER", endpoint_id: "worker:mission-control-live-slice:current-task",
    observed_at: now, lease_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(), source: null,
    detail: "The active Mission Control implementation task advanced the live worker-channel acceptance and experiment queue.",
  }),
  envelope(`mission-control:queue:${suffix}`, {
    type: "work_queue_published", worker: "mission-control-live-slice", project_id: "project:mission-control", task_id: "task:mission-control-live-slice",
    queue_revision_id: queueRevisionId, revision: 2, previous_queue_revision_id: "queue:mission-control:continuation", direction_id: directionId, published_at: now,
    items: [
      item("mc:live-worker-channel", "Connect the live HumanDesign worker", "Real repository sidecar polled, acknowledged, published its direction-bound queue, and reconciled the fresh direction.", "DONE", "P0", 0),
      item("MC-EXP-HERMES-001", "Run the bounded Hermes continuity experiment", "Prerequisite satisfied. Run matched baseline/Hermes scenarios and automatically score the preregistered gate; passing can only produce a reviewed candidate.", "READY", "P1", 1, ["mc:live-worker-channel"]),
      item("MC-EVAL-N8N-001", "Evaluate n8n only after recurring adapter burden exists", "WAITING_DEPENDENCY: require at least one recurring real integration burden and preferably two credible flows before comparison.", "PLANNED", "P2", 2, ["mc:recurring-adapter-burden"]),
      item("mc:recurring-adapter-burden", "Establish recurring adapter burden evidence", "No qualifying recurring burden exists yet; keep n8n deferred.", "BLOCKED", "P2", 3),
    ],
  }),
  envelope(`mission-control:reconcile:${suffix}`, {
    type: "direction_reconciled", worker: "mission-control-live-slice", reconciliation_id: `reconcile:mission-control:${suffix}`,
    direction_id: directionId, queue_revision_id: queueRevisionId, status: "INCORPORATED",
    summary: "Live HumanDesign acceptance is complete; Hermes is ready for its bounded experiment and n8n remains dependency-gated.", reconciled_at: now,
  }),
];
const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/worker-channel/mission-control-live-slice/events`, {
  method: "POST", headers: { authorization: `Bearer ${token}`, "x-mission-control-producer-id": producerId, "content-type": "application/json" },
  body: JSON.stringify({ events }),
});
const body = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`${response.status} ${body.error ?? response.statusText}`);
process.stdout.write(`${JSON.stringify({ status: "ADVANCED", queueRevisionId, events: body.events?.map((event) => ({ sequence: event.sequence, type: event.type })) }, null, 2)}\n`);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}
