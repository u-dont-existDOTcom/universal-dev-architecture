import fs from "node:fs";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const directPath = value("--direct");
const candidatePath = value("--candidate");
if (!directPath || !candidatePath) throw new Error("Provide --direct and --candidate JSON or JSONL event files.");

const readEvents = (filename) => {
  const source = fs.readFileSync(filename, "utf8").trim();
  if (!source) return [];
  return source.startsWith("[") ? JSON.parse(source) : source.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
};
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  : value;
const fingerprint = (event) => createHash("sha256").update(JSON.stringify(canonical(event))).digest("hex");
const direct = readEvents(directPath);
const candidate = readEvents(candidatePath);
const mismatches = [];
if (direct.length !== candidate.length) mismatches.push(`event_count:${direct.length}:${candidate.length}`);
for (let index = 0; index < Math.max(direct.length, candidate.length); index += 1) {
  if (!direct[index] || !candidate[index]) continue;
  const directId = direct[index].event_id ?? direct[index].eventId;
  const candidateId = candidate[index].event_id ?? candidate[index].eventId;
  if (directId !== candidateId) mismatches.push(`event_order_or_id:${index}:${directId}:${candidateId}`);
  if (fingerprint(direct[index]) !== fingerprint(candidate[index])) mismatches.push(`payload:${index}:${directId}`);
}
const report = {
  evaluation: "mission-control-n8n-adapter-v1",
  authoritative: false,
  directCount: direct.length,
  candidateCount: candidate.length,
  exactEventParity: mismatches.length === 0,
  mismatches,
  decision: mismatches.length === 0 ? "PARITY_PASS_OPERATIONAL_VALUE_STILL_UNPROVEN" : "KEEP_DIRECT_ADAPTER",
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = mismatches.length === 0 ? 0 : 1;
