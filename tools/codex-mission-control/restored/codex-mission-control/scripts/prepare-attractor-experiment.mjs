import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const root = process.cwd();
const experimentDir = path.resolve(value("--experiment-dir", path.join(root, "experiments/attractor-independence")));
const output = value("--output");
const seed = value("--seed", "somatic-intro-attractor-diagnosis-control-v2");
if (!output) throw new Error("Provide --output for an immutable run plan.");
if (!seed || seed.length < 8) throw new Error("The randomization seed must contain at least 8 characters.");

const manifest = readJson(path.join(experimentDir, "experiment.json"));
const cells = readJson(path.join(experimentDir, "behavior-cells.json"));
const writerPacket = fs.readFileSync(path.join(experimentDir, "writer-packet.txt"), "utf8").trim();
const evaluatorPacket = fs.readFileSync(path.join(experimentDir, "evaluator-packet.txt"), "utf8").trim();
validateManifest(manifest, cells, writerPacket, evaluatorPacket);

const preparedAt = new Date().toISOString();
const writerPacketSha256 = sha256(writerPacket);
const evaluatorPacketSha256 = sha256(evaluatorPacket);
const runs = manifest.arms.flatMap((arm) => {
  const orderedCells = deterministicOrder(cells.cells, `${seed}:${arm.id}`);
  return orderedCells.slice(0, manifest.sampleBudget.candidatesPerArm).map((cell, ordinal) => {
    const exactWriterInput = `${writerPacket}\n\n${cell.positiveCue}`;
    const suffix = sha256(`${manifest.experimentId}:${arm.id}:${cell.id}:${seed}`).slice(0, 16);
    return {
      runId: `attractor:${arm.id.toLowerCase()}:${suffix}`,
      arm: arm.id,
      ordinal,
      behaviorCellId: cell.id,
      positiveCue: cell.positiveCue,
      exactWriterInput,
      exactWriterInputSha256: sha256(exactWriterInput),
      writerPacketSha256,
      evaluatorPacketSha256,
      requiredIsolation: arm.isolation,
      persistentMemoryRequired: arm.persistentMemory,
      status: "PLANNED",
    };
  });
});

