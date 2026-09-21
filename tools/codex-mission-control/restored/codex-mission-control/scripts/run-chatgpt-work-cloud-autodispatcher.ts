import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";

import {
  discoverDirectWorkCloudDispatches,
  parseWorkCloudSourceChats,
  type PreparedDirectWorkCloudDispatch,
} from "../lib/chatgpt-work-cloud-autodispatch";
import { parseGitHubReceiptPolicy } from "../lib/github-decision-receipts";
import type { StoredEvent } from "../lib/schema";
import { sha256 } from "../lib/canonical";

const chmod = promisify(fs.chmod);
const PRODUCER_ID = "system:chatgpt-work-cloud-dispatch";
const once = process.argv.includes("--once");
const intervalMs = positiveInteger(process.env.MISSION_CONTROL_CHATGPT_WORK_AUTODISPATCH_INTERVAL_MS, 10_000);
const baseUrl = (process.env.MISSION_CONTROL_DAEMON_URL ?? "http://127.0.0.1:4100").replace(/\/$/, "");
const token = requiredEnvironment("MISSION_CONTROL_INTERNAL_TOKEN");
const privateRoot = privateDirectory(requiredEnvironment("MISSION_CONTROL_CHATGPT_WORK_AUTODISPATCH_DIR"));
const policy = parseGitHubReceiptPolicy();
if (!policy) throw new Error("Native Work autodispatch requires MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON.");
const sourceChats = parseWorkCloudSourceChats(
  process.env.MISSION_CONTROL_CHATGPT_WORK_SOURCE_CHATS_JSON ?? process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON,
);
if (sourceChats.length === 0) throw new Error("Native Work autodispatch requires at least one registered source supervisor Chat.");

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => { stopping = true; });

async function cycle(): Promise<Record<string, unknown>> {
  const events = await fetchEvents();
  const now = new Date().toISOString();
  const candidates = discoverDirectWorkCloudDispatches({
    events,
    sourceChats,
    receiptTarget: { repository: policy!.repository, stageIssueNumber: policy!.stageIssueNumber },
    requestedAt: now,
    artifactPathFor: (dispatchId) => path.join(privateRoot, `${sha256(dispatchId)}.directive.json`),
  });
  if (candidates.length === 0) return { status: "IDLE", observedAt: now };
  const candidate = candidates[0]!;
  const requestPath = await materialize(candidate);
  const controller = await runController(requestPath);
  return {
    status: "DISPATCH_CYCLE",
    observedAt: now,
    worker: candidate.worker,
    dispatchId: candidate.dispatchId,
    recoveryState: candidate.recoveryState,
    controllerStatus: controllerStatus(controller),
  };
}

async function fetchEvents(): Promise<StoredEvent[]> {
  const response = await fetch(`${baseUrl}/events`, { signal: AbortSignal.timeout(15_000) });
  const body = await response.json() as { events?: StoredEvent[]; error?: string };
  if (!response.ok || !Array.isArray(body.events)) throw new Error(`Mission Control event read failed: ${body.error ?? response.status}`);
  return body.events;
}

async function materialize(candidate: PreparedDirectWorkCloudDispatch): Promise<string> {
  const artifactPath = candidate.controllerRequest.directiveArtifactPath;
  await writeExactPrivate(artifactPath, candidate.directiveArtifactText);
  const requestPath = path.join(privateRoot, `${sha256(candidate.dispatchId)}.request.json`);
  await writeExactPrivate(requestPath, `${JSON.stringify(candidate.controllerRequest, null, 2)}\n`);
  return requestPath;
}

async function runController(requestPath: string): Promise<Record<string, unknown>> {
  const controllerScript = path.resolve("scripts/dispatch-chatgpt-work-cloud.ts");
  const command = process.env.MISSION_CONTROL_CHATGPT_WORK_CONTROLLER_COMMAND?.trim() || process.execPath;
  const args = process.env.MISSION_CONTROL_CHATGPT_WORK_CONTROLLER_COMMAND?.trim()
    ? [controllerScript, "--request", requestPath]
    : ["--import", "tsx", controllerScript, "--request", requestPath];
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("Native Work controller timed out.")); }, 180_000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`Native Work controller failed (${code ?? signal ?? "unknown"}): ${stderr.trim().slice(0, 1000)}`));
      try { resolve(JSON.parse(stdout) as Record<string, unknown>); }
      catch { reject(new Error("Native Work controller returned invalid JSON.")); }
    });
  });
}

async function writeExactPrivate(target: string, bytes: string): Promise<void> {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(`${privateRoot}${path.sep}`)) throw new Error("Autodispatch artifacts must remain inside the private runtime directory.");
  if (fs.existsSync(resolved)) {
    const current = fs.readFileSync(resolved, "utf8");
    if (current !== bytes) throw new Error(`Autodispatch private artifact changed under stable identity: ${path.basename(resolved)}`);
    return;
  }
  const temp = `${resolved}.${process.pid}.tmp`;
  fs.writeFileSync(temp, bytes, { mode: 0o600, flag: "wx" });
  fs.renameSync(temp, resolved);
  await chmod(resolved, 0o600);
}

function controllerStatus(value: Record<string, unknown>): string | null {
  const result = value.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const data = (result as Record<string, unknown>).data;
  return data && typeof data === "object" && !Array.isArray(data) && typeof (data as Record<string, unknown>).status === "string"
    ? (data as Record<string, unknown>).status as string : null;
}
function privateDirectory(value: string): string {
  const resolved = fs.realpathSync.native(path.resolve(value));
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0) throw new Error("Native Work autodispatch private directory must exist with mode 0700.");
  return resolved;
}
function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
function positiveInteger(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error("Autodispatch interval must be a positive integer.");
  return value;
}

async function main(): Promise<void> {
  do {
    try { process.stdout.write(`${JSON.stringify(await cycle())}\n`); }
    catch (error) {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      if (once) throw error;
    }
    if (!once && !stopping) await sleep(intervalMs);
  } while (!once && !stopping);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
