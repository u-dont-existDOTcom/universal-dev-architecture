import { canonicalJson } from "./canonical";
import {
  LEGACY_MODEL_PROFILE_UNSPECIFIED,
  workExecutionProfileSchema,
  workExecutionProfilesEqual,
  type AuthorizedWorkExecutionProfile,
  type WorkExecutionProfile,
} from "./work-execution-profile";
import {
  claudeExecutionProfileSchema,
  claudeExecutionProfilesEqual,
  claudeExecutionProviderBindingSchema,
  type ClaudeExecutionProfile,
  type ClaudeExecutionProviderBinding,
} from "./claude-execution-profile";

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
  | "AUTHOR_ARCHITECTURE_DECISION"
  | "AUTHOR_REVIEW"
  | "AUTHOR_SUPERVISORY_VERDICT"
  | "AUTHOR_OWNER_DECISION"
  | "AUTHOR_SUBSTANTIVE_SUPERVISORY_PROSE"
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
  executionScope: ExecutionScope | null;
  spend: SpendRequest | null;
  internalRoute: InternalSupervisorRoute | null;
  ownerPolicy: {
    paidModelInferenceAllowed: boolean;
    activeZeroSpendDecisionId: string | null;
  };
  directiveSchemaVersion?: 2 | 3;
  executionDirectiveBinding?: {
    directiveId: string;
    directiveRevision: number;
    taskId: string;
    directiveArtifactSha256: string;
  } | null;
  workExecutionProfile?: unknown;
  executionProviderBinding?: unknown;
  claudeExecutionProfile?: unknown;
}

export interface PersistedExecutionDirectiveProof {
  directiveId: string;
  directiveRevision: number;
  taskId: string;
  directiveArtifactSha256: string;
  sourceMessageId: string;
  sourceBodySha256: string;
  status: "ACTIVE";
  workExecutionProfile: AuthorizedWorkExecutionProfile;
  executionProviderBinding?: ClaudeExecutionProviderBinding | null;
  claudeExecutionProfile?: ClaudeExecutionProfile | null;
  authoritySource?:
    | { kind: "DIRECT_REASONING_MESSAGE" }
    | {
      kind: "VALIDATED_GITHUB_DECISION";
      receiptEventId: string;
      receiptId: string;
      requestId: string;
      canonicalEnvelopeSha256: string;
      boundedExecutionSha256: string;
    };
}

export type ExecutionScope =
  | "TERMINAL_OR_COMPUTER_WORK"
  | "GENUINELY_LONG_RANGE_REPOSITORY_OPERATION"
  | "ROUTINE_GITHUB_READ_WRITE"
  | "ISSUE_OR_PR_UPDATE"
  | "ARCHITECTURE_DECISION"
  | "REVIEW"
  | "SUPERVISORY_REASONING"
  | "SUBSTANTIVE_SUPERVISORY_PROSE";

export type AuthorityGateDecision =
  | "ALLOW_CHAT_REASONING"
  | "ALLOW_BOUNDED_EXECUTION"
  | "ALLOW_AUTOMATIC_INTERNAL_ROUTE"
  | "REJECT_CODEX_OR_WORK_SEMANTIC_AUTHORSHIP"
  | "REJECT_UNVERIFIED_REASONING_SOURCE"
  | "REJECT_UNBOUNDED_EXECUTION"
  | "REJECT_CHAT_EXECUTABLE_TASK_SUBSTITUTION"
  | "REJECT_CHAT_OWNED_EXECUTION_SCOPE"
  | "REJECT_MISSING_WORK_EXECUTION_PROFILE"
  | "REJECT_INVALID_WORK_EXECUTION_PROFILE"
  | "REJECT_MISSING_CLAUDE_EXECUTION_PROFILE"
  | "REJECT_INVALID_CLAUDE_EXECUTION_PROFILE"
  | "REJECT_INVALID_EXECUTION_PROVIDER_BINDING"
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
  authorizedWorkExecutionProfile: AuthorizedWorkExecutionProfile | null;
  authorizedClaudeExecutionProfile: ClaudeExecutionProfile | null;
  executionProviderBinding: ClaudeExecutionProviderBinding | null;
}

