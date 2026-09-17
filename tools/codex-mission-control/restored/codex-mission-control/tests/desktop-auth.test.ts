import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { authenticateOwnerRequest, createOwnerSession, verifyOwnerSessionToken } from '../lib/owner-auth';
// @ts-expect-error JavaScript launcher is also the directly exercised installed executable.
import { parseSession, verifyTaskAccess, validateConfig, sshSessionArgs } from '../scripts/desktop-launcher.mjs';

const secret = 'isolated-session-signing-fixture-'.repeat(3);

test('private SSH session works without a human owner token; worker and ordinary local clients cannot become owner', () => {
  const prior = { ...process.env };
  try {
    process.env.MISSION_CONTROL_SESSION_SECRET = secret;
    delete process.env.MISSION_CONTROL_OWNER_TOKEN;
    const session = createOwnerSession();
    assert.equal(authenticateOwnerRequest(new Request('http://127.0.0.1/api/workers')).ok, false);
    assert.equal(authenticateOwnerRequest(new Request('http://127.0.0.1/api/workers', {headers:{authorization:'Bearer worker-fixture', 'x-mission-control-producer-kind':'OWNER_AUTHORITY'}})).ok, false);
    const headers = {cookie:`mc_owner_session=${session.token}; mc_owner_csrf=${session.csrf}`, origin:'http://127.0.0.1', 'x-mission-control-csrf':session.csrf};
    const authenticated = authenticateOwnerRequest(new Request('http://127.0.0.1/api/viewed', {method:'POST',headers}), true);
    assert.equal(authenticated.ok, true);
    assert.equal(authenticateOwnerRequest(new Request('http://127.0.0.1/api/viewed', {method:'POST',headers:{...headers,origin:'https://untrusted.example'}}), true).ok, false);
    assert.equal(authenticateOwnerRequest(new Request('http://127.0.0.1/api/viewed', {method:'POST',headers:{...headers,'x-mission-control-csrf':'wrong'}}), true).ok, false);
    assert.equal(verifyOwnerSessionToken(session.token+'tampered'),null);
    const clock = Date.now; Date.now = () => clock()+9*60*60*1000;
    try { assert.equal(verifyOwnerSessionToken(session.token),null); } finally { Date.now=clock; }
    assert.notEqual(createOwnerSession().csrf,session.csrf);
  } finally { process.env=prior; }
});

test('bootstrap parsing and connection config fail closed without reflecting credential contents', () => {
  assert.throws(()=>parseSession('private-sensitive-value'), {message:'Invalid private session response.'});
  assert.throws(()=>parseSession(JSON.stringify({token:'secret',csrf:'private-sensitive-value',maxAge:1})));
  const config={url:'http://127.0.0.1:13000/',sshAlias:'private-owner',container:'dashboard',browser:'/usr/bin/chromium',controlPath:'/tmp/test/control'};
  assert.equal(validateConfig(config).url,config.url);
  for (const url of ['https://public.example/','http://127.0.0.1/?token=secret','http://user:secret@127.0.0.1/']) assert.throws(()=>validateConfig({...config,url}));
  assert.throws(()=>validateConfig({...config,container:'x; echo nope'}));
  const args=sshSessionArgs(config).join(' ');
  assert.match(args,/createOwnerSession/);
  assert.doesNotMatch(args,/MISSION_CONTROL_OWNER_TOKEN|--remote-debugging-port|mc_owner_session=/);
});

test('access health rejects login redirects, malformed snapshots and server failure',async()=>{
  let status=307, data:unknown={};
  const server=createServer((_req,res)=>{res.writeHead(status,{'content-type':'application/json',location:'/login'});res.end(JSON.stringify(data));});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const address=server.address() as {port:number};
  const url=`http://127.0.0.1:${address.port}/`;
  try {
    await assert.rejects(verifyTaskAccess(url,{token:'test',csrf:'test'}),/authenticated task view/);
    status=503; await assert.rejects(verifyTaskAccess(url,{token:'test',csrf:'test'}));
    status=200; await assert.rejects(verifyTaskAccess(url,{token:'test',csrf:'test'}),/unavailable/);
    data={workers:[],fleetQueue:[],generatedAt:new Date().toISOString()};
    assert.deepEqual(await verifyTaskAccess(url,{token:'test',csrf:'test'}),data);
  } finally { await new Promise<void>(r=>server.close(()=>r())); }
});

// @ts-expect-error Executable JavaScript binding parser.
import { dashboardBindingArguments } from '../scripts/dashboard-binding.mjs';
test('private desktop binding rejects public, equals and duplicate host overrides', () => {
  const env = {MISSION_CONTROL_PRIVATE_DESKTOP_AUTH:'1',MISSION_CONTROL_PUBLIC_ORIGIN:'https://public.example'};
  const allInterfaces = [0, 0, 0, 0].join('.');
  for (const args of [[`--hostname=${allInterfaces}`], ['--hostname',allInterfaces], [`-H${allInterfaces}`], ['-H','127.0.0.1','--hostname',allInterfaces]]) assert.throws(()=>dashboardBindingArguments('start',args,env));
  assert.deepEqual(dashboardBindingArguments('start',['--port','13100'],env),['start','--hostname','127.0.0.1','--port','13100']);
});
