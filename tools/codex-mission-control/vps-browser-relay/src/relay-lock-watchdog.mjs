import { processIdentity } from './relay-lock.mjs';

// Separate process: a blocked event loop or SIGSTOP cannot defeat the helper deadline.
// This child never inherits the lock fd, browser configuration, tokens, or provider access.
const [pidText, startTicks, bootId, deadlineAt] = process.argv.slice(2);
const pid = Number(pidText);
const deadline = Date.parse(deadlineAt);
if (!process.send || !Number.isSafeInteger(pid) || pid <= 1 || !Number.isFinite(deadline)) process.exit(64);
const sameOwner = () => {
  const owner = processIdentity(pid);
  return owner && owner.startTicks === startTicks && owner.bootId === bootId && !['Z', 'X'].includes(owner.state);
};
if (!sameOwner()) process.exit(65);
process.on('disconnect', () => process.exit(0));
process.send('READY');
setTimeout(() => {
  if (!sameOwner()) process.exit(0);
  console.error(JSON.stringify({ status: 'RELAY_LOCK_DEADLINE_EXCEEDED', pid, deadlineAt }));
  try { process.kill(pid, 'SIGTERM'); } catch (error) { if (error.code === 'ESRCH') process.exit(0); else throw error; }
  setTimeout(() => {
    // Escalation applies only to this exact spawned owner's expired lifetime, never a reused PID.
    if (sameOwner()) process.kill(pid, 'SIGKILL');
    process.exit(0);
  }, 5_000);
}, Math.max(0, deadline - Date.now()));
