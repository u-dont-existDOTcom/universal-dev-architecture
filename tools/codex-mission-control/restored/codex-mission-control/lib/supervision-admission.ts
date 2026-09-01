export type SupervisionActor =
  | "OWNER"
  | "PROJECT_MANAGER_CHAT"
  | "SPECIALIST_SUPERVISOR_CHAT"
  | "CODEX"
  | "WORKER"
  | "SYSTEM";

export type SupervisionAction =
  | "REASONING"
  | "PROPOSAL"
  | "METHODOLOGY"
  | "PRIORITIZATION"
  | "CONSEQUENTIAL_TRADEOFF"
  | "SPEND_PROPOSAL"
  | "PAID_MODEL_INFERENCE"
  | "BOUNDED_EXECUTION"
  | "INTERNAL_SUPERVISOR_ROUTE"
  | "EXTERNAL_THIRD_PARTY_COMMUNICATION"
  | "COMPLETION_CLAIM";

export type AdmissionDecision =
  | "ALLOW"
  | "AUTO_ROUTE_TO_PROJECT_MANAGER"
  | "AUTO_ROUTE_TO_SPECIALIST_SUPERVISOR"
  | "BLOCK_PAID_API_PATH"
  | "BLOCK_UNVERIFIED_REASONING_SOURCE"
  | "BLOCK_MISSING_CHAT_DIRECTIVE"
  | "CONTINUE_TO_NEXT_STEP"
  | "OWNER_DECISION_REQUIRED"
  | "STOP_AT_EXACT_BLOCKER";

export interface VerifiedChatDirective {
  directiveId: string;
  status: "ACTIVE" | "SUPERSEDED" | "CLOSED";
  sourceRole: "PROJECT_MANAGER_CHAT" | "SPECIALIST_SUPERVISOR_CHAT";
  provenanceStatus: "VERIFIED" | "OWNER_ATTESTED" | "UNVERIFIED";
  exactBodySha256: string;
}

export interface ClaimedReasoningSource {
  claimed: boolean;
  provenanceStatus: "VERIFIED" | "OWNER_ATTESTED" | "UNVERIFIED";
  sourceRole?: "PROJECT_MANAGER_CHAT" | "SPECIALIST_SUPERVISOR_CHAT";
  messageId?: string;
  exactBodySha256?: string;
}

export interface OwnerSupervisionPolicy {
  chatOwnsReasoning: true;
  codexExecutionOnly: true;
  paidApiModelInferenceAllowed: boolean;
  preferIncludedChatgptCapacity: boolean;
  internalSupervisorRoutingPreauthorized: boolean;
  continueUntilOutcomeOrExactBoundary: boolean;
}

export interface SupervisionAdmissionRequest {
  actor: SupervisionActor;
  action: SupervisionAction;
  policy: OwnerSupervisionPolicy;
  preferredRoute?: "PROJECT_MANAGER_CHAT" | "SPECIALIST_SUPERVISOR_CHAT";
  estimatedSpendUsd?: number;
  directive?: VerifiedChatDirective | null;
  claimedReasoningSource?: ClaimedReasoningSource | null;
  genericTransportPolicyRequiresConfirmation?: boolean;
  routeScope?: "INTERNAL_SUPERVISION" | "EXTERNAL_THIRD_PARTY";
  pendingCompletionSteps?: string[];
  exactBlocker?: string | null;
  unresolvedOwnerDecision?: string | null;
}

export interface SupervisionAdmissionResult {
  decision: AdmissionDecision;
  allowed: boolean;
  ownerActionRequired: boolean;
  routeTarget: "PROJECT_MANAGER_CHAT" | "SPECIALIST_SUPERVISOR_CHAT" | null;
  reason: string;
  requiredNextAction: string;
}

const SEMANTIC_ACTIONS = new Set<SupervisionAction>([
  "REASONING",
  "PROPOSAL",
  "METHODOLOGY",
  "PRIORITIZATION",
  "CONSEQUENTIAL_TRADEOFF",
  "SPEND_PROPOSAL",
]);

