export type AuthorityActor =
  | "OWNER"
  | "PROJECT_MANAGER_CHAT"
  | "SPECIALIST_SUPERVISOR_CHAT"
  | "CODEX"
  | "WORK";

export type ControlledAction =
  | "AUTHOR_PROPOSAL"
  | "DESIGN_METHODOLOGY"
  | "SET_PRIORITY"
  | "DESIGN_SPEND"
  | "CHOOSE_CONSEQUENTIAL_TRADEOFF"
  | "EXECUTE_BOUNDED_TASK"
  | "ROUTE_INTERNAL_SUPERVISOR"
  | "SEND_EXTERNAL_REPRESENTATIONAL_MESSAGE";

export type ReasoningSurface =
  | "OWNER_DIRECT"
  | "CHATGPT_PROJECT_MANAGER"
  | "CHATGPT_SPECIALIST_SUPERVISOR"
  | "CODEX_LOCAL"
  | "WORK_LOCAL"
  | "UNKNOWN";

export interface ReasoningSourceReceipt {
  messageId: string;
  bodySha256: string;
  claimedSurface: ReasoningSurface;
  observedSurface: ReasoningSurface;
  provenanceStatus: "VERIFIED" | "OWNER_ATTESTED" | "UNVERIFIED";
  authorActor: AuthorityActor;
}

export interface SpendRequest {
  kind: "MODEL_API_INFERENCE" | "OTHER";
  ceilingUsd: number;
  ownerApprovedNonzeroSpendManifestId: string | null;
}

export interface InternalSupervisorRoute {
  destination: "PROJECT_MANAGER_CHAT" | "SPECIALIST_SUPERVISOR_CHAT";
  destinationChatId: string;
  standingOwnerAuthorization: boolean;
  ownerRelayRequested: boolean;
  actionTimeConfirmationRequested: boolean;
}

export interface ChatWorkAuthorityRequest {
  requestId: string;
  action: ControlledAction;
  actor: AuthorityActor;
  sourceReceipt: ReasoningSourceReceipt | null;
  boundedExecution: boolean;
  taskRequiresExecutionOutsideChat: boolean;
  spend: SpendRequest | null;
  internalRoute: InternalSupervisorRoute | null;
  ownerPolicy: {
    paidModelInferenceAllowed: boolean;
    activeZeroSpendDecisionId: string | null;
  };
}

export type AuthorityGateDecision =
  | "ALLOW_CHAT_REASONING"
  | "ALLOW_BOUNDED_EXECUTION"
  | "ALLOW_AUTOMATIC_INTERNAL_ROUTE"
  | "REJECT_CODEX_OR_WORK_SEMANTIC_AUTHORSHIP"
  | "REJECT_UNVERIFIED_REASONING_SOURCE"
  | "REJECT_UNBOUNDED_EXECUTION"
  | "REJECT_CHAT_EXECUTABLE_TASK_SUBSTITUTION"
  | "REJECT_PAID_MODEL_INFERENCE"
  | "REJECT_NONZERO_SPEND_WITHOUT_OWNER_MANIFEST"
  | "REJECT_OWNER_RELAY_FOR_INTERNAL_ROUTE"
  | "REJECT_INTERNAL_ROUTE_CONFIRMATION_HANDOFF"
  | "REJECT_MISSING_INTERNAL_ROUTE"
  | "REQUIRES_EXTERNAL_COMMUNICATION_CONFIRMATION";

export interface AuthorityGateResult {
  allowed: boolean;
  decision: AuthorityGateDecision;
  reasons: string[];
  requiredNextAction: string;
}

const semanticActions = new Set<ControlledAction>([
  "AUTHOR_PROPOSAL",
  "DESIGN_METHODOLOGY",
  "SET_PRIORITY",
  "DESIGN_SPEND",
  "CHOOSE_CONSEQUENTIAL_TRADEOFF",
]);

const chatAuthorities = new Set<AuthorityActor>([
  "OWNER",
  "PROJECT_MANAGER_CHAT",
  "SPECIALIST_SUPERVISOR_CHAT",
]);

const chatSurfaces = new Set<ReasoningSurface>([
  "OWNER_DIRECT",
  "CHATGPT_PROJECT_MANAGER",
  "CHATGPT_SPECIALIST_SUPERVISOR",
]);

/**
 * Enforces the Chat-to-Work authority boundary before any proposal, spending
 * design, supervisor route, or bounded execution is admitted.
 *
 * The gate deliberately distinguishes internal owner-authorized supervisor
 * routing from external representational communication. Codex/Work may route
 * exact factual state internally without asking the owner to relay it, but may
 * not author the receiving chat's reasoning or consequential decision.
 */
