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
const seed = value("--seed", "somatic-intro-attractor-independence-v1");
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
  schemaVersion: 1,
  experimentId: manifest.experimentId,
  preparedAt,
  randomizationSeedSha256: sha256(seed),
  sourceManifestSha256: sha256(canonicalJson(manifest)),
  behaviorCellsSha256: sha256(canonicalJson(cells)),
  writerPacketSha256,
  evaluatorPacketSha256,
  controls: manifest.fixedControls,
  sampleBudget: manifest.sampleBudget,
  runs,
};
const runPlanSha256 = sha256(canonicalJson(planWithoutDigest));
const plan = { ...planWithoutDigest, runPlanSha256 };
const target = path.resolve(output);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({
  status: "RUN_PLAN_PREPARED_NOT_EXECUTED",
  output: target,
  experimentId: manifest.experimentId,
  runPlanSha256,
  arms: manifest.arms.map((arm) => arm.id),
  runs: runs.length,
  paidExecutionAuthorized: false,
}, null, 2)}\n`);

function validateManifest(manifest, cells, writerPacket, evaluatorPacket) {
  const failures = [];
  if (manifest.status !== "READY_FOR_MECHANICAL_IMPLEMENTATION") failures.push("manifest status is not READY_FOR_MECHANICAL_IMPLEMENTATION");
  if (manifest.fixedControls.sameModelFamilyAcrossArms !== true) failures.push("same model family is not fixed across arms");
  if (manifest.fixedControls.sameModelModeAcrossArms !== true) failures.push("same model mode is not fixed across arms");
  if (manifest.fixedControls.crossCandidateCommunication !== false) failures.push("cross-candidate communication is not disabled");
  if (manifest.fixedControls.modelDebate !== false) failures.push("model debate is not disabled");
  if (manifest.fixedControls.selfRefinement !== false) failures.push("self-refinement is not disabled");
  if (manifest.fixedControls.criticTextReturnedToWriter !== false) failures.push("critic-to-writer feedback is not disabled");
  if (manifest.authority.orchestratorMayAuthorVerdict !== false) failures.push("orchestrator verdict authority is not disabled");
  if (manifest.authority.codexMayAuthorVerdict !== false) failures.push("Codex verdict authority is not disabled");
  if (manifest.sampleBudget.paidExecutionRequiresSeparateAuthorization !== true) failures.push("paid execution is not separately gated");
  if (!Array.isArray(manifest.arms) || manifest.arms.length !== 3) failures.push("the three matched orchestration arms are not present");
  if (!Array.isArray(cells.cells) || cells.cells.length < manifest.sampleBudget.candidatesPerArm) failures.push("insufficient behavior cells for the fixed per-arm budget");
  if (!writerPacket || !evaluatorPacket) failures.push("writer or evaluator packet is empty");
  const forbiddenWriterTerms = ["prior candidate", "detector result", "pass counter", "claude", "debate transcript"];
  for (const term of forbiddenWriterTerms) if (writerPacket.toLowerCase().includes(term)) failures.push(`writer packet contains forbidden inherited-state term: ${term}`);
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
