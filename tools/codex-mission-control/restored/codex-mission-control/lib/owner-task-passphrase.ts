import { scrypt, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// The owner's task-registration passphrase (PR #394 review, P0). Signing in to the dashboard takes the owner token, and
// scripts on the server hold that token too, so a signed-in session alone can't show that the owner typed a task. The
// daemon therefore registers a task only with a passphrase the owner chose on their own computer. The server keeps only
// a scrypt verifier of it, in a file next to the database (scripts/set-owner-task-passphrase.ts installs it); the
// passphrase itself reaches the server only inside a registration, and is never recorded or logged.
//
// Verifier format: mc-task-passphrase:v1:scrypt:<log2 N>:<r>:<p>:<salt, base64url>:<32-byte key, base64url>.

const VERIFIER = /^mc-task-passphrase:v1:scrypt:(\d{2}):(\d{1,2}):(\d):([A-Za-z0-9_-]{22,86}):([A-Za-z0-9_-]{43})$/;
const MAX_PASSPHRASE_CHARS = 1_024;
export const OWNER_TASK_PASSPHRASE_MAX_FAILURES = 5;
export const OWNER_TASK_PASSPHRASE_LOCK_MS = 15 * 60_000;

export interface OwnerTaskPassphraseVerifier { log2N: number; r: number; p: number; salt: Buffer; key: Buffer }

export type OwnerTaskPassphraseCheck =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 429 | 503; error: string };

export function parseOwnerTaskPassphraseVerifier(text: string): OwnerTaskPassphraseVerifier | null {
  const match = VERIFIER.exec(text.trim());
  if (!match) return null;
  const [log2N, r, p] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const salt = Buffer.from(match[4], "base64url");
  const key = Buffer.from(match[5], "base64url");
  // Bounded so that checking a passphrase costs at most 128 MiB and a fraction of a second.
  if (log2N < 14 || log2N > 17 || r !== 8 || p < 1 || p > 4 || salt.length < 16 || key.length !== 32) return null;
  return { log2N, r, p, salt, key };
}

/** Where the verifier lives: next to the database unless MISSION_CONTROL_OWNER_TASK_PASSPHRASE_FILE names a file. */
export function ownerTaskPassphraseFile(env: Record<string, string | undefined> = process.env): string {
  if (env.MISSION_CONTROL_OWNER_TASK_PASSPHRASE_FILE) return env.MISSION_CONTROL_OWNER_TASK_PASSPHRASE_FILE;
  const database = env.MISSION_CONTROL_DB ?? path.join(process.cwd(), "data", "mission-control.db");
  return path.join(path.dirname(database), "owner-task-passphrase.verifier");
}

export function deriveOwnerTaskPassphraseKey(passphrase: string, verifier: Omit<OwnerTaskPassphraseVerifier, "key">): Promise<Buffer> {
  const N = 2 ** verifier.log2N;
  const options = { N, r: verifier.r, p: verifier.p, maxmem: 2 * 128 * verifier.r * (N + verifier.p + 2) };
  return new Promise((resolve, reject) => {
    scrypt(Buffer.from(passphrase.normalize("NFC"), "utf8"), verifier.salt, 32, options, (error, key) => error ? reject(error) : resolve(key));
  });
}

/** Checks a submitted passphrase against the stored verifier, with a lock after repeated wrong ones. One per daemon. */
export class OwnerTaskPassphraseGate {
  private attempts: number[] = [];

  constructor(private readonly file = ownerTaskPassphraseFile(), private readonly now: () => number = Date.now) {}

  async check(passphrase: unknown): Promise<OwnerTaskPassphraseCheck> {
    if (typeof passphrase !== "string" || passphrase.length === 0 || passphrase.length > MAX_PASSPHRASE_CHARS) {
      return { ok: false, status: 400, error: "Type your registration passphrase." };
    }
    const now = this.now();
    this.attempts = this.attempts.filter((at) => now - at < OWNER_TASK_PASSPHRASE_LOCK_MS);
    if (this.attempts.length >= OWNER_TASK_PASSPHRASE_MAX_FAILURES) {
      const minutes = Math.max(1, Math.ceil((this.attempts[0] + OWNER_TASK_PASSPHRASE_LOCK_MS - now) / 60_000));
      return { ok: false, status: 429, error: `Too many wrong passphrases. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
    }
    let text: string;
    try {
      text = fs.readFileSync(this.file, "utf8");
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT"
        ? { ok: false, status: 503, error: "Registering tasks is off until the owner sets a registration passphrase." }
        : { ok: false, status: 503, error: "The stored check for the registration passphrase can't be read." };
    }
    const verifier = parseOwnerTaskPassphraseVerifier(text);
    if (!verifier) return { ok: false, status: 503, error: "The stored check for the registration passphrase is malformed; set the passphrase again." };
    // Counted before the check, so attempts sent at the same time can't get past the lock.
    this.attempts.push(now);
    const key = await deriveOwnerTaskPassphraseKey(passphrase, verifier);
    if (!timingSafeEqual(key, verifier.key)) return { ok: false, status: 403, error: "That registration passphrase is wrong." };
    this.attempts = [];
    return { ok: true };
  }
}
