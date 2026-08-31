import { canonicalJson, sha256 } from "./canonical";

export interface SupervisionHandoffIdentity {
  capsuleId: string;
  worker: string;
  sourceSessionId: string;
  acceptedStateVectorSha256: string;
  authorityHighWaterSequence: number;
}

export function supervisionHandoffCapsuleSha256(identity: SupervisionHandoffIdentity): string {
  return sha256(canonicalJson(identity));
}
