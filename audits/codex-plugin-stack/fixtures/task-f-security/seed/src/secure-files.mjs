import fs from "node:fs";
import path from "node:path";

export function readWorkspaceFile(root, userPath) {
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, userPath);
  if (!candidate.startsWith(resolvedRoot)) throw new Error("path escapes workspace");
  return fs.readFileSync(candidate, "utf8");
}
