import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const planPath = value("--plan");
const runId = value("--run-id");
const candidatePath = value("--candidate");
const output = value("--output");
const providerSurface = value("--provider-surface");
const modelFamily = value("--model-family");
const exactModelIdentifier = value("--exact-model-identifier");
const modelMode = value("--model-mode");
const generationConfigSha256 = value("--generation-config-sha256");
const orchestratorVersion = value("--orchestrator-version");
const startedAt = value("--started-at");
const completedAt = value("--completed-at");
const memoryState = value("--memory-state");
const sessionSearchState = value("--session-search-state");
const inheritedStateFlags = value("--inherited-state-flags");
const runtimeIdentityStatus = value("--runtime-identity-status");
const dryRun = args.includes("--dry-run");

const required = {
  planPath, runId, candidatePath, output, providerSurface, modelFamily,
  exactModelIdentifier, modelMode, generationConfigSha256, orchestratorVersion,
  startedAt, completedAt, memoryState, sessionSearchState, inheritedStateFlags,
  runtimeIdentityStatus,
};
const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
if (missing.length) throw new Error(`Missing required arguments: ${missing.join(", ")}`);

const plan = JSON.parse(fs.readFileSync(path.resolve(planPath), "utf8"));
const run = plan.runs.find((candidate) => candidate.runId === runId);
if (!run) throw new Error(`Run ${runId} is not present in the immutable plan.`);
if (sha256(canonicalJson(withoutDigest(plan))) !== plan.runPlanSha256) {
  throw new Error("The run plan digest does not match its contents.");
}
if (runtimeIdentityStatus !== "VERIFIED") throw new Error("Runtime identity must be VERIFIED; unknown model/runtime identity invalidates the run.");
if (!exactModelIdentifier || /^unknown$/i.test(exactModelIdentifier)) throw new Error("An exact non-UNKNOWN model identifier is required.");
if (!/^[a-f0-9]{64}$/.test(generationConfigSha256)) throw new Error("generation-config-sha256 must be a lowercase SHA-256 digest.");
if (memoryState !== "DISABLED") throw new Error("Persistent memory must be DISABLED for every arm.");
if (sessionSearchState !== "DISABLED") throw new Error("Session search must be DISABLED for every arm.");
if (inheritedStateFlags !== "NONE") throw new Error("Inherited-state flags must be NONE; contaminated runs are invalid rather than repaired.");
for (const [label, value] of [["started-at", startedAt], ["completed-at", completedAt]]) {
  if (!Number.isFinite(new Date(value).getTime())) throw new Error(`${label} must be an ISO timestamp.`);
}
if (new Date(completedAt).getTime() < new Date(startedAt).getTime()) throw new Error("completed-at precedes started-at.");

const exactCandidate = fs.readFileSync(path.resolve(candidatePath), "utf8").trim();
if (!exactCandidate) throw new Error("Candidate text is empty.");
const wordCount = countWords(exactCandidate);
if (wordCount < plan.sampleBudget.minimumWords || wordCount > plan.sampleBudget.maximumWords) {
  throw new Error(`Candidate word count ${wordCount} is outside ${plan.sampleBudget.minimumWords}-${plan.sampleBudget.maximumWords}.`);
}
const forbiddenMarkers = [/\bPASS\b/i, /\bFAIL\b/i, /PANGRAM/i, /candidate[_ -]?\d+/i, /writer lane/i];
if (forbiddenMarkers.some((pattern) => pattern.test(exactCandidate))) {
  throw new Error("Candidate contains experiment/evaluator metadata and is contaminated.");
}

const record = {
  schemaVersion: 2,
  experimentId: plan.experimentId,
  experimentStage: plan.experimentStage,
  runPlanSha256: plan.runPlanSha256,
  runId,
  arm: run.arm,
  behaviorCellId: run.behaviorCellId,
  exactWriterInputSha256: run.exactWriterInputSha256,
  providerSurface,
  modelFamily,
  exactModelIdentifier,
  modelMode,
  generationConfigSha256,
  runtimeIdentityStatus,
  orchestratorVersion,
  memoryState,
  sessionSearchState,
  inheritedStateFlags: [],
  startedAt,
  completedAt,
  candidateSha256: sha256(exactCandidate),
  candidateWordCount: wordCount,
  exactCandidate,
  editorialVerdict: null,
  evaluatorMessageReceiptId: null,
  recordedAt: new Date().toISOString(),
};

const target = path.resolve(output);
const existing = fs.existsSync(target)
  ? fs.readFileSync(target, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
  : [];
if (existing.some((item) => item.runId === runId)) throw new Error(`Run ${runId} already has a candidate record.`);
if (existing.some((item) => item.candidateSha256 === record.candidateSha256)) throw new Error("The exact candidate already exists in another run; repeated output fails closed.");
if (!dryRun) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.appendFileSync(target, `${JSON.stringify(record)}\n`, { encoding: "utf8" });
}
process.stdout.write(`${JSON.stringify({
  status: dryRun ? "CANDIDATE_PROVENANCE_VALID_DRY_RUN" : "CANDIDATE_PROVENANCE_RECORDED",
  runId,
  arm: run.arm,
  behaviorCellId: run.behaviorCellId,
  exactModelIdentifier,
  generationConfigSha256,
  candidateSha256: record.candidateSha256,
  candidateWordCount: wordCount,
  editorialVerdict: null,
}, null, 2)}\n`);

function withoutDigest(value) {
  const { runPlanSha256: _digest, ...rest } = value;
  return rest;
}

function countWords(value) {
  return value.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
