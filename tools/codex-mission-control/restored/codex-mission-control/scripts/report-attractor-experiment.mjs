import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const planPath = value("--plan");
const runsPath = value("--runs");
const evaluationsPath = value("--evaluations");
const output = value("--output");
if (!planPath || !runsPath || !evaluationsPath) {
  throw new Error("Provide --plan, --runs, and --evaluations.");
}

const plan = JSON.parse(fs.readFileSync(path.resolve(planPath), "utf8"));
const runs = readJsonl(path.resolve(runsPath));
const evaluations = readJsonl(path.resolve(evaluationsPath));
const evaluationByRun = new Map(evaluations.map((item) => [item.runId, item]));
const duplicateHashes = duplicates(runs.map((run) => run.candidateSha256));
const arms = plan.runs.reduce((map, item) => {
  if (!map.has(item.arm)) map.set(item.arm, []);
  map.get(item.arm).push(item);
  return map;
}, new Map());
const armReports = [...arms.entries()].map(([arm, planned]) => {
  const recorded = planned.map((item) => runs.find((run) => run.runId === item.runId)).filter(Boolean);
  const evaluated = recorded.map((run) => ({ run, evaluation: evaluationByRun.get(run.runId) })).filter((item) => item.evaluation);
  const passCount = evaluated.filter((item) => item.evaluation.verdict === "PASS").length;
  const failureFamilies = evaluated.filter((item) => item.evaluation.strongestLiteralDefect)
    .map((item) => item.evaluation.strongestLiteralDefect);
  return {
    arm,
    planned: planned.length,
    candidatesRecorded: recorded.length,
    candidatesEvaluated: evaluated.length,
    passCount,
    blindEditorialPassRate: evaluated.length ? passCount / evaluated.length : null,
    occupiedPromptBehaviorCells: new Set(recorded.map((run) => run.behaviorCellId)).size,
    uniqueCandidateHashes: new Set(recorded.map((run) => run.candidateSha256)).size,
    candidateWordCountRange: recorded.length
      ? [Math.min(...recorded.map((run) => run.candidateWordCount)), Math.max(...recorded.map((run) => run.candidateWordCount))]
      : null,
    strongestLiteralDefects: failureFamilies,
    complete: recorded.length === planned.length && evaluated.length === planned.length,
  };
});
const allComplete = armReports.every((arm) => arm.complete);
const provenanceViolations = [
  ...runs.filter((run) => run.runtimeIdentityStatus !== "VERIFIED"
    || run.memoryState !== "DISABLED"
    || run.sessionSearchState !== "DISABLED"
    || (run.inheritedStateFlags ?? []).length > 0),
  ...evaluations.filter((evaluation) => !["VERIFIED", "OWNER_ATTESTED"].includes(evaluation.evaluatorProvenanceStatus)
    || evaluation.runtimeIdentityVisibleBeforeVerdict !== false
    || evaluation.verdictFrozenBeforeStateRead !== true),
];
const report = {
  schemaVersion: 1,
  experimentId: plan.experimentId,
  runPlanSha256: plan.runPlanSha256,
  generatedAt: new Date().toISOString(),
  complete: allComplete,
  arms: armReports,
  duplicateCandidateHashes: duplicateHashes,
  provenanceViolationCount: provenanceViolations.length,
  decision: allComplete && provenanceViolations.length === 0
    ? "OWNER_EDITORIAL_REVIEW_REQUIRED_NO_AUTOMATIC_ADOPTION"
    : "INCOMPLETE_OR_INVALID_NO_COMPARATIVE_CLAIM",
  automaticAdoptionPerformed: false,
  limitations: [
    "Prompt-assigned behavior cells are exploration controls, not proof of post-generation structural diversity.",
    "Semantic fidelity and post-generation behavior classification require separate blinded records before an arm can be preferred.",
    "Detector output, if separately authorized, is secondary evidence and cannot replace owner editorial judgment."
  ],
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (output) {
  const target = path.resolve(output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, serialized, { flag: "wx" });
}
process.stdout.write(serialized);

function readJsonl(filename) {
  if (!fs.existsSync(filename)) return [];
  return fs.readFileSync(filename, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function duplicates(values) {
  const seen = new Set();
  const duplicate = new Set();
  for (const value of values) seen.has(value) ? duplicate.add(value) : seen.add(value);
  return [...duplicate];
}
