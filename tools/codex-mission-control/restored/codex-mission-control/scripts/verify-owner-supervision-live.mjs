const baseUrl = argument("--base-url") ?? "http://127.0.0.1:3000";
const worker = argument("--worker");
const ownerToken = process.env.MISSION_CONTROL_OWNER_TOKEN;

if (!worker) throw new Error("Provide --worker with the exact live worker ID.");
if (!ownerToken || ownerToken.length < 32) throw new Error("MISSION_CONTROL_OWNER_TOKEN is required.");

const origin = new URL(baseUrl).origin;
const login = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST",
  redirect: "manual",
  headers: { origin, "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ token: ownerToken }),
});
if (login.status !== 303) throw new Error(`Owner login returned ${login.status}, expected 303.`);
const cookie = login.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
if (!cookie) throw new Error("Owner login did not issue a session cookie.");

const pages = {};
for (const [name, pathname] of Object.entries({
  fleet: "/",
  supervision: "/supervision",
  worker: `/worker/${encodeURIComponent(worker)}`,
})) {
  const response = await fetch(`${baseUrl}${pathname}`, { headers: { cookie } });
  pages[name] = response.status;
  if (response.status !== 200) throw new Error(`${name} returned ${response.status}, expected 200.`);
}

const workerResponse = await fetch(`${baseUrl}/api/workers/${encodeURIComponent(worker)}`, { headers: { cookie } });
const workerBody = await workerResponse.json().catch(() => ({}));
if (workerResponse.status !== 200 || workerBody.worker?.id !== worker) {
  throw new Error(`The exact live worker detail was unavailable (${workerResponse.status}).`);
}
if (workerBody.worker.connection?.state !== "CONNECTED" || workerBody.worker.connection?.runtimeKind === "FIXTURE") {
  throw new Error("The worker detail is not backed by current authenticated live connection evidence.");
}

const operatorResponse = await fetch(`${baseUrl}/api/operator-status`, { headers: { cookie } });
const operator = await operatorResponse.json().catch(() => ({}));
if (operatorResponse.status !== 200) throw new Error(`Operator status returned ${operatorResponse.status}.`);
if (operator.authority?.writer !== "MISSION_CONTROL_SINGLE_WRITER" || operator.authority?.ledgerIntegrity !== "VALID") {
  throw new Error("Mission Control single-writer or ledger integrity is not healthy.");
}
if (operator.providerRelayState !== "HEALTHY" || !operator.activeHostLabel) {
  throw new Error("The active provider/browser transport is not currently healthy.");
}
if (!Array.isArray(operator.hosts) || operator.hosts.length !== 2 || operator.hosts.filter((host) => host.active).length !== 1) {
  throw new Error("The operator projection does not prove exactly one active host across the two-host topology.");
}
if (new Set(operator.hosts.map((host) => host.role)).size !== 2
  || new Set(operator.hosts.map((host) => host.label)).size !== 2
  || !operator.hosts.every((host) => typeof host.label === "string" && host.label.trim() !== ""
    && ["PRIMARY", "SECONDARY"].includes(host.role)
    && host.reportFresh === true && host.authorityBindingState === "BOUND")) {
  throw new Error("The operator projection does not contain two fresh, authority-bound owner-readable host rows.");
}
if (operator.authority.activeLeaseRole !== "PRIMARY" || !Number.isInteger(operator.authority.epoch)
  || operator.authority.epoch < 1 || operator.authority.queueDepth < 0) {
  throw new Error("The active authority epoch, role, or queue depth is invalid.");
}
if (operator.pacing.configuredMinimumIntervalMs < 60_000
  || operator.pacing.violationsBelowConfiguredMinimum !== 0
  || operator.pacing.minimumObservedIntervalMs !== null
    && operator.pacing.minimumObservedIntervalMs < operator.pacing.configuredMinimumIntervalMs) {
  throw new Error("The shared provider pacing evidence does not satisfy the configured minimum interval.");
}
if (operator.pacing.rateLimitState !== "CLEAR" || (operator.pacing.cooldownRemainingMs ?? 0) > 0) {
  throw new Error("The provider rate-limit state is not currently clear.");
}

