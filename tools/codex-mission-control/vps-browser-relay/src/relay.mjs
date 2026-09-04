import {
  CAPABILITY_CHALLENGE_SUMMARY,
  MANAGED_CHATGPT_HARD_CEILING_TABS,
  MCP_BINDING_PRELOAD_STEP,
  MODE_CAPABILITY_VERIFIED_SUMMARY,
  PROVIDER_SESSION_MODEL_SUMMARY,
  PROVIDER_SESSION_SUMMARY,
  RELAY_STAGE_SUMMARY,
  capabilityControlPrompt,
  appSelectionForMessage,
  chatCapabilityState,
  classifyMemoryPressure,
  completedCycleStepStatus,
  cycleControlPrompt,
  extractQueuedRoutes,
  mcpReadPreflightPrompt,
  managedChatGptTabTelemetry,
  newProviderSessionId,
  nextSupervisoryCycleAction,
  redactError,
  resolveMemoryPolicy,
  selectManagedTabClosures,
  sha256,
  shouldAttemptRoute,
  startedCycleStepStatus,
} from './core.mjs';
import { readMemoryMetrics } from './memory.mjs';
import { GlobalSubmissionPacer, isGlobalSubmissionCooldown, publicCooldown } from './submission-pacing.mjs';

const MCP_BINDING_PRELOAD_RECEIPT_GRACE_MS = 30_000;
const PROVIDER_SESSION_PROJECTION_TIMEOUT_MS = 30_000;

export class RelayRuntime {
  constructor({ config, missionControl, browser, stateStore, submissionPacer = null, memoryReader = readMemoryMetrics, logger = console }) {
    this.config = config;
    this.missionControl = missionControl;
    this.browser = browser;
    this.stateStore = stateStore;
    this.submissionPacer = submissionPacer ?? new GlobalSubmissionPacer({
      stateStore,
      minIntervalMs: config.runtime.minSubmissionIntervalMs ?? 60_000,
    });
    this.memoryReader = memoryReader;
    this.logger = logger;
  }

  async doctor() {
    let state = await this.stateStore.read();
    state = await this.#markInterruptedIntents(state);
    const [metrics, browser, snapshot] = await Promise.all([
      this.memoryReader(this.config.browser.profileDir),
      this.browser.doctor(),
      this.missionControl.fetchFleet(),
    ]);
    const memory = this.#memoryState(metrics);
    const routes = extractQueuedRoutes(snapshot, this.config.runtime.chats, state);
    const chatCapabilities = this.config.runtime.chats.map((chat) => chatCapabilityState(snapshot, chat));
    const result = {
      status: 'READY',
      checkedAt: new Date().toISOString(),
      submitEnabled: this.config.runtime.submitEnabled,
      capabilityTestEnabled: this.config.runtime.capabilityTestEnabled,
      submissionPacing: this.submissionPacer.status(state),
      browser,
      memory,
      missionControl: { workerCount: snapshot.workers.length, generatedAt: snapshot.generatedAt ?? null },
      queue: summarizeRoutes(routes, state),
      chatCapabilities,
      unresolvedAmbiguities: unresolvedAmbiguities(state),
    };
    await this.stateStore.writeStatus(result);
    return result;
  }

