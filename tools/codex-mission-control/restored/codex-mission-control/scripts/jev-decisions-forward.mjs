#!/usr/bin/env node
// Forwards ONE OpenRouter Decisions request for the owner-approved, ledger-capped Jev evaluation
// (scripts/jev-budgeted-evaluator.py --via-mission-control HOST:CONTAINER, owner authorization of 2026-11-15).
// The runner keeps the USD 1.00 ledger; this process only signs the request with the OPENROUTER_API_KEY already
// configured for Mission Control, which never leaves it. It prints exactly one JSON line:
//   {"http_status":200,"body":{id,model,provider,usage,answers}}   a reply, typed fields only
//   {"http_status":<n>,"limit_source":<code|null>}                 an HTTP error, never the provider's error body
//   {"http_status":0,"error":"NO_KEY"|"BAD_INPUT"|"TRANSPORT"}     nothing was answered
// With --key-status it reads the key's own limit metadata instead: {"http_status":200,"body":{"data":{limit_remaining}}}.
import { pathToFileURL } from "node:url";

export const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
export const KEY_URL = "https://openrouter.ai/api/v1/key";
const MAX_BODY_BYTES = 32_000;
const PINNED_JEV = /^typesafe\/jev-\d{1,3}\.\d{1,3}$/;
const LIMIT_SOURCES = new Set(["openrouter_in_flight_budget", "openrouter_key_limit", "openrouter_credits"]);

export async function forward({ argv = [], input = "", env = process.env, fetchImpl = fetch, timeoutMs = 30_000 } = {}) {
  const key = env.OPENROUTER_API_KEY?.trim();
  if (!key) return { http_status: 0, error: "NO_KEY" };
  const signal = AbortSignal.timeout(timeoutMs);
  const headers = { Authorization: `Bearer ${key}`, Accept: "application/json" };
  if (argv.includes("--key-status")) {
    try {
      const response = await fetchImpl(KEY_URL, { headers, signal });
      if (!response.ok) {
        await response.body?.cancel?.().catch(() => undefined);
        return { http_status: response.status, limit_source: null };
      }
      const data = (await response.json())?.data;
      const remaining = typeof data?.limit_remaining === "number" ? data.limit_remaining : null;
      return { http_status: 200, body: { data: { limit_remaining: remaining } } };
    } catch {
      return { http_status: 0, error: "TRANSPORT" };
    }
  }
  let request;
  try {
    if (Buffer.byteLength(input) > MAX_BODY_BYTES) throw new Error("too large");
    request = JSON.parse(input);
    if (!request || typeof request !== "object" || Array.isArray(request) || !PINNED_JEV.test(request.model)
      || request.provider?.allow_fallbacks !== false || !request.questions || typeof request.questions !== "object") {
      throw new Error("not a pinned Jev Decisions request");
    }
  } catch {
    return { http_status: 0, error: "BAD_INPUT" };
  }
  let response;
  try {
    response = await fetchImpl(DECISIONS_URL, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(request), signal,
    });
  } catch {
    // The request may have reached the provider: the runner keeps its reservation as spent.
    return { http_status: 0, error: "TRANSPORT" };
  }
  if (!response.ok) {
    let limitSource = null;
    if (response.status === 402 || response.status === 429) {
      try {
        const text = (await response.text()).slice(0, 4096);
        const value = JSON.parse(text)?.error?.metadata?.limit_source;
        if (LIMIT_SOURCES.has(value)) limitSource = value;
      } catch { /* the error body is never kept */ }
    } else {
      await response.body?.cancel?.().catch(() => undefined);
    }
    return { http_status: response.status, limit_source: limitSource };
  }
  try {
    const reply = await response.json();
    const pick = (value, max) => typeof value === "string" && value.length <= max ? value : undefined;
    return { http_status: 200, body: {
      id: pick(reply?.id, 300), model: pick(reply?.model, 200), provider: pick(reply?.provider, 200),
      usage: reply?.usage && typeof reply.usage === "object" ? {
        input_tokens: Number.isFinite(reply.usage.input_tokens) ? reply.usage.input_tokens : undefined,
        output_tokens: Number.isFinite(reply.usage.output_tokens) ? reply.usage.output_tokens : undefined,
        cost: Number.isFinite(reply.usage.cost) ? reply.usage.cost : undefined,
      } : undefined,
      answers: reply?.answers && typeof reply.answers === "object" && !Array.isArray(reply.answers) ? reply.answers : undefined,
    } };
  } catch {
    // Answered but unreadable: billable, unusable. The runner records it as such.
    return { http_status: 200, body: null };
  }
}

async function readStdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES + 1) break;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const argv = process.argv.slice(2);
  const input = argv.includes("--key-status") ? "" : await readStdin();
  process.stdout.write(`${JSON.stringify(await forward({ argv, input }))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stdout.write(`${JSON.stringify({ http_status: 0, error: "TRANSPORT" })}\n`);
  });
}
