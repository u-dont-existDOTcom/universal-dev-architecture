import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_LIFETIME_MS = 30 * 60_000;
const watchdogFile = fileURLToPath(new URL('./relay-lock-watchdog.mjs', import.meta.url));

// Linux /proc start ticks plus boot ID distinguish PID reuse, without reading argv/env.
export function processIdentity(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return { pid, ppid: Number(fields[1]), startTicks: fields[19], state: fields[0], bootId: readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ESRCH') return null;
    throw error; // Permission/read errors are not proof of a dead owner.
  }
}

function metadata(lockFile) {
  try {
    const stat = lstatSync(lockFile);
    if (!stat.isFile() || stat.size > 16_384) throw new Error('Invalid lock metadata file.');
    const raw = readFileSync(lockFile, 'utf8');
    const owner = JSON.parse(raw);
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error('Invalid lock owner PID.');
    const identity = processIdentity(owner.pid);
    const dead = !identity || identity.state === 'Z' || identity.state === 'X';
    const reused = identity && owner.startTicks && owner.bootId
      && (identity.startTicks !== owner.startTicks || identity.bootId !== owner.bootId);
    const safeOwner = Object.fromEntries(['pid', 'ppid', 'startTicks', 'bootId', 'taskId', 'command', 'acquiredAt', 'deadlineAt', 'mode']
      .filter((key) => Object.hasOwn(owner, key)).map((key) => [key, owner[key]]));
    return { status: dead || reused ? 'STALE' : 'HELD', reason: dead ? 'OWNER_DEAD' : reused ? 'PID_REUSED' : 'OWNER_ALIVE', owner: safeOwner, raw, stat };
  } catch (error) {
    if (error.code === 'ENOENT') return { status: 'FREE', owner: null };
    return { status: 'UNKNOWN', reason: 'METADATA_OR_OWNER_UNVERIFIABLE', owner: null };
  }
}

function flock(fd) {
  const result = spawnSync('/usr/bin/flock', ['--exclusive', '--nonblock', '3'], { stdio: ['ignore', 'ignore', 'pipe', fd], timeout: 5_000 });
  if (result.error || ![0, 1].includes(result.status)) throw new Error('Relay kernel-lock guard unavailable; refusing unsafe fallback.');
  return result.status === 0;
}

function publicMetadata(value) {
  const { raw, stat, ...safe } = value;
  return safe;
}

