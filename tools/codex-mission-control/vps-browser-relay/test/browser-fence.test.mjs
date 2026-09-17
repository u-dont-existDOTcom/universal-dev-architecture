import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFile = promisify(execFileCallback);
const helper = fileURLToPath(new URL('../scripts/browser-fence.sh', import.meta.url));

test('durable browser fence survives unmask-style starts and releases explicitly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-browser-fence-'));
  const stateDir = join(root, 'fences');
  const systemctl = join(root, 'systemctl');
  const log = join(root, 'systemctl.log');
  const cdpListener = join(root, 'cdp-listener');
  const env = {
    ...process.env,
    MC_BROWSER_FENCE_STATE_DIR: stateDir,
    MC_BROWSER_FENCE_SYSTEMCTL: systemctl,
    MC_BROWSER_FENCE_LOG: log,
  };
  try {
    await writeFile(systemctl, '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >>"$MC_BROWSER_FENCE_LOG"\n');
    await chmod(systemctl, 0o700);

    const initial = await execFile(helper, ['status', 'cloudbrowser'], { env });
    assert.equal(initial.stdout.trim(), 'HOST_BROWSER_UNFENCED');

    const engaged = await execFile(helper, ['engage', 'cloudbrowser'], { env });
    assert.equal(engaged.stdout.trim(), 'HOST_BROWSER_FENCED');
    await assert.rejects(
      execFile(helper, ['assert-unfenced', 'cloudbrowser'], { env }),
      (error) => error.code === 78 && /HOST_BROWSER_FENCED/.test(error.stderr),
    );

    const guardedStart = async () => {
      await execFile(helper, ['assert-unfenced', 'cloudbrowser'], { env });
      await writeFile(cdpListener, '127.0.0.1:9222');
    };
    await assert.rejects(guardedStart(), (error) => error.code === 78);
    await assert.rejects(stat(cdpListener), (error) => error.code === 'ENOENT');

    const released = await execFile(helper, ['release', 'cloudbrowser'], { env });
    assert.equal(released.stdout.trim(), 'HOST_BROWSER_UNFENCED');
    await guardedStart();
    assert.equal(await readFile(cdpListener, 'utf8'), '127.0.0.1:9222');

    const operations = (await readFile(log, 'utf8')).trim().split('\n');
    assert.deepEqual(operations, [
      'stop mission-control-chatgpt-relay@cloudbrowser.service',
      'disable --now mission-control-chatgpt-health@cloudbrowser.timer',
      'stop mission-control-chatgpt-health@cloudbrowser.service',
      'stop mission-control-chatgpt-browser@cloudbrowser.service',
      'disable mission-control-chatgpt-relay@cloudbrowser.service mission-control-chatgpt-browser@cloudbrowser.service',
      'mask mission-control-chatgpt-browser@cloudbrowser.service',
      'daemon-reload',
      'unmask mission-control-chatgpt-browser@cloudbrowser.service',
      'daemon-reload',
    ]);
    assert.equal(operations.some((operation) => operation.startsWith('start ')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
