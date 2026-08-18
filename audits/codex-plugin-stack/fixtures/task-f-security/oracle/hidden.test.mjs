import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readWorkspaceFile } from "../src/secure-files.mjs";

test("rejects prefix siblings and symlink escapes", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "security-boundary-"));
  const root = path.join(parent, "app");
  const sibling = path.join(parent, "app-private");
  fs.mkdirSync(root);
  fs.mkdirSync(sibling);
  fs.writeFileSync(path.join(sibling, "secret.txt"), "secret", "utf8");
  assert.throws(() => readWorkspaceFile(root, path.join(sibling, "secret.txt")), /workspace|path|file/i);
  fs.symlinkSync(path.join(sibling, "secret.txt"), path.join(root, "link.txt"));
  assert.throws(() => readWorkspaceFile(root, "link.txt"), /workspace|path|file|symbolic/i);
});

test("rejects directories", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "security-directory-"));
  fs.mkdirSync(path.join(root, "folder"));
  assert.throws(() => readWorkspaceFile(root, "folder"), /regular|file|directory/i);
});
