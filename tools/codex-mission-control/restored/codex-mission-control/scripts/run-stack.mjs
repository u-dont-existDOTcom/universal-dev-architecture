import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const mode = process.argv[2] === "start" ? "start" : "dev";
const forwarded = process.argv.slice(3);
const executable = process.platform === "win32" ? "tsx.cmd" : "tsx";
const nextExecutable = process.platform === "win32" ? "next.cmd" : "next";
const hostnameIndex = forwarded.findIndex((value) => value === "-H" || value === "--hostname");
const requestedHost = hostnameIndex >= 0 ? forwarded[hostnameIndex + 1] : "127.0.0.1";
const nextArguments = hostnameIndex >= 0 ? [mode, ...forwarded] : [mode, "--hostname", requestedHost, ...forwarded];
if (!["127.0.0.1", "localhost", "::1"].includes(requestedHost)) {
  const publicOrigin = process.env.MISSION_CONTROL_PUBLIC_ORIGIN;
  if (!publicOrigin || new URL(publicOrigin).protocol !== "https:") {
    throw new Error("Remote dashboard binding requires an HTTPS MISSION_CONTROL_PUBLIC_ORIGIN. Prefer the private MCP tunnel and keep the dashboard on loopback.");
  }
}
const stackEnv = {
  ...process.env,
  MISSION_CONTROL_INTERNAL_TOKEN: process.env.MISSION_CONTROL_INTERNAL_TOKEN ?? randomBytes(32).toString("hex"),
  MISSION_CONTROL_OWNER_TOKEN: process.env.MISSION_CONTROL_OWNER_TOKEN ?? randomBytes(32).toString("base64url"),
  MISSION_CONTROL_SESSION_SECRET: process.env.MISSION_CONTROL_SESSION_SECRET ?? randomBytes(48).toString("base64url"),
};
if (!process.env.MISSION_CONTROL_OWNER_TOKEN) {
  console.error(`Mission Control local owner token: ${stackEnv.MISSION_CONTROL_OWNER_TOKEN}`);
}
const daemon = spawn(executable, ["daemon/server.ts"], { stdio: "inherit", env: stackEnv, detached: process.platform !== "win32" });
let next;
let closing = false;
let requestedExitCode = 0;
let forceExitTimer;
const liveChildren = new Set([daemon]);

try {
  await waitForDaemon();
  next = spawn(nextExecutable, nextArguments, { stdio: "inherit", env: stackEnv, detached: process.platform !== "win32" });
  liveChildren.add(next);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  daemon.kill("SIGTERM");
  process.exit(1);
}

function shutdown(signal = "SIGTERM", exitCode = 0) {
  requestedExitCode = Math.max(requestedExitCode, exitCode);
  if (!closing) closing = true;
  for (const child of liveChildren) stopChild(child, signal);
  if (liveChildren.size === 0) process.exit(requestedExitCode);
  forceExitTimer ??= setTimeout(() => {
    for (const child of liveChildren) stopChild(child, "SIGKILL");
    process.exit(requestedExitCode || 1);
  }, 5000);
}

daemon.on("exit", (code) => {
  liveChildren.delete(daemon);
  if (!closing) {
    shutdown("SIGTERM", code ?? 1);
  }
  if (closing && liveChildren.size === 0) {
    if (forceExitTimer) clearTimeout(forceExitTimer);
    process.exit(requestedExitCode);
  }
});
next.on("exit", (code) => {
  liveChildren.delete(next);
  if (!closing) {
    shutdown("SIGTERM", code ?? 0);
  }
  if (closing && liveChildren.size === 0) {
    if (forceExitTimer) clearTimeout(forceExitTimer);
    process.exit(requestedExitCode);
  }
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => shutdown(signal));

function stopChild(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    child.kill(signal);
  }
}

async function waitForDaemon() {
  const url = process.env.MISSION_CONTROL_DAEMON_URL ?? "http://127.0.0.1:4100/health";
  const healthUrl = url.endsWith("/health") ? url : new URL("/health", url).toString();
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (daemon.exitCode !== null) throw new Error("Mission Control daemon exited before becoming ready.");
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Mission Control daemon did not become ready at ${healthUrl}.`);
}
