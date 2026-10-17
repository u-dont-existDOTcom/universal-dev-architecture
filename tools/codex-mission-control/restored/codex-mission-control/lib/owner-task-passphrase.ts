import { createHash, scrypt, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// The owner's task-registration passphrase (PR #394 review, P0). Signing in to the dashboard takes the owner token, and
// scripts on the server hold that token too, so a signed-in session alone can't show that the owner typed a task. The
// daemon therefore registers a task only with a passphrase the owner chose on their own computer. The server keeps only
// a scrypt verifier of it, in a file next to the database (scripts/set-owner-task-passphrase.ts installs it); the
// passphrase itself reaches the server only inside a registration, and is never recorded or logged.
//
// Verifier format: mc-task-passphrase:v1:scrypt:<log2 N>:<r>:<p>:<salt, base64url>:<32-byte key, base64url>.
// Wrong attempts are kept in a file next to the verifier, so a restart doesn't reset them: five within 15 minutes, or
// twenty within a day, lock registration until they age out. The form shows the count, when the passphrase was set and
// its fingerprint, and each registration records the fingerprint, so a replaced verifier shows.

const VERIFIER = /^mc-task-passphrase:v1:scrypt:(\d{2}):(\d{1,2}):(\d):([A-Za-z0-9_-]{22,86}):([A-Za-z0-9_-]{43})$/;
const MAX_PASSPHRASE_CHARS = 1_024;
export const OWNER_TASK_PASSPHRASE_SHORT_LIMIT = { failures: 5, windowMs: 15 * 60_000 } as const;
export const OWNER_TASK_PASSPHRASE_DAILY_LIMIT = { failures: 20, windowMs: 24 * 60 * 60_000 } as const;

export interface OwnerTaskPassphraseVerifier { log2N: number; r: number; p: number; salt: Buffer; key: Buffer }

export type OwnerTaskPassphraseCheck =
  | { ok: true; fingerprint: string }
  | { ok: false; status: 400 | 403 | 429 | 503; error: string };

export interface OwnerTaskPassphraseStatus {
  passphraseSet: boolean;
  setAt: string | null;
  fingerprint: string | null;
  wrongAttempts: number;
  lockedUntil: string | null;
}

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

/** A short public fingerprint of a verifier: the first 12 hex digits of the SHA-256 of its line. */
export function ownerTaskPassphraseFingerprint(verifierLine: string): string {
  return createHash("sha256").update(verifierLine.trim()).digest("hex").slice(0, 12);
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
  private readonly attemptsFile: string;

  constructor(private readonly file = ownerTaskPassphraseFile(), private readonly now: () => number = Date.now) {
    this.attemptsFile = `${file}.attempts.json`;
  }

  status(): OwnerTaskPassphraseStatus {
    const now = this.now();
    const failures = this.failures(now);
    const locked = lockedUntil(failures, now);
    const stored = this.readVerifier();
    return {
      passphraseSet: stored.kind === "OK",
      setAt: stored.kind === "OK" ? new Date(stored.modifiedMs).toISOString() : null,
      fingerprint: stored.kind === "OK" ? ownerTaskPassphraseFingerprint(stored.text) : null,
      wrongAttempts: failures.length,
      lockedUntil: locked === null ? null : new Date(locked).toISOString(),
    };
  }

  async check(passphrase: unknown): Promise<OwnerTaskPassphraseCheck> {
    if (typeof passphrase !== "string" || passphrase.length === 0 || passphrase.length > MAX_PASSPHRASE_CHARS) {
      return { ok: false, status: 400, error: "Type your registration passphrase." };
    }
    const now = this.now();
    const failures = this.failures(now);
    const locked = lockedUntil(failures, now);
    if (locked !== null) {
      const minutes = Math.max(1, Math.ceil((locked - now) / 60_000));
      const wait = minutes <= 90 ? `${minutes} minute${minutes === 1 ? "" : "s"}` : `about ${Math.round(minutes / 60)} hours`;
      return { ok: false, status: 429, error: `Too many wrong passphrases. Try again in ${wait}.` };
    }
    const stored = this.readVerifier();
    if (stored.kind === "MISSING") return { ok: false, status: 503, error: "Registering tasks is off until the owner sets a registration passphrase." };
    if (stored.kind === "UNREADABLE") return { ok: false, status: 503, error: "The stored check for the registration passphrase can't be read." };
    const verifier = parseOwnerTaskPassphraseVerifier(stored.text);
    if (!verifier) return { ok: false, status: 503, error: "The stored check for the registration passphrase is malformed; set the passphrase again." };
    // Counted before the check and kept on disk, so neither attempts sent at once nor a restart get past the lock.
    this.writeFailures([...failures, now]);
    const key = await deriveOwnerTaskPassphraseKey(passphrase, verifier);
    if (!timingSafeEqual(key, verifier.key)) return { ok: false, status: 403, error: "That registration passphrase is wrong." };
    this.writeFailures([]);
    return { ok: true, fingerprint: ownerTaskPassphraseFingerprint(stored.text) };
  }

  private readVerifier(): { kind: "OK"; text: string; modifiedMs: number } | { kind: "MISSING" } | { kind: "UNREADABLE" } {
    try {
      const text = fs.readFileSync(this.file, "utf8");
      return { kind: "OK", text, modifiedMs: fs.statSync(this.file).mtimeMs };
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT" ? { kind: "MISSING" } : { kind: "UNREADABLE" };
    }
  }

  /** Wrong attempts in the last day, oldest first. A missing or damaged file counts as none. */
  private failures(now: number): number[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.attemptsFile, "utf8")) as { failures?: unknown };
      return (Array.isArray(parsed.failures) ? parsed.failures : [])
        .filter((at): at is number => typeof at === "number" && Number.isFinite(at) && at <= now && now - at < OWNER_TASK_PASSPHRASE_DAILY_LIMIT.windowMs)
        .sort((left, right) => left - right);
    } catch {
      return [];
    }
  }

  private writeFailures(failures: number[]): void {
    const temporary = `${this.attemptsFile}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, `${JSON.stringify({ failures })}\n`, { mode: 0o600 });
      fs.renameSync(temporary, this.attemptsFile);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
}

/** When the lock ends, or null: five failures within 15 minutes, or twenty within a day, lock until they age out. */
function lockedUntil(failures: readonly number[], now: number): number | null {
  const ends: number[] = [];
  for (const limit of [OWNER_TASK_PASSPHRASE_SHORT_LIMIT, OWNER_TASK_PASSPHRASE_DAILY_LIMIT]) {
    const recent = failures.filter((at) => now - at < limit.windowMs);
    if (recent.length >= limit.failures) ends.push(recent[recent.length - limit.failures] + limit.windowMs);
  }
  return ends.length ? Math.max(...ends) : null;
}
