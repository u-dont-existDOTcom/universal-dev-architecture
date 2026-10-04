import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { importJevShadowLog } from "../lib/jev-shadow-log-import";
import { EventStore } from "../lib/store";

async function main() {
  if (process.argv.length > 3) throw new Error("Invalid arguments.");
  const filename = process.argv[2];
  const input = !filename || filename === "-" ? process.stdin : createReadStream(filename);
  const lines = createInterface({ input, crlfDelay: Infinity });
  // The normal store enforces its exclusive writer lock: stop the daemon first.
  const store = new EventStore();
  try {
    const counts = await importJevShadowLog(lines, store);
    process.stdout.write(`${JSON.stringify(counts)}\n`);
  } finally {
    lines.close();
    if (input !== process.stdin) input.destroy();
    store.close();
  }
}

void main().catch(() => {
  // Do not echo log content, paths or SQLite errors.
  process.stderr.write("Jev log import failed; check arguments, input availability and the database writer lock.\n");
  process.exitCode = 1;
});
