#!/usr/bin/env node
// SSH is the owner authentication boundary. No HTTP bootstrap or debugging listener.
import { spawn } from 'node:child_process';
import { readFile, stat, lstat, mkdtemp, mkdir, chmod, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const sessionProgram = `import { createOwnerSession } from './lib/owner-auth';
if (process.stdout.isTTY) process.exit(1);
process.stdout.write(JSON.stringify(createOwnerSession()));`;

export function validateConfig(config) {
  const origin = new URL(config.url);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('Private dashboard URL must be a plain loopback origin.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(config.sshAlias ?? '') || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(config.container ?? '')) throw new Error('Invalid private connection configuration.');
  if (!config.browser?.startsWith('/') || !config.controlPath?.startsWith('/')) throw new Error('Absolute browser and SSH control paths are required.');
  if (config.remotePort !== undefined && (!Number.isInteger(config.remotePort) || config.remotePort < 1 || config.remotePort > 65535)) throw new Error('Invalid remote port.');
  return { ...config, url: origin.origin + '/' };
}

export async function loadConfig(filename) {
  const metadata = await stat(filename);
  if (metadata.uid !== process.getuid() || (metadata.mode & 0o077)) throw new Error('Launcher configuration must be owned by you and accessible only to you.');
  return validateConfig(JSON.parse(await readFile(filename, 'utf8')));
}

export function sshSessionArgs(config) {
  // Only code and public configuration enter argv. SSH carries the session response.
  return ['-S', config.controlPath, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8', '-o', 'ClearAllForwardings=yes', config.sshAlias,
    'sudo', '-n', 'docker', 'exec', '-i', config.container, './node_modules/.bin/tsx', '--eval', "'" + sessionProgram.replaceAll("'", "'\\''") + "'"];
}

export async function capture(command, args, timeout = 15000) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let data = Buffer.alloc(0);
    const timer = setTimeout(() => { child.kill(); reject(new Error('Private connection timed out.')); }, timeout);
    child.stdout.on('data', chunk => { data = Buffer.concat([data, chunk]); if (data.length > 16384) child.kill(); });
    child.on('error', () => { clearTimeout(timer); reject(new Error('Private connection could not start.')); });
    child.on('close', code => { clearTimeout(timer); code === 0 && data.length <= 16384 ? resolvePromise(data.toString()) : reject(new Error('Private owner-session establishment failed.')); });
  });
}