const EXECUTION_ACTORS = new Set<SupervisionActor>(["CODEX", "WORKER"]);
const CHAT_ACTORS = new Set<SupervisionActor>([
  "PROJECT_MANAGER_CHAT",
  "SPECIALIST_SUPERVISOR_CHAT",
]);

function result(
  decision: AdmissionDecision,
  allowed: boolean,
  ownerActionRequired: boolean,
  routeTarget: SupervisionAdmissionResult["routeTarget"],
  reason: string,
  requiredNextAction: string,
): SupervisionAdmissionResult {
  return { decision, allowed, ownerActionRequired, routeTarget, reason, requiredNextAction };
}

function preferredRoute(request: SupervisionAdmissionRequest) {
  return request.preferredRoute ?? "PROJECT_MANAGER_CHAT";
}

function autoRouteDecision(request: SupervisionAdmissionRequest): SupervisionAdmissionResult {
  const routeTarget = preferredRoute(request);
  return result(
    routeTarget === "SPECIALIST_SUPERVISOR_CHAT"
      ? "AUTO_ROUTE_TO_SPECIALIST_SUPERVISOR"
      : "AUTO_ROUTE_TO_PROJECT_MANAGER",
    false,
    false,
    routeTarget,
    "Codex/Work cannot author this semantic action. The factual state must be routed automatically to the designated ChatGPT reasoning surface.",
    `Route the exact factual packet to ${routeTarget} without asking the owner to relay it or say “send it”.`,
  );
}

function hasValidDirective(directive: VerifiedChatDirective | null | undefined): boolean {
  return Boolean(
    directive
      && directive.status === "ACTIVE"
      && (directive.provenanceStatus === "VERIFIED" || directive.provenanceStatus === "OWNER_ATTESTED")
      && /^[a-f0-9]{64}$/.test(directive.exactBodySha256)
      && directive.directiveId.trim(),
  );
}

/**
 * Central admission decision for Chat-led reasoning and Codex-only execution.
 *
 * This is intentionally deterministic. It does not ask Codex to judge whether
 * its own proposal is reasonable; it routes the entire semantic class away
 * from Codex and blocks paid model inference under the current owner policy.
 */