export function evaluateChatWorkAuthorityGate(
  request: ChatWorkAuthorityRequest,
): AuthorityGateResult {
  const malformed = validateRequestShape(request);
  if (malformed.length > 0) {
    return reject(
      "REJECT_UNVERIFIED_REASONING_SOURCE",
      malformed,
      "Repair the exact source and routing receipt before continuing.",
    );
  }

  if (semanticActions.has(request.action)) {
    if (!chatAuthorities.has(request.actor)) {
      return reject(
        "REJECT_CODEX_OR_WORK_SEMANTIC_AUTHORSHIP",
        [
          `${request.actor} cannot author ${request.action}.`,
          "Reasoning, proposals, methodology, prioritization, spending design, and consequential tradeoffs belong to the owner or a source-verified ChatGPT reasoning surface.",
        ],
        "Route the exact factual state automatically to the appropriate Project Manager or specialist supervisor chat.",
      );
    }
    const sourceError = reasoningSourceError(request.sourceReceipt, request.actor);
    if (sourceError) {
      return reject(
        "REJECT_UNVERIFIED_REASONING_SOURCE",
        [sourceError],
        "Obtain a source-bound owner or ChatGPT message receipt; do not attribute Codex-authored reasoning to a chat.",
      );
    }
    const spendRejection = rejectSpendIfNeeded(request);
    if (spendRejection) return spendRejection;
    return allow(
      "ALLOW_CHAT_REASONING",
      [`${request.actor} is authorized to perform ${request.action}.`],
      "Persist the exact reasoning message and issue a bounded execution directive only for work Chat cannot execute.",
    );
  }

  if (request.action === "ROUTE_INTERNAL_SUPERVISOR") {
    if (!request.internalRoute) {
      return reject(
        "REJECT_MISSING_INTERNAL_ROUTE",
        ["Internal supervisor routing requires an exact destination chat identity."],
        "Resolve the configured Project Manager or specialist supervisor chat and route automatically.",
      );
    }
    if (!request.internalRoute.standingOwnerAuthorization) {
      return reject(
        "REJECT_MISSING_INTERNAL_ROUTE",
        ["No standing owner authorization is recorded for this internal supervisor route."],
        "Escalate only the missing authorization; do not ask the owner to relay the message.",
      );
    }
    if (request.internalRoute.ownerRelayRequested) {
      return reject(
        "REJECT_OWNER_RELAY_FOR_INTERNAL_ROUTE",
        [
          "Routine internal supervisor routing may not be bounced back to Joel as a relay request.",
          "The exact factual packet must be delivered by the orchestrator.",
        ],
        "Send the exact packet to the configured internal supervisor chat now and capture the source receipt.",
      );
    }
    if (request.internalRoute.actionTimeConfirmationRequested) {
      return reject(
        "REJECT_INTERNAL_ROUTE_CONFIRMATION_HANDOFF",
        [
          "Owner-directed internal supervisor routing is pre-authorized control-plane transport, not third-party representational communication.",
          "A generic browser confirmation rule cannot override the more specific standing supervision route.",
        ],
        "Route automatically without asking the owner to say 'send it'.",
      );
    }
    return allow(
      "ALLOW_AUTOMATIC_INTERNAL_ROUTE",
      [
        `Internal route to ${request.internalRoute.destination}:${request.internalRoute.destinationChatId} is owner-authorized.`,
        "The orchestrator may deliver exact factual state but may not author the supervisor's reasoning.",
      ],
      "Deliver the immutable factual packet, then record the exact destination message receipt and response provenance.",
    );
  }

  if (request.action === "EXECUTE_BOUNDED_TASK") {
    const sourceError = reasoningSourceError(request.sourceReceipt, null);
    if (sourceError) {
      return reject(
        "REJECT_UNVERIFIED_REASONING_SOURCE",
        [sourceError],
        "Route the decision to Chat and obtain an exact execution directive before Codex/Work acts.",
      );
    }
    if (!request.boundedExecution) {
      return reject(
        "REJECT_UNBOUNDED_EXECUTION",
        ["Codex/Work execution must be bounded by exact objective, inputs, allowed actions, forbidden decisions, evidence, and stop conditions."],
        "Return to the reasoning surface for a bounded directive.",
      );
    }
    if (!request.taskRequiresExecutionOutsideChat) {
      return reject(
        "REJECT_CHAT_EXECUTABLE_TASK_SUBSTITUTION",
        ["Work/Codex may not take over a task that the Project Manager or specialist chat can execute directly."],
        "Keep the task in Chat; delegate only the mechanical residue Chat cannot execute.",
      );
    }
    if (!new Set<AuthorityActor>(["CODEX", "WORK"]).has(request.actor)) {
      return reject(
        "REJECT_UNBOUNDED_EXECUTION",
        [`${request.actor} is not the bounded execution actor for this request.`],
        "Retain reasoning in Chat and send only the mechanical execution residue to Codex/Work.",
      );
    }
    const spendRejection = rejectSpendIfNeeded(request);
    if (spendRejection) return spendRejection;
    return allow(
      "ALLOW_BOUNDED_EXECUTION",
      [
        `${request.actor} may execute the bounded task because it requires capability outside Chat.`,
        "The execution actor has no proposal, methodology, priority, spending-design, consequential-tradeoff, or supervisory-verdict authority.",
      ],
      "Execute exactly the source-bound directive and return factual receipts to the reasoning chat automatically.",
    );
  }

  return reject(
    "REQUIRES_EXTERNAL_COMMUNICATION_CONFIRMATION",
    ["External representational communication remains outside the internal-supervisor routing exception."],
    "Apply the normal action-time confirmation rule for the external recipient.",
  );
}

