import readline from "node:readline";

const endpoint = process.env.MISSION_CONTROL_MCP_URL ?? "http://127.0.0.1:3000/api/mcp";
const producerId = process.env.MISSION_CONTROL_MCP_PRODUCER_ID ?? "supervisor:chatgpt-tunnel";
const token = process.env.MISSION_CONTROL_MCP_TOKEN;
if (!token || token.length < 32) {
  console.error("MISSION_CONTROL_MCP_TOKEN must be a scoped Mission Control supervisor credential.");
  process.exit(1);
}

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
for await (const line of lines) {
  if (!line.trim()) continue;
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } });
    continue;
  }
  if (request.method === "notifications/initialized" && request.id === undefined) continue;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-mission-control-producer-id": producerId,
      },
      body: JSON.stringify(request),
    });
    const body = await response.json().catch(() => ({ jsonrpc: "2.0", id: request.id ?? null, error: { code: -32000, message: `Mission Control returned HTTP ${response.status}.` } }));
    write(body);
  } catch {
    write({ jsonrpc: "2.0", id: request.id ?? null, error: { code: -32001, message: "The live Mission Control service is unavailable." } });
  }
}

function write(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