// Read-only diagnostics. A busy kernel guard is authoritative even if metadata is absent.
export function inspectRelayLock(lockFile) {
  let fd;
  try {
    fd = openSync(`${lockFile}.guard`, constants.O_RDONLY | constants.O_NOFOLLOW);
    const acquired = flock(fd);
    const detail = publicMetadata(metadata(lockFile));
    return acquired ? { ...detail, kernelGuard: 'FREE' } : { ...detail, status: 'HELD', kernelGuard: 'HELD' };
  } catch (error) {
    if (error.code === 'ENOENT') return { ...publicMetadata(metadata(lockFile)), kernelGuard: 'NOT_CREATED' };
    return { status: 'UNKNOWN', reason: 'KERNEL_GUARD_UNVERIFIABLE', owner: null };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export class RelayLock {
  constructor(lockFile) {
    this.lockFile = lockFile;
    this.guardFd = null;
    this.ownerFd = null;
    this.ownerRaw = null;
    this.watchdog = null;
    this.handlers = [];
  }

  async acquire({ taskId = process.env.MC_RELAY_LOCK_TASK_ID ?? `helper:${basename(process.argv[1] ?? 'node')}`, maxLifetimeMs = Number(process.env.MC_RELAY_LOCK_MAX_MS ?? DEFAULT_LIFETIME_MS), persistent = false } = {}) {
    if (this.guardFd !== null) throw new Error('This relay lock is already acquired.');
    if (!/^[a-zA-Z0-9:._-]{1,120}$/.test(taskId)) throw new Error('A bounded, non-secret lock task ID is required.');
    if (typeof persistent !== 'boolean' || (!persistent && (!Number.isSafeInteger(maxLifetimeMs) || maxLifetimeMs < 1 || maxLifetimeMs > 86_400_000))) throw new Error('Finite lock lifetime must be 1..86400000 ms.');
    const guardFd = openSync(`${this.lockFile}.guard`, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
    let acquired = false;
    try {
      if (!fstatSync(guardFd).isFile()) throw new Error('Relay kernel guard is not a regular file.');
      acquired = flock(guardFd);
      if (!acquired) throw this.busyError(inspectRelayLock(this.lockFile));
      const prior = metadata(this.lockFile);
      if (!['FREE', 'STALE'].includes(prior.status)) throw this.busyError(publicMetadata(prior));
      // The persistent kernel guard serializes stale recovery; never unlink the guard.
      if (prior.status === 'STALE') {
        const current = lstatSync(this.lockFile);
        if (current.ino !== prior.stat.ino || current.dev !== prior.stat.dev || readFileSync(this.lockFile, 'utf8') !== prior.raw) throw new Error('Relay lock changed during stale-owner validation.');
        unlinkSync(this.lockFile);
      }
      const identity = processIdentity(process.pid);
      if (!identity) throw new Error('Cannot establish exact relay process identity.');
      const acquiredAt = new Date().toISOString();
      this.owner = { schemaVersion: 2, ...identity, taskId, command: basename(process.argv[1] ?? 'node'), acquiredAt, deadlineAt: persistent ? null : new Date(Date.now() + maxLifetimeMs).toISOString(), mode: persistent ? 'PERSISTENT_SERVICE' : 'BOUNDED_HELPER', ownerToken: randomUUID() };
      this.guardFd = guardFd;
      this.ownerFd = openSync(this.lockFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      this.ownerRaw = `${JSON.stringify(this.owner)}\n`;
      writeFileSync(this.ownerFd, this.ownerRaw);
      this.installLifecycleHandlers();
      if (!persistent) await this.startWatchdog();
    } catch (error) {
      if (this.guardFd !== null) this.release();
      else closeSync(guardFd);
      throw error;
    }
  }

  busyError(detail) {
    const error = new Error(`Another relay process holds ${this.lockFile}. ${JSON.stringify(detail)}`);
    error.code = detail.status === 'UNKNOWN' ? 'RELAY_LOCK_UNKNOWN' : 'RELAY_LOCK_BUSY';
    error.relayLock = detail;
    return error;
  }

  installLifecycleHandlers() {
    const onExit = () => { try { this.release(); } catch { /* Kernel releases on process exit; metadata remains recoverable. */ } };
    this.handlers.push(['exit', onExit]);
    for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) this.handlers.push([signal, () => process.exit(code)]);
    for (const [event, handler] of this.handlers) process.once(event, handler);
  }

  async startWatchdog() {
    const child = spawn(process.execPath, [watchdogFile, String(process.pid), this.owner.startTicks, this.owner.bootId, this.owner.deadlineAt], {
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'], env: {},
    });
    this.watchdog = child;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Relay lifetime watchdog did not become ready.')), 5_000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Relay lifetime watchdog exited before readiness.')); });
      child.once('message', (message) => { clearTimeout(timer); message === 'READY' ? resolve() : reject(new Error('Invalid relay watchdog readiness.')); });
    });
    child.removeAllListeners('exit');
    child.on('exit', () => {
      if (this.watchdog === child) {
        console.error(JSON.stringify({ status: 'RELAY_WATCHDOG_LOST', pid: process.pid }));
        process.exit(70); // Never continue with an unbounded temporary owner.
      }
    });
    child.unref();
    child.channel?.unref();
  }

  release() {
    if (this.guardFd === null) return; // Failed acquisition / double release cannot unlink a successor.
    const guardFd = this.guardFd;
    this.guardFd = null;
    for (const [event, handler] of this.handlers) process.removeListener(event, handler);
    this.handlers = [];
    const child = this.watchdog;
    this.watchdog = null;
    if (child?.connected) child.disconnect();
    try {
      if (this.ownerFd !== null) {
        const owned = fstatSync(this.ownerFd);
        try {
          const current = lstatSync(this.lockFile);
          if (current.ino === owned.ino && current.dev === owned.dev && readFileSync(this.lockFile, 'utf8') === this.ownerRaw) unlinkSync(this.lockFile);
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    } finally {
      if (this.ownerFd !== null) closeSync(this.ownerFd);
      this.ownerFd = null;
      this.ownerRaw = null;
      closeSync(guardFd); // OS ownership, not the JSON filename, is the exclusive guard.
    }
  }
}