const planWithoutDigest = {
  schemaVersion: 2,
  experimentId: manifest.experimentId,
  experimentStage: "BOUNDED_EXECUTION_STATE_ISOLATION_DIAGNOSTIC",
  preparedAt,
  randomizationSeedSha256: sha256(seed),
  sourceManifestSha256: sha256(canonicalJson(manifest)),
  behaviorCellsSha256: sha256(canonicalJson(cells)),
  writerPacketSha256,
  evaluatorPacketSha256,
  causalModel: manifest.causalModel,
  controls: manifest.fixedControls,
  excludedProgressSignals: manifest.excludedProgressSignals,
  sampleBudget: manifest.sampleBudget,
  deferredArms: manifest.deferredArms,
  decisionRules: manifest.decisionRules,
  runs,
};
const runPlanSha256 = sha256(canonicalJson(planWithoutDigest));
const plan = { ...planWithoutDigest, runPlanSha256 };
const target = path.resolve(output);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({
  status: "RUN_PLAN_PREPARED_NOT_EXECUTED",
  stage: plan.experimentStage,
  output: target,
  experimentId: manifest.experimentId,
  runPlanSha256,
  arms: manifest.arms.map((arm) => arm.id),
  deferredArms: manifest.deferredArms.map((arm) => arm.id),
  runs: runs.length,
  diagnosisAccuracyCountsAsProgress: manifest.causalModel.diagnosisAccuracyCountsAsProgress,
  paidExecutionAuthorized: false,
}, null, 2)}\n`);

function validateManifest(manifest, cells, writerPacket, evaluatorPacket) {
  const failures = [];
  if (manifest.status !== "READY_FOR_BOUNDED_ISOLATION_DIAGNOSTIC") failures.push("manifest status is not READY_FOR_BOUNDED_ISOLATION_DIAGNOSTIC");
  if (manifest.causalModel?.diagnosisAvailable !== true) failures.push("diagnosis-control separation does not record diagnosis as available");
  if (manifest.causalModel?.generativeControlAvailableThroughOrdinarySelfCritique !== false) failures.push("ordinary self-critique is not rejected as generative control");
  if (manifest.causalModel?.diagnosisAccuracyCountsAsProgress !== false) failures.push("diagnosis accuracy is still allowed to count as progress");
  if (manifest.fixedControls.sameExactModelAcrossArms !== true) failures.push("the exact model is not fixed across arms");
  if (manifest.fixedControls.sameModelModeAcrossArms !== true) failures.push("the same model mode is not fixed across arms");
  if (manifest.fixedControls.crossCandidateCommunication !== false) failures.push("cross-candidate communication is not disabled");
  if (manifest.fixedControls.modelDebate !== false) failures.push("model debate is not disabled");
  if (manifest.fixedControls.selfRefinement !== false) failures.push("self-refinement is not disabled");
  if (manifest.fixedControls.selfDiagnosisReturnedToWriter !== false) failures.push("self-diagnosis is still returned to the writer");
  if (manifest.fixedControls.criticTextReturnedToWriter !== false) failures.push("critic-to-writer feedback is not disabled");
  if (manifest.authority.orchestratorMayAuthorVerdict !== false) failures.push("orchestrator verdict authority is not disabled");
  if (manifest.authority.codexMayAuthorVerdict !== false) failures.push("Codex verdict authority is not disabled");
  if (manifest.sampleBudget.paidExecutionRequiresSeparateAuthorization !== true) failures.push("paid execution is not separately gated");
  if (!Array.isArray(manifest.arms) || manifest.arms.length !== 2) failures.push("the two matched direct/n8n diagnostic arms are not present");
  const armIds = new Set((manifest.arms ?? []).map((arm) => arm.id));
  if (!armIds.has("DIRECT_FRESH_PROCESS") || !armIds.has("N8N_ISOLATED_EXECUTION")) failures.push("direct or n8n diagnostic arm is missing");
  if (armIds.has("HERMES_ISOLATED_PROFILE_MEMORY_DISABLED")) failures.push("Hermes remains in the immediate diagnostic despite lacking a distinct control mechanism");
  const deferredHermes = (manifest.deferredArms ?? []).find((arm) => arm.id === "HERMES_ISOLATED_PROFILE_MEMORY_DISABLED");
  if (!deferredHermes || deferredHermes.disposition !== "DEFER_NO_DISTINCT_CONTROL_MECHANISM") failures.push("Hermes deferral is not explicit and mechanism-bound");
  if (manifest.sampleBudget.maximumArms !== manifest.arms.length) failures.push("maximumArms does not match active arms");
  if (manifest.sampleBudget.maximumCandidates !== manifest.sampleBudget.candidatesPerArm * manifest.arms.length) failures.push("maximumCandidates does not match the fixed diagnostic budget");
  if (!Array.isArray(cells.cells) || cells.cells.length < manifest.sampleBudget.candidatesPerArm) failures.push("insufficient behavior cells for the fixed per-arm budget");
  if (!writerPacket || !evaluatorPacket) failures.push("writer or evaluator packet is empty");
  const forbiddenWriterTerms = ["prior candidate", "detector result", "pass counter", "claude", "debate transcript", "self-diagnosis"];
  for (const term of forbiddenWriterTerms) if (writerPacket.toLowerCase().includes(term)) failures.push(`writer packet contains forbidden inherited-state term: ${term}`);
  if (!String(manifest.decisionRules?.sharedFailureNextStage ?? "").includes("ACTIVATION_OR_REPRESENTATION_STEERING")) failures.push("shared failure does not escalate below ordinary natural-language self-instruction");
  if (failures.length) throw new Error(`Attractor experiment manifest failed closed:\n- ${failures.join("\n- ")}`);
}

function deterministicOrder(items, orderSeed) {
  return [...items].sort((left, right) => {
    const leftKey = sha256(`${orderSeed}:${left.id}`);
    const rightKey = sha256(`${orderSeed}:${right.id}`);
    return leftKey.localeCompare(rightKey);
  });
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
