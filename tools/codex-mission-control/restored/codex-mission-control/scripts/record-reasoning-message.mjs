import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const values = (name) => args.flatMap((item, index) => item === name && args[index + 1] ? [args[index + 1]] : []);
const present = (name) => args.includes(name);

const baseUrl = value("--base-url", "http://127.0.0.1:3000").replace(/\/$/, "");
const worker = value("--worker");
const producerId = value("--producer-id");
const expectedProducerKind = value("--expected-producer-kind");
const token = value("--token", process.env.MISSION_CONTROL_INGEST_TOKEN);
const missionId = value("--mission-id", "mission-control-live");
const eventId = value("--event-id");
const messageId = value("--message-id");
const threadId = value("--thread-id");
const surfaceRole = value("--surface-role");
const providerSurface = value("--provider-surface", "UNKNOWN");
const modelMode = value("--model-mode", "UNKNOWN");
const accountWorkspace = value("--account-workspace", "UNKNOWN");
const authorRole = value("--author-role");
const sentAtSource = value("--sent-at-source");
const receivedAtMissionControl = value("--received-at-mission-control", new Date().toISOString());
const bodyFile = value("--body-file");
const providerLocator = value("--provider-locator");
const parentMessageId = value("--parent-message-id");
const ownerDirectionId = value("--owner-direction-id");
const decisionRequestId = value("--decision-request-id");
const acquisitionMethod = value("--acquisition-method");
const provenanceStatus = value("--provenance-status");
const limitations = values("--limitation");
const dryRun = present("--dry-run");

const required = {
  worker,
  producerId,
  expectedProducerKind,
  messageId,
  threadId,
  surfaceRole,
  authorRole,
  acquisitionMethod,
  provenanceStatus,
};
const missing = Object.entries(required).filter(([, item]) => !item).map(([key]) => key);
if (missing.length) throw new Error(`Missing required arguments: ${missing.join(", ")}`);
if (!dryRun && (!token || token.length < 32)) throw new Error("MISSION_CONTROL_INGEST_TOKEN or --token must contain at least 32 characters.");
if (expectedProducerKind === "WORKER") throw new Error("A WORKER/Codex credential cannot record Project Manager or supervisory ChatGPT messages.");
if (!["SUPERVISOR", "COLLECTOR", "OWNER_AUTHORITY"].includes(expectedProducerKind)) {
  throw new Error("--expected-producer-kind must be SUPERVISOR, COLLECTOR, or OWNER_AUTHORITY.");
}
if (!["PROJECT_MANAGER", "SUPERVISOR"].includes(surfaceRole)) throw new Error("--surface-role must be PROJECT_MANAGER or SUPERVISOR.");
if (!["OWNER", "ASSISTANT", "SYSTEM"].includes(authorRole)) throw new Error("--author-role must be OWNER, ASSISTANT, or SYSTEM.");
if (!["CHATGPT_CONSUMER", "CHATGPT_WORK", "OPENAI_API", "UNKNOWN"].includes(providerSurface)) {
  throw new Error("Unsupported --provider-surface.");
}
if (!["PROVIDER_DIRECT", "INDEPENDENT_READER_DIRECT", "OWNER_ATTESTED", "CODEX_COPIED", "UNKNOWN"].includes(acquisitionMethod)) {
  throw new Error("Unsupported --acquisition-method.");
}
if (!["VERIFIED", "OWNER_ATTESTED", "UNVERIFIED"].includes(provenanceStatus)) throw new Error("Unsupported --provenance-status.");
if (Boolean(bodyFile) === Boolean(providerLocator)) throw new Error("Provide exactly one of --body-file or --provider-locator.");
if (!isTimestamp(receivedAtMissionControl)) throw new Error("--received-at-mission-control must be an ISO timestamp.");
if (sentAtSource && !isTimestamp(sentAtSource)) throw new Error("--sent-at-source must be an ISO timestamp.");
if (provenanceStatus === "VERIFIED"
  && (!sentAtSource || providerSurface === "UNKNOWN"
    || !["PROVIDER_DIRECT", "INDEPENDENT_READER_DIRECT"].includes(acquisitionMethod))) {
  throw new Error("VERIFIED requires source send time, a known provider surface, and provider-direct or independent-reader acquisition.");
}
if (provenanceStatus === "OWNER_ATTESTED" && (acquisitionMethod !== "OWNER_ATTESTED" || authorRole !== "OWNER")) {
  throw new Error("OWNER_ATTESTED requires owner-authored text and OWNER_ATTESTED acquisition.");
}
if (acquisitionMethod === "CODEX_COPIED" && provenanceStatus !== "UNVERIFIED") {
  throw new Error("CODEX_COPIED material is UNVERIFIED and cannot acquire ChatGPT authority.");
}
if (expectedProducerKind === "OWNER_AUTHORITY"
  && !(authorRole === "OWNER" && acquisitionMethod === "OWNER_ATTESTED" && provenanceStatus === "OWNER_ATTESTED")) {
  throw new Error("OWNER_AUTHORITY may record only owner-authored, owner-attested messages.");
}
if (expectedProducerKind === "SUPERVISOR" && authorRole !== "ASSISTANT") {
  throw new Error("SUPERVISOR credentials may record only their own assistant messages.");
}
if (expectedProducerKind === "COLLECTOR"
  && !(provenanceStatus === "VERIFIED" && ["PROVIDER_DIRECT", "INDEPENDENT_READER_DIRECT"].includes(acquisitionMethod))) {
  throw new Error("COLLECTOR credentials require verified provider-direct or independent-reader evidence.");
}

