const [daemonResponse, bffResponse] = await Promise.all([
  fetch("http://127.0.0.1:4100/live"),
  fetch("http://127.0.0.1:3000/api/live"),
]);
if (!daemonResponse.ok || !bffResponse.ok) process.exit(1);
const [daemon, bff] = await Promise.all([daemonResponse.json(), bffResponse.json()]);
if (daemon.status !== "ok" || daemon.kind !== "liveness"
  || bff.status !== "ok" || bff.kind !== "liveness") process.exit(1);