  async verifyCapabilities(chatId) {
    let state = await this.stateStore.read();
    state = await this.#markInterruptedIntents(state);
    const chat = this.config.runtime.chats.find((entry) => entry.supervisorId === chatId || entry.bootstrapCapability.chatId === chatId);
    if (!chat) throw new Error(`Unknown registered chat: ${chatId}`);
    let snapshot = await this.missionControl.fetchFleet();
    let capability = chatCapabilityState(snapshot, chat);
    if (!capability.challengeAvailable) {
      return this.#writeStandaloneStatus('CAPABILITY_CHALLENGE_MISSING', state, { chatId, capability });
    }

    const metrics = await this.memoryReader(this.config.browser.profileDir);
    const memory = this.#memoryState(metrics);
    if (memory.pressure === 'HARD') return this.#writeStandaloneStatus('PAUSED_MEMORY_HARD', state, { chatId, memory, capability });

    const target = await this.browser.findOrCreateChatTarget(chat.bootstrapCapability.url, {
      reusableTargetId: this.#selectReusableTargetId(state, await this.browser.listTargets()),
      hardCeiling: Math.min(this.config.runtime.maxHotTabs, MANAGED_CHATGPT_HARD_CEILING_TABS),
    });
    this.#rememberTarget(state, chat, target, null, chat.bootstrapCapability.url);
    const mode = await this.browser.verifyModelRoundTrip(target, {
      expectedUrl: chat.bootstrapCapability.url,
      extraHighLabel: chat.modelLabels.extraHigh,
      proLabel: chat.modelLabels.pro,
    });
    const challengeExpiry = findChallengeExpiry(snapshot, chat);
    if (!challengeExpiry) throw new Error(`Capability challenge ${chat.bootstrapCapability.challengeId} has no usable expiry.`);
    await this.missionControl.recordEvidence(chat.workerId, {
      receiptId: `chat-mode-capability:${chat.bootstrapCapability.chatId}:${Date.now()}`,
      summary: MODE_CAPABILITY_VERIFIED_SUMMARY,
      refs: [
        `challenge:${chat.bootstrapCapability.challengeId}`,
        `chat:${chat.bootstrapCapability.chatId}`,
        'capability:modeSwitching',
        `extra_high_label:${chat.modelLabels.extraHigh}`,
        `pro_label:${chat.modelLabels.pro}`,
        `expires_at:${challengeExpiry}`,
        'backend_model_identity_claimed:false',
      ],
    });

    snapshot = await this.missionControl.fetchFleet();
    capability = chatCapabilityState(snapshot, chat);
    if (capability.allCurrent) {
      return this.#writeStandaloneStatus('CAPABILITIES_VERIFIED', state, { chatId, mode, capability, memory });
    }
    if (!this.config.runtime.capabilityTestEnabled) {
      return this.#writeStandaloneStatus('CAPABILITY_CHALLENGE_READY', state, {
        chatId,
        mode,
        capability,
        memory,
        nextAction: 'Set MC_RELAY_CAPABILITY_TEST_ENABLED=1 only for the harmless capability challenge.',
      });
    }

    const key = `capability:${chat.bootstrapCapability.chatId}:${chat.bootstrapCapability.challengeId}`;
    const prior = state.deliveries[key] ?? null;
    if (prior?.status === 'AMBIGUOUS_AFTER_RESTART') {
      return this.#writeStandaloneStatus('CAPABILITY_SUBMISSION_AMBIGUOUS', state, { chatId, capability, memory });
    }
    if (prior?.status === 'CAPABILITY_GENERATION_STARTED') {
      let complete;
      try {
        complete = await this.browser.waitForGenerationComplete(target, { expectedUrl: chat.bootstrapCapability.url, generationStarted: true });
      } catch (error) {
        if (isGlobalSubmissionCooldown(error)) return this.#cooldownStatus(state, { chatId, capability, memory }, error);
        throw error;
      }
      state = await this.stateStore.read();
      state.deliveries[key] = { ...prior, status: 'CAPABILITY_GENERATION_COMPLETE', generationCompletion: complete, completedAt: complete.completedAtObserved };
      state = await this.stateStore.write(state);
      snapshot = await this.missionControl.fetchFleet();
      capability = chatCapabilityState(snapshot, chat);
      return this.#writeStandaloneStatus(capability.allCurrent ? 'CAPABILITIES_VERIFIED' : 'AWAITING_CAPABILITY_RECEIPT', state, { chatId, capability, mode, memory });
    }
    if (prior?.status === 'CAPABILITY_GENERATION_COMPLETE') {
      snapshot = await this.missionControl.fetchFleet();
      capability = chatCapabilityState(snapshot, chat);
      return this.#writeStandaloneStatus(capability.allCurrent ? 'CAPABILITIES_VERIFIED' : 'AWAITING_CAPABILITY_RECEIPT', state, { chatId, capability, mode, memory });
    }

    const prompt = capabilityControlPrompt(chat);
    const observed = await this.browser.switchModel(target, { expectedUrl: chat.bootstrapCapability.url, label: chat.modelLabels.extraHigh });
    try {
      const start = await this.submissionPacer.submit({
        beforeSubmit: async () => {
          const intentAt = new Date().toISOString();
          state = await this.stateStore.read();
          state.deliveries[key] = {
            status: 'SUBMISSION_INTENT_RECORDED',
            chatId: chat.bootstrapCapability.chatId,
            conversationUrl: chat.bootstrapCapability.url,
            capabilityChallengeId: chat.bootstrapCapability.challengeId,
            bodySha256: sha256(prompt),
            modelUiLabel: observed.observedLabel,
            intentRecordedAt: intentAt,
            lastAttemptAt: intentAt,
          };
          state = await this.stateStore.write(state);
        },
        submit: async () => {
          const messageApps = await this.browser.selectAppsForMessage(target, appSelectionForMessage(chat, 'CAPABILITY'));
          const start = await this.browser.submitExactMessage(target, { expectedUrl: chat.bootstrapCapability.url, body: prompt, bodySha256: sha256(prompt) });
          return { ...start, messageApps };
        },
      });
      state = await this.stateStore.read();
      state.deliveries[key] = { ...state.deliveries[key], status: 'CAPABILITY_GENERATION_STARTED', generationStart: start, startedAt: start.startedAtObserved };
      state = await this.stateStore.write(state);
      let complete;
      try {
        complete = await this.browser.waitForGenerationComplete(target, { expectedUrl: chat.bootstrapCapability.url, generationStarted: start.generationStarted });
      } catch (error) {
        if (isGlobalSubmissionCooldown(error)) return this.#cooldownStatus(state, { chatId, capability, mode, memory }, error);
        throw error;
      }
      state = await this.stateStore.read();
      state.deliveries[key] = { ...state.deliveries[key], status: 'CAPABILITY_GENERATION_COMPLETE', generationCompletion: complete, completedAt: complete.completedAtObserved };
      state = await this.stateStore.write(state);
      snapshot = await this.missionControl.fetchFleet();
      capability = chatCapabilityState(snapshot, chat);
      return this.#writeStandaloneStatus(capability.allCurrent ? 'CAPABILITIES_VERIFIED' : 'AWAITING_CAPABILITY_RECEIPT', state, { chatId, capability, mode, memory });
    } catch (error) {
      if (isGlobalSubmissionCooldown(error)) return this.#cooldownStatus(state, { chatId, capability, mode, memory }, error);
      const stage = error?.relayStage ?? 'UNKNOWN';
      state = await this.stateStore.read();
      state.deliveries[key] = {
        ...state.deliveries[key],
        status: stage === 'CLICKED' ? 'AMBIGUOUS_AFTER_RESTART' : 'FAILED_RETRYABLE',
        failureStage: stage,
        failedAt: new Date().toISOString(),
        lastError: redactError(error),
      };
      state = await this.stateStore.write(state);
      return this.#writeStandaloneStatus(stage === 'CLICKED' ? 'CAPABILITY_SUBMISSION_AMBIGUOUS' : 'CAPABILITY_SUBMISSION_FAILED', state, { chatId, capability, mode, memory, error: redactError(error) });
    }
  }

  async verifyMcpReadPreflight(chatId) {
    let state = await this.stateStore.read();
    state = await this.#markInterruptedIntents(state);
    const chat = this.config.runtime.chats.find((entry) => entry.supervisorId === chatId || entry.bootstrapCapability.chatId === chatId);
    if (!chat) throw new Error(`Unknown registered chat: ${chatId}`);
    const snapshot = await this.missionControl.fetchFleet();
    const capability = chatCapabilityState(snapshot, chat);
    if (!capability.challengeAvailable) {
      return this.#writeStandaloneStatus('CAPABILITY_CHALLENGE_MISSING', state, { chatId, capability });
    }

    const metrics = await this.memoryReader(this.config.browser.profileDir);
    const memory = this.#memoryState(metrics);
    if (memory.pressure === 'HARD') return this.#writeStandaloneStatus('PAUSED_MEMORY_HARD', state, { chatId, memory, capability });
    if (!this.config.runtime.capabilityTestEnabled) {
      return this.#writeStandaloneStatus('MCP_PREFLIGHT_READY', state, {
        chatId,
        capability,
        memory,
        nextAction: 'Set MC_RELAY_CAPABILITY_TEST_ENABLED=1 only for the harmless read-only MCP preflight.',
      });
    }

    const target = await this.browser.findOrCreateChatTarget(chat.bootstrapCapability.url, {
      reusableTargetId: this.#selectReusableTargetId(state, await this.browser.listTargets()),
      hardCeiling: Math.min(this.config.runtime.maxHotTabs, MANAGED_CHATGPT_HARD_CEILING_TABS),
    });
    this.#rememberTarget(state, chat, target, null, chat.bootstrapCapability.url);
    const key = `mcp-preflight:${chat.bootstrapCapability.chatId}:${chat.bootstrapCapability.challengeId}`;
    const prior = state.deliveries[key] ?? null;
    if (prior?.status === 'AMBIGUOUS_AFTER_RESTART') {
      return this.#writeStandaloneStatus('MCP_PREFLIGHT_SUBMISSION_AMBIGUOUS', state, { chatId, capability, memory });
    }
    if (prior?.status === 'MCP_PREFLIGHT_GENERATION_COMPLETE') {
      return this.#writeStandaloneStatus('MCP_PREFLIGHT_GENERATION_COMPLETE', state, { chatId, capability, memory });
    }
    if (prior?.status === 'MCP_PREFLIGHT_GENERATION_STARTED') {
      let complete;
      try {
        complete = await this.browser.waitForGenerationComplete(target, { expectedUrl: chat.bootstrapCapability.url, generationStarted: true });
      } catch (error) {
        if (isGlobalSubmissionCooldown(error)) return this.#cooldownStatus(state, { chatId, capability, memory }, error);
        throw error;
      }
      state = await this.stateStore.read();
      state.deliveries[key] = { ...prior, status: 'MCP_PREFLIGHT_GENERATION_COMPLETE', generationCompletion: complete, completedAt: complete.completedAtObserved };
      state = await this.stateStore.write(state);
      return this.#writeStandaloneStatus('MCP_PREFLIGHT_GENERATION_COMPLETE', state, { chatId, capability, memory });
    }

    const prompt = mcpReadPreflightPrompt(chat);
    const observed = await this.browser.switchModel(target, { expectedUrl: chat.bootstrapCapability.url, label: chat.modelLabels.extraHigh });
    try {
      const start = await this.submissionPacer.submit({
        beforeSubmit: async () => {
          const intentAt = new Date().toISOString();
          state = await this.stateStore.read();
          state.deliveries[key] = {
            status: 'SUBMISSION_INTENT_RECORDED',
            chatId: chat.bootstrapCapability.chatId,
            conversationUrl: chat.bootstrapCapability.url,
            capabilityChallengeId: chat.bootstrapCapability.challengeId,
            bodySha256: sha256(prompt),
            modelUiLabel: observed.observedLabel,
            intentRecordedAt: intentAt,
            lastAttemptAt: intentAt,
          };
          state = await this.stateStore.write(state);
        },
        submit: async () => {
          const messageApps = await this.browser.selectAppsForMessage(target, appSelectionForMessage(chat, 'MCP_PREFLIGHT'));
          const start = await this.browser.submitExactMessage(target, { expectedUrl: chat.bootstrapCapability.url, body: prompt, bodySha256: sha256(prompt) });
          return { ...start, messageApps };
        },
      });
      state = await this.stateStore.read();
      state.deliveries[key] = { ...state.deliveries[key], status: 'MCP_PREFLIGHT_GENERATION_STARTED', generationStart: start, startedAt: start.startedAtObserved };
      state = await this.stateStore.write(state);
      const complete = await this.browser.waitForGenerationComplete(target, { expectedUrl: chat.bootstrapCapability.url, generationStarted: start.generationStarted });
      state = await this.stateStore.read();
      state.deliveries[key] = { ...state.deliveries[key], status: 'MCP_PREFLIGHT_GENERATION_COMPLETE', generationCompletion: complete, completedAt: complete.completedAtObserved };
      state = await this.stateStore.write(state);
      return this.#writeStandaloneStatus('MCP_PREFLIGHT_GENERATION_COMPLETE', state, { chatId, capability, memory });
    } catch (error) {
      if (isGlobalSubmissionCooldown(error)) return this.#cooldownStatus(state, { chatId, capability, memory }, error);
      const stage = error?.relayStage ?? 'UNKNOWN';
      state = await this.stateStore.read();
      state.deliveries[key] = {
        ...state.deliveries[key],
        status: stage === 'CLICKED' ? 'AMBIGUOUS_AFTER_RESTART' : 'FAILED_RETRYABLE',
        failureStage: stage,
        failedAt: new Date().toISOString(),
        lastError: redactError(error),
      };
      state = await this.stateStore.write(state);
      return this.#writeStandaloneStatus(stage === 'CLICKED' ? 'MCP_PREFLIGHT_SUBMISSION_AMBIGUOUS' : 'MCP_PREFLIGHT_SUBMISSION_FAILED', state, { chatId, capability, memory, error: redactError(error) });
    }
  }

  async cycle() {
    const startedAt = new Date().toISOString();
    let state = await this.stateStore.read();
    state = await this.#markInterruptedIntents(state);
    state.health.lastCycleAt = startedAt;

    try {
      let metrics = await this.memoryReader(this.config.browser.profileDir);
      let memory = this.#memoryState(metrics);
      const targets = await this.browser.listTargets();
      this.#forgetMissingTargets(state, targets);
      const closedTargets = await this.#applyTabBudget(targets, state, memory.pressure, null);
      if (closedTargets.length > 0) {
        metrics = await this.memoryReader(this.config.browser.profileDir);
        memory = this.#memoryState(metrics);
      }
      state.health.metrics = metrics;
      state.health.pressure = memory.pressure;
      state.health.pausedReason = memory.pressure === 'HARD' ? memory.reasons.join('; ') : null;
      if (memory.pressure === 'HARD') {
        state.health.lastError = null;
        state = await this.stateStore.write(state);
        return this.#writeStandaloneStatus('PAUSED_MEMORY_HARD', state, { memory, closedTargets, queue: null });
      }

      const snapshot = await this.missionControl.fetchFleet();
      state.health.lastSuccessfulPollAt = new Date().toISOString();
      const routes = extractQueuedRoutes(snapshot, this.config.runtime.chats, state);
      const withReceipt = routes.find((route) => route.routeKind === 'SUPERVISORY_CYCLE' && route.decisionReceipt);
      if (withReceipt) {
        const providerSessionId = withReceipt.decisionReceipt.provider_session_id;
        const session = providerSessionId ? state.providerSessions[providerSessionId] : null;
        if (!session || session.requestId !== withReceipt.requestId || session.supervisorId !== withReceipt.supervisorId) {
          throw new Error(`Canonical receipt for ${withReceipt.requestId} is not bound to its active provider session.`);
        }
        session.status = 'COMPLETE';
        session.completedAt = new Date().toISOString();
        state.providerSessions[providerSessionId] = session;
        await this.#recordProviderSession({ ...withReceipt, providerSessionId, providerSession: session }, session, 'EXACT');
        if (session.targetId) this.#rememberReusableTarget(state, session.targetId, session.conversationUrl);
        state.deliveries[withReceipt.routeKey] = {
          ...(state.deliveries[withReceipt.routeKey] ?? {}),
          status: 'DECISION_RECEIPT_INGESTED',
          receiptId: withReceipt.decisionReceipt.receipt_id,
          receivedAt: new Date().toISOString(),
        };
        state.health.lastError = null;
        state.health.pausedReason = null;
        state = await this.stateStore.write(state);
        return this.#writeStandaloneStatus('DECISION_RECEIPT_INGESTED', state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(withReceipt), receipt: publicDecisionReceipt(withReceipt.decisionReceipt) });
      }

      const ambiguous = routes.find((route) => state.deliveries[route.routeKey]?.status === 'AMBIGUOUS_AFTER_RESTART');
      if (ambiguous) {
        state.health.lastError = null;
        state.health.pausedReason = `Route ${ambiguous.routeKey} is ambiguous after a possible browser click; automatic replay is prohibited.`;
        state = await this.stateStore.write(state);
        return this.#writeStandaloneStatus('AMBIGUITY_REQUIRES_OPERATOR', state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(ambiguous) });
      }

      const nowMs = Date.now();
      const candidate = routes.find((route) => route.routeKind === 'SUPERVISORY_CYCLE'
        ? shouldProcessSupervisoryCycle(route, state.deliveries[route.routeKey], nowMs, this.config.runtime.retryDelayMs)
        : shouldAttemptRoute(state.deliveries[route.routeKey], nowMs, this.config.runtime.retryDelayMs));
      if (!candidate) {
        state.health.lastError = null;
        state.health.pausedReason = null;
        state = await this.stateStore.write(state);
        return this.#writeStandaloneStatus('IDLE', state, { memory, queue: summarizeRoutes(routes, state), closedTargets });
      }

      if (candidate.routeKind !== 'SUPERVISORY_CYCLE') {
        state.health.pausedReason = 'Legacy factual-packet browser automation is disabled; migrate this route to the same-chat supervisory-cycle protocol.';
        state = await this.stateStore.write(state);
        return this.#writeStandaloneStatus('LEGACY_ROUTE_NOT_AUTOMATED', state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(candidate) });
      }

      const capability = chatCapabilityState(snapshot, candidate.chat);
      if (!capability.allCurrent) {
        state.health.pausedReason = `Stable supervisor ${candidate.chat.supervisorId} lacks current bootstrap capability receipts.`;
        state = await this.stateStore.write(state);
        return this.#writeStandaloneStatus('CAPABILITY_NOT_VERIFIED', state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(candidate), capability });
      }

      if (!this.config.runtime.submitEnabled) {
        state.health.lastError = null;
        state.health.pausedReason = 'MC_RELAY_SUBMIT_ENABLED is not 1; no supervisory browser write was attempted.';
        state = await this.stateStore.write(state);
        return this.#writeStandaloneStatus('DRY_RUN_ROUTE_READY', state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(candidate), capability });
      }

      return this.#processSupervisoryCycle(candidate, routes, state, memory);
    } catch (error) {
      if (isGlobalSubmissionCooldown(error)) return this.#cooldownStatus(state, {}, error);
      state.health.lastError = redactError(error);
      state.health.pausedReason = null;
      state = await this.stateStore.write(state);
      return this.#writeStandaloneStatus('ERROR', state, { error: redactError(error) });
    }
  }

  async resolve(routeKey, outcome) {
    let state = await this.stateStore.read();
    const current = state.deliveries[routeKey];
    if (!current) throw new Error(`Unknown route key: ${routeKey}`);
    if (!['SUBMISSION_INTENT_RECORDED', 'AMBIGUOUS_AFTER_RESTART', 'FAILED_RETRYABLE'].includes(current.status)) {
      throw new Error(`Route ${routeKey} is ${current.status}; no ambiguity resolution is permitted.`);
    }
    const resolvedAt = new Date().toISOString();
    if (outcome === 'retry') state.deliveries[routeKey] = { ...current, status: 'RETRY_AUTHORIZED', resolvedAt, resolution: 'OPERATOR_AUTHORIZED_RETRY', lastError: null };
    else if (outcome === 'submitted') state.deliveries[routeKey] = { ...current, status: 'SUBMITTED_CONFIRMED', confirmedAt: resolvedAt, resolution: 'OPERATOR_ATTESTED_SUBMITTED', lastError: null };
    else if (outcome === 'discard') state.deliveries[routeKey] = { ...current, status: 'DISCARDED', resolvedAt, resolution: 'OPERATOR_DISCARDED', lastError: null };
    else throw new Error('Resolution outcome must be retry, submitted, or discard.');
    state = await this.stateStore.write(state);
    return this.#writeStandaloneStatus('AMBIGUITY_RESOLVED', state, { routeKey, outcome });
  }

  async #processSupervisoryCycle(route, routes, state, memory) {
    let prior = state.deliveries[route.routeKey] ?? null;
    if (prior?.status === completedCycleStepStatus(MCP_BINDING_PRELOAD_STEP) && !route.firstTurnMcpReceipt) {
      const completedAt = Date.parse(prior.generationCompletedAt ?? '');
      if (!Number.isFinite(completedAt) || Date.now() - completedAt < MCP_BINDING_PRELOAD_RECEIPT_GRACE_MS) {
        state.health.pausedReason = `Waiting for the required MCP binding preload receipt for ${route.requestId}.`;
        state = await this.stateStore.write(state);
        return this.#writeStandaloneStatus('AWAITING_MCP_BINDING_PRELOAD_RECEIPT', state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route) });
      }
      const session = prior.providerSessionId ? state.providerSessions[prior.providerSessionId] : null;
      const failedAt = new Date().toISOString();
      if (session) {
        const failedSession = { ...session, status: 'FAILED', failedAt, failureStage: 'MCP_BINDING_PRELOAD_RECEIPT_MISSING' };
        state.providerSessions[session.providerSessionId] = failedSession;
        await this.#recordProviderSession(route, failedSession, failedSession.conversationUrl ? 'EXACT' : 'PENDING_PROVIDER_ASSIGNMENT');
      }
      state.deliveries[route.routeKey] = {
        ...prior,
        status: 'FAILED_RETRYABLE',
        failedAt,
        failureStage: 'MCP_BINDING_PRELOAD_RECEIPT_MISSING',
        lastError: 'The binding-only preload completed without a server-observed current-session get_supervisory_request_binding success receipt; no semantic message was sent.',
      };
      state.health.lastError = state.deliveries[route.routeKey].lastError;
      state.health.pausedReason = null;
      state = await this.stateStore.write(state);
      return this.#writeStandaloneStatus('MCP_BINDING_PRELOAD_RECEIPT_MISSING', state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route) });
    }
    const action = nextSupervisoryCycleAction(route, prior);
    if (!action) return this.#writeStandaloneStatus('IDLE', state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route) });
    if (action.type === 'WAIT_GITHUB_RECEIPT') {
      state.health.pausedReason = `Waiting for canonical GitHub decision receipt for ${route.requestId}.`;
      state = await this.stateStore.write(state);
      return this.#writeStandaloneStatus('AWAITING_GITHUB_RECEIPT', state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route) });
    }

    let session = prior?.providerSessionId ? state.providerSessions[prior.providerSessionId] : null;
    if (session && (prior?.status === 'FAILED_RETRYABLE' || prior?.status === 'RETRY_AUTHORIZED') && session.status === 'FAILED') session = null;
    let target;
    let expectedUrl;
    if (!session) {
      if (prior && !['UNSEEN', 'RETRY_AUTHORIZED', 'FAILED_RETRYABLE'].includes(prior.status)) {
        throw new Error(`Route ${route.requestId} reached ${prior.status} without a bound provider session.`);
      }
      const providerSessionId = newProviderSessionId();
      const openedAt = new Date().toISOString();
      const currentTargets = await this.browser.listTargets();
      target = await this.browser.createFreshChatTarget({
        reusableTargetId: this.#selectReusableTargetId(state, currentTargets),
        hardCeiling: Math.min(this.config.runtime.maxHotTabs, MANAGED_CHATGPT_HARD_CEILING_TABS),
      });
      const mode = await this.browser.verifyModelRoundTrip(target, {
        expectedUrl: 'https://chatgpt.com/',
        extraHighLabel: route.chat.modelLabels.extraHigh,
        proLabel: route.chat.modelLabels.pro,
      });
      const modelReceiptId = `provider-session-model:${providerSessionId}:${sha256(openedAt).slice(0, 12)}`;
      await this.missionControl.recordEvidence(route.workerId, {
        receiptId: modelReceiptId,
        summary: PROVIDER_SESSION_MODEL_SUMMARY,
        refs: [
          `request:${route.requestId}`,
          `supervisor:${route.supervisorId}`,
          `provider_session:${providerSessionId}`,
          `extra_high_label:${route.chat.modelLabels.extraHigh}`,
          `pro_label:${route.chat.modelLabels.pro}`,
          'round_trip:EXTRA_HIGH_PRO_EXTRA_HIGH',
          'assistant_content_observed:false',
          'backend_model_identity_claimed:false',
          `opened_at:${openedAt}`,
        ],
        occurredAt: openedAt,
      });
      session = {
        providerSessionId,
        supervisorId: route.supervisorId,
        requestId: route.requestId,
        workerId: route.workerId,
        conversationUrl: null,
        openedAt,
        status: 'ACTIVE',
        modelReceiptId,
        firstTurnMcpReceiptId: null,
        targetId: target.id,
      };
      state.providerSessions[providerSessionId] = session;
      state.deliveries[route.routeKey] = {
        ...(prior ?? {}),
        status: prior?.status ?? 'UNSEEN',
        requestId: route.requestId,
        workerId: route.workerId,
        supervisorId: route.supervisorId,
        providerSessionId,
      };
      this.#rememberTarget(state, route.chat, target, providerSessionId, 'https://chatgpt.com/');
      state = await this.stateStore.write(state);
      await this.#recordProviderSession(route, session, 'PENDING_PROVIDER_ASSIGNMENT');
      prior = state.deliveries[route.routeKey];
      expectedUrl = 'https://chatgpt.com/';
    } else {
      if (session.requestId !== route.requestId || session.supervisorId !== route.supervisorId || session.status !== 'ACTIVE') {
        throw new Error(`Provider session ${session.providerSessionId ?? prior.providerSessionId} is not the active exact session for request ${route.requestId}.`);
      }
      if (session.conversationUrl) {
        target = await this.browser.findOrCreateChatTarget(session.conversationUrl, {
          reusableTargetId: session.targetId,
          hardCeiling: Math.min(this.config.runtime.maxHotTabs, MANAGED_CHATGPT_HARD_CEILING_TABS),
        });
        expectedUrl = session.conversationUrl;
      } else {
        const existing = (await this.browser.listTargets()).find((candidate) => candidate.id === session.targetId && candidate.type === 'page' && candidate.url === 'https://chatgpt.com/');
        if (!existing) throw new Error(`Pending provider session ${session.providerSessionId} lost its fresh-chat target before first send.`);
        await this.browser.activateTarget(existing.id);
        target = { ...existing, created: false };
        expectedUrl = 'https://chatgpt.com/';
      }
      this.#rememberTarget(state, route.chat, target, session.providerSessionId, expectedUrl);
    }
    await this.#waitForProviderSessionProjection(route, session, session.conversationUrl ? 'EXACT' : 'PENDING_PROVIDER_ASSIGNMENT');
    if (route.firstTurnMcpReceipt && !session.firstTurnMcpReceiptId) {
      if (route.firstTurnMcpReceipt.supervisorId !== route.supervisorId || route.firstTurnMcpReceipt.providerSessionId !== session.providerSessionId) {
        throw new Error(`First-turn MCP receipt does not match provider session ${session.providerSessionId}.`);
      }
      session = { ...session, firstTurnMcpReceiptId: route.firstTurnMcpReceipt.receiptId };
      state.providerSessions[session.providerSessionId] = session;
      state = await this.stateStore.write(state);
      await this.#recordProviderSession(route, session, session.conversationUrl ? 'EXACT' : 'PENDING_PROVIDER_ASSIGNMENT');
    }
    route = { ...route, providerSessionId: session.providerSessionId, providerSession: session };
    if (['EXTRA_HIGH_DIRECT', 'EXTRA_HIGH_READER'].includes(action.step) && !session.firstTurnMcpReceiptId) {
      throw new Error(`Semantic step ${action.step} cannot start before provider session ${session.providerSessionId} has its admitted MCP binding preload receipt.`);
    }
    const postOpenMetrics = await this.memoryReader(this.config.browser.profileDir);
    memory = this.#memoryState(postOpenMetrics);
    const closedTargets = await this.#applyTabBudget(await this.browser.listTargets(), state, memory.pressure, target.id);
    if (memory.pressure === 'HARD') {
      if (target.created) await this.browser.closeTarget(target.id).catch(() => {});
      session.status = 'FAILED';
      session.failedAt = new Date().toISOString();
      state.providerSessions[session.providerSessionId] = session;
      await this.#recordProviderSession(route, session, session.conversationUrl ? 'EXACT' : 'PENDING_PROVIDER_ASSIGNMENT');
      state.health.pausedReason = `Opening a fresh provider session for ${route.chat.label} crossed the hard memory boundary: ${memory.reasons.join('; ')}`;
      state = await this.stateStore.write(state);
      return this.#writeStandaloneStatus('PAUSED_MEMORY_AFTER_TAB_OPEN', state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route), closedTargets });
    }

    if (action.type === 'WAIT_GENERATION') {
      await this.#ensureStartEvidence(route, action.step, prior);
      const observation = await this.browser.waitForGenerationComplete(target, { expectedUrl, generationStarted: prior?.generationStarted === true });
      await this.#recordRelayStage(route, action.step, prior.modelUiLabel, prior.promptSha256, 'COMPLETE', observation.completedAtObserved, null, prior.generationStart?.messageApps ?? null);
      state = await this.stateStore.read();
      state.deliveries[route.routeKey] = {
        ...prior,
        status: completedCycleStepStatus(action.step),
        generationCompletedAt: observation.completedAtObserved,
        generationCompletion: observation,
      };
      state.health.lastError = null;
      state.health.pausedReason = null;
      state = await this.stateStore.write(state);
      return this.#writeStandaloneStatus(completedCycleStepStatus(action.step), state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route), observation });
    }

    const prompt = cycleControlPrompt(route, action.step);
    const desiredLabel = action.model === 'PRO' ? route.chat.modelLabels.pro : route.chat.modelLabels.extraHigh;
    const model = await this.browser.switchModel(target, { expectedUrl, label: desiredLabel });
    if (model.observedLabel !== desiredLabel) throw new Error(`Exact model UI label mismatch: expected ${desiredLabel}, observed ${model.observedLabel ?? 'UNKNOWN'}.`);
    const promptSha256 = sha256(prompt);
    let generationStarted = false;
    try {
      const start = await this.submissionPacer.submit({
        beforeSubmit: async () => {
          const intentAt = new Date().toISOString();
          state = await this.stateStore.read();
          const current = state.deliveries[route.routeKey] ?? prior;
          state.deliveries[route.routeKey] = {
            ...current,
            status: 'SUBMISSION_INTENT_RECORDED',
            requestId: route.requestId,
            workerId: route.workerId,
            supervisorId: route.supervisorId,
            providerSessionId: session.providerSessionId,
            conversationUrl: session.conversationUrl,
            cycleStep: action.step,
            reasoningLane: route.packet.reasoningLane,
            modelUiLabel: model.observedLabel,
            promptSha256,
            bodySha256: promptSha256,
            bodyLength: prompt.length,
            targetId: target.id,
            attempt: (current?.attempt ?? 0) + 1,
            intentRecordedAt: intentAt,
            lastAttemptAt: intentAt,
            lastError: null,
          };
          state = await this.stateStore.write(state);
        },
        submit: async () => {
          const appPlan = appSelectionForMessage(route.chat, action.step);
          const messageApps = appPlan.requiredLabels.length > 0
            ? await this.browser.selectAppsForMessage(target, appPlan)
            : { status: 'APP_SELECTION_NOT_ATTEMPTED', requiredLabels: [], selectedLabels: [], inspectedAssistantOutput: false };
          const start = await this.browser.submitExactMessage(target, { expectedUrl, body: prompt, bodySha256: promptSha256 });
          return { ...start, messageApps };
        },
      });
      generationStarted = true;
      state = await this.stateStore.read();
      session = state.providerSessions[session.providerSessionId];
      if (!session) throw new Error(`Provider session ${route.providerSessionId} disappeared after submission.`);
      if (!session.conversationUrl) {
        session = { ...session, conversationUrl: start.conversationUrl, targetId: target.id, urlBoundAt: start.startedAtObserved };
        state.providerSessions[session.providerSessionId] = session;
        this.#rememberTarget(state, route.chat, target, session.providerSessionId, session.conversationUrl);
        state = await this.stateStore.write(state);
        await this.#recordProviderSession(route, session, 'EXACT');
      } else if (session.conversationUrl !== start.conversationUrl) {
        throw new Error(`Provider session URL changed from ${session.conversationUrl} to ${start.conversationUrl}.`);
      }
      route = { ...route, providerSession: session };
      state.deliveries[route.routeKey] = {
        ...state.deliveries[route.routeKey],
        status: startedCycleStepStatus(action.step),
        generationStarted: true,
        generationStartedAt: start.startedAtObserved,
        generationStart: start,
        conversationUrl: session.conversationUrl,
      };
      state = await this.stateStore.write(state);
      await this.#recordRelayStage(route, action.step, model.observedLabel, promptSha256, 'STARTED', start.startedAtObserved, start.startSignal, start.messageApps ?? null);
      return this.#writeStandaloneStatus(startedCycleStepStatus(action.step), state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route), generationStart: start });
    } catch (error) {
      if (isGlobalSubmissionCooldown(error)) return this.#cooldownStatus(state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route) }, error);
      const stage = error?.relayStage ?? 'UNKNOWN';
      const afterClick = generationStarted || stage === 'CLICKED';
      state = await this.stateStore.read();
      session = state.providerSessions[route.providerSessionId] ?? session;
      if (session) {
        session = {
          ...session,
          status: afterClick ? 'AMBIGUOUS' : 'FAILED',
          failedAt: new Date().toISOString(),
          failureStage: stage,
        };
        state.providerSessions[session.providerSessionId] = session;
        await this.#recordProviderSession(route, session, session.conversationUrl ? 'EXACT' : 'PENDING_PROVIDER_ASSIGNMENT');
      }
      state.deliveries[route.routeKey] = {
        ...state.deliveries[route.routeKey],
        status: afterClick ? 'AMBIGUOUS_AFTER_RESTART' : 'FAILED_RETRYABLE',
        failedAt: new Date().toISOString(),
        failureStage: stage,
        lastError: redactError(error),
      };
      state.health.lastError = redactError(error);
      state.health.pausedReason = afterClick ? 'A browser click may have occurred without a verified generation-start transition; automatic replay is prohibited.' : null;
      state = await this.stateStore.write(state);
      return this.#writeStandaloneStatus(afterClick ? 'SUBMISSION_AMBIGUOUS' : 'SUBMISSION_FAILED_RETRYABLE', state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route), failureStage: stage, error: redactError(error) });
    }
  }

  async #ensureStartEvidence(route, step, prior) {
    if (!prior?.generationStarted || !prior?.generationStartedAt || !prior?.modelUiLabel || !prior?.promptSha256) {
      throw new Error(`Generation-start evidence is incomplete for ${route.requestId}/${step}.`);
    }
    await this.#recordRelayStage(route, step, prior.modelUiLabel, prior.promptSha256, 'STARTED', prior.generationStartedAt, prior.generationStart?.startSignal ?? null, prior.generationStart?.messageApps ?? null);
  }

  async #recordRelayStage(route, step, modelUiLabel, promptSha256, generationState, observedAt, startSignal, messageApps) {
    const refs = [
      `request:${route.requestId}`,
      `supervisor:${route.supervisorId}`,
      `provider_session:${route.providerSessionId}`,
      `conversation_url:${route.providerSession?.conversationUrl ?? 'PENDING_PROVIDER_ASSIGNMENT'}`,
      `step:${step}`,
      `model_ui_label:${modelUiLabel}`,
      `prompt_sha256:${promptSha256}`,
      `generation_state:${generationState}`,
      `observed_at:${observedAt}`,
      'assistant_content_observed:false',
      'backend_model_identity_claimed:false',
      `app_selection_attempted:${messageApps?.status === 'APP_SELECTION_NOT_ATTEMPTED' ? 'false' : 'true'}`,
      `app_selection_status:${messageApps?.status ?? 'UNKNOWN'}`,
      'semantic_authority:false',
    ];
    if (startSignal) refs.push(`generation_start_signal:${startSignal}`);
    return this.missionControl.recordEvidence(route.workerId, {
      receiptId: `relay-stage:${route.requestId}:${step}:${generationState}:${sha256(observedAt).slice(0, 12)}`,
      summary: RELAY_STAGE_SUMMARY,
      refs,
      occurredAt: observedAt,
    });
  }

  async #recordProviderSession(route, session, urlBindingStatus) {
    const occurredAt = session.completedAt ?? session.failedAt ?? session.urlBoundAt ?? session.openedAt;
    return this.missionControl.recordEvidence(route.workerId, {
      receiptId: `provider-session:${session.providerSessionId}:${session.status}:${sha256(`${urlBindingStatus}:${occurredAt}`).slice(0, 12)}`,
      summary: PROVIDER_SESSION_SUMMARY,
      refs: [
        `request:${route.requestId}`,
        `supervisor:${route.supervisorId}`,
        `provider_session:${session.providerSessionId}`,
        `conversation_url:${session.conversationUrl ?? 'PENDING_PROVIDER_ASSIGNMENT'}`,
        `url_binding_status:${urlBindingStatus}`,
        `opened_at:${session.openedAt}`,
        `lifecycle_status:${session.status}`,
        `model_receipt:${session.modelReceiptId}`,
        `first_turn_mcp_receipt:${session.firstTurnMcpReceiptId ?? 'PENDING'}`,
        `binding_preload_receipt:${session.firstTurnMcpReceiptId ?? 'PENDING'}`,
        'semantic_authority:false',
      ],
      occurredAt,
    });
  }

  async #waitForProviderSessionProjection(route, session, urlBindingStatus) {
    const deadline = Date.now() + PROVIDER_SESSION_PROJECTION_TIMEOUT_MS;
    for (;;) {
      const snapshot = await this.missionControl.fetchFleet();
      const worker = snapshot?.workers?.find((item) => item?.id === route.workerId);
      const visible = worker?.timeline?.some((event) => event?.data?.type === 'evidence_receipt_recorded'
        && event.data.summary === PROVIDER_SESSION_SUMMARY
        && event.data.verified === true
        && event.data.refs?.includes(`request:${route.requestId}`)
        && event.data.refs?.includes(`supervisor:${route.supervisorId}`)
        && event.data.refs?.includes(`provider_session:${session.providerSessionId}`)
        && event.data.refs?.includes(`url_binding_status:${urlBindingStatus}`)
        && event.data.refs?.includes('lifecycle_status:ACTIVE'));
      if (visible) return;
      if (Date.now() >= deadline) {
        throw new Error(`Provider session ${session.providerSessionId} was not visible in Mission Control before first send.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  async #markInterruptedIntents(state) {
    let changed = false;
    for (const [key, delivery] of Object.entries(state.deliveries)) {
      if (delivery?.status === 'SUBMISSION_INTENT_RECORDED') {
        state.deliveries[key] = {
          ...delivery,
          status: 'AMBIGUOUS_AFTER_RESTART',
          ambiguousAt: new Date().toISOString(),
          ambiguityReason: 'The prior process stopped after recording pre-click intent and before durable generation-start observation.',
        };
        changed = true;
      }
    }
    return changed ? this.stateStore.write(state) : state;
  }

  #memoryState(metrics) {
    const policy = resolveMemoryPolicy(metrics.totalMb, this.config.memory);
    return { metrics, policy, ...classifyMemoryPressure(metrics, policy) };
  }

  async #applyTabBudget(targets, state, pressure, activeTargetId) {
    const closures = selectManagedTabClosures({ targets, chats: this.config.runtime.chats, state, activeTargetId, pressure, maxHotTabs: this.config.runtime.maxHotTabs });
    for (const targetId of closures) {
      await this.browser.closeTarget(targetId).catch((error) => this.#log('warn', 'tab_close_failed', { targetId, error: redactError(error) }));
      for (const [chatId, tab] of Object.entries(state.tabs)) if (tab?.targetId === targetId) delete state.tabs[chatId];
    }
    return closures;
  }

  #rememberTarget(state, chat, target, providerSessionId = null, url = null) {
    const key = providerSessionId ?? `bootstrap:${chat.bootstrapCapability.chatId}`;
    for (const [existingKey, tab] of Object.entries(state.tabs)) if (tab?.targetId === target.id && existingKey !== key) delete state.tabs[existingKey];
    state.tabs[key] = {
      chatId: providerSessionId ? null : chat.bootstrapCapability.chatId,
      supervisorId: chat.supervisorId,
      providerSessionId,
      targetId: target.id,
      url: url ?? chat.bootstrapCapability.url,
      pinned: providerSessionId ? false : chat.pinned,
      lastUsedAt: new Date().toISOString(),
    };
  }

  #rememberReusableTarget(state, targetId, url) {
    for (const [key, tab] of Object.entries(state.tabs)) if (tab?.targetId === targetId) delete state.tabs[key];
    state.tabs['reusable:chatgpt'] = {
      chatId: null,
      supervisorId: null,
      providerSessionId: null,
      targetId,
      url: url ?? 'https://chatgpt.com/',
      pinned: false,
      reusable: true,
      lastUsedAt: new Date().toISOString(),
    };
  }

  #selectReusableTargetId(state, targets) {
    const ids = new Set(targets.filter((target) => target?.type === 'page').map((target) => target.id));
    const explicit = state.tabs?.['reusable:chatgpt'];
    if (explicit?.targetId && ids.has(explicit.targetId)) return explicit.targetId;
    const remembered = Object.values(state.tabs ?? {})
      .filter((tab) => tab?.targetId && ids.has(tab.targetId))
      .sort((left, right) => (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? ''));
    return remembered[0]?.targetId ?? null;
  }

  #forgetMissingTargets(state, targets) {
    const ids = new Set(targets.map((target) => target.id));
    for (const [chatId, tab] of Object.entries(state.tabs)) if (!ids.has(tab?.targetId)) delete state.tabs[chatId];
  }

  async #writeStandaloneStatus(status, state, detail = {}) {
    const targets = await this.browser.listTargets().catch(() => null);
    const browserTabs = targets ? managedChatGptTabTelemetry(targets) : { managedChatGptTabCount: null, steadyStateTarget: 1, transitionMax: 2, hardCeiling: 3, hardCeilingExceeded: null };
    const value = { schemaVersion: 1, status, generatedAt: new Date().toISOString(), pid: process.pid, submitEnabled: this.config.runtime.submitEnabled, capabilityTestEnabled: this.config.runtime.capabilityTestEnabled, submissionPacing: this.submissionPacer.status(state), browserTabs, health: state.health, unresolvedAmbiguities: unresolvedAmbiguities(state), ...detail };
    await this.stateStore.writeStatus(value);
    return value;
  }

  async #cooldownStatus(state, detail, error) {
    state = await this.stateStore.read();
    return this.#writeStandaloneStatus('GLOBAL_SUBMISSION_COOLDOWN', state, {
      ...detail,
      submissionPacing: publicCooldown(error),
      retryAfterMs: error.retryAfterMs,
      nextSubmissionAt: error.nextSubmissionAt,
    });
  }

  #log(level, event, detail) {
    const line = { time: new Date().toISOString(), level, event, ...detail };
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    this.logger[method](JSON.stringify(line));
  }
}

function findChallengeExpiry(snapshot, chat) {
  const worker = snapshot?.workers?.find((item) => item?.id === chat.workerId);
  const timeline = Array.isArray(worker?.timeline) ? worker.timeline : [];
  const challenge = [...timeline].reverse().find((event) => event?.data?.type === 'evidence_receipt_recorded'
    && event.data.summary === CAPABILITY_CHALLENGE_SUMMARY
    && event.data.refs?.includes(`challenge:${chat.bootstrapCapability.challengeId}`)
    && event.data.refs?.includes(`chat:${chat.bootstrapCapability.chatId}`));
  const expiry = challenge?.data?.refs?.find((ref) => typeof ref === 'string' && ref.startsWith('expires_at:'))?.slice('expires_at:'.length);
  return expiry && Number.isFinite(Date.parse(expiry)) ? expiry : null;
}

function unresolvedAmbiguities(state) {
  return Object.entries(state.deliveries)
    .filter(([, delivery]) => delivery?.status === 'AMBIGUOUS_AFTER_RESTART')
    .map(([routeKey, delivery]) => ({ routeKey, supervisorId: delivery.supervisorId ?? null, providerSessionId: delivery.providerSessionId ?? null, bodySha256: delivery.bodySha256, lastAttemptAt: delivery.lastAttemptAt ?? null, status: delivery.status }));
}

function summarizeRoutes(routes, state) {
  const counts = {};
  for (const route of routes) {
    const status = state.deliveries[route.routeKey]?.status ?? 'UNSEEN';
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return { discovered: routes.length, byLocalState: counts, next: routes[0] ? publicRoute(routes[0]) : null };
}

function publicRoute(route) {
  return {
    routeKey: route.routeKey,
    requestId: route.requestId,
    workerId: route.workerId,
    workerName: route.workerName,
    destinationSupervisorId: route.supervisorId,
    providerSessionId: route.providerSessionId,
    destinationLabel: route.chat.label,
    queuedAt: route.queuedAt,
    bodySha256: route.bodySha256,
    bodyLength: route.body.length,
    routeKind: route.routeKind,
    reasoningLane: route.packet.reasoningLane ?? null,
  };
}

function shouldProcessSupervisoryCycle(route, prior, nowMs, retryDelayMs) {
  if (prior?.status === 'DECISION_RECEIPT_INGESTED') return false;
  if (prior?.status === 'AMBIGUOUS_AFTER_RESTART' || prior?.status === 'SUBMISSION_INTENT_RECORDED') return false;
  if (prior?.status === 'FAILED_RETRYABLE' && !shouldAttemptRoute(prior, nowMs, retryDelayMs)) return false;
  return Boolean(route.decisionReceipt || nextSupervisoryCycleAction(route, prior));
}

function publicDecisionReceipt(receipt) {
  return {
    receiptId: receipt.receipt_id,
    requestId: receipt.request_id,
    reasoningLane: receipt.reasoning_lane,
    repository: receipt.github_receipt?.repository ?? null,
    issueNumber: receipt.github_receipt?.issue_number ?? null,
    commentId: receipt.github_receipt?.comment_id ?? null,
    immutableUrl: receipt.github_receipt?.immutable_url ?? null,
    proProvenance: receipt.pro_decision_block?.used ? 'SAME_CHAT_WRITER_ATTESTED' : null,
  };
}
