import {
  CAPABILITY_CHALLENGE_SUMMARY,
  MODE_CAPABILITY_VERIFIED_SUMMARY,
  RELAY_STAGE_SUMMARY,
  capabilityControlPrompt,
  chatCapabilityState,
  classifyMemoryPressure,
  completedCycleStepStatus,
  cycleControlPrompt,
  extractQueuedRoutes,
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
    const chat = this.config.runtime.chats.find((entry) => entry.chatId === chatId);
    if (!chat) throw new Error(`Unknown registered chat: ${chatId}`);
    let snapshot = await this.missionControl.fetchFleet();
    let capability = chatCapabilityState(snapshot, chat);
    if (!capability.challengeAvailable) {
      return this.#writeStandaloneStatus('CAPABILITY_CHALLENGE_MISSING', state, { chatId, capability });
    }

    const metrics = await this.memoryReader(this.config.browser.profileDir);
    const memory = this.#memoryState(metrics);
    if (memory.pressure === 'HARD') return this.#writeStandaloneStatus('PAUSED_MEMORY_HARD', state, { chatId, memory, capability });

    const target = await this.browser.findOrCreateChatTarget(chat.url);
    this.#rememberTarget(state, chat, target);
    const mode = await this.browser.verifyModelRoundTrip(target, {
      expectedUrl: chat.url,
      extraHighLabel: chat.modelLabels.extraHigh,
      proLabel: chat.modelLabels.pro,
    });
    const challengeExpiry = findChallengeExpiry(snapshot, chat);
    if (!challengeExpiry) throw new Error(`Capability challenge ${chat.capabilityChallengeId} has no usable expiry.`);
    await this.missionControl.recordEvidence(chat.workerId, {
      receiptId: `chat-mode-capability:${chat.chatId}:${Date.now()}`,
      summary: MODE_CAPABILITY_VERIFIED_SUMMARY,
      refs: [
        `challenge:${chat.capabilityChallengeId}`,
        `chat:${chat.chatId}`,
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

    const key = `capability:${chat.chatId}:${chat.capabilityChallengeId}`;
    const prior = state.deliveries[key] ?? null;
    if (prior?.status === 'AMBIGUOUS_AFTER_RESTART') {
      return this.#writeStandaloneStatus('CAPABILITY_SUBMISSION_AMBIGUOUS', state, { chatId, capability, memory });
    }
    if (prior?.status === 'CAPABILITY_GENERATION_STARTED') {
      let complete;
      try {
        complete = await this.browser.waitForGenerationComplete(target, { expectedUrl: chat.url, generationStarted: true });
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
    const observed = await this.browser.switchModel(target, { expectedUrl: chat.url, label: chat.modelLabels.extraHigh });
    try {
      const start = await this.submissionPacer.submit({
        beforeSubmit: async () => {
          const intentAt = new Date().toISOString();
          state = await this.stateStore.read();
          state.deliveries[key] = {
            status: 'SUBMISSION_INTENT_RECORDED',
            chatId: chat.chatId,
            conversationUrl: chat.url,
            capabilityChallengeId: chat.capabilityChallengeId,
            bodySha256: sha256(prompt),
            modelUiLabel: observed.observedLabel,
            intentRecordedAt: intentAt,
            lastAttemptAt: intentAt,
          };
          state = await this.stateStore.write(state);
        },
        submit: () => this.browser.submitExactMessage(target, { expectedUrl: chat.url, body: prompt, bodySha256: sha256(prompt) }),
      });
      state = await this.stateStore.read();
      state.deliveries[key] = { ...state.deliveries[key], status: 'CAPABILITY_GENERATION_STARTED', generationStart: start, startedAt: start.startedAtObserved };
      state = await this.stateStore.write(state);
      let complete;
      try {
        complete = await this.browser.waitForGenerationComplete(target, { expectedUrl: chat.url, generationStarted: start.generationStarted });
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
        state.health.pausedReason = `Registered chat ${candidate.chat.chatId} lacks current live capability receipts.`;
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
    const prior = state.deliveries[route.routeKey] ?? null;
    const action = nextSupervisoryCycleAction(route, prior);
    if (!action) return this.#writeStandaloneStatus('IDLE', state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route) });
    if (action.type === 'WAIT_GITHUB_RECEIPT') {
      state.health.pausedReason = `Waiting for canonical GitHub decision receipt for ${route.requestId}.`;
      state = await this.stateStore.write(state);
      return this.#writeStandaloneStatus('AWAITING_GITHUB_RECEIPT', state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route) });
    }

    const target = await this.browser.findOrCreateChatTarget(route.chat.url);
    this.#rememberTarget(state, route.chat, target);
    const postOpenMetrics = await this.memoryReader(this.config.browser.profileDir);
    memory = this.#memoryState(postOpenMetrics);
    const closedTargets = await this.#applyTabBudget(await this.browser.listTargets(), state, memory.pressure, target.id);
    if (memory.pressure === 'HARD') {
      if (target.created) await this.browser.closeTarget(target.id).catch(() => {});
      state.health.pausedReason = `Opening ${route.chat.label} crossed the hard memory boundary: ${memory.reasons.join('; ')}`;
      state = await this.stateStore.write(state);
      return this.#writeStandaloneStatus('PAUSED_MEMORY_AFTER_TAB_OPEN', state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route), closedTargets });
    }

    if (action.type === 'WAIT_GENERATION') {
      await this.#ensureStartEvidence(route, action.step, prior);
      const observation = await this.browser.waitForGenerationComplete(target, { expectedUrl: route.chat.url, generationStarted: prior?.generationStarted === true });
      await this.#recordRelayStage(route, action.step, prior.modelUiLabel, prior.promptSha256, 'COMPLETE', observation.completedAtObserved, null);
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
    const model = await this.browser.switchModel(target, { expectedUrl: route.chat.url, label: desiredLabel });
    if (model.observedLabel !== desiredLabel) throw new Error(`Exact model UI label mismatch: expected ${desiredLabel}, observed ${model.observedLabel ?? 'UNKNOWN'}.`);
    const promptSha256 = sha256(prompt);
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
            chatId: route.chat.chatId,
            conversationUrl: route.chat.url,
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
        submit: () => this.browser.submitExactMessage(target, { expectedUrl: route.chat.url, body: prompt, bodySha256: promptSha256 }),
      });
      state = await this.stateStore.read();
      state.deliveries[route.routeKey] = {
        ...state.deliveries[route.routeKey],
        status: startedCycleStepStatus(action.step),
        generationStarted: true,
        generationStartedAt: start.startedAtObserved,
        generationStart: start,
      };
      state = await this.stateStore.write(state);
      await this.#recordRelayStage(route, action.step, model.observedLabel, promptSha256, 'STARTED', start.startedAtObserved, start.startSignal);
      return this.#writeStandaloneStatus(startedCycleStepStatus(action.step), state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route), generationStart: start });
    } catch (error) {
      if (isGlobalSubmissionCooldown(error)) return this.#cooldownStatus(state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route) }, error);
      const stage = error?.relayStage ?? 'UNKNOWN';
      const afterClick = stage === 'CLICKED';
      state = await this.stateStore.read();
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
    await this.#recordRelayStage(route, step, prior.modelUiLabel, prior.promptSha256, 'STARTED', prior.generationStartedAt, prior.generationStart?.startSignal ?? null);
  }

  async #recordRelayStage(route, step, modelUiLabel, promptSha256, generationState, observedAt, startSignal) {
    const refs = [
      `request:${route.requestId}`,
      `chat:${route.chat.chatId}`,
      `step:${step}`,
      `model_ui_label:${modelUiLabel}`,
      `prompt_sha256:${promptSha256}`,
      `generation_state:${generationState}`,
      `observed_at:${observedAt}`,
      'assistant_content_observed:false',
      'backend_model_identity_claimed:false',
    ];
    if (startSignal) refs.push(`generation_start_signal:${startSignal}`);
    return this.missionControl.recordEvidence(route.workerId, {
      receiptId: `relay-stage:${route.requestId}:${step}:${generationState}:${sha256(observedAt).slice(0, 12)}`,
      summary: RELAY_STAGE_SUMMARY,
      refs,
      occurredAt: observedAt,
    });
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

  #rememberTarget(state, chat, target) {
    state.tabs[chat.chatId] = { chatId: chat.chatId, targetId: target.id, url: chat.url, pinned: chat.pinned, lastUsedAt: new Date().toISOString() };
  }

  #forgetMissingTargets(state, targets) {
    const ids = new Set(targets.map((target) => target.id));
    for (const [chatId, tab] of Object.entries(state.tabs)) if (!ids.has(tab?.targetId)) delete state.tabs[chatId];
  }

  async #writeStandaloneStatus(status, state, detail = {}) {
    const value = { schemaVersion: 1, status, generatedAt: new Date().toISOString(), pid: process.pid, submitEnabled: this.config.runtime.submitEnabled, capabilityTestEnabled: this.config.runtime.capabilityTestEnabled, submissionPacing: this.submissionPacer.status(state), health: state.health, unresolvedAmbiguities: unresolvedAmbiguities(state), ...detail };
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
    && event.data.refs?.includes(`challenge:${chat.capabilityChallengeId}`)
    && event.data.refs?.includes(`chat:${chat.chatId}`));
  const expiry = challenge?.data?.refs?.find((ref) => typeof ref === 'string' && ref.startsWith('expires_at:'))?.slice('expires_at:'.length);
  return expiry && Number.isFinite(Date.parse(expiry)) ? expiry : null;
}

function unresolvedAmbiguities(state) {
  return Object.entries(state.deliveries)
    .filter(([, delivery]) => delivery?.status === 'AMBIGUOUS_AFTER_RESTART')
    .map(([routeKey, delivery]) => ({ routeKey, chatId: delivery.chatId, bodySha256: delivery.bodySha256, lastAttemptAt: delivery.lastAttemptAt ?? null, status: delivery.status }));
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
    destinationChatId: route.chat.chatId,
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
