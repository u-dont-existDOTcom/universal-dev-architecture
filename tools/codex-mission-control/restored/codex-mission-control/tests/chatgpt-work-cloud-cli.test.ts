import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("work-cloud controller CLI loads under the package CommonJS tsx entrypoint", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(root, "scripts", "dispatch-chatgpt-work-cloud.ts"),
    ],
    { cwd: root, encoding: "utf8", env: { ...process.env } },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage: npm run work-cloud:dispatch/);
  assert.doesNotMatch(result.stderr, /Top-level await is currently not supported/);
});

test("the direct controller runs native Work only for a worker on the dispatcher's list, before touching the app", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "mc-work-cli-"));
  try {
    const requestPath = path.join(directory, "request.json");
    writeFileSync(requestPath, JSON.stringify({ dispatchId: "work-cloud:test", mode: "CREATE", binding: { worker: "held-task" } }));
    const run = (workersJson: string | undefined) => {
      const env: NodeJS.ProcessEnv = { ...process.env };
      delete env.MISSION_CONTROL_CHATGPT_WORK_AUTODISPATCH_WORKERS_JSON;
      if (workersJson !== undefined) env.MISSION_CONTROL_CHATGPT_WORK_AUTODISPATCH_WORKERS_JSON = workersJson;
      return spawnSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
        path.join(root, "scripts", "dispatch-chatgpt-work-cloud.ts"), "--request", requestPath], { cwd: root, encoding: "utf8", env });
    };
    const unlisted = run(JSON.stringify(["atlas-test"]));
    assert.notEqual(unlisted.status, 0);
    assert.match(unlisted.stderr, /isn't on the native Work autodispatch worker list/);
    const missing = run(undefined);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /requires its worker list/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
