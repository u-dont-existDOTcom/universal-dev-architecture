import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, "experiments/hermes/experiment.json"), "utf8"));
const python = argument("--hermes-python");
const hermesSource = argument("--hermes-source");
const hermesHome = argument("--hermes-home");
const outputDir = path.resolve(argument("--output-dir") ?? path.join(appRoot, "experiments/hermes/results/provider-independent"));
if (!python || !hermesSource || !hermesHome) throw new Error("Provide --hermes-python, --hermes-source, and --hermes-home for the isolated official runtime.");
if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length > 0) throw new Error(`Refusing to overwrite experiment results at ${outputDir}.`);
fs.mkdirSync(outputDir, { recursive: true });

const runs = [];
for (const scenario of manifest.scenarios) {
  for (const arm of ["baseline", "hermes"]) {
    for (let runNumber = 1; runNumber <= manifest.bounds.maximumRunsPerArmPerScenario; runNumber += 1) {
      const workspace = fs.mkdtempSync(path.join(os.tmpdir(), `mc-hermes-${scenario.id}-${arm}-`));
      const result = spawnSync(python, [
        path.join(appRoot, "experiments/hermes/hermes_scenario_driver.py"), "--arm", arm, "--scenario", scenario.id,
        "--run", String(runNumber), "--workspace", workspace, "--hermes-source", hermesSource,
      ], { encoding: "utf8", env: { ...process.env, HERMES_HOME: hermesHome } });
      if (result.status !== 0) throw new Error(`Hermes ${arm}/${scenario.id}/${runNumber} failed: ${result.stderr || result.stdout}`);
      const receipt = JSON.parse(result.stdout);
      runs.push(receipt);
      fs.writeFileSync(path.join(outputDir, `${scenario.id}.${arm}.${runNumber}.json`), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
    }
  }
}
const scored = score(manifest, runs);
const summary = {
  experimentId: manifest.experimentId,
  status: "COMPLETED_PROVIDER_INDEPENDENT",
  executedAt: new Date().toISOString(),
  runtime: { name: "hermes-agent", version: "0.21.0", upstreamCommit: "e600507a8f5b88296a617034a905084e655bf0b9", isolatedProfile: true },
  providerScope: {
    completed: "All matched restart, offline-return, and handoff persistence scenarios using the official Hermes runtime.",
    blocked: "LLM-backed semantic reasoning was not run because no experiment-only Hermes inference credential was available; production credentials were not imported.",
  },
  score: scored,
  decision: scored.passed ? "CANDIDATE_ADOPTION_REVIEW_REQUIRED" : "DO_NOT_ADOPT_KEEP_BASELINE",
  automaticAdoptionPerformed: false,
};
fs.writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

function score(experiment, receipts) {
  const byArm = (arm) => receipts.filter((receipt) => receipt.arm === arm);
  const baseline = byArm("baseline");
  const hermes = byArm("hermes");
  const sum = (rows, field) => rows.reduce((total, row) => total + Number(row.metrics[field]), 0);
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const baselineMedian = median(baseline.map((row) => row.metrics.recovery_milliseconds));
  const hermesMedian = median(hermes.map((row) => row.metrics.recovery_milliseconds));
  const improvement = baselineMedian === 0 ? 0 : (baselineMedian - hermesMedian) / baselineMedian * 100;
  const correctionWins = experiment.scenarios.filter((scenario) => {
    const baselineCorrections = sum(baseline.filter((row) => row.scenario === scenario.id), "owner_corrections_required");
    const hermesCorrections = sum(hermes.filter((row) => row.scenario === scenario.id), "owner_corrections_required");
    return hermesCorrections < baselineCorrections;
  }).length;
  const gates = {
    zeroAuthorityViolations: sum(hermes, "authority_violations") === 0,
    noLostOrReorderedLedgerEvents: sum(hermes, "lost_or_reordered_ledger_events") === 0,
    medianRecoveryTimeImprovementAtLeast20Percent: improvement >= 20,
    fewerOwnerCorrectionsInAtLeastTwoScenarios: correctionWins >= 2,
    allRunsReliable: sum(hermes, "reliability_failures") === 0,
  };
  return {
    passed: Object.values(gates).every(Boolean), gates,
    baselineMedianRecoveryMilliseconds: Number(baselineMedian.toFixed(3)),
    hermesMedianRecoveryMilliseconds: Number(hermesMedian.toFixed(3)),
    medianRecoveryImprovementPercent: Number(improvement.toFixed(3)),
    correctionWinScenarios: correctionWins,
    runs: receipts.length,
    aggregate: {
      baseline: aggregate(baseline), hermes: aggregate(hermes),
    },
  };
}

function aggregate(rows) {
  const metrics = Object.keys(rows[0].metrics);
  return Object.fromEntries(metrics.map((field) => [field, Number((rows.reduce((total, row) => total + Number(row.metrics[field]), 0) / rows.length).toFixed(3))]));
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}