export function decideSupervisionAdmission(
  request: SupervisionAdmissionRequest,
): SupervisionAdmissionResult {
  if (request.estimatedSpendUsd !== undefined
      && (!Number.isFinite(request.estimatedSpendUsd) || request.estimatedSpendUsd < 0)) {
    throw new Error("estimatedSpendUsd must be a finite non-negative number");
  }

  const source = request.claimedReasoningSource;
  if (source?.claimed && source.provenanceStatus === "UNVERIFIED") {
    return result(
      "BLOCK_UNVERIFIED_REASONING_SOURCE",
      false,
      false,
      preferredRoute(request),
      "A Codex summary, local subagent output, chat label, or unverified recollection cannot be represented as a Project Manager or supervisor decision.",
      `Route the exact factual state to ${preferredRoute(request)} and obtain a source-bound message receipt.`,
    );
  }

  const paidPath = request.action === "PAID_MODEL_INFERENCE"
    || request.action === "SPEND_PROPOSAL"
    || (request.estimatedSpendUsd ?? 0) > 0;

  if (paidPath && (!request.policy.paidApiModelInferenceAllowed || EXECUTION_ACTORS.has(request.actor))) {
    return result(
      "BLOCK_PAID_API_PATH",
      false,
      false,
      "PROJECT_MANAGER_CHAT",
      "Paid API inference and spend design are outside Codex/Work authority. The current owner policy prefers included ChatGPT capacity and does not authorize a paid API path.",
      "Cancel the paid path and automatically route the zero-spend factual state to the Project Manager Chat for an Extra High/Pro decision.",
    );
  }

  if (SEMANTIC_ACTIONS.has(request.action) && EXECUTION_ACTORS.has(request.actor)) {
    return autoRouteDecision(request);
  }

  if (request.action === "INTERNAL_SUPERVISOR_ROUTE") {
    if (request.routeScope !== "INTERNAL_SUPERVISION") {
      return result(
        "OWNER_DECISION_REQUIRED",
        false,
        true,
        null,
        "The requested route is not proven to remain inside the owner's supervision system.",
        "Obtain an explicit owner decision for external representational communication.",
      );
    }
    if (request.policy.internalSupervisorRoutingPreauthorized) {
      return result(
        "ALLOW",
        true,
        false,
        preferredRoute(request),
        request.genericTransportPolicyRequiresConfirmation
          ? "Standing owner authorization for internal supervisor routing controls at the orchestration layer; a generic representational-communication label must not be converted into a textual relay request to the owner."
          : "Internal supervisor routing is already authorized by the owner.",
        `Deliver the exact packet automatically to ${preferredRoute(request)} and preserve the delivery/source receipt.`,
      );
    }
    return result(
      "OWNER_DECISION_REQUIRED",
      false,
      true,
      null,
      "No standing owner authorization was supplied for this internal route.",
      "Request a direct owner decision once; do not ask the owner to copy or retype the message.",
    );
  }

  if (request.action === "EXTERNAL_THIRD_PARTY_COMMUNICATION") {
    return result(
      "OWNER_DECISION_REQUIRED",
      false,
      true,
      null,
      "Communication outside the owner's internal supervision system remains a consequential representational action.",
      "Obtain the required action-time owner confirmation for the exact external communication.",
    );
  }

  if (request.action === "BOUNDED_EXECUTION" && EXECUTION_ACTORS.has(request.actor)) {
    if (!hasValidDirective(request.directive)) {
      return result(
        "BLOCK_MISSING_CHAT_DIRECTIVE",
        false,
        false,
        preferredRoute(request),
        "Codex/Work may execute only from an active source-bound ChatGPT directive.",
        `Automatically route the current factual state to ${preferredRoute(request)} for an exact bounded execution directive.`,
      );
    }
    return result(
      "ALLOW",
      true,
      false,
      null,
      "The requested operation is bounded execution under an active source-bound ChatGPT directive.",
      "Execute exactly within the directive and return observable evidence without adding strategy or proposals.",
    );
  }

  if (request.action === "COMPLETION_CLAIM") {
    if (request.unresolvedOwnerDecision?.trim()) {
      return result(
        "OWNER_DECISION_REQUIRED",
        false,
        true,
        null,
        "A genuine unresolved owner decision prevents automatic continuation.",
        request.unresolvedOwnerDecision,
      );
    }
    if (request.exactBlocker?.trim()) {
      return result(
        "STOP_AT_EXACT_BLOCKER",
        false,
        false,
        null,
        "A concrete unavailable permission, credential, external system, safety boundary, or irreversible action blocks the remaining work.",
        request.exactBlocker,
      );
    }
    const pending = (request.pendingCompletionSteps ?? []).filter((step) => step.trim());
    if (request.policy.continueUntilOutcomeOrExactBoundary && pending.length > 0) {
      return result(
        "CONTINUE_TO_NEXT_STEP",
        false,
        false,
        null,
        "An intermediate green result, local implementation, PR, or undeployed build does not complete the owner outcome while eligible steps remain.",
        `Continue automatically with: ${pending[0]}`,
      );
    }
  }

  if (CHAT_ACTORS.has(request.actor) || request.actor === "OWNER" || request.actor === "SYSTEM") {
    return result(
      "ALLOW",
      true,
      false,
      null,
      "The action is within the actor's declared authority class.",
      "Proceed and preserve the exact source/provenance record.",
    );
  }

  return result(
    "ALLOW",
    true,
    false,
    null,
    "No blocking supervision condition applies.",
    "Proceed within the current bounded task contract.",
  );
}
