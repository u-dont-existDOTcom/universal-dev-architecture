import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/capability-challenges/current/route";

const current={schema_version:1,status:"CURRENT",supervisor_id:"spec",chat_id:"spec-chat",challenge_id:"new-challenge",expires_at:"2099-01-01T00:00:00.000Z"};
async function withRuntime(run: (requests:Array<{url:string;init?:RequestInit}>,setBody:(body:unknown)=>void)=>Promise<void>) {
  const originalFetch=globalThis.fetch,previous={credentials:process.env.MISSION_CONTROL_INGEST_CREDENTIALS,internal:process.env.MISSION_CONTROL_INTERNAL_TOKEN};
  process.env.MISSION_CONTROL_INGEST_CREDENTIALS=JSON.stringify({"relay-test":{kind:"COLLECTOR",token:"r".repeat(32),workers:["worker-a"],tasks:["task:worker-a"]},"worker-test":{kind:"WORKER",token:"w".repeat(32),workers:["worker-a"],tasks:["task:worker-a"]}});
  process.env.MISSION_CONTROL_INTERNAL_TOKEN="i".repeat(32);let body:unknown=current;const requests:Array<{url:string;init?:RequestInit}>=[];
  globalThis.fetch=async(url,init)=>{requests.push({url:String(url),init});return Response.json(body);};
  try{await run(requests,value=>{body=value;});}finally{globalThis.fetch=originalFetch;for(const [key,value] of [["MISSION_CONTROL_INGEST_CREDENTIALS",previous.credentials],["MISSION_CONTROL_INTERNAL_TOKEN",previous.internal]]) {if(value===undefined) delete process.env[key!];else process.env[key!]=value;}}
}
function request(query="supervisor_id=spec&chat_id=spec-chat",producer="relay-test",token="r".repeat(32)) {return new Request(`http://127.0.0.1:13000/api/capability-challenges/current?${query}`,{headers:{authorization:`Bearer ${token}`,"x-mission-control-producer-id":producer}});}
test("current challenge discovery requires authenticated collector; worker/anonymous denied before daemon access",async()=>withRuntime(async(calls)=>{
  assert.equal((await GET(new Request("http://localhost/api/capability-challenges/current"))).status,401);
  assert.equal((await GET(request(undefined,"worker-test","w".repeat(32)))).status,403);assert.equal(calls.length,0);
}));
test("discovery is exact-pair read-only, scoped to original authenticated producer, six public fields only",async()=>withRuntime(async(calls)=>{
  const response=await GET(request());assert.equal(response.status,200);assert.deepEqual(await response.json(),current);assert.match(response.headers.get("cache-control")!,/no-store/);
  assert.equal(calls.length,1);assert.match(calls[0].url,/\/capability-challenges\/current\?supervisor_id=spec&chat_id=spec-chat$/);assert.equal(new Headers(calls[0].init?.headers).get("x-mission-control-worker-scopes"),"worker-a");assert.equal(calls[0].init?.method,undefined);
}));
test("ambiguous and missing query bindings fail before daemon access",async()=>withRuntime(async(calls)=>{
  for(const query of ["supervisor_id=spec","supervisor_id=spec&chat_id=spec-chat&chat_id=other","supervisor_id=spec&chat_id=spec-chat&extra=1"]) assert.equal((await GET(request(query))).status,400);assert.equal(calls.length,0);
}));
test("unexpected nonce fields, mismatched pair and expired daemon replies fail closed without leakage",async()=>withRuntime(async(_calls,setBody)=>{
  for(const body of [{...current,mc_nonce:"PRIVATE_NONCE"},{...current,supervisor_id:"other"},{...current,expires_at:"2000-01-01T00:00:00.000Z"}]) {setBody(body);const response=await GET(request());assert.equal(response.status,503);assert.equal((await response.text()).includes("PRIVATE_NONCE"),false);}
}));
