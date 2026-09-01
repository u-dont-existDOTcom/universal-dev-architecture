import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const tunnelId = valueAfter("--tunnel-id") ?? process.env.OPENAI_MCP_TUNNEL_ID;
const profile = valueAfter("--profile") ?? "mission-control";
if (!tunnelId || !/^tunnel_[A-Za-z0-9]+$/.test(tunnelId)) {
  console.error("Provide --tunnel-id tunnel_... after creating the private tunnel in OpenAI Platform settings.");
  process.exit(2);
}
if (!process.env.CONTROL_PLANE_API_KEY) {
  console.error("CONTROL_PLANE_API_KEY is required by tunnel-client.");
  process.exit(2);
}
if (!process.env.MISSION_CONTROL_MCP_TOKEN || process.env.MISSION_CONTROL_MCP_TOKEN.length < 32) {
  console.error("MISSION_CONTROL_MCP_TOKEN must be the scoped supervisor token configured in MISSION_CONTROL_INGEST_CREDENTIALS.");
  process.exit(2);
}

const bridge = fileURLToPath(new URL("./mcp-stdio.mjs", import.meta.url));
const command = `${process.execPath} ${JSON.stringify(bridge)}`;
const initialized = spawnSync("tunnel-client", [
  "init", "--sample", "sample_mcp_stdio_local", "--profile", profile,
  "--tunnel-id", tunnelId, "--mcp-command", command,
], { stdio: "inherit", env: process.env });
if (initialized.status !== 0) process.exit(initialized.status ?? 1);
const checked = spawnSync("tunnel-client", ["doctor", "--profile", profile, "--explain"], { stdio: "inherit", env: process.env });
process.exit(checked.status ?? 1);

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
