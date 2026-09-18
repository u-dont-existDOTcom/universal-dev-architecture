/** Normalize Next hostname arguments once, before any process is started. */
export function dashboardBindingArguments(mode, forwarded, env = process.env) {
  const rest = []; let hostname;
  for (let index = 0; index < forwarded.length; index++) {
    const value = forwarded[index];
    if (value === '-H' || value === '--hostname' || value.startsWith('--hostname=')) {
      if (hostname !== undefined) throw new Error('Only one dashboard hostname may be supplied.');
      hostname = value.startsWith('--hostname=') ? value.slice('--hostname='.length) : forwarded[++index];
      if (!hostname || hostname.startsWith('-')) throw new Error('Dashboard hostname is missing.');
    } else if (value.startsWith('-H')) {
      throw new Error('Use --hostname with one explicit value.');
    } else rest.push(value);
  }
  hostname ??= '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
    if (env.MISSION_CONTROL_PRIVATE_DESKTOP_AUTH === '1') throw new Error('Private desktop authentication requires loopback dashboard binding.');
    if (!env.MISSION_CONTROL_PUBLIC_ORIGIN || new URL(env.MISSION_CONTROL_PUBLIC_ORIGIN).protocol !== 'https:') throw new Error('Remote dashboard binding requires an HTTPS MISSION_CONTROL_PUBLIC_ORIGIN.');
  }
  return [mode, '--hostname', hostname, ...rest];
}
