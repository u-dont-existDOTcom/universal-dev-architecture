import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CapabilityRotationRuntime, nonceFixtureBody, type NonceFixture, type CapabilityNoncePublisher } from "../lib/capability-rotation";
import { EventStore } from "../lib/store";
import { seedIssue47Store } from "../lib/seed";
import { sha256 } from "../lib/canonical";
import { capabilityReceiptCommentPrefix, ingestGitHubSupervisionCandidate, publicCapabilityChallenge, type GitHubReceiptPolicy } from "../lib/github-decision-receipts";
import type { ConfiguredSupervisorChat } from "../lib/configured-supervisor-chats";
import type { PublicationProof } from "../lib/capability-rotation-store";
import { producerMayEmit } from "../lib/ingestion-auth";
import { hasCanonicalCapabilityProvenance } from "../lib/capability-evidence-authority";

const start=Date.parse("2026-09-13T03:00:00.000Z");
const controls={modelVisibleLabel:"GPT-5.6 Sol",thinkingControlLabel:"Thinking effort",thinkingVisibleLabel:"Extra High",thinkingOrdinal:"4 of 5",accountPlanLabel:"Pro",accountPlanRole:"PROVENANCE_METADATA_ONLY",accountPlanIsReasoningMode:false} as const;
const registration: ConfiguredSupervisorChat={registrationState:"ACTIVE",scope:"SPECIALIST",supervisorId:"spec",chatId:"spec",label:"Specialist",url:"https://chatgpt.com/c/private-test",workerId:"mission-control-live-slice",requiredApp:"Mission Control",registrationId:"registration-spec",ownership:"MISSION_CONTROL_ONLY",purpose:"Supervision",accountAlias:"private-account",workspaceAlias:"private-workspace",privateLocatorRef:"private-locator",registrationProvenance:{registeredBy:"OWNER",registeredAt:new Date(start-1000).toISOString(),sourceRef:"owner"},consumerControls:controls,bootstrapCapability:{chatId:"spec-chat",url:"https://chatgpt.com/c/private-test",challengeId:"legacy-expired"},locatorVerification:"OWNER_CONFIGURED_UNVERIFIED"};
const policy: GitHubReceiptPolicy={repository:"u-dont-existDOTcom/universal-dev-architecture",decisionIssueNumber:59,capabilityIssueNumber:60,stageIssueNumber:61,authorizedWriterLogins:["u-dont-existDOTcom"],capabilityChallenges:[]};
class Publisher implements CapabilityNoncePublisher {
  proofs=new Map<string,PublicationProof>();fixtures: NonceFixture[]=[];posts=0;fail=false;ambiguous=false;bad=false;
  constructor(readonly now:()=>number) {}
  async find(f:NonceFixture) {return this.proofs.get(f.challengeId)??null;}
  async publish(f:NonceFixture) {
    this.posts++;this.fixtures.push(structuredClone(f));
    if(this.fail) throw new Error("publication unavailable");
    const p={commentId:this.posts,immutableUrl:`https://github.com/${policy.repository}/issues/${this.bad?59:60}#issuecomment-${this.posts}`,bodySha256:sha256(nonceFixtureBody(f)),authorLogin:"u-dont-existDOTcom",createdAt:new Date(this.now()).toISOString()};this.proofs.set(f.challengeId,p);
    if(this.ambiguous) throw new Error("response lost after publication");return p;
  }
  async verify(_f:NonceFixture,p:PublicationProof) {return p;}
}
function seedContract(store: EventStore) { if(!store.count()) seedIssue47Store(store); }
function setup(filename=":memory:") {let now=start;const store=new EventStore(filename);seedContract(store);const publisher=new Publisher(()=>now);const runtime=()=>new CapabilityRotationRuntime(store,policy,[registration],publisher,{now:()=>now});return {store,publisher,runtime,setNow:(value:number)=>{now=value;}};}