const directoryResponse = await fetch(`${baseUrl}/api/supervisor-directory`, { headers: { cookie } });
const directory = await directoryResponse.json().catch(() => ({}));
if (directoryResponse.status !== 200 || directory.configurationState !== "CONFIGURED" || !Array.isArray(directory.entries)) {
  throw new Error(`The authenticated private supervisor directory was unavailable (${directoryResponse.status}).`);
}
const projectManagers = directory.entries.filter((entry) => entry.scope === "PROJECT_MANAGER");
const specialists = directory.entries.filter((entry) => entry.scope === "SPECIALIST");
if (projectManagers.length !== 1 || specialists.length !== 2 || directory.entries.length !== 3) {
  throw new Error("The private supervisor directory does not contain one permanent Project Manager and two specialists.");
}
if (new Set(directory.entries.map((entry) => entry.bootstrapCapability?.url)).size !== 3
  || !directory.entries.every((entry) => isPrivateChatUrl(entry.bootstrapCapability?.url))) {
  throw new Error("A private supervisor entry does not contain a distinct direct ChatGPT link.");
}
if (!Array.isArray(operator.supervisors) || operator.supervisors.length !== 3
  || !directory.entries.every((entry) => operator.supervisors.some((supervisor) => supervisor.supervisorId === entry.supervisorId
    && supervisor.registered === true && supervisor.reachable === true && supervisor.sourceBound === true))) {
  throw new Error("The three private supervisor links are not all registered, reachable, and source-bound.");
}
const serializedOperator = JSON.stringify(operator);
if (/token|cookie|privatekey|targetid|hostalias|leaseid|conversationurl|chatid/i.test(serializedOperator)) {
  throw new Error("The operator projection contains a prohibited private field name.");
}

const sse = await fetch(`${baseUrl}/api/events/stream`, { headers: { cookie, accept: "text/event-stream" } });
if (sse.status !== 200 || !sse.body) throw new Error(`Owner SSE returned ${sse.status}.`);
const reader = sse.body.getReader();
const timeout = setTimeout(() => void reader.cancel(), 5_000);
let sseReady = false;
try {
  const decoder = new TextDecoder();
  let received = "";
  while (received.length < 16_384) {
    const { done, value } = await reader.read();
    if (done) break;
    received += decoder.decode(value, { stream: true });
    if (received.includes("event: ready")) {
      sseReady = true;
      break;
    }
  }
} finally {
  clearTimeout(timeout);
  await reader.cancel().catch(() => undefined);
}
if (!sseReady) throw new Error("Owner SSE did not emit its authenticated ready event.");

process.stdout.write(`${JSON.stringify({
  acceptance: "PASS",
  checkedAt: new Date().toISOString(),
  route: "SSH_LOOPBACK_FORWARD",
  pages,
  ownerSession: "AUTHENTICATED",
  sse: "READY",
  worker: {
    id: worker,
    connection: workerBody.worker.connection.state,
    runtimeKind: workerBody.worker.connection.runtimeKind,
  },
  authority: {
    state: operator.authority.state,
    writer: operator.authority.writer,
    activeLeaseRole: operator.authority.activeLeaseRole,
    epoch: operator.authority.epoch,
    ledgerIntegrity: operator.authority.ledgerIntegrity,
    queueDepth: operator.authority.queueDepth,
  },
  pacing: {
    configuredMinimumIntervalMs: operator.pacing.configuredMinimumIntervalMs,
    minimumObservedIntervalMs: operator.pacing.minimumObservedIntervalMs,
    violationsBelowConfiguredMinimum: operator.pacing.violationsBelowConfiguredMinimum,
    rateLimitState: operator.pacing.rateLimitState,
    cooldownRemainingMs: operator.pacing.cooldownRemainingMs,
  },
  providerTransport: operator.providerRelayState,
  activeHostLabel: operator.activeHostLabel,
  hosts: operator.hosts.map((host) => ({
    label: host.label,
    role: host.role,
    active: host.active,
    reportFresh: host.reportFresh,
    relayWorkerState: host.relayWorkerState,
    browserState: host.browserState,
    authorityBindingState: host.authorityBindingState,
  })),
  supervision: {
    permanentProjectManagerLinks: projectManagers.length,
    specialistLinks: specialists.length,
    registered: operator.supervisors.filter((supervisor) => supervisor.registered).length,
    reachable: operator.supervisors.filter((supervisor) => supervisor.reachable).length,
    sourceBound: operator.supervisors.filter((supervisor) => supervisor.sourceBound).length,
  },
}, null, 2)}\n`);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

function isPrivateChatUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "chatgpt.com" && url.pathname.length > 1
      && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}