const exactVisibleBody = bodyFile ? fs.readFileSync(path.resolve(bodyFile), "utf8") : null;
if (exactVisibleBody !== null && !exactVisibleBody.trim()) throw new Error("The exact visible message body is empty.");
const bodySha256 = exactVisibleBody === null
  ? sha256(`PROVIDER_LOCATOR_ONLY\n${providerLocator}`)
  : sha256(exactVisibleBody);
const recordedEventId = eventId ?? `event:${messageId}:${bodySha256.slice(0, 12)}`;
const envelope = {
  schema_version: 2,
  event_id: recordedEventId,
  mission_id: missionId,
  occurred_at: receivedAtMissionControl,
  data: {
    type: "reasoning_message_recorded",
    worker,
    message_id: messageId,
    thread_id: threadId,
    surface_role: surfaceRole,
    provider_surface: providerSurface,
    model_mode: modelMode,
    account_workspace: accountWorkspace,
    author_role: authorRole,
    sent_at_source: sentAtSource,
    received_at_mission_control: receivedAtMissionControl,
    body_sha256: bodySha256,
    exact_visible_body: exactVisibleBody,
    immutable_provider_locator: providerLocator,
    parent_message_id: parentMessageId,
    owner_direction_id: ownerDirectionId,
    decision_request_id: decisionRequestId,
    acquisition_method: acquisitionMethod,
    provenance_status: provenanceStatus,
    limitations,
    recorded_by: producerId,
  },
};

if (dryRun) {
  process.stdout.write(`${JSON.stringify({
    status: "REASONING_MESSAGE_VALID_DRY_RUN_NOT_INGESTED",
    expectedProducerKind,
    serverWillReauthenticateProducer: true,
    envelope,
  }, null, 2)}\n`);
  process.exit(0);
}

const response = await fetch(`${baseUrl}/api/events`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "x-mission-control-producer-id": producerId,
    "content-type": "application/json",
  },
  body: JSON.stringify(envelope),
});
const result = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`${response.status} ${result.error ?? response.statusText}`);
process.stdout.write(`${JSON.stringify({
  status: "REASONING_MESSAGE_INGESTED",
  eventId: recordedEventId,
  messageId,
  bodySha256,
  provenanceStatus,
  sourceSentAt: sentAtSource,
  result,
}, null, 2)}\n`);

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function isTimestamp(value) {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}
