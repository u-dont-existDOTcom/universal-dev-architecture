import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readWorkspaceFile } from "../src/secure-files.mjs";

test("reads a legitimate nested workspace file", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-"));
  fs.mkdirSync(path.join(root, "nested"));
  fs.writeFileSync(path.join(root, "nested", "note.txt"), "safe", "utf8");
  assert.equal(readWorkspaceFile(root, "nested/note.txt"), "safe");
});

test("rejects ordinary parent traversal", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-parent-"));
  const root = path.join(parent, "root");
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(parent, "secret.txt"), "secret", "utf8");
  assert.throws(() => readWorkspaceFile(root, "../secret.txt"), /escapes workspace/);
});