export async function ensureTunnel(config) {
  try {
    await capture('ssh', ['-S', config.controlPath, '-O', 'check', config.sshAlias]);
  } catch {
    await capture('ssh', ['-fNT', '-M', '-S', config.controlPath, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', config.sshAlias]);
  }
  // Ask the authenticated master to own this exact forwarding. A listener alone
  // never proves its identity and must not receive the new owner cookie.
  const port = new URL(config.url).port || '80';
  await capture('ssh', ['-S', config.controlPath, '-O', 'forward', '-L', `127.0.0.1:${port}:127.0.0.1:${config.remotePort ?? 3000}`, config.sshAlias]);
  const response = await fetch(config.url, { redirect: 'manual', signal: AbortSignal.timeout(4000) });
  if (response.status >= 500) throw new Error('Private connection opened, but the dashboard is unavailable.');
}

export function parseSession(value) {
  let session;
  try { session = JSON.parse(value); } catch { throw new Error('Invalid private session response.'); }
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(session?.token ?? '') || !/^[A-Za-z0-9_-]{32,}$/.test(session?.csrf ?? '') || !Number.isInteger(session.maxAge) || session.maxAge <= 0 || session.maxAge > 28800) throw new Error('Invalid private session response.');
  return session;
}

export async function verifyTaskAccess(url, session) {
  const response = await fetch(new URL('/api/workers', url), {
    redirect: 'manual', signal: AbortSignal.timeout(45000),
    headers: { cookie: `mc_owner_session=${session.token}; mc_owner_csrf=${session.csrf}` },
  });
  if (response.status !== 200 || !(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Owner session could not load the authenticated task view.');
  const snapshot = await response.json();
  if (!Array.isArray(snapshot.workers) || !Array.isArray(snapshot.fleetQueue) || typeof snapshot.generatedAt !== 'string') throw new Error('Authenticated task data is unavailable.');
  return snapshot;
}

export function connectPipe(child) {
  let nextId = 0, buffer = ''; const pending = new Map();
  const fail = () => { for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error('Dashboard browser closed.')); } pending.clear(); };
  child.on('exit', fail); child.on('error', fail);
  child.stdio[4].on('data', chunk => {
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf('\0')) >= 0) {
      const raw = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      let message; try { message = JSON.parse(raw); } catch { continue; }
      if (message.method) child.emit('cdp-event', message);
      const entry = pending.get(message.id); if (!entry) continue;
      pending.delete(message.id); clearTimeout(entry.timer);
      message.error ? entry.reject(new Error('Dashboard browser operation failed.')) : entry.resolve(message.result);
    }
  });
  return (method, params = {}, sessionId) => new Promise((resolvePromise, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Dashboard browser timed out.')); }, 60000);
    pending.set(id, { resolve: resolvePromise, reject, timer });
    child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
}

export async function openDashboard(config, session, options = {}) {
  const runtime = options.runtime ?? join(process.env.XDG_RUNTIME_DIR ?? tmpdir(), `mission-control-${process.getuid()}`);
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  const metadata = await lstat(runtime);
  if (metadata.uid !== process.getuid() || !metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o077)) throw new Error('Private browser directory is not owner controlled.');
  await chmod(runtime, 0o700);
  const profile = await mkdtemp(join(runtime, 'session-'));
  const browser = spawn(config.browser, ['--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-mode', '--disable-sync', '--class=MissionControl', '--app=about:blank', ...(options.headless ? ['--headless=new'] : [])], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  browser.once('exit', () => { void rm(profile, { recursive: true, force: true }); });
  const command = connectPipe(browser);
  options.observe?.(browser, command);
  try {
    let targets;
    for (let attempt = 0; attempt < 40; attempt++) {
      targets = await command('Target.getTargets');
      if (targets.targetInfos.some(t => t.type === 'page')) break;
      await new Promise(r => setTimeout(r, 100));
    }
    const target = targets.targetInfos.find(t => t.type === 'page');
    if (!target) throw new Error('Dashboard window did not open.');
    const attached = await command('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const sid = attached.sessionId;
    await command('Network.setCookies', { cookies: [
      { name: 'mc_owner_session', value: session.token, url: config.url, httpOnly: true, sameSite: 'Strict', secure: false },
      { name: 'mc_owner_csrf', value: session.csrf, url: config.url, httpOnly: false, sameSite: 'Strict', secure: false },
    ] }, sid);
    await command('Page.navigate', { url: config.url }, sid);
    let verified = false;
    for (let attempt = 0; attempt < 600; attempt++) {
      const result = await command('Runtime.evaluate', { expression: `location.pathname === '/' && !!document.querySelector('main h1')`, returnByValue: true }, sid);
      if (result.result?.value === true) { verified = true; break; }
      await new Promise(r => setTimeout(r, 100));
    }
    if (!verified) throw new Error('Authenticated dashboard did not render.');
    const result = await command('Runtime.evaluate', { expression: `(async () => { const r = await fetch('/api/workers', {cache:'no-store'}); if (!r.ok) return false; const d = await r.json(); return Array.isArray(d.workers) && Array.isArray(d.fleetQueue); })()`, awaitPromise: true, returnByValue: true }, sid);
    if (result.result?.value !== true) throw new Error('Browser task-view authentication failed.');
    return { browser, command, sessionId: sid, profile };
  } catch (error) { browser.kill(); throw error; }
}

export async function main() {
  const filename = process.env.MISSION_CONTROL_LAUNCHER_CONFIG ?? join(homedir(), '.config/mission-control/desktop.json');
  const config = await loadConfig(filename);
  await ensureTunnel(config);
  console.log('Private SSH/dashboard reachability verified.');
  const session = parseSession(await capture('ssh', sshSessionArgs(config)));
  console.log('Automatic owner session established.');
  await verifyTaskAccess(config.url, session);
  if (process.argv.includes('--check')) { console.log('Authenticated task data verified.'); return; }
  await openDashboard(config, session);
  console.log('Authenticated dashboard rendered; task data verified in the app window.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    const message = 'Mission Control could not open an authenticated task view. Check the private SSH connection and installed launcher configuration. No dashboard token is needed.';
    console.error(message);
    spawn('notify-send', ['Mission Control', message], { stdio: 'ignore' }).on('error', () => {});
    process.exitCode = 1;
  });
}
