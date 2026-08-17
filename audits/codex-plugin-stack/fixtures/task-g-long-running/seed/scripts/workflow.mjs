import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function initialState() {
  return { schemaVersion: 1, completedPhase: 0, attempts: 0, failedOnce: false, complete: false };
}

export function nextPhase(state) {
  return Math.min(3, state.completedPhase + 1);
}

function parseStatePath(argv) {
  const index = argv.indexOf("--state");
  if (index < 0 || !argv[index + 1]) throw new Error("--state path is required");
  return path.resolve(argv[index + 1]);
}

function writeState(file, state) {
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function main(argv = process.argv.slice(2)) {
  const stateFile = parseStatePath(argv);
  const state = fs.existsSync(stateFile)
    ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
    : initialState();
  state.attempts += 1;
  const phaseMs = Number(process.env.WORKFLOW_PHASE_MS ?? 22000);
  for (let phase = nextPhase(state); phase <= 3; phase += 1) {
    process.stdout.write(`phase ${phase}/3 starting\n`);
    await new Promise((resolve) => setTimeout(resolve, phaseMs));
    if (phase === 3 && !state.failedOnce) {
      state.failedOnce = true;
      writeState(stateFile, state);
      process.stderr.write("phase 3 deterministic failure; resumable state saved\n");
      process.exitCode = 2;
      return;
    }
    state.completedPhase = phase;
    writeState(stateFile, state);
  }
  state.complete = true;
  writeState(stateFile, state);
  process.stdout.write("workflow complete\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
