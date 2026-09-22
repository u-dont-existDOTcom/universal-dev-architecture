import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

export const VENICE_API_BASE = "https://api.venice.ai/api/v1";
export const DEFAULT_MODEL = "openai-gpt-56-sol";

const MODEL_ALIASES = new Map([
  ["gpt-5.6-sol", DEFAULT_MODEL],
  [DEFAULT_MODEL, DEFAULT_MODEL],
]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

function secureEqual(left, right) {
  const a = Buffer.from(left ?? "");
  const b = Buffer.from(right ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}
function requireGatewayAuth(req, expectedToken) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secureEqual(token, expectedToken)) throw new HttpError(401, "Unauthorized");
}

function normalizeModel(value) {
  if (value === undefined) return DEFAULT_MODEL;
  if (typeof value !== "string") throw new HttpError(400, "model must be a string");
  const model = MODEL_ALIASES.get(value) ?? value;
  if (!/^[A-Za-z0-9._:/-]{1,128}$/.test(model)) throw new HttpError(400, "Invalid model identifier");
  return model;
}

async function readRequestBody(req, maxBytes) {
  const parts = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > maxBytes) throw new HttpError(413, "Request body too large");
    parts.push(part);
  }
  return Buffer.concat(parts).toString("utf8");
}

function sanitizeProviderText(text, apiKey) {
  return apiKey ? text.split(apiKey).join("[REDACTED]") : text;
}
async function proxyResponse(res, upstream, apiKey) {
  const contentType = upstream.headers.get("content-type") || "application/json";
  res.statusCode = upstream.status;
  res.setHeader("content-type", contentType);
  if (!upstream.ok) {
    res.end(sanitizeProviderText(await upstream.text(), apiKey));
    return;
  }
  if (!upstream.body) {
    res.end();
    return;
  }
  Readable.fromWeb(upstream.body).pipe(res);
}

export function createGatewayServer(options = {}) {
  const veniceApiKey = options.veniceApiKey ?? process.env.VENICE_API_KEY?.trim();
  const gatewayToken = options.gatewayToken ?? process.env.MODEL_GATEWAY_TOKEN?.trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBodyBytes = options.maxBodyBytes ?? 16 * 1024 * 1024;
  if (!veniceApiKey) throw new Error("VENICE_API_KEY is required");
  if (!gatewayToken) throw new Error("MODEL_GATEWAY_TOKEN is required");

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://gateway.local");
      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { ok: true, provider: "venice", default_model: DEFAULT_MODEL });
        return;
      }
      requireGatewayAuth(req, gatewayToken);

      if (req.method === "GET" && url.pathname === "/v1/models") {
        const upstream = await fetchImpl(`${VENICE_API_BASE}/models`, {
          headers: { authorization: `Bearer ${veniceApiKey}` },
        });
        await proxyResponse(res, upstream, veniceApiKey);
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
        const raw = await readRequestBody(req, maxBodyBytes);
        let body;
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          throw new HttpError(400, "Invalid JSON body");
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "JSON body must be an object");
        body.model = normalizeModel(body.model);
        const upstream = await fetchImpl(`${VENICE_API_BASE}/chat/completions`, {
          method: "POST",
          headers: { authorization: `Bearer ${veniceApiKey}`, "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        await proxyResponse(res, upstream, veniceApiKey);
        return;
      }
      throw new HttpError(404, "Not found");
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const status = error instanceof HttpError ? error.status : 502;
      const message = error instanceof HttpError ? error.message : "Upstream request failed";
      sendJson(res, status, { error: message });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port");
  const server = createGatewayServer();
  server.listen(port, () => {
    process.stdout.write(`venice-model-gateway listening on ${port}\n`);
  });
}
