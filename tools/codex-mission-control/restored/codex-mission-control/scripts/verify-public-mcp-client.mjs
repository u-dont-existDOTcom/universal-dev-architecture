import fs from "node:fs";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = valueAfter("--endpoint") ?? process.env.MISSION_CONTROL_PUBLIC_MCP_URL;
const challengeId = valueAfter("--challenge-id") ?? process.env.MISSION_CONTROL_CAPABILITY_CHALLENGE_ID;
const chatId = valueAfter("--chat-id") ?? process.env.MISSION_CONTROL_CAPABILITY_CHAT_ID;
const output = valueAfter("--output");
if (!endpoint || !challengeId || !chatId) {
  console.error("Provide --endpoint, --challenge-id, and --chat-id for the safe public MCP verification.");
  process.exit(2);
}

const url = new URL(endpoint);
if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
  throw new Error("The public MCP endpoint must use HTTPS unless it is loopback-only.");
}

const client = new Client({ name: "mission-control-public-acceptance", version: "1.0.0" }, { capabilities: {} });
const transport = new StreamableHTTPClientTransport(url);
try {
  await client.connect(transport);
  const listed = await client.listTools();
  const expected = ["get_capability_challenge", "get_supervisory_request_binding", "get_stage_liveness_state"];
  const names = listed.tools.map((tool) => tool.name);
  if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error(`Unexpected public MCP tools: ${JSON.stringify(names)}`);
  if (listed.tools.some((tool) => tool.annotations?.readOnlyHint !== true || tool.annotations?.destructiveHint !== false)) {
    throw new Error("Every public MCP tool must advertise the read-only, non-destructive boundary.");
  }
  const challenge = await client.callTool({
    name: "get_capability_challenge",
    arguments: { challenge_id: challengeId, chat_id: chatId },
  });
  if (challenge.isError || !challenge.structuredContent) throw new Error("The safe capability challenge MCP call failed.");
  const fields = Object.keys(challenge.structuredContent);
  const allowed = ["schema_version", "challenge_id", "chat_id", "mc_nonce", "github_nonce_sha256", "github_nonce_source", "receipt_target", "expires_at"];
  if (JSON.stringify(fields) !== JSON.stringify(allowed)) throw new Error(`Unexpected capability fields: ${JSON.stringify(fields)}`);
  if (challenge.structuredContent.challenge_id !== challengeId || challenge.structuredContent.chat_id !== chatId) {
    throw new Error("The capability response did not match the exact challenge/chat binding.");
  }
  const receipt = {
    acceptance: "PASS",
    checked_at: new Date().toISOString(),
    endpoint: url.toString(),
    server: "mission-control",
    transport: "STREAMABLE_HTTP",
    tools: listed.tools.map((tool) => ({ name: tool.name, annotations: tool.annotations, securitySchemes: tool._meta?.securitySchemes })),
    safe_call: { tool: "get_capability_challenge", challenge_id: challengeId, chat_id: chatId, status: "OK", returned_fields: fields },
    sensitive_values_logged: false,
  };
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  if (output) {
    const target = path.resolve(output);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, serialized, { flag: "wx" });
  }
  process.stdout.write(serialized);
} finally {
  await client.close();
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
