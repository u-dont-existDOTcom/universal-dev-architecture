import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
