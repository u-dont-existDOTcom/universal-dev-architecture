import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const outputIndex = process.argv.indexOf("--output");
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
const workerIndex = process.argv.indexOf("--worker");
const worker = workerIndex >= 0 ? process.argv[workerIndex + 1] : "human-design-governance";
const bridge = fileURLToPath(new URL("./mcp-stdio.mjs", import.meta.url));
const child = spawn(process.execPath, [bridge], { stdio: ["pipe", "pipe", "pipe"], env: process.env });
const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
const responses = new Map();
let stderr = "";
child.stderr.on("data", (chunk) => { stderr += String(chunk); });
lines.on("line", (line) => {
  const parsed = JSON.parse(line);
  if (parsed.id !== undefined) responses.set(parsed.id, parsed);
});
const send = (request) => child.stdin.write(`${JSON.stringify(request)}\n`);
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mission-control-acceptance", version: "1.0.0" } } });
send({ jsonrpc: "2.0", method: "notifications/initialized" });
send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "mission_control_get_fleet", arguments: {} } });
send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "mission_control_get_worker", arguments: { worker } } });

const deadline = Date.now() + 15_000;
while (responses.size < 4 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
child.stdin.end();
if (responses.size < 4) {
  child.kill("SIGTERM");
  throw new Error(`MCP client timed out. ${stderr}`);
}
for (const id of [1, 2, 3, 4]) if (responses.get(id)?.error) throw new Error(`MCP response ${id} failed: ${JSON.stringify(responses.get(id).error)}`);
const tools = responses.get(2).result.tools;
const fleet = responses.get(3).result.structuredContent;
const workerState = responses.get(4).result.structuredContent.worker;
if (!tools.some((tool) => tool.name === "mission_control_get_fleet" && tool.annotations?.readOnlyHint)
  || !tools.some((tool) => tool.name === "mission_control_get_worker" && tool.annotations?.readOnlyHint)) {
  throw new Error("The expected read-only MCP tools were not advertised.");
}
const hermesItem = fleet.fleetQueue.find((item) => item.itemId === "MC-EXP-HERMES-001");
if (!hermesItem || !["READY", "DONE"].includes(hermesItem.status)) throw new Error("The live fleet result did not expose the eligible Hermes queue item.");
if (workerState.id !== worker || workerState.channel.freshness !== "CURRENT" || workerState.connection.state !== "CONNECTED") {
  throw new Error("The live worker MCP result is stale or disconnected.");
}
const receipt = {
  acceptance: "PASS",
  checkedAt: new Date().toISOString(),
  client: "distinct-stdio-mcp-bridge",
  protocolVersion: responses.get(1).result.protocolVersion,
  server: responses.get(1).result.serverInfo,
  tools: tools.map((tool) => ({ name: tool.name, annotations: tool.annotations })),
  fleet: { latestEventId: fleet.latestEventId, hermesQueueState: hermesItem.status, workerCount: fleet.workers.length },
  worker: { id: workerState.id, directionId: workerState.channel.latestDirectionId, freshness: workerState.channel.freshness, connection: workerState.connection.state },
};
const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
if (output) {
  const target = path.resolve(output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, serialized, { flag: "wx" });
}
process.stdout.write(serialized);
