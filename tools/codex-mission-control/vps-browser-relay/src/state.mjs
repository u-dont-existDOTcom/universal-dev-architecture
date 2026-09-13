import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { defaultState, normalizeState } from './core.mjs';
import { RelayLock, inspectRelayLock } from './relay-lock.mjs';

export class StateStore {
  constructor({ stateFile, statusFile, lockFile }) {
    this.stateFile = stateFile;
    this.statusFile = statusFile;
    this.lockFile = lockFile;
    this.lock = new RelayLock(lockFile);
  }

  async initialize() {
    for (const path of [this.stateFile, this.statusFile, this.lockFile]) {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    }
  }

  async acquireLock(options) {
    await this.initialize();
    await this.lock.acquire(options);
  }

  async releaseLock() {
    this.lock.release();
  }

  lockStatus() {
    return inspectRelayLock(this.lockFile);
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
    const lastAdmissionId = lastSubmissionAt === current.submissionPacing?.lastSubmissionAt
      ? current.submissionPacing?.lastAdmissionId ?? state.submissionPacing?.lastAdmissionId ?? null
      : state.submissionPacing?.lastAdmissionId ?? null;
    const next = { ...state, submissionPacing: { lastSubmissionAt, lastAdmissionId }, updatedAt: new Date().toISOString() };
    await atomicJsonWrite(this.stateFile, next, 0o600);
    return next;
  }

  async writeStatus(status) {
    await atomicJsonWrite(this.statusFile, { ...status, relayLock: this.lockStatus() }, 0o644);
  }
}

async function atomicJsonWrite(path, value, mode) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode });
  await chmod(temporary, mode);
  await rename(temporary, path);
}
