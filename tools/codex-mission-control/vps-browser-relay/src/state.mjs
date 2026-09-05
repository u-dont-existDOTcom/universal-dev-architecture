import { constants as fsConstants } from 'node:fs';
import { access, chmod, mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { defaultState, normalizeState } from './core.mjs';

export class StateStore {
  constructor({ stateFile, statusFile, lockFile }) {
    this.stateFile = stateFile;
    this.statusFile = statusFile;
    this.lockFile = lockFile;
    this.lockHandle = null;
  }

  async initialize() {
    for (const path of [this.stateFile, this.statusFile, this.lockFile]) {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    }
  }

  async acquireLock() {
    await this.initialize();
    try {
      this.lockHandle = await open(this.lockFile, 'wx', 0o600);
      await this.lockHandle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }) + '\n');
      return;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }

    const stale = await this.#lockIsStale();
    if (!stale) throw new Error(`Another relay process holds ${this.lockFile}.`);
    await unlink(this.lockFile).catch(() => {});
    this.lockHandle = await open(this.lockFile, 'wx', 0o600);
    await this.lockHandle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString(), replacedStaleLock: true }) + '\n');
  }

  async releaseLock() {
    await this.lockHandle?.close().catch(() => {});
    this.lockHandle = null;
    await unlink(this.lockFile).catch(() => {});
  }

  async read() {
    await this.initialize();
    try {
      const raw = await readFile(this.stateFile, 'utf8');
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      if (error?.code === 'ENOENT') return defaultState();
      if (error instanceof SyntaxError) throw new Error(`Relay state is invalid JSON: ${this.stateFile}`);
      throw error;
    }
  }

  async write(state) {
    const current = await this.read();
    const currentSubmissionMs = Date.parse(current.submissionPacing?.lastSubmissionAt ?? '');
    const proposedSubmissionMs = Date.parse(state.submissionPacing?.lastSubmissionAt ?? '');
    const lastSubmissionAt = Number.isFinite(currentSubmissionMs) && (!Number.isFinite(proposedSubmissionMs) || currentSubmissionMs > proposedSubmissionMs)
      ? current.submissionPacing.lastSubmissionAt
      : state.submissionPacing?.lastSubmissionAt ?? null;
    const next = { ...state, submissionPacing: { lastSubmissionAt }, updatedAt: new Date().toISOString() };
    await atomicJsonWrite(this.stateFile, next, 0o600);
    return next;
  }

  async writeStatus(status) {
    await atomicJsonWrite(this.statusFile, status, 0o644);
  }

  async #lockIsStale() {
    try {
      const raw = await readFile(this.lockFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Number.isInteger(parsed.pid) || parsed.pid <= 0) return true;
      try {
        await access(`/proc/${parsed.pid}`, fsConstants.F_OK);
        return false;
      } catch {
        return true;
      }
    } catch {
      return true;
    }
  }
}

async function atomicJsonWrite(path, value, mode) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode });
  await chmod(temporary, mode);
  await rename(temporary, path);
}
