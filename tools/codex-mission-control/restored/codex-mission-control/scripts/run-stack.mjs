import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const mode = process.argv[2] === "start" ? "start" : "dev";
const forwarded = process.argv.slice(3);
const executable = process.platform === "win32" ? "tsx.cmd" : "tsx";
const nextExecutable = process.platform === "win32" ? "next.cmd" : "next";
const stackEnv = {
  ...process.env,
  MISSION_CONTROL_INTERNAL_TOKEN: process.env.MISSION_CONTROL_INTERNAL_TOKEN ?? randomBytes(32).toString("hex"),
};
const daemon = spawn(executable, ["daemon/server.ts"], { stdio: "inherit", env: stackEnv });
let next;
let closing = false;

try {
  await waitForDaemon();
  next = spawn(nextExecutable, [mode, ...forwarded], { stdio: "inherit", env: stackEnv });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  daemon.kill("SIGTERM");
  process.exit(1);
}

function shutdown(signal = "SIGTERM") {
  if (closing) return;
  closing = true;
  daemon.kill(signal);
  next?.kill(signal);
}

daemon.on("exit", (code) => {
  if (!closing) {
    shutdown();
    process.exit(code ?? 1);
  }
});
next.on("exit", (code) => {
  if (!closing) {
    shutdown();
    process.exit(code ?? 0);
  }
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => shutdown(signal));

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
