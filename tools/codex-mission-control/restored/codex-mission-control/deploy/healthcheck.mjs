const [daemonResponse, bffResponse] = await Promise.all([
  fetch("http://127.0.0.1:4100/health"),
  fetch("http://127.0.0.1:3000/api/runtime-status"),
]);
if (!daemonResponse.ok || !bffResponse.ok) process.exit(1);
const [daemon, bff] = await Promise.all([daemonResponse.json(), bffResponse.json()]);
if (daemon.status !== "ok" || daemon.chain?.valid !== true
  || daemon.submissionAuthorityConfigured !== true
  || daemon.submissionAuthoritySchedulerState !== "ACTIVE_LEASE"
  || daemon.submissionAuthorityLedger?.valid !== true
  || bff.status !== "ok") process.exit(1);
