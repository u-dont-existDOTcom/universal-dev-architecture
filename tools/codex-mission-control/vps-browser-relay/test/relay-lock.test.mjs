import assert from 'node:assert/strict';
import test from 'node:test';
import { fork } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StateStore } from '../src/state.mjs';
import { processIdentity } from '../src/relay-lock.mjs';

const fixture = fileURLToPath(new URL('./fixtures/lock-helper.mjs', import.meta.url));

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'mc-lock-regression-'));
  const paths = { stateFile: join(root, 'state.json'), statusFile: join(root, 'status.json'), lockFile: join(root, 'relay.lock') };
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, paths, store: new StateStore(paths) };
}

function helper(t, root, mode, lifetime) {
  const child = fork(fixture, [root, mode, String(lifetime ?? 15000)], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env: {} });
  const messages = [];
  let stderr = '';
  child.stderr.on('data', (data) => { stderr += data; });
  const ready = new Promise((resolve, reject) => {
    child.once('message', resolve);
    child.once('error', reject);
    child.once('exit', () => reject(new Error(`Exited before readiness: ${stderr}`)));
  });
  child.on('message', (message) => messages.push(message));
  const done = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal, messages, stderr })));
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await done; });
  return { child, ready, done };
}

async function proveSuccessor(store) {
  await store.acquireLock({ taskId: 'test:successor' });
  assert.equal(store.lockStatus().status, 'HELD');
  await store.releaseLock();
  assert.equal(store.lockStatus().status, 'FREE');
}

test('owner metadata identifies task, exact process start, boot and finite deadline', async (t) => {
  const { paths, store } = await setup(t);
  await store.acquireLock({ taskId: 'test:metadata', maxLifetimeMs: 10000 });
  t.after(() => store.releaseLock());
  const status = store.lockStatus();
  assert.equal(status.owner.pid, process.pid);
  assert.equal(status.owner.ppid, process.ppid);
  assert.equal(status.owner.startTicks, processIdentity(process.pid).startTicks);
  assert.equal(status.owner.bootId, processIdentity(process.pid).bootId);
  assert.equal(status.owner.taskId, 'test:metadata');
  assert.equal(status.owner.mode, 'BOUNDED_HELPER');
  assert.ok(Date.parse(status.owner.deadlineAt) > Date.now());
  assert.equal(Object.hasOwn(status.owner, 'ownerToken'), false);
  await store.writeStatus({ status: 'READY' });
  assert.equal(JSON.parse(await readFile(paths.statusFile, 'utf8')).relayLock.owner.taskId, 'test:metadata');
});

test('failed acquisition and double release never release another owner', async (t) => {
  const { paths, store } = await setup(t);
  const other = new StateStore(paths);
  await store.acquireLock();
  t.after(() => store.releaseLock());
  await assert.rejects(() => other.acquireLock(), /Another relay process/);
  await other.releaseLock();
  assert.equal(store.lockStatus().status, 'HELD');
  await store.releaseLock();
  await other.acquireLock();
  t.after(() => other.releaseLock());
  await store.releaseLock();
  assert.equal(other.lockStatus().status, 'HELD');
});

test('kernel ownership survives metadata loss and rejects a second live owner', async (t) => {
  const { paths, store } = await setup(t);
  await store.acquireLock();
  t.after(() => store.releaseLock());
  await unlink(paths.lockFile); // Isolated fault injection, never an operator recovery step.
  assert.equal(store.lockStatus().kernelGuard, 'HELD');
  await assert.rejects(() => new StateStore(paths).acquireLock(), /Another relay process/);
  await store.releaseLock();
  await proveSuccessor(store);
});

test('live legacy owner and malformed metadata fail closed; reused PID is recoverable', async (t) => {
  const { paths, store } = await setup(t);
  await writeFile(paths.lockFile, JSON.stringify({ pid: process.pid }));
  await assert.rejects(() => store.acquireLock(), /OWNER_ALIVE/);
  await writeFile(paths.lockFile, '{incomplete');
  await assert.rejects(() => store.acquireLock(), /UNVERIFIABLE/);
  assert.equal(await readFile(paths.lockFile, 'utf8'), '{incomplete');
  await writeFile(paths.lockFile, JSON.stringify({ pid: process.pid, startTicks: 'not-this-process', bootId: processIdentity(process.pid).bootId }));
  assert.equal(store.lockStatus().reason, 'PID_REUSED');
  await proveSuccessor(store);
});

test('simultaneous dead-owner recovery admits exactly one process', async (t) => {
  const { root, paths, store } = await setup(t);
  await writeFile(paths.lockFile, JSON.stringify({ pid: 99999999 }));
  const workers = Array.from({ length: 5 }, () => helper(t, root, 'hold'));
  const receipts = await Promise.all(workers.map((worker) => worker.ready));
  assert.equal(receipts.filter((receipt) => receipt.status === 'ACQUIRED').length, 1);
  const winner = workers[receipts.findIndex((receipt) => receipt.status === 'ACQUIRED')];
  winner.child.kill('SIGTERM');
  await Promise.all(workers.map((worker) => worker.done));
  await proveSuccessor(store);
});

test('termination before atomic owner publication leaves no malformed public lock', async (t) => {
  const { root, paths, store } = await setup(t);
  const worker = helper(t, root, 'publication-crash');
  assert.equal((await worker.ready).status, 'CRASH_ARMED');
  assert.equal((await worker.done).signal, 'SIGKILL');
  await assert.rejects(readFile(paths.lockFile), { code: 'ENOENT' });
  assert.equal(store.lockStatus().status, 'FREE');
  await proveSuccessor(store);
});

for (const mode of ['success', 'failure', 'unhandled', 'hold-TERM', 'hold-KILL', 'deadline', 'frozen', 'watchdog-failure']) {
  test(`${mode}: helper lifecycle cannot strand the relay`, { timeout: 15000 }, async (t) => {
    const { root, store } = await setup(t);
    const worker = helper(t, root, mode, ['deadline', 'frozen'].includes(mode) ? 500 : 15000);
    assert.equal((await worker.ready).status, 'ACQUIRED');
    if (mode === 'hold-TERM') worker.child.kill('SIGTERM');
    if (mode === 'hold-KILL') worker.child.kill('SIGKILL');
    const result = await worker.done;
    if (mode === 'success') assert.equal(result.code, 0);
    if (mode === 'failure' || mode === 'unhandled') assert.equal(result.code, 1);
    if (mode === 'hold-TERM' || mode === 'deadline') assert.equal(result.code, 143);
    if (mode === 'hold-KILL' || mode === 'frozen') assert.equal(result.signal, 'SIGKILL');
    if (mode === 'watchdog-failure') assert.equal(result.code, 70);
    if (mode === 'deadline' || mode === 'frozen') assert.match(result.stderr, /RELAY_LOCK_DEADLINE_EXCEEDED/);
    await proveSuccessor(store);
  });
}

test('persistent mode is explicit; ordinary helpers remain finite by default', async (t) => {
  const { store } = await setup(t);
  await store.acquireLock({ taskId: 'test:service', persistent: true });
  assert.equal(store.lockStatus().owner.deadlineAt, null);
  assert.equal(store.lock.watchdog, null);
  await store.releaseLock();
  await store.acquireLock();
  assert.equal(store.lockStatus().owner.mode, 'BOUNDED_HELPER');
  assert.ok(store.lock.watchdog);
  await store.releaseLock();
});
