import fs from "node:fs";

const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const worker = value("--worker");
const baseUrl = value("--base-url", process.env.MISSION_CONTROL_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const producerId = value("--producer-id", worker ? `worker:${worker}` : null);
const token = value("--token", process.env.MISSION_CONTROL_WORKER_TOKEN);
const inputPath = value("--input");
const observedProfilePath = value("--observed-profile");
const appliedSelectionPath = value("--applied-selection");

if (!worker || !producerId || !inputPath) throw new Error("Provide --worker and --input; producer ID derives from the worker unless explicitly supplied.");
if (!token || token.length < 32) throw new Error("MISSION_CONTROL_WORKER_TOKEN or --token must contain at least 32 characters.");
const requestBody = fs.readFileSync(inputPath, "utf8");
const parsedRequestBody = JSON.parse(requestBody);

const response = await fetch(`${baseUrl}/api/worker-channel/${encodeURIComponent(worker)}/admission`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "x-mission-control-producer-id": producerId,
    "content-type": "application/json",
  },
  body: requestBody,
});
const result = await response.json().catch(() => ({ error: response.statusText }));

if (!response.ok || result.mayExecute !== true) {
  process.stdout.write(`${JSON.stringify({ admission: result }, null, 2)}\n`);
  process.stderr.write("MISSION_CONTROL_EXECUTION_NOT_ADMITTED\n");
  process.exit(2);
}

const observedProfile = observedProfilePath
  ? JSON.parse(fs.readFileSync(observedProfilePath, "utf8"))
  : { model: null, effort: null, fastMode: null };
const appliedSelection = appliedSelectionPath
  ? JSON.parse(fs.readFileSync(appliedSelectionPath, "utf8"))
  : null;
const preflightResponse = await fetch(`${baseUrl}/api/worker-channel/${encodeURIComponent(worker)}/preflight`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "x-mission-control-producer-id": producerId,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    authorizationId: result.profileAuthorizationId,
    requestedProfile: parsedRequestBody?.request?.workExecutionProfile,
    observedProfile,
    appliedSelection,
  }),
});
const preflight = await preflightResponse.json().catch(() => ({ error: preflightResponse.statusText }));
process.stdout.write(`${JSON.stringify({ admission: result, preflight }, null, 2)}\n`);
if (!preflightResponse.ok || preflight.allowed !== true) {
  process.stderr.write(`${preflight.decision ?? "WORK_EXECUTION_PROFILE_PREFLIGHT_FAILED"}\n`);
  process.exit(3);
}
