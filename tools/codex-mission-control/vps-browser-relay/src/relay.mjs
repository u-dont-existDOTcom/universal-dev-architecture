import { classifyMemoryPressure, extractQueuedRoutes, redactError, selectManagedTabClosures, shouldAttemptRoute } from './core.mjs';
import { readMemoryMetrics } from './memory.mjs';

export class RelayRuntime {
  constructor({ config, missionControl, browser, stateStore, memoryReader = readMemoryMetrics, logger = console }) {
    this.config = config;
    this.missionControl = missionControl;
    this.browser = browser;
    this.stateStore = stateStore;
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
    const pressure = classifyMemoryPressure(metrics, this.config.memory);
    const routes = extractQueuedRoutes(snapshot, this.config.runtime.chats, state);
    const result = {
      status: 'READY',
      checkedAt: new Date().toISOString(),
      submitEnabled: this.config.runtime.submitEnabled,
      browser,
      memory: { metrics, ...pressure },
      missionControl: {
        workerCount: snapshot.workers.length,
        generatedAt: snapshot.generatedAt ?? null,
      },
      queue: summarizeRoutes(routes, state),
      unresolvedAmbiguities: unresolvedAmbiguities(state),
    };
    await this.stateStore.writeStatus(result);
    return result;
  }

  async cycle() {
    const startedAt = new Date().toISOString();
    let state = await this.stateStore.read();
    state = await this.#markInterruptedIntents(state);
    state.health.lastCycleAt = startedAt;

    try {
      let metrics = await this.memoryReader(this.config.browser.profileDir);
      let pressure = classifyMemoryPressure(metrics, this.config.memory);
      const targets = await this.browser.listTargets();
      this.#forgetMissingTargets(state, targets);
      const closedTargets = await this.#applyTabBudget(targets, state, pressure.pressure, null);
      if (closedTargets.length > 0) {
        metrics = await this.memoryReader(this.config.browser.profileDir);
        pressure = classifyMemoryPressure(metrics, this.config.memory);
      }

      state.health.metrics = metrics;
      state.health.pressure = pressure.pressure;
      state.health.pausedReason = pressure.pressure === 'HARD' ? pressure.reasons.join('; ') : null;
      if (pressure.pressure === 'HARD') {
        state.health.lastError = null;
        state = await this.stateStore.write(state);
        const status = this.#status('PAUSED_MEMORY_HARD', state, {
          memory: { metrics, ...pressure },
          closedTargets,
          queue: null,
        });
        await this.stateStore.writeStatus(status);
        return status;
      }

      const snapshot = await this.missionControl.fetchFleet();
      state.health.lastSuccessfulPollAt = new Date().toISOString();
      const routes = extractQueuedRoutes(snapshot, this.config.runtime.chats, state);

