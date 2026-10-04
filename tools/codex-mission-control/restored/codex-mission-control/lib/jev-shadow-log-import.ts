import type { EventStore } from "./store";
import { z } from "zod";
import { sanitizeJevShadowObservation } from "./jev-shadow-telemetry";
import type { JevShadowObservation } from "./jev-shadow";

export function parseJevShadowLogLine(line: string):
  | { kind: "observation"; observedAt: string; observation: JevShadowObservation }
  | { kind: "skipped" | "malformed" } {
  if (!/"event"\s*:\s*"jev_shadow_observation"/.test(line)) return { kind: "skipped" };
  const match = line.match(/^(\S+)\s+(\{.*)\s*$/);
  if (!match || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(match[1])
    || !z.string().datetime().safeParse(match[1]).success) return { kind: "malformed" };
  try {
    const raw = JSON.parse(match[2]);
    if (raw.event !== "jev_shadow_observation") return { kind: "skipped" };
    return { kind: "observation", observedAt: match[1], observation: sanitizeJevShadowObservation(raw) };
  } catch {
    return { kind: "malformed" };
  }
}

export async function importJevShadowLog(lines: AsyncIterable<string> | Iterable<string>, store: Pick<EventStore, "recordJevShadowObservation">) {
  const counts = { read: 0, imported: 0, skipped: 0, malformed: 0 };
  for await (const line of lines) {
    counts.read += 1;
    const parsed = parseJevShadowLogLine(line);
    if (parsed.kind !== "observation") { counts[parsed.kind] += 1; continue; }
    if (store.recordJevShadowObservation({ source: "LOG_IMPORT", observedAt: parsed.observedAt, observation: parsed.observation })) counts.imported += 1;
    else counts.skipped += 1;
  }
  return counts;
}
