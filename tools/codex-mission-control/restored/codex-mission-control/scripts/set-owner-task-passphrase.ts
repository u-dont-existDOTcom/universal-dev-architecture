import fs from "node:fs";
import path from "node:path";
import {
  ownerTaskPassphraseAttemptsFile, ownerTaskPassphraseFile, ownerTaskPassphraseFingerprint, parseOwnerTaskPassphraseVerifier,
} from "../lib/owner-task-passphrase";

// Installs the owner's task-registration passphrase verifier (lib/owner-task-passphrase.ts). It reads one verifier line
// from standard input, made on the owner's own computer from the passphrase the owner typed there (only the scrypt
// verifier comes here, never the passphrase), checks its format, and writes it next to the database, readable by this
// user only. The daemon reads it on each registration, so no restart is needed. Running it again replaces the passphrase
// and clears the wrong attempts counted against the old one. It prints the verifier's fingerprint, which the owner's
// computer compares with its own and the registration form shows.
async function main() {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 4_096) return fail("That input is too long to be a registration passphrase verifier. Nothing was changed.");
    chunks.push(buffer);
  }
  const verifier = Buffer.concat(chunks).toString("utf8").trim();
  if (!parseOwnerTaskPassphraseVerifier(verifier)) return fail("That isn't a registration passphrase verifier. Nothing was changed.");
  const file = ownerTaskPassphraseFile();
  const temporary = path.join(path.dirname(file), `.owner-task-passphrase-${process.pid}.tmp`);
  try {
    fs.writeFileSync(temporary, `${verifier}\n`, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  fs.rmSync(ownerTaskPassphraseAttemptsFile(), { force: true });
  process.stdout.write(`OWNER_TASK_PASSPHRASE_SET ${ownerTaskPassphraseFingerprint(verifier)}\n`);
}

function fail(message: string): void {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

void main().catch(() => {
  // Never echo the input.
  process.stderr.write("The registration passphrase verifier could not be written. Nothing was changed.\n");
  process.exitCode = 1;
});
