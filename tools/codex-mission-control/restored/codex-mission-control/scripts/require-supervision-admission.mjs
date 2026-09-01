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

if (!worker || !producerId || !inputPath) throw new Error("Provide --worker and --input; producer ID derives from the worker unless explicitly supplied.");
if (!token || token.length < 32) throw new Error("MISSION_CONTROL_WORKER_TOKEN or --token must contain at least 32 characters.");
const requestBody = fs.readFileSync(inputPath, "utf8");
JSON.parse(requestBody);

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
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

if (!response.ok || result.mayExecute !== true) {
  process.stderr.write("MISSION_CONTROL_EXECUTION_NOT_ADMITTED\n");
  process.exit(2);
}
