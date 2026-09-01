import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const planPath = value("--plan");
const runsPath = value("--runs");
const output = value("--output");
const runId = value("--run-id");
const verdict = value("--verdict");
const strongestLiteralDefect = value("--strongest-literal-defect");
const evaluatorMessageReceiptId = value("--evaluator-message-receipt-id");
const evaluatorSentAtSource = value("--evaluator-sent-at-source");
const evaluatorProvenanceStatus = value("--evaluator-provenance-status");
const runtimeIdentityVisible = value("--runtime-identity-visible");
const verdictFrozenBeforeStateRead = value("--verdict-frozen-before-state-read");

const required = {
  planPath, runsPath, output, runId, verdict, evaluatorMessageReceiptId,
  evaluatorSentAtSource, evaluatorProvenanceStatus, runtimeIdentityVisible,
  verdictFrozenBeforeStateRead,
};
const missing = Object.entries(required).filter(([, item]) => !item).map(([key]) => key);
if (missing.length) throw new Error(`Missing required arguments: ${missing.join(", ")}`);
if (!["PASS", "FAIL", "UNCERTAIN"].includes(verdict)) throw new Error("Verdict must be PASS, FAIL, or UNCERTAIN.");
if (["FAIL", "UNCERTAIN"].includes(verdict) && !strongestLiteralDefect) {
  throw new Error("FAIL and UNCERTAIN require the strongest literal defect.");
}
if (verdict === "PASS" && strongestLiteralDefect) throw new Error("PASS cannot carry a contradictory strongest defect.");
if (runtimeIdentityVisible !== "false") throw new Error("Evaluator runtime identity must remain hidden until after the verdict is frozen.");
if (verdictFrozenBeforeStateRead !== "true") throw new Error("The literal verdict must be frozen before state or consequences are read.");
if (!["VERIFIED", "OWNER_ATTESTED"].includes(evaluatorProvenanceStatus)) {
  throw new Error("Evaluator message provenance must be VERIFIED or OWNER_ATTESTED; copied/unknown reasoning cannot qualify.");
}
if (!Number.isFinite(new Date(evaluatorSentAtSource).getTime())) throw new Error("evaluator-sent-at-source must be an ISO timestamp.");

const plan = JSON.parse(fs.readFileSync(path.resolve(planPath), "utf8"));
if (sha256(canonicalJson(withoutDigest(plan))) !== plan.runPlanSha256) throw new Error("Run plan digest mismatch.");
const runPlanItem = plan.runs.find((item) => item.runId === runId);
if (!runPlanItem) throw new Error(`Run ${runId} is not present in the plan.`);
const runs = readJsonl(path.resolve(runsPath));
const run = runs.find((item) => item.runId === runId);
if (!run) throw new Error(`Run ${runId} has no candidate record.`);
if (run.runPlanSha256 !== plan.runPlanSha256 || run.exactWriterInputSha256 !== runPlanItem.exactWriterInputSha256) {
  throw new Error("Candidate provenance does not bind the immutable run plan and exact writer input.");
}

const target = path.resolve(output);
const existing = fs.existsSync(target) ? readJsonl(target) : [];
if (existing.some((item) => item.runId === runId)) throw new Error(`Run ${runId} already has a frozen evaluation.`);
const record = {
  schemaVersion: 1,
  experimentId: plan.experimentId,
  runPlanSha256: plan.runPlanSha256,
  runId,
  candidateSha256: run.candidateSha256,
  verdict,
  strongestLiteralDefect: strongestLiteralDefect ?? null,
  evaluatorMessageReceiptId,
  evaluatorSentAtSource,
  evaluatorProvenanceStatus,
  runtimeIdentityVisibleBeforeVerdict: false,
  verdictFrozenBeforeStateRead: true,
  evaluatorRewroteCandidate: false,
  recordedAt: new Date().toISOString(),
};
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.appendFileSync(target, `${JSON.stringify(record)}\n`, { encoding: "utf8" });
process.stdout.write(`${JSON.stringify({
  status: "BLIND_EDITORIAL_VERDICT_RECORDED",
  runId,
  candidateSha256: run.candidateSha256,
  verdict,
  evaluatorProvenanceStatus,
}, null, 2)}\n`);

function readJsonl(filename) {
  return fs.readFileSync(filename, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function withoutDigest(value) {
  const { runPlanSha256: _digest, ...rest } = value;
  return rest;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
