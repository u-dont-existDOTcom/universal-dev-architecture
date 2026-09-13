import { join } from 'node:path';
import { StateStore } from '../../src/state.mjs';

const [root, mode, lifetime = '15000'] = process.argv.slice(2);
const store = new StateStore({ stateFile: join(root, 'state.json'), statusFile: join(root, 'status.json'), lockFile: join(root, 'relay.lock') });
try {
  await store.acquireLock({ taskId: `test:${mode}`, maxLifetimeMs: Number(lifetime) });
  process.send?.({ status: 'ACQUIRED', owner: store.lockStatus().owner });
  if (mode === 'success') await store.releaseLock();
  else if (mode === 'failure') throw new Error('Intentional helper failure.');
  else if (mode === 'unhandled') setImmediate(() => { throw new Error('Intentional unhandled helper error.'); });
  else if (mode === 'frozen') { for (;;) { /* External watchdog must end even a blocked event loop. */ } }
  else if (mode === 'watchdog-failure') { setInterval(() => {}, 1_000); store.lock.watchdog.kill('SIGKILL'); }
  else setInterval(() => {}, 1_000);
} catch (error) {
  process.send?.({ status: 'FAILED', code: error.code ?? 'HELPER_FAILURE' });
  process.exitCode = 1;
} finally {
  if (['success', 'failure'].includes(mode)) {
    await store.releaseLock();
    process.disconnect?.();
  } else if (process.exitCode) process.disconnect?.();
}
