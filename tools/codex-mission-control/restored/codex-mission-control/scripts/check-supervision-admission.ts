import fs from "node:fs";
import path from "node:path";
import {
  evaluateChatWorkAuthorityGate,
  type ChatWorkAuthorityRequest,
} from "../lib/chat-work-authority-gate";

const args = process.argv.slice(2);
const value = (name: string): string | null => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1] ?? null;
};

const inputPath = value("--input");
if (!inputPath) {
  throw new Error("Provide --input <chat-work-authority-request.json>.");
}

const request = JSON.parse(
  fs.readFileSync(path.resolve(inputPath), "utf8"),
) as ChatWorkAuthorityRequest;
const admission = evaluateChatWorkAuthorityGate(request);
process.stdout.write(`${JSON.stringify(admission, null, 2)}\n`);

if (!admission.allowed) {
  process.exitCode = 2;
}
