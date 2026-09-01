import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const baseUrl = value("--base-url", "http://127.0.0.1:3000").replace(/\/$/, "");
const worker = value("--worker");
const directionId = value("--direction-id");
const ownerToken = value("--owner-token", process.env.MISSION_CONTROL_OWNER_TOKEN);
const expectedRepository = value("--repository");
const output = value("--output");
if (!worker || !directionId || !ownerToken || !expectedRepository) {
  throw new Error("Provide --worker, --direction-id, --repository, and an owner token.");
}

const headers = { authorization: `Bearer ${ownerToken}` };
const workerResponse = await getJson(`${baseUrl}/api/workers/${encodeURIComponent(worker)}`, headers);
const eventsResponse = await getJson(`${baseUrl}/api/events`, headers);
const projected = workerResponse.worker;
const relevant = eventsResponse.events.filter((event) => event.worker === worker
  && (event.data?.direction_id === directionId || event.data?.message_id === directionId.replace(/^direction:/, "message:")));
const ownerRecorded = relevant.find((event) => event.type === "owner_message_recorded");
const delivery = relevant.find((event) => event.type === "outbound_delivery_lifecycle_recorded" && event.data.status === "DELIVERED");
const acknowledged = relevant.find((event) => event.type === "direction_acknowledged");
const queue = relevant.find((event) => event.type === "work_queue_published");
const reconciled = relevant.find((event) => event.type === "direction_reconciled");
const required = { ownerRecorded, delivery, acknowledged, queue, reconciled };
for (const [name, event] of Object.entries(required)) if (!event) throw new Error(`Live acceptance is missing ${name}.`);
if (!(ownerRecorded.sequence < delivery.sequence && delivery.sequence < acknowledged.sequence
  && acknowledged.sequence < queue.sequence && queue.sequence < reconciled.sequence)) {
  throw new Error("Live acceptance event ordering is invalid.");
}
if (projected.channel.freshness !== "CURRENT" || projected.channel.latestDirectionId !== directionId) {
  throw new Error("The live direction is not current in the worker projection.");
}
if (projected.connection.state !== "CONNECTED" || projected.connection.runtimeKind !== "POLLING_SIDECAR"
  || projected.connection.source?.repository !== path.resolve(expectedRepository)) {
  throw new Error("The projection is not bound to the expected real repository sidecar.");
}
if (!projected.channel.queue.length || !projected.channel.proposals.length) throw new Error("The real queue or proposal projection is empty.");
const receipt = {
  acceptance: "PASS",
  checkedAt: new Date().toISOString(),
  worker,
  directionId,
  ledgerOrdering: Object.fromEntries(Object.entries(required).map(([name, event]) => [name, event.sequence])),
  projection: {
    freshness: projected.channel.freshness,
    connection: projected.connection,
    queue: projected.channel.queue,
    blockers: projected.channel.blockers,
    proposals: projected.channel.proposals,
  },
};
const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
if (output) {
  const target = path.resolve(output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, serialized, { flag: "wx" });
}
process.stdout.write(serialized);

async function getJson(url, requestHeaders) {
  const response = await fetch(url, { headers: requestHeaders });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${body.error ?? response.statusText}`);
  return body;
}