test("healthy reuse, independent random nonces, immutable history, and no implicit capability PASS",async()=>{
  const c=setup();try{
    const r=c.runtime(),first=await r.ensure("spec","spec-chat");
    assert.equal((await r.ensure("spec","spec-chat")).challengeId,first.challengeId);assert.equal(c.publisher.posts,1);
    assert.ok(first.mcNonce.length>=32&&first.githubNonce.length>=32);assert.notEqual(first.mcNonce,first.githubNonce);
    assert.deepEqual(Object.keys(c.publisher.fixtures[0]).sort(),["challengeId","chatId","expiresAt","githubNonce"]);
    const exposed=JSON.stringify(c.publisher.fixtures);for(const forbidden of [first.mcNonce,registration.url,registration.privateLocatorRef,registration.accountAlias]) assert.equal(exposed.includes(forbidden),false);
    assert.equal(c.store.allEvents().some(e=>e.data.type==="evidence_receipt_recorded"&&e.data.summary.includes("CAPABILITY_VERIFIED")),false);
    assert.ok(c.store.verifyChain().valid);assert.deepEqual(Object.keys(r.discovery("spec","spec-chat")!).sort(),["challenge_id","chat_id","expires_at","schema_version","status","supervisor_id"]);
  }finally{c.store.close();}
});
for(const advance of [20*3_600_000,24*3_600_000]) test(`renewal/expiry at ${advance}ms rotates exactly once and rejects previous exact ID`,async()=>{
  const c=setup();try{const r=c.runtime(),old=await r.ensure("spec","spec-chat");c.setNow(start+advance);
    const next=await r.ensure("spec","spec-chat");assert.notEqual(old.challengeId,next.challengeId);assert.equal(c.publisher.posts,2);
    assert.equal(publicCapabilityChallenge(r.effectivePolicy(),old.challengeId,new Date(start+advance).toISOString()),null);
    assert.equal(c.store.capabilityRotation.byId(old.challengeId)?.challenge.mcNonce,old.mcNonce);
    assert.equal(r.effectivePolicy().capabilityChallenges.length,1);
  }finally{c.store.close();}
});
test("concurrent ensures mint one candidate, publication and current challenge",async()=>{
  const c=setup();try{const r=c.runtime();const values=await Promise.all(Array.from({length:16},()=>r.ensure("spec","spec-chat")));assert.equal(new Set(values.map(v=>v.challengeId)).size,1);assert.equal(c.publisher.posts,1);}finally{c.store.close();}
});
test("failed or ambiguous publication never activates and does not blindly POST twice",async()=>{
  const c=setup();try{c.publisher.fail=true;const r=c.runtime();await assert.rejects(r.ensure("spec","spec-chat"));assert.equal(r.current("spec","spec-chat"),null);c.publisher.fail=false;
    await assert.rejects(c.runtime().ensure("spec","spec-chat"),/AMBIGUOUS/);assert.equal(c.publisher.posts,1);
  }finally{c.store.close();}
});
test("crash after publication recovers same immutable candidate through verified lookup",async()=>{
  const c=setup();try{c.publisher.ambiguous=true;await assert.rejects(c.runtime().ensure("spec","spec-chat"));const id=c.store.capabilityRotation.slot("spec").pending!.challenge.challengeId;
    c.publisher.ambiguous=false;const next=await c.runtime().ensure("spec","spec-chat");assert.equal(next.challengeId,id);assert.equal(c.publisher.posts,1);
  }finally{c.store.close();}
});
test("durable restart reuses activated challenge and publication",async()=>{
  const directory=mkdtempSync(join(tmpdir(),"mc-capability-rotation-")),filename=join(directory,"db.sqlite");let store=new EventStore(filename);seedContract(store);const publisher=new Publisher(()=>start);
  try{const old=await new CapabilityRotationRuntime(store,policy,[registration],publisher,{now:()=>start}).ensure("spec","spec-chat");store.close();store=new EventStore(filename);
    const current=await new CapabilityRotationRuntime(store,policy,[registration],publisher,{now:()=>start}).ensure("spec","spec-chat");assert.equal(old.challengeId,current.challengeId);assert.equal(publisher.posts,1);
  }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
test("wrong pair, changed binding, wrong bus or writer cannot activate",async()=>{
  const c=setup();try{const r=c.runtime();assert.throws(()=>r.ensure("other","spec-chat"),/REGISTRATION/);assert.throws(()=>r.ensure("spec","wrong-chat"),/REGISTRATION/);
    c.publisher.bad=true;await assert.rejects(r.ensure("spec","spec-chat"),/PROOF_INVALID/);assert.equal(r.current("spec","spec-chat"),null);
    const changed={...registration,workerId:"worker-b"};await assert.rejects(new CapabilityRotationRuntime(c.store,policy,[changed],c.publisher,{now:()=>start}).ensure("spec","spec-chat"),/BINDING_CHANGED/);
    assert.throws(()=>new CapabilityRotationRuntime(c.store,{...policy,capabilityIssueNumber:59},[registration],c.publisher),/AUTHORITY_MISMATCH/);
    assert.throws(()=>new CapabilityRotationRuntime(c.store,{...policy,authorizedWriterLogins:["attacker"]},[registration],c.publisher),/AUTHORITY_MISMATCH/);
  }finally{c.store.close();}
});
test("legacy config cannot outrank new current state or mutate registration",async()=>{
  const c=setup();try{const before=structuredClone(registration);const legacy={...controls,challengeId:"legacy-expired",supervisorId:"spec",chatId:"spec-chat",worker:"worker-a",mcNonce:"old-mc",githubNonce:"old-gh",expiresAt:new Date(start-1).toISOString()};
    const r=new CapabilityRotationRuntime(c.store,{...policy,capabilityChallenges:[legacy]},[registration],c.publisher,{now:()=>start});const current=await r.ensure("spec","spec-chat");assert.notEqual(current.challengeId,legacy.challengeId);assert.deepEqual(registration,before);assert.equal(r.effectivePolicy().capabilityChallenges[0].challengeId,current.challengeId);
  }finally{c.store.close();}
});
test("old receipt fails after rotation; only exact fresh current receipt grants proof",async()=>{
  const c=setup();try{const r=c.runtime(),old=await r.ensure("spec","spec-chat");const candidate=(challenge:typeof old)=>({repository:policy.repository,issueNumber:60,commentId:700,immutableUrl:`https://github.com/${policy.repository}/issues/60#issuecomment-700`,authorLogin:"u-dont-existDOTcom",createdAt:new Date(start+20*3_600_000+1).toISOString(),deliveryId:null,ingestionMethod:"RECONCILIATION_POLL" as const,body:capabilityReceiptCommentPrefix+JSON.stringify({schema_version:1,challenge_id:challenge.challengeId,chat_id:challenge.chatId,mc_nonce:challenge.mcNonce,github_nonce:challenge.githubNonce,capabilities:["MISSION_CONTROL_READ","GITHUB_READ","GITHUB_WRITE"]})});
    c.setNow(start+20*3_600_000);const next=await r.ensure("spec","spec-chat");const at=new Date(start+20*3_600_000+2).toISOString();
    assert.throws(()=>ingestGitHubSupervisionCandidate(c.store,candidate(old),r.effectivePolicy(),at),/configured chat challenge/);
    assert.throws(()=>ingestGitHubSupervisionCandidate(c.store,{...candidate(next),authorLogin:"other"},r.effectivePolicy(),at),/authorized/);
    assert.equal(ingestGitHubSupervisionCandidate(c.store,candidate(next),r.effectivePolicy(),at).length,1);
  }finally{c.store.close();}
});
test("expired unpublished candidate is retained and replaced, not a permanent dead end",async()=>{
  const c=setup();try{const noPublisher=new CapabilityRotationRuntime(c.store,policy,[registration],null,{now:()=>start});await assert.rejects(noPublisher.ensure("spec","spec-chat"),/UNAVAILABLE/);const old=c.store.capabilityRotation.slot("spec").pending!.challenge.challengeId;
    c.setNow(start+86_400_000);const next=await c.runtime().ensure("spec","spec-chat");assert.notEqual(next.challengeId,old);assert.equal(c.store.capabilityRotation.byId(old)?.phase,"EXPIRED");
  }finally{c.store.close();}
});

test("unadmitted worker cannot publish an orphan or bypass the contract gate",async()=>{
  const store=new EventStore(":memory:"),publisher=new Publisher(()=>start);
  try {await assert.rejects(new CapabilityRotationRuntime(store,policy,[registration],publisher,{now:()=>start}).ensure("spec","spec-chat"),/CONTRACT_REQUIRED/);assert.equal(publisher.posts,0);}
  finally {store.close();}
});

test("activation transaction rollback leaves no current or partial challenge evidence",async()=>{
  const c=setup();try {
    const runtime=c.runtime(),original=c.store.capabilityRotation.activate.bind(c.store.capabilityRotation);
    c.store.capabilityRotation.activate=(id,at,materialize)=>original(id,at,()=>{materialize();throw new Error("crash before activation commit");});
    await assert.rejects(runtime.ensure("spec","spec-chat"),/crash/);
    const pending=c.store.capabilityRotation.slot("spec").pending!;
    assert.equal(pending.phase,"PUBLISHED");assert.equal(runtime.current("spec","spec-chat"),null);
    assert.equal(c.store.allEvents().some(e=>e.data.type==="evidence_receipt_recorded"&&e.data.refs.includes(`challenge:${pending.challenge.challengeId}`)),false);
    c.store.capabilityRotation.activate=original;
    assert.equal((await c.runtime().ensure("spec","spec-chat")).challengeId,pending.challenge.challengeId);assert.equal(c.publisher.posts,1);
  }finally {c.store.close();}
});

test("generic ingest cannot manufacture canonical capability evidence, even claiming its producer",async()=>{
  const c=setup();try {
    const current=await c.runtime().ensure("spec","spec-chat");
    const event=c.store.allEvents().find(e=>e.data.type==="evidence_receipt_recorded"&&e.data.refs.includes(`challenge:${current.challengeId}`))!;
    assert.ok(hasCanonicalCapabilityProvenance(event));
    const producer={id:event.producerId,kind:"COLLECTOR" as const,workerScopes:["*"],taskScopes:["*"]};
    assert.equal(producerMayEmit(producer,event.data as never),false);
    assert.equal(hasCanonicalCapabilityProvenance({...event,producerId:"collector:unrelated"}),false);
    assert.throws(()=>c.store.append({schema_version:2,event_id:"forged",mission_id:event.missionId,occurred_at:event.occurredAt,data:event.data},undefined,{...producer,id:"collector:unrelated"}),/provenance/);
    assert.throws(()=>c.store.append({schema_version:2,event_id:"forged-default",mission_id:event.missionId,occurred_at:event.occurredAt,data:event.data}),/provenance/);
  }finally {c.store.close();}
});
