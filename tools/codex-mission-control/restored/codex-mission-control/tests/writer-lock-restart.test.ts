import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { EventStore, WriterLockError } from "../lib/store";

test("SQLite writer ownership rejects a concurrent live process and is released after SIGKILL", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mc-writer-crash-"));
  const filename = path.join(root, "mission-control.db");
  const child = spawn(process.execPath, ["--import", "tsx", "tests/fixtures/hold-store-writer.ts", filename], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("error", reject);
      child.once("exit", (code) => reject(new Error(`writer fixture exited before ready (${code}): ${stderr}`)));
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { if (chunk.includes("READY")) resolve(); });
    });
    assert.throws(() => new EventStore(filename), WriterLockError);
    child.kill("SIGKILL");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    const reopened = new EventStore(filename);
    reopened.close();
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await rm(root, { recursive: true, force: true });
  }
});
