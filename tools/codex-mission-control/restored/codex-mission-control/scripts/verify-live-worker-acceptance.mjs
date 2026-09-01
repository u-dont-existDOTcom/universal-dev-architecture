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
const workerEvents = eventsResponse.events.filter((event) => event.worker === worker);
const relevant = workerEvents.filter((event) => event.data?.direction_id === directionId
  || event.data?.message_id === directionId.replace(/^direction:/, "message:"));
const ownerRecorded = relevant.find((event) => event.type === "owner_message_recorded");
const delivery = relevant.find((event) => event.type === "outbound_delivery_lifecycle_recorded" && event.data.status === "DELIVERED");
const transportAck = relevant.find((event) => event.type === "outbound_message_acknowledged");
const workerMessage = relevant.find((event) => event.type === "worker_message_recorded");
if (!ownerRecorded || !delivery || !transportAck || !workerMessage) {
  const missing = Object.entries({ ownerRecorded, delivery, transportAck, workerMessage })
    .filter(([, event]) => !event).map(([name]) => name);
  throw new Error(`Live transport acceptance is missing ${missing.join(", ")}.`);
}
const connection = workerEvents.find((event) => event.type === "worker_connection_observed"
  && event.data.state === "CONNECTED"
  && event.sequence > transportAck.sequence
  && event.sequence < workerMessage.sequence);
if (!connection) throw new Error("Live transport acceptance is missing the batch-bound connected sidecar observation.");

const semanticEvents = relevant.filter((event) => [
  "direction_acknowledged",
  "work_queue_published",
  "direction_reconciled",
  "structured_blocker_recorded",
  "change_proposal_recorded",
].includes(event.type));
if (semanticEvents.length) {
  throw new Error(`The transport-only sidecar authored forbidden semantic events: ${semanticEvents.map((event) => event.type).join(", ")}.`);
}
if (!(ownerRecorded.sequence < delivery.sequence && delivery.sequence < transportAck.sequence
  && transportAck.sequence < connection.sequence && connection.sequence < workerMessage.sequence)) {
  throw new Error("Live transport acceptance event ordering is invalid.");
}
if (projected.channel.freshness !== "AWAITING_ACKNOWLEDGEMENT" || projected.channel.latestDirectionId !== directionId) {
  throw new Error("Transport delivery incorrectly advanced the direction beyond AWAITING_ACKNOWLEDGEMENT.");
}
if (projected.connection.state !== "CONNECTED" || projected.connection.runtimeKind !== "POLLING_SIDECAR"
  || projected.connection.source?.repository !== path.resolve(expectedRepository)) {
  throw new Error("The projection is not bound to the expected real repository sidecar.");
}
if (projected.channel.queue.length || projected.channel.acknowledgementInterpretation) {
  throw new Error("Transport evidence incorrectly populated a semantic queue or interpretation.");
}
const required = { ownerRecorded, delivery, transportAck, connection, workerMessage };
const receipt = {
  acceptance: "PASS_TRANSPORT_ONLY",
  checkedAt: new Date().toISOString(),
  worker,
  directionId,
  ledgerOrdering: Object.fromEntries(Object.entries(required).map(([name, event]) => [name, event.sequence])),
  semanticCurrent: false,
  requiredNextEvidence: [
    "verified direction_acknowledged from an authenticated worker or reasoning surface",
    "direction-bound work_queue_published",
    "direction_reconciled bound to that queue revision",
  ],
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
