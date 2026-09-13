import { randomBytes, randomUUID } from "node:crypto";
import { canonicalJson, sha256 } from "./canonical";
import { ensureConfiguredCapabilityChallenges, type CapabilityChallenge, type GitHubReceiptPolicy } from "./github-decision-receipts";
import type { ConfiguredSupervisorChat } from "./configured-supervisor-chats";
import type { EventStore } from "./store";
import type { DurableCapabilityChallenge, PublicationProof, RotationRecord } from "./capability-rotation-store";

export interface NonceFixture { challengeId: string; chatId: string; githubNonce: string; expiresAt: string }
export interface CapabilityNoncePublisher {
  find(fixture: NonceFixture): Promise<PublicationProof | null>;
  publish(fixture: NonceFixture): Promise<PublicationProof>;
  verify(fixture: NonceFixture, proof: PublicationProof): Promise<PublicationProof>;
}
export const capabilityNoncePrefix = "MISSION_CONTROL_CAPABILITY_NONCE_V1\n";
export function nonceFixtureBody(f: NonceFixture): string {
  return capabilityNoncePrefix + JSON.stringify({schema_version:1,challenge_id:f.challengeId,chat_id:f.chatId,github_nonce:f.githubNonce,expires_at:f.expiresAt});
}

export class CapabilityRotationRuntime {
  private readonly jobs = new Map<string, Promise<DurableCapabilityChallenge>>();
  private readonly ttlMs: number;
  private readonly renewBeforeMs: number;
  private readonly now: () => number;
  constructor(private readonly store: EventStore, private readonly policy: GitHubReceiptPolicy,
    private readonly registrations: ConfiguredSupervisorChat[], private readonly publisher: CapabilityNoncePublisher | null,
    options: {ttlMs?: number; renewBeforeMs?: number; now?: () => number} = {}) {
    this.ttlMs=options.ttlMs ?? 86_400_000; this.renewBeforeMs=options.renewBeforeMs ?? 14_400_000; this.now=options.now ?? Date.now;
    if (!Number.isInteger(this.ttlMs) || this.ttlMs < 3_600_000 || this.ttlMs > 172_800_000 || !Number.isInteger(this.renewBeforeMs)
      || this.renewBeforeMs < 60_000 || this.renewBeforeMs > this.ttlMs/2) throw new Error("CAPABILITY_ROTATION_BOUNDS_INVALID");
    // This publisher authority is explicitly owner-deployment-specific, never a general GitHub writer.
    if (policy.repository !== "u-dont-existDOTcom/universal-dev-architecture" || policy.capabilityIssueNumber !== 60
      || policy.decisionIssueNumber !== 59 || policy.stageIssueNumber !== 61
      || canonicalJson(policy.authorizedWriterLogins.map(x=>x.toLowerCase())) !== canonicalJson(["u-dont-existdotcom"])) throw new Error("CAPABILITY_ROTATION_RECEIPT_AUTHORITY_MISMATCH");
    for (const entry of registrations) {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,179}$/.test(entry.bootstrapCapability.chatId)) throw new Error("CAPABILITY_PUBLIC_ALIAS_INVALID");
    }
  }
  private binding(entry: ConfiguredSupervisorChat) {
    const {challengeId: _legacy, ...bootstrapCapability}=entry.bootstrapCapability;
    return sha256(canonicalJson({...entry,bootstrapCapability}));
  }
  private policyIdentity() {
    const {capabilityChallenges: _legacy, ...authority}=this.policy;
    return sha256(canonicalJson(authority));
  }
  private registration(supervisor: string, chat: string) {
    const matches=this.registrations.filter(r=>r.supervisorId===supervisor && r.bootstrapCapability.chatId===chat);
    if (matches.length!==1 || matches[0].ownership!=="MISSION_CONTROL_ONLY" || !matches[0].workerId) throw new Error("CAPABILITY_REGISTRATION_UNAVAILABLE");
    return matches[0];
  }
  private matches(record: RotationRecord, entry: ConfiguredSupervisorChat) {
    return record.challenge.bindingDigest===this.binding(entry) && record.challenge.policyDigest===this.policyIdentity()
      && record.challenge.supervisorId===entry.supervisorId && record.challenge.chatId===entry.bootstrapCapability.chatId;
  }
  current(supervisor: string, chat: string): DurableCapabilityChallenge | null {
    const entry=this.registration(supervisor,chat), current=this.store.capabilityRotation.slot(supervisor).current;
    return current && current.phase==="ACTIVE" && this.matches(current,entry) && Date.parse(current.challenge.expiresAt)>this.now()
      ? current.challenge : null;
  }
  effectivePolicy(): GitHubReceiptPolicy {
    return {...this.policy,capabilityChallenges:this.registrations.flatMap(entry=>{
      try { const current=this.current(entry.supervisorId,entry.bootstrapCapability.chatId); return current ? [current] : []; }
      catch {return [];}
    })};
  }
  discovery(supervisor: string, chat: string) {
    const current=this.current(supervisor,chat);
    return current ? {schema_version:1 as const,status:"CURRENT" as const,supervisor_id:supervisor,chat_id:chat,challenge_id:current.challengeId,expires_at:current.expiresAt} : null;
  }
  ensure(supervisor: string, chat: string): Promise<DurableCapabilityChallenge> {
    const entry=this.registration(supervisor,chat);
    const running=this.jobs.get(supervisor); if(running) return running;
    const promise=this.ensureOne(entry).finally(()=>this.jobs.delete(supervisor)); this.jobs.set(supervisor,promise); return promise;
  }
  async reconcile(): Promise<Array<{supervisorId:string; state:"CURRENT"|"BLOCKED"}>> {
    const results: Array<{supervisorId:string;state:"CURRENT"|"BLOCKED"}>=[];
    for(const entry of this.registrations) {
      try {await this.ensure(entry.supervisorId,entry.bootstrapCapability.chatId);results.push({supervisorId:entry.supervisorId,state:"CURRENT"});}
      catch {results.push({supervisorId:entry.supervisorId,state:"BLOCKED"});}
    }
    return results;
  }
  private async ensureOne(entry: ConfiguredSupervisorChat): Promise<DurableCapabilityChallenge> {
    const current=this.current(entry.supervisorId,entry.bootstrapCapability.chatId);
    if(current && Date.parse(current.expiresAt)-this.now()>this.renewBeforeMs) return current;
    let candidate=this.store.capabilityRotation.slot(entry.supervisorId).pending;
    if(candidate && Date.parse(candidate.challenge.expiresAt)<=this.now()) {
      this.store.capabilityRotation.expirePending(entry.supervisorId,new Date(this.now()).toISOString());candidate=null;
    }
    if(!candidate) {
      // Static IDs/nonces are migration inputs only. The first durable successor is always fresh;
      // publishing/activating it never carries forward the legacy capability PASS.
      const value: DurableCapabilityChallenge={...entry.consumerControls,challengeId:`mc-capability-${randomUUID()}`,
        supervisorId:entry.supervisorId,chatId:entry.bootstrapCapability.chatId,worker:entry.workerId!,
        mcNonce:randomBytes(32).toString("base64url"),githubNonce:randomBytes(32).toString("base64url"),
        issuedAt:new Date(this.now()).toISOString(),expiresAt:new Date(this.now()+this.ttlMs).toISOString(),
        bindingDigest:this.binding(entry),policyDigest:this.policyIdentity()};
      candidate=this.store.capabilityRotation.candidate(value);
    }
    if(!this.matches(candidate,entry)) throw new Error("CAPABILITY_PENDING_BINDING_CHANGED");
    if(Date.parse(candidate.challenge.expiresAt)<=this.now()) throw new Error("CAPABILITY_PENDING_EXPIRED");
    if(!this.store.workerEvents(entry.workerId!).some(event=>event.data.type==="task_contract_recorded")) {
      throw new Error("CAPABILITY_WORKER_CONTRACT_REQUIRED");
    }
    if(!this.publisher) throw new Error("CAPABILITY_NONCE_PUBLISHER_UNAVAILABLE");
    const {challengeId,chatId,githubNonce,expiresAt}=candidate.challenge;
    const fixture={challengeId,chatId,githubNonce,expiresAt}; // No MC nonce, private binding, or credential crosses this interface.
    let proof=candidate.publication;
    if(!proof) {
      proof=await this.publisher.find(fixture);
      if(!proof) {
        // PUBLISHING survives crashes/timeouts. Reconcile a proven comment, never blindly POST again.
        if(candidate.phase!=="GENERATED") throw new Error("CAPABILITY_PUBLICATION_AMBIGUOUS");
        this.store.capabilityRotation.markPublishing(challengeId,new Date(this.now()).toISOString());
        proof=await this.publisher.publish(fixture);
      }
    }
    proof=await this.publisher.verify(fixture,proof);
    this.assertProof(fixture,proof,candidate.challenge.issuedAt);
    this.store.capabilityRotation.markPublished(challengeId,proof,new Date(this.now()).toISOString());
    // Publication may have taken time. Recheck all binding/expiry constraints at the transaction boundary.
    if(!this.matches(candidate,entry) || Date.parse(expiresAt)<=this.now()) throw new Error("CAPABILITY_ACTIVATION_INVALID");
    const activated=this.store.capabilityRotation.activate(challengeId,new Date(this.now()).toISOString(),()=>{
      ensureConfiguredCapabilityChallenges(this.store,{...this.policy,capabilityChallenges:[candidate!.challenge]},new Date(this.now()).toISOString());
    });
    return activated.challenge;
  }
  private assertProof(f: NonceFixture, proof: PublicationProof, issuedAt: string) {
    const url=`https://github.com/${this.policy.repository}/issues/60#issuecomment-${proof.commentId}`;
    if(!Number.isSafeInteger(proof.commentId)||proof.commentId<=0||proof.immutableUrl!==url||proof.bodySha256!==sha256(nonceFixtureBody(f))
      || !this.policy.authorizedWriterLogins.some(x=>x.toLowerCase()===proof.authorLogin.toLowerCase())
      || !Number.isFinite(Date.parse(proof.createdAt)) || Date.parse(proof.createdAt)<Date.parse(issuedAt)-5_000
      || Date.parse(proof.createdAt)>this.now()+5_000 || Date.parse(proof.createdAt)>=Date.parse(f.expiresAt)) throw new Error("CAPABILITY_PUBLICATION_PROOF_INVALID");
  }
}