function reasoningSourceError(
  receipt: ReasoningSourceReceipt | null,
  expectedActor: AuthorityActor | null,
): string | null {
  if (!receipt) return "No source-bound reasoning message receipt exists.";
  if (!isSha256(receipt.bodySha256)) return "The reasoning source body digest is missing or invalid.";
  if (!receipt.messageId.trim()) return "The reasoning source message identity is missing.";
  if (receipt.claimedSurface !== receipt.observedSurface) {
    return `Claimed reasoning surface ${receipt.claimedSurface} does not match observed surface ${receipt.observedSurface}.`;
  }
  if (!chatSurfaces.has(receipt.observedSurface)) {
    return `${receipt.observedSurface} is not an authorized owner or ChatGPT reasoning surface.`;
  }
  if (receipt.provenanceStatus === "UNVERIFIED") {
    return "Unverified or Codex-copied reasoning cannot authorize a proposal or execution directive.";
  }
  if (expectedActor && receipt.authorActor !== expectedActor) {
    return `Reasoning receipt actor ${receipt.authorActor} does not match claimed author ${expectedActor}.`;
  }
  if (!chatAuthorities.has(receipt.authorActor)) {
    return `${receipt.authorActor} cannot supply reasoning authority.`;
  }
  return null;
}

function rejectSpendIfNeeded(
  request: ChatWorkAuthorityRequest,
): AuthorityGateResult | null {
  const spend = request.spend;
  if (!spend || spend.ceilingUsd <= 0) return null;
  if (spend.kind === "MODEL_API_INFERENCE" && !request.ownerPolicy.paidModelInferenceAllowed) {
    return reject(
      "REJECT_PAID_MODEL_INFERENCE",
      [
        `Paid model inference ceiling $${spend.ceilingUsd.toFixed(2)} conflicts with active zero-spend decision ${request.ownerPolicy.activeZeroSpendDecisionId ?? "UNRECORDED"}.`,
        "No executor or reasoning surface may revive the canceled API path without a newer explicit owner decision.",
      ],
      "Use the owner's available ChatGPT reasoning/evaluation surface and keep API spend at $0.",
    );
  }
  if (!spend.ownerApprovedNonzeroSpendManifestId) {
    return reject(
      "REJECT_NONZERO_SPEND_WITHOUT_OWNER_MANIFEST",
      [`Nonzero spend ceiling $${spend.ceilingUsd.toFixed(2)} lacks an exact owner-approved spend manifest.`],
      "Return the proposed nonzero spend decision to the owner through the reasoning chat; do not execute or present it as approved.",
    );
  }
  return null;
}

function validateRequestShape(request: ChatWorkAuthorityRequest): string[] {
  const errors: string[] = [];
  if (!request.requestId?.trim()) errors.push("requestId is required.");
  if (request.spend && (!Number.isFinite(request.spend.ceilingUsd) || request.spend.ceilingUsd < 0)) {
    errors.push("spend.ceilingUsd must be a finite nonnegative number.");
  }
  if (request.internalRoute && !request.internalRoute.destinationChatId.trim()) {
    errors.push("internalRoute.destinationChatId is required.");
  }
  return errors;
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function allow(
  decision: AuthorityGateDecision,
  reasons: string[],
  requiredNextAction: string,
): AuthorityGateResult {
  return { allowed: true, decision, reasons, requiredNextAction };
}

function reject(
  decision: AuthorityGateDecision,
  reasons: string[],
  requiredNextAction: string,
): AuthorityGateResult {
  return { allowed: false, decision, reasons, requiredNextAction };
}