      const ambiguous = routes.find((route) => ['SUBMISSION_INTENT_RECORDED', 'AMBIGUOUS_AFTER_RESTART'].includes(state.deliveries[route.routeKey]?.status));
      if (ambiguous) {
        const reconciliation = await this.#reconcileAmbiguous(ambiguous, state);
        state.health.lastError = null;
        state = await this.stateStore.write(state);
        const status = this.#status(reconciliation.status, state, {
          memory: { metrics, ...pressure },
          queue: summarizeRoutes(routes, state),
          route: publicRoute(ambiguous),
          reconciliation,
        });
        await this.stateStore.writeStatus(status);
        return status;
      }

      const nowMs = Date.now();
      const candidate = routes.find((route) => shouldAttemptRoute(state.deliveries[route.routeKey], nowMs, this.config.runtime.retryDelayMs));
      if (!candidate) {
        state.health.lastError = null;
        state.health.pausedReason = null;
        state = await this.stateStore.write(state);
        const status = this.#status('IDLE', state, {
          memory: { metrics, ...pressure },
          queue: summarizeRoutes(routes, state),
          closedTargets,
        });
        await this.stateStore.writeStatus(status);
        return status;
      }

      if (!this.config.runtime.submitEnabled) {
        state.health.lastError = null;
        state.health.pausedReason = 'MC_RELAY_SUBMIT_ENABLED is not 1; no browser write was attempted.';
        state = await this.stateStore.write(state);
        const status = this.#status('DRY_RUN_ROUTE_READY', state, {
          memory: { metrics, ...pressure },
          queue: summarizeRoutes(routes, state),
          route: publicRoute(candidate),
        });
        await this.stateStore.writeStatus(status);
        return status;
      }

      const target = await this.browser.findOrCreateChatTarget(candidate.chat.url);
      this.#rememberTarget(state, candidate.chat, target);
      metrics = await this.memoryReader(this.config.browser.profileDir);
      pressure = classifyMemoryPressure(metrics, this.config.memory);
      const postOpenClosedTargets = await this.#applyTabBudget(await this.browser.listTargets(), state, pressure.pressure, target.id);
      if (pressure.pressure === 'HARD') {
        if (target.created) await this.browser.closeTarget(target.id).catch(() => {});
        state.health.metrics = metrics;
        state.health.pressure = pressure.pressure;
        state.health.pausedReason = `Opening ${candidate.chat.label} crossed the hard memory boundary: ${pressure.reasons.join('; ')}`;
        state = await this.stateStore.write(state);
        const status = this.#status('PAUSED_MEMORY_AFTER_TAB_OPEN', state, {
          memory: { metrics, ...pressure },
          queue: summarizeRoutes(routes, state),
          route: publicRoute(candidate),
          closedTargets: postOpenClosedTargets,
        });
        await this.stateStore.writeStatus(status);
        return status;
      }

      const intentAt = new Date().toISOString();
      state.deliveries[candidate.routeKey] = {
        status: 'SUBMISSION_INTENT_RECORDED',
        requestId: candidate.requestId,
        messageId: candidate.messageId,
        eventId: candidate.eventId,
        workerId: candidate.workerId,
        chatId: candidate.chat.chatId,
        conversationUrl: candidate.chat.url,
        bodySha256: candidate.bodySha256,
        bodyLength: candidate.body.length,
        targetId: target.id,
        attempt: (state.deliveries[candidate.routeKey]?.attempt ?? 0) + 1,
        intentRecordedAt: intentAt,
        lastAttemptAt: intentAt,
        lastError: null,
      };
      state = await this.stateStore.write(state);

      try {
        const receipt = await this.browser.submitExactMessage(target, {
          expectedUrl: candidate.chat.url,
          body: candidate.body,
          bodySha256: candidate.bodySha256,
        });
        state.deliveries[candidate.routeKey] = {
          ...state.deliveries[candidate.routeKey],
          status: 'SUBMITTED_CONFIRMED',
          confirmedAt: new Date().toISOString(),
          confirmation: receipt,
          lastError: null,
        };
        this.#rememberTarget(state, candidate.chat, target);
        state.health.lastError = null;
        state.health.pausedReason = null;
        state.health.metrics = await this.memoryReader(this.config.browser.profileDir);
        state.health.pressure = classifyMemoryPressure(state.health.metrics, this.config.memory).pressure;
        state = await this.stateStore.write(state);
        const status = this.#status('SUBMITTED_CONFIRMED', state, {
          memory: { metrics: state.health.metrics, ...classifyMemoryPressure(state.health.metrics, this.config.memory) },
          queue: summarizeRoutes(routes, state),
          route: publicRoute(candidate),
          receipt,
        });
        await this.stateStore.writeStatus(status);
        this.#log('info', 'route_submitted', { routeKey: candidate.routeKey, chatId: candidate.chat.chatId, bodySha256: candidate.bodySha256 });
        return status;
      } catch (error) {
        const stage = error?.relayStage ?? 'UNKNOWN';
        const afterClick = stage === 'CLICKED' || stage === 'CONFIRMED';
        state.deliveries[candidate.routeKey] = {
          ...state.deliveries[candidate.routeKey],
          status: afterClick ? 'AMBIGUOUS_AFTER_RESTART' : 'FAILED_RETRYABLE',
          failedAt: new Date().toISOString(),
          failureStage: stage,
          lastError: redactError(error),
        };
        state.health.lastError = redactError(error);
        state.health.pausedReason = afterClick
          ? 'A click may have occurred without confirmation. Automatic replay is blocked until reconciliation.'
          : null;
        state = await this.stateStore.write(state);
        const status = this.#status(afterClick ? 'SUBMISSION_AMBIGUOUS' : 'SUBMISSION_FAILED_RETRYABLE', state, {
          memory: { metrics, ...pressure },
          queue: summarizeRoutes(routes, state),
          route: publicRoute(candidate),
          error: redactError(error),
          failureStage: stage,
        });
        await this.stateStore.writeStatus(status);
        this.#log('error', 'route_submission_failed', { routeKey: candidate.routeKey, chatId: candidate.chat.chatId, failureStage: stage, error: redactError(error) });
        return status;
      }
    } catch (error) {
      state.health.lastError = redactError(error);
      state.health.pausedReason = null;
      state = await this.stateStore.write(state);
      const status = this.#status('ERROR', state, { error: redactError(error) });
      await this.stateStore.writeStatus(status);
      this.#log('error', 'relay_cycle_failed', { error: redactError(error) });
      return status;
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
    if (outcome === 'retry') {
      state.deliveries[routeKey] = { ...current, status: 'RETRY_AUTHORIZED', resolvedAt, resolution: 'OPERATOR_AUTHORIZED_RETRY', lastError: null };
    } else if (outcome === 'submitted') {
      state.deliveries[routeKey] = { ...current, status: 'SUBMITTED_CONFIRMED', confirmedAt: resolvedAt, resolution: 'OPERATOR_ATTESTED_SUBMITTED', lastError: null };
    } else if (outcome === 'discard') {
      state.deliveries[routeKey] = { ...current, status: 'DISCARDED', resolvedAt, resolution: 'OPERATOR_DISCARDED', lastError: null };
    } else {
      throw new Error('Resolution outcome must be retry, submitted, or discard.');
    }
    state = await this.stateStore.write(state);
    const status = this.#status('AMBIGUITY_RESOLVED', state, { routeKey, outcome });
    await this.stateStore.writeStatus(status);
    return status;
  }

  async #markInterruptedIntents(state) {
    let changed = false;
    for (const [key, delivery] of Object.entries(state.deliveries)) {
      if (delivery?.status === 'SUBMISSION_INTENT_RECORDED') {
        state.deliveries[key] = {
          ...delivery,
          status: 'AMBIGUOUS_AFTER_RESTART',
          ambiguousAt: new Date().toISOString(),
          ambiguityReason: 'The prior process stopped after recording submission intent and before a durable confirmation.',
        };
        changed = true;
      }
    }
    return changed ? this.stateStore.write(state) : state;
  }

  async #reconcileAmbiguous(route, state) {
    const target = await this.browser.findOrCreateChatTarget(route.chat.url);
    this.#rememberTarget(state, route.chat, target);
    const present = await this.browser.outboundMessagePresent(target, {
      expectedUrl: route.chat.url,
      body: route.body,
    });
    if (present) {
      state.deliveries[route.routeKey] = {
        ...state.deliveries[route.routeKey],
        status: 'SUBMITTED_CONFIRMED',
        confirmedAt: new Date().toISOString(),
        resolution: 'AUTOMATIC_EXACT_USER_MESSAGE_RECONCILIATION',
        lastError: null,
      };
      return { status: 'AMBIGUITY_RECONCILED_AS_SUBMITTED', routeKey: route.routeKey };
    }
    state.deliveries[route.routeKey] = {
      ...state.deliveries[route.routeKey],
      status: 'AMBIGUOUS_AFTER_RESTART',
      lastReconciliationAt: new Date().toISOString(),
      resolution: 'EXACT_OUTBOUND_MESSAGE_NOT_OBSERVED_AUTOMATIC_REPLAY_BLOCKED',
    };
    state.health.pausedReason = `Route ${route.routeKey} remains ambiguous; automatic replay is blocked.`;
    return { status: 'AMBIGUITY_REQUIRES_OPERATOR', routeKey: route.routeKey };
  }

  async #applyTabBudget(targets, state, pressure, activeTargetId) {
    const closures = selectManagedTabClosures({
      targets,
      chats: this.config.runtime.chats,
      state,
      activeTargetId,
      pressure,
      maxHotTabs: this.config.runtime.maxHotTabs,
    });
    for (const targetId of closures) {
      await this.browser.closeTarget(targetId).catch((error) => {
        this.#log('warn', 'tab_close_failed', { targetId, error: redactError(error) });
      });
      for (const [chatId, tab] of Object.entries(state.tabs)) {
        if (tab?.targetId === targetId) delete state.tabs[chatId];
      }
    }
    return closures;
  }

  #rememberTarget(state, chat, target) {
    state.tabs[chat.chatId] = {
      chatId: chat.chatId,
      targetId: target.id,
      url: chat.url,
      pinned: chat.pinned,
      lastUsedAt: new Date().toISOString(),
    };
  }

  #forgetMissingTargets(state, targets) {
    const ids = new Set(targets.map((target) => target.id));
    for (const [chatId, tab] of Object.entries(state.tabs)) {
      if (!ids.has(tab?.targetId)) delete state.tabs[chatId];
    }
  }

  #status(status, state, detail = {}) {
    return {
      schemaVersion: 1,
      status,
      generatedAt: new Date().toISOString(),
      pid: process.pid,
      submitEnabled: this.config.runtime.submitEnabled,
      health: state.health,
      unresolvedAmbiguities: unresolvedAmbiguities(state),
      ...detail,
    };
  }

  #log(level, event, detail) {
    const line = { time: new Date().toISOString(), level, event, ...detail };
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    this.logger[method](JSON.stringify(line));
  }
}

function unresolvedAmbiguities(state) {
  return Object.entries(state.deliveries)
    .filter(([, delivery]) => ['SUBMISSION_INTENT_RECORDED', 'AMBIGUOUS_AFTER_RESTART'].includes(delivery?.status))
    .map(([routeKey, delivery]) => ({
      routeKey,
      chatId: delivery.chatId,
      bodySha256: delivery.bodySha256,
      lastAttemptAt: delivery.lastAttemptAt ?? null,
      status: delivery.status,
    }));
}

function summarizeRoutes(routes, state) {
  const counts = {};
  for (const route of routes) {
    const status = state.deliveries[route.routeKey]?.status ?? 'UNSEEN';
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return {
    discovered: routes.length,
    byLocalState: counts,
    next: routes[0] ? publicRoute(routes[0]) : null,
  };
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
  };
}