const semanticActions = new Set<ControlledAction>([
  "AUTHOR_PROPOSAL",
  "DESIGN_METHODOLOGY",
  "SET_PRIORITY",
  "DESIGN_SPEND",
  "CHOOSE_CONSEQUENTIAL_TRADEOFF",
  "AUTHOR_ARCHITECTURE_DECISION",
  "AUTHOR_REVIEW",
  "AUTHOR_SUPERVISORY_VERDICT",
  "AUTHOR_OWNER_DECISION",
  "AUTHOR_SUBSTANTIVE_SUPERVISORY_PROSE",
]);

const workEligibleExecutionScopes = new Set<ExecutionScope>([
  "TERMINAL_OR_COMPUTER_WORK",
  "GENUINELY_LONG_RANGE_REPOSITORY_OPERATION",
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
  persistedDirective: PersistedExecutionDirectiveProof | null = null,
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
    const sourceError = persistedDirective?.authoritySource?.kind === "VALIDATED_GITHUB_DECISION"
      ? validatedDecisionSourceError(request.sourceReceipt)
      : reasoningSourceError(request.sourceReceipt, null);
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
    if (!request.executionScope || !workEligibleExecutionScopes.has(request.executionScope)) {
      return reject(
        "REJECT_CHAT_OWNED_EXECUTION_SCOPE",
        [
          `${request.executionScope ?? "UNDECLARED"} remains in Chat.`,
          "Routine GitHub reads/writes, issue or pull-request updates, architecture decisions, reviews, supervisory reasoning, and substantive supervisory prose are not Work execution residue.",
        ],
        "Keep this action in Chat; use Work only for terminal/computer work or a genuinely long-range repository operation.",
      );
    }
    if (!new Set<AuthorityActor>(["CODEX", "WORK"]).has(request.actor)) {
      return reject(
        "REJECT_UNBOUNDED_EXECUTION",
        [`${request.actor} is not the bounded execution actor for this request.`],
        "Retain reasoning in Chat and send only the mechanical execution residue to Codex/Work.",
      );
    }
    const profiles = validateProviderExecutionProfile(request, persistedDirective);
    if (profiles.result) return profiles.result;
    const spendRejection = rejectSpendIfNeeded(request);
    if (spendRejection) return spendRejection;
    return allow(
      "ALLOW_BOUNDED_EXECUTION",
      [
        `${request.actor} may execute the bounded task because it requires capability outside Chat.`,
        "The execution actor has no proposal, methodology, priority, spending-design, consequential-tradeoff, or supervisory-verdict authority.",
      ],
      "Execute exactly the source-bound directive and return factual receipts to the reasoning chat automatically.",
      profiles.workProfile,
      profiles.claudeProfile,
      profiles.providerBinding,
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

function validatedDecisionSourceError(receipt: ReasoningSourceReceipt | null): string | null {
  if (!receipt) return "No source binding exists for the validated GitHub supervisory decision.";
  if (!isSha256(receipt.bodySha256) || !receipt.messageId.trim()) {
    return "The validated-decision source identity or payload digest is invalid.";
  }
  if (receipt.claimedSurface !== "CHATGPT_SPECIALIST_SUPERVISOR"
    || receipt.observedSurface !== "CHATGPT_SPECIALIST_SUPERVISOR"
    || receipt.authorActor !== "SPECIALIST_SUPERVISOR_CHAT") {
    return "The validated GitHub decision must remain bound to its specialist-supervisor Chat surface.";
  }
  if (receipt.provenanceStatus !== "UNVERIFIED") {
    return "GitHub-session-attested decision content must remain UNVERIFIED; authority comes from the server-validated decision receipt.";
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
  if (request.action === "EXECUTE_BOUNDED_TASK" && !request.executionScope) {
    errors.push("executionScope is required for bounded execution.");
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
  authorizedWorkExecutionProfile: AuthorizedWorkExecutionProfile | null = null,
  authorizedClaudeExecutionProfile: ClaudeExecutionProfile | null = null,
  executionProviderBinding: ClaudeExecutionProviderBinding | null = null,
): AuthorityGateResult {
  return { allowed: true, decision, reasons, requiredNextAction, authorizedWorkExecutionProfile,
    authorizedClaudeExecutionProfile, executionProviderBinding };
}

function reject(
  decision: AuthorityGateDecision,
  reasons: string[],
  requiredNextAction: string,
): AuthorityGateResult {
  return { allowed: false, decision, reasons, requiredNextAction, authorizedWorkExecutionProfile: null,
    authorizedClaudeExecutionProfile: null, executionProviderBinding: null };
}

type ProviderExecutionProfileValidation =
  | { workProfile: WorkExecutionProfile; claudeProfile: null; providerBinding: null; result: null }
  | { workProfile: null; claudeProfile: ClaudeExecutionProfile; providerBinding: ClaudeExecutionProviderBinding; result: null }
  | { workProfile: null; claudeProfile: null; providerBinding: null; result: AuthorityGateResult };

function validateProviderExecutionProfile(
  request: ChatWorkAuthorityRequest,
  persistedDirective: PersistedExecutionDirectiveProof | null,
): ProviderExecutionProfileValidation {
  const claudeRequested = request.executionProviderBinding !== undefined && request.executionProviderBinding !== null
    || request.claudeExecutionProfile !== undefined && request.claudeExecutionProfile !== null;
  if (!claudeRequested) {
    const work = validateExecutionProfile(request, persistedDirective);
    return work.result
      ? { workProfile: null, claudeProfile: null, providerBinding: null, result: work.result }
      : { workProfile: work.profile, claudeProfile: null, providerBinding: null, result: null };
  }
  const providerBinding = claudeExecutionProviderBindingSchema.safeParse(request.executionProviderBinding);
  if (!providerBinding.success) {
    return { workProfile: null, claudeProfile: null, providerBinding: null, result: reject(
      "REJECT_INVALID_EXECUTION_PROVIDER_BINDING",
      providerBinding.error.issues.map((issue) => `${issue.path.join(".") || "executionProviderBinding"}: ${issue.message}`),
      "Use the explicit ANTHROPIC / CLAUDE_CODE_CLI / EXECUTION binding; do not infer Claude from model text.",
    ) };
  }
  if (request.workExecutionProfile !== undefined && request.workExecutionProfile !== null
    && request.workExecutionProfile !== LEGACY_MODEL_PROFILE_UNSPECIFIED) {
    return { workProfile: null, claudeProfile: null, providerBinding: null, result: reject(
      "REJECT_INVALID_CLAUDE_EXECUTION_PROFILE",
      ["Claude execution cannot reuse or relabel the GPT/Codex Work execution profile."],
      "Supply a separate source-bound Claude execution profile and leave the GPT/Codex profile unspecified.",
    ) };
  }
  if (request.claudeExecutionProfile === undefined || request.claudeExecutionProfile === null) {
    return { workProfile: null, claudeProfile: null, providerBinding: null, result: reject(
      "REJECT_MISSING_CLAUDE_EXECUTION_PROFILE",
      ["The explicit Claude execution binding requires claudeExecutionProfile."],
      "Obtain a new source-bound version 3 directive with an explicit Claude execution profile.",
    ) };
  }
  const parsed = claudeExecutionProfileSchema.safeParse(request.claudeExecutionProfile);
  if (!parsed.success) {
    return { workProfile: null, claudeProfile: null, providerBinding: null, result: reject(
      "REJECT_INVALID_CLAUDE_EXECUTION_PROFILE",
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "claudeExecutionProfile"}: ${issue.message}`),
      "Return the invalid source-bound Claude profile to Chat for correction; do not substitute a model or effort.",
    ) };
  }
  const version = request.directiveSchemaVersion ?? 2;
  const binding = request.executionDirectiveBinding;
  if (version !== 3 || !binding
    || !binding.directiveId?.trim()
    || !Number.isInteger(binding.directiveRevision) || binding.directiveRevision < 1
    || !binding.taskId?.trim()
    || !/^[a-f0-9]{64}$/.test(binding.directiveArtifactSha256)) {
    return { workProfile: null, claudeProfile: null, providerBinding: null, result: reject(
      "REJECT_UNVERIFIED_REASONING_SOURCE",
      ["Claude execution requires a source-bound version 3 directive artifact identity and digest."],
      "Repair the source-bound execution directive identity before authorization.",
    ) };
  }
  if (!persistedDirective
    || persistedDirective.directiveId !== binding.directiveId
    || persistedDirective.directiveRevision !== binding.directiveRevision
    || persistedDirective.taskId !== binding.taskId
    || persistedDirective.directiveArtifactSha256 !== binding.directiveArtifactSha256
    || persistedDirective.sourceMessageId !== request.sourceReceipt?.messageId
    || persistedDirective.sourceBodySha256 !== request.sourceReceipt?.bodySha256
    || persistedDirective.executionProviderBinding === undefined
    || persistedDirective.executionProviderBinding === null
    || canonicalJson(persistedDirective.executionProviderBinding) !== canonicalJson(providerBinding.data)
    || !persistedDirective.claudeExecutionProfile
    || !claudeExecutionProfilesEqual(persistedDirective.claudeExecutionProfile, parsed.data)) {
    return { workProfile: null, claudeProfile: null, providerBinding: null, result: reject(
      "REJECT_UNVERIFIED_REASONING_SOURCE",
      ["The request does not bind the current durable Claude execution directive, provider surface, source provenance, identity, revision, task, and exact profile."],
      "Use the current active Claude execution directive; do not trust caller-supplied provider or profile assertions alone.",
    ) };
  }
  return { workProfile: null, claudeProfile: parsed.data, providerBinding: providerBinding.data, result: null };
}

type ExecutionProfileValidation =
  | { profile: WorkExecutionProfile; result: null }
  | { profile: null; result: AuthorityGateResult };

function validateExecutionProfile(
  request: ChatWorkAuthorityRequest,
  persistedDirective: PersistedExecutionDirectiveProof | null,
): ExecutionProfileValidation {
  const version = request.directiveSchemaVersion ?? 2;
  if (version !== 3 && request.workExecutionProfile !== undefined
    && request.workExecutionProfile !== null
    && request.workExecutionProfile !== LEGACY_MODEL_PROFILE_UNSPECIFIED) {
    return {
      profile: null,
      result: reject(
        "REJECT_INVALID_WORK_EXECUTION_PROFILE",
        ["A recovered version 2 directive cannot be retrofitted with a Work profile; only a source-bound version 3 directive may authorize one."],
        "Obtain a new source-bound version 3 Chat directive; do not reinterpret a legacy artifact.",
      ),
    };
  }
  if (request.workExecutionProfile === undefined || request.workExecutionProfile === null
    || request.workExecutionProfile === LEGACY_MODEL_PROFILE_UNSPECIFIED) {
    return {
      profile: null,
      result: reject(
        "REJECT_MISSING_WORK_EXECUTION_PROFILE",
        [version === 3
          ? "A new-format bounded-execution directive requires workExecutionProfile."
          : "The recovered legacy directive is explicitly LEGACY_MODEL_PROFILE_UNSPECIFIED and cannot authorize a new execution."],
        "Obtain a new source-bound Chat directive with an explicit Work execution profile; do not assume a default model or effort.",
      ),
    };
  }
  const parsed = workExecutionProfileSchema.safeParse(request.workExecutionProfile);
  if (!parsed.success) {
    return {
      profile: null,
      result: reject(
        "REJECT_INVALID_WORK_EXECUTION_PROFILE",
        parsed.error.issues.map((issue) => `${issue.path.join(".") || "workExecutionProfile"}: ${issue.message}`),
        "Return the invalid source-bound profile to Chat for correction; model escalation is not authorized.",
      ),
    };
  }
  const binding = request.executionDirectiveBinding;
  if (version === 3 && (!binding
    || !binding.directiveId?.trim()
    || !Number.isInteger(binding.directiveRevision) || binding.directiveRevision < 1
    || !binding.taskId?.trim()
    || !/^[a-f0-9]{64}$/.test(binding.directiveArtifactSha256))) {
    return {
      profile: null,
      result: reject(
        "REJECT_UNVERIFIED_REASONING_SOURCE",
        ["The Work profile lacks a valid execution-directive artifact digest or identity."],
        "Repair the source-bound execution directive identity before authorization.",
      ),
    };
  }
  if (version === 3 && (!persistedDirective
    || persistedDirective.directiveId !== binding?.directiveId
    || persistedDirective.directiveRevision !== binding.directiveRevision
    || persistedDirective.taskId !== binding.taskId
    || persistedDirective.directiveArtifactSha256 !== binding.directiveArtifactSha256
    || persistedDirective.sourceMessageId !== request.sourceReceipt?.messageId
    || persistedDirective.sourceBodySha256 !== request.sourceReceipt?.bodySha256
    || persistedDirective.workExecutionProfile === LEGACY_MODEL_PROFILE_UNSPECIFIED
    || !workExecutionProfilesEqual(persistedDirective.workExecutionProfile, parsed.data))) {
    return {
      profile: null,
      result: reject(
        "REJECT_UNVERIFIED_REASONING_SOURCE",
        ["The request does not bind the current durable execution-directive artifact, source provenance, identity, revision, task, and exact Work profile."],
        "Use the current active execution_directive_recorded event; do not trust a worker-supplied digest alone.",
      ),
    };
  }
  return { profile: parsed.data, result: null };
}
