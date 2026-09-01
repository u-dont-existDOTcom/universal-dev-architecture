import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, "experiments/hermes/experiment.json"), "utf8"));
const separator = process.argv.indexOf("--");
const args = process.argv.slice(2, separator === -1 ? undefined : separator);
const command = separator === -1 ? [] : process.argv.slice(separator + 1);
const value = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const arm = value("--arm");
const scenario = value("--scenario");
const output = value("--output");
const dryRun = args.includes("--dry-run");

if (!manifest.authority.missionControlLedgerRemainsSourceOfTruth || manifest.authority.hermesIsAuthoritative) {
  throw new Error("Hermes experiment authority boundary is invalid.");
}
if (!['baseline', 'hermes'].includes(arm) || !manifest.scenarios.some((item) => item.id === scenario)) {
  throw new Error("Provide --arm baseline|hermes and one scenario ID from experiments/hermes/experiment.json.");
}
if (!dryRun && command.length === 0) throw new Error("Provide a scenario command after --, or use --dry-run.");

const startedAt = new Date().toISOString();
const started = Date.now();
const run = dryRun ? { status: 0, signal: null, stdout: "", stderr: "" } : spawnSync(command[0], command.slice(1), {
  cwd: appRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, MISSION_CONTROL_HERMES_EXPERIMENT_ARM: arm, MISSION_CONTROL_HERMES_NON_AUTHORITATIVE: "1" },
});
const result = {
  experimentId: manifest.experimentId,
  arm,
  scenario,
  dryRun,
  authority: manifest.authority,
  startedAt,
  stoppedAt: new Date().toISOString(),
  elapsedMilliseconds: Date.now() - started,
  exitCode: run.status,
  signal: run.signal,
  stdout: run.stdout,
  stderr: run.stderr,
};
const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (output) fs.writeFileSync(path.resolve(output), serialized, { flag: "wx" });
process.stdout.write(serialized);
process.exitCode = run.status ?? 1;
