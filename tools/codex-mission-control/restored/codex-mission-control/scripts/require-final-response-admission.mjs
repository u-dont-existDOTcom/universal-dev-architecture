const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};

const worker = value("--worker");
const baseUrl = value("--base-url", process.env.MISSION_CONTROL_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const producerId = value("--producer-id", worker ? `worker:${worker}` : null);
const token = value("--token", process.env.MISSION_CONTROL_WORKER_TOKEN);

if (!worker || !producerId) throw new Error("Provide --worker; the producer ID derives safely or may be supplied explicitly.");
if (!token || token.length < 32) throw new Error("MISSION_CONTROL_WORKER_TOKEN or --token must contain at least 32 characters.");

const response = await fetch(`${baseUrl}/api/worker-channel/${encodeURIComponent(worker)}/finalization`, {
  method: "GET",
  headers: {
    authorization: `Bearer ${token}`,
    "x-mission-control-producer-id": producerId,
    accept: "application/json",
  },
});
const payload = await response.json().catch(() => ({}));

if (response.status === 409 && payload?.mustContinue === true) {
  process.stdout.write(`${JSON.stringify({
    worker,
    terminalResponseAllowed: false,
    mustContinue: true,
    decision: payload.decision ?? "UNKNOWN",
    requiredNextAction: payload.requiredNextAction ?? "Continue the next safe in-scope action.",
    terminalStateVectorSha256: payload.terminalStateVectorSha256 ?? null,
  }, null, 2)}\n`);
  process.exit(75);
}

if (!response.ok) {
  throw new Error(`Mission Control finalization gate failed with HTTP ${response.status}: ${payload?.error ?? response.statusText}`);
}
if (payload?.terminalResponseAllowed !== true) {
  throw new Error("Mission Control finalization endpoint did not return an explicit terminal-response admission.");
}

process.stdout.write(`${JSON.stringify({
  worker,
  terminalResponseAllowed: true,
  mustContinue: false,
  decision: payload.decision ?? "UNKNOWN",
  requiredNextAction: payload.requiredNextAction ?? null,
  terminalStateVectorSha256: payload.terminalStateVectorSha256 ?? null,
}, null, 2)}\n`);
