import {
  BINDING_CAPSULE_SUMMARY,
  BINDING_ENVELOPE_SUMMARY,
  CAPABILITY_CHALLENGE_SUMMARY,
  MANAGED_CHATGPT_HARD_CEILING_TABS,
  MCP_BINDING_PRELOAD_STEP,
  IN_BAND_PRE_SEND_SUMMARY,
  IN_BAND_COPY_CONFIRMED_STATUS,
  IN_BAND_COPY_PENDING_STATUS,
  IN_BAND_RECOVERY_BLOCKED_STATUS,
  IN_BAND_STRUCTURAL_RECOVERY_VERSION,
  IN_BAND_REQUEST_PROTOCOL,
  LEGACY_FIXED_CONSUMER_CONTROLS,
  IN_BAND_REQUEST_STEP,
  REQUEST_BOUND_STEP,
  MODE_CAPABILITY_VERIFIED_SUMMARY,
  PROVIDER_SESSION_MODEL_SUMMARY,
  PROVIDER_SESSION_MCP_SUMMARY,
  PROVIDER_SESSION_SUMMARY,
  RELAY_STAGE_SUMMARY,
  capabilityControlPrompt,
  appSelectionForMessage,
  canonicalJson,
  chatCapabilityState,
  classifyMemoryPressure,
  completedCycleStepStatus,
  consumerControlRefs,
  cycleControlPrompt,
  deriveBindingCapsule,
  deriveInBandRequestBinding,
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
import { validateRecoveredDecisionObservation } from './provider-decision-recovery.mjs';
import { readMemoryMetrics } from './memory.mjs';
import { isTerminalControllerCycle } from './controller-mediated-pm.mjs';
import { isCentralSubmissionQueued, isGlobalSubmissionCooldown, publicCooldown } from './submission-pacing.mjs';
import { submissionSchedulerContext } from './submission-context.mjs';

const MCP_BINDING_PRELOAD_RECEIPT_GRACE_MS = 30_000;
const PROVIDER_SESSION_PROJECTION_TIMEOUT_MS = 30_000;

export class RelayRuntime {
  constructor({ config, missionControl, browser, stateStore, submissionPacer = null, codexExecutionDispatcher = null, memoryReader = readMemoryMetrics, logger = console }) {
    this.config = config;
    this.missionControl = missionControl;
    this.browser = browser;
    this.stateStore = stateStore;
    if (!submissionPacer || typeof submissionPacer.remoteStatus !== 'function') {
      throw new Error('RelayRuntime requires the explicit central submission scheduler; host-local pacing is not live-send eligible.');
    }
    this.submissionPacer = submissionPacer;
    this.codexExecutionDispatcher = codexExecutionDispatcher;
    this.memoryReader = memoryReader;
    this.logger = logger;
  }

  async doctor({ readOnly = false } = {}) {
    let state = await this.stateStore.read();
    if (!readOnly) state = await this.#markInterruptedIntents(state);
    const [metrics, browser, snapshot, centralScheduler] = await Promise.all([
      this.memoryReader(this.config.browser.profileDir),
      this.browser.doctor({ readOnly }),
      this.missionControl.fetchFleet(),
      this.submissionPacer.remoteStatus(),
    ]);
    const memory = this.#memoryState(metrics);
    const routes = extractQueuedRoutes(snapshot, this.config.runtime.chats, state);
    const chatCapabilities = this.config.runtime.chats.map((chat) => chatCapabilityState(snapshot, chat));
    const activeLease = centralScheduler.activeLease;
    const relayBinding = centralScheduler.authenticatedRelayBinding;
    const automationWindowBound = Number.isInteger(browser.automationWindowId)
      && browser.automationWindowId === relayBinding?.automationWindowId
      && browser.automationOwnedTabCount === relayBinding?.ownedTargetCount
      && browser.automationOwnedTargetIdsSha256 === relayBinding?.ownedTargetIdsSha256;
    const localLeaseActive = activeLease?.epoch === this.config.runtime.submissionHost.deploymentEpoch
      && activeLease?.activeHostAlias === this.config.runtime.submissionHost.alias
      && activeLease?.activeHostRole === this.config.runtime.submissionHost.role;
    const standbyReady = this.config.runtime.submissionHost.role === 'SECONDARY'
      && activeLease?.activeHostRole === 'PRIMARY'
      && centralScheduler.schedulerState === 'ACTIVE_LEASE'
      && centralScheduler.ledger?.valid === true
      && centralScheduler.safetyHalt == null
      && automationWindowBound;
    const status = !automationWindowBound
      ? 'AUTOMATION_WINDOW_BINDING_MISMATCH'
      : localLeaseActive
      ? (centralScheduler.ready === true ? 'READY' : 'CENTRAL_AUTHORITY_NOT_READY')
      : (standbyReady ? 'STANDBY_READY' : 'DEPLOYMENT_LEASE_MISMATCH');
    const result = {
      status,
      checkedAt: new Date().toISOString(),
      submitEnabled: this.config.runtime.submitEnabled,
      capabilityTestEnabled: this.config.runtime.capabilityTestEnabled,
      submissionPacing: this.submissionPacer.status(state),
      centralScheduler,
      browser,
      memory,
      missionControl: { workerCount: snapshot.workers.length, generatedAt: snapshot.generatedAt ?? null },
      queue: summarizeRoutes(routes, state),
      chatCapabilities,
      unresolvedAmbiguities: unresolvedAmbiguities(state),
    };
    if (!readOnly) await this.stateStore.writeStatus(result);
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
    const mode = await this.browser.ensureExactConsumerControls(target, {
      expectedUrl: chat.bootstrapCapability.url,
      controls: chat.consumerControls,
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
        ...consumerControlRefs(chat.consumerControls),
        `model_ui_label:${mode.modelVisibleLabel}`,
        `model_option_count:${mode.modelOptionCount}`,
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
    let observed;
    try {
      const start = await this.submissionPacer.submit({
        context: submissionSchedulerContext({
          chat, target, expectedUrl: chat.bootstrapCapability.url, requestId: key, queueKey: key,
          sendPath: 'CAPABILITY', bodySha256: sha256(prompt),
        }),
        beforeSubmit: async () => {
          observed = await this.browser.ensureExactConsumerControls(target, { expectedUrl: chat.bootstrapCapability.url, controls: chat.consumerControls });
          const intentAt = new Date().toISOString();
          state = await this.stateStore.read();
          state.deliveries[key] = {
            status: 'SUBMISSION_INTENT_RECORDED',
            chatId: chat.bootstrapCapability.chatId,
            conversationUrl: chat.bootstrapCapability.url,
            capabilityChallengeId: chat.bootstrapCapability.challengeId,
            bodySha256: sha256(prompt),
            modelUiLabel: observed.modelVisibleLabel,
            intentRecordedAt: intentAt,
            lastAttemptAt: intentAt,
          };
          state = await this.stateStore.write(state);
        },
        submit: async (onSubmissionBoundary, _admission, onBeforeSubmissionBoundary) => {
          const messageApps = await this.browser.selectAppsForMessage(target, appSelectionForMessage(chat, 'CAPABILITY'));
          const start = await this.browser.submitExactMessage(target, { expectedUrl: chat.bootstrapCapability.url, body: prompt, bodySha256: sha256(prompt), composerMentions: messageApps.composerMentions ?? [], onBeforeSubmissionBoundary, onSubmissionBoundary });
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
    let observed;
    try {
      const start = await this.submissionPacer.submit({
        context: submissionSchedulerContext({
          chat, target, expectedUrl: chat.bootstrapCapability.url, requestId: key, queueKey: key,
          sendPath: 'MCP_PREFLIGHT', bodySha256: sha256(prompt),
        }),
        beforeSubmit: async () => {
          observed = await this.browser.ensureExactConsumerControls(target, { expectedUrl: chat.bootstrapCapability.url, controls: chat.consumerControls });
          const intentAt = new Date().toISOString();
          state = await this.stateStore.read();
          state.deliveries[key] = {
            status: 'SUBMISSION_INTENT_RECORDED',
            chatId: chat.bootstrapCapability.chatId,
            conversationUrl: chat.bootstrapCapability.url,
            capabilityChallengeId: chat.bootstrapCapability.challengeId,
            bodySha256: sha256(prompt),
            modelUiLabel: observed.modelVisibleLabel,
            intentRecordedAt: intentAt,
            lastAttemptAt: intentAt,
          };
          state = await this.stateStore.write(state);
        },
        submit: async (onSubmissionBoundary, _admission, onBeforeSubmissionBoundary) => {
          const messageApps = await this.browser.selectAppsForMessage(target, appSelectionForMessage(chat, 'MCP_PREFLIGHT'));
          const start = await this.browser.submitExactMessage(target, { expectedUrl: chat.bootstrapCapability.url, body: prompt, bodySha256: sha256(prompt), composerMentions: messageApps.composerMentions ?? [], onBeforeSubmissionBoundary, onSubmissionBoundary });
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

  async cycle({ skipCodexExecution = false, exactLegacyBinding: requestedLegacyBinding = null, exactRequest = null } = {}) {
    const startedAt = new Date().toISOString();
    let state = await this.stateStore.read();
    state = await this.#markInterruptedIntents(state);
    state.health.lastCycleAt = startedAt;

    const activeControllerCycle = Object.values(state.controllerCycles ?? {})
      .find((cycle) => !isTerminalControllerCycle(cycle));
    if (activeControllerCycle) {
      state.health.lastError = null;
      state.health.pausedReason = `Controller-mediated PM cycle ${activeControllerCycle.cycleId} must advance through the controller command.`;
      state = await this.stateStore.write(state);
      return this.#writeStandaloneStatus('CONTROLLER_CYCLE_REQUIRES_CONTROLLER_COMMAND', state, {
        controllerCycle: {
          cycleId: activeControllerCycle.cycleId,
          taskId: activeControllerCycle.taskId,
          requestId: activeControllerCycle.requestId,
          step: activeControllerCycle.step,
          controllerBindingSha256: activeControllerCycle.controllerBindingSha256,
        },
      });
    }

    try {
      const snapshot = await this.missionControl.fetchFleet();
      state.health.lastSuccessfulPollAt = new Date().toISOString();
      let exactLegacyBinding = requestedLegacyBinding;
      if (!skipCodexExecution && typeof this.codexExecutionDispatcher === 'function') {
        const dispatch = await this.codexExecutionDispatcher({
          snapshot,
          legacyBrowserHandler: async (_directive, route) => ({
            status: 'MISSION_CONTROL_EXACT_LEGACY_ROUTE_REQUIRED',
            route: route.route,
            reason: route.reason,
            missionControlLegacyBinding: route.missionControlBinding,
          }),
        });
        if (dispatch?.status !== 'MISSION_CONTROL_CODEX_DISPATCH_IDLE') {
          if (dispatch?.status === 'MISSION_CONTROL_EXACT_LEGACY_ROUTE_REQUIRED') {
            exactLegacyBinding = dispatch.missionControlLegacyBinding;
          } else {
            state.health.lastError = dispatch?.status === 'COMPLETED' ? null : dispatch?.runnerError ?? null;
            state.health.pausedReason = null;
            state = await this.stateStore.write(state);
            return this.#writeStandaloneStatus('CODEX_EXECUTION_DISPATCHED', state, { codexExecution: dispatch }, { inspectBrowser: false });
          }
        }
      }

      const allRoutes = extractQueuedRoutes(snapshot, this.config.runtime.chats, state);
      const replacements = allRoutes.filter((route) => typeof route.packet?.supersedesRequestId === 'string');
      if (replacements.length > 0) {
        const central = await this.submissionPacer.remoteStatus();
        const head = central.queueHead;
        const replacement = replacements.find((route) => route.packet.supersedesRequestId === head?.requestId);
        if (replacement && head?.status === 'PRECLICK_RETRY_PENDING' && typeof head.queueItemId === 'string') {
          await this.submissionPacer.cancelSupersededPreclickRetry({
            queueItemId: head.queueItemId,
            requestId: head.requestId,
            replacementRequestId: replacement.requestId,
            failureReceiptSha256: replacement.packet.supersession.failureReceiptSha256,
          });
        }
      }
      const expiredDiscardedRoutes = allRoutes.filter((route) => {
        const prior = state.deliveries[route.routeKey];
        return prior?.status === 'DISCARDED'
          && Number.isFinite(Date.parse(route.packet.expiresAt))
          && Date.parse(route.packet.expiresAt) <= Date.now();
      });
      if (expiredDiscardedRoutes.length > 0) {
        const central = await this.submissionPacer.remoteStatus();
        const head = central.queueHead;
        const matching = expiredDiscardedRoutes.find((route) => route.requestId === head?.requestId);
        if (matching && head?.status === 'PRECLICK_RETRY_PENDING' && typeof head.queueItemId === 'string') {
          await this.submissionPacer.cancelExpiredPreclickRetry({
            queueItemId: head.queueItemId, requestId: matching.requestId, sourceRouteExpiresAt: matching.packet.expiresAt,
          });
        }
      }
      const legacyScopedRoutes = exactLegacyBinding
        ? allRoutes.filter((route) => route.workerId === exactLegacyBinding.worker
          && route.taskId === exactLegacyBinding.taskId
          && route.requestId === exactLegacyBinding.decisionRequestId)
          .map((route) => ({ ...route, missionControlLegacyBinding: exactLegacyBinding }))
        : allRoutes;
      if (exactLegacyBinding && legacyScopedRoutes.length !== 1) {
        state.health.lastError = null;
        state.health.pausedReason = legacyScopedRoutes.length === 0
          ? `No exact legacy route is queued for ${exactLegacyBinding.taskId}.`
          : `More than one exact legacy route is queued for ${exactLegacyBinding.taskId}.`;
        state = await this.stateStore.write(state);
        return this.#writeStandaloneStatus(
          legacyScopedRoutes.length === 0 ? 'EXACT_LEGACY_ROUTE_UNAVAILABLE' : 'EXACT_LEGACY_ROUTE_AMBIGUOUS',
          state,
          { missionControlLegacyBinding: exactLegacyBinding, unrelatedRouteCount: allRoutes.length - legacyScopedRoutes.length },
        );
      }
      const scopedRoutes = exactRequest
        ? legacyScopedRoutes.filter((route) => route.workerId === exactRequest.workerId
          && route.requestId === exactRequest.requestId)
        : legacyScopedRoutes;
      const receiptReconciliationRoutes = scopedRoutes.filter((route) => route.routeKind === 'SUPERVISORY_CYCLE'
        && route.decisionReceipt
        && state.deliveries[route.routeKey]?.status !== 'DECISION_RECEIPT_INGESTED');
      if (receiptReconciliationRoutes.length > 0) {
        const reconciled = [];
        for (const route of receiptReconciliationRoutes.sort((left, right) => left.routeKey.localeCompare(right.routeKey))) {
          const providerSessionId = route.decisionReceipt.provider_session_id
            ?? route.decisionReceipt.decision_provider_session_id
            ?? route.decisionReceipt.stage_provider_session_id;
          const session = providerSessionId ? state.providerSessions[providerSessionId] : null;
          if (!session && ((route.packet.routeSchemaVersion === 5 && route.decisionReceipt.execution_provenance === 'REQUEST_BOUND_MCP_GITHUB_OBSERVED')
            || (route.packet.routeSchemaVersion === 6 && route.decisionReceipt.execution_provenance === 'IN_BAND_REQUEST_BINDING_GITHUB_OBSERVED'))) {
            state.deliveries[route.routeKey] = { status: 'DECISION_RECEIPT_INGESTED', requestId: route.requestId, workerId: route.workerId, supervisorId: route.supervisorId, providerSessionId, receiptId: route.decisionReceipt.receipt_id, recoveredFrom: 'DURABLE_GITHUB_ADMISSION', receivedAt: new Date().toISOString() };
          } else {
            if (!session || session.requestId !== route.requestId || session.supervisorId !== route.supervisorId) {
              throw new Error(`Canonical receipt for ${route.requestId} is not bound to its active provider session.`);
            }
            session.status = 'COMPLETE';
            session.completedAt = new Date().toISOString();
            state.providerSessions[providerSessionId] = session;
            await this.#recordProviderSession({ ...route, providerSessionId, providerSession: session }, session, 'EXACT');
            if (session.targetId) this.#rememberReusableTarget(state, session.targetId, session.conversationUrl);
            state.deliveries[route.routeKey] = {
              ...(state.deliveries[route.routeKey] ?? {}),
              status: 'DECISION_RECEIPT_INGESTED',
              receiptId: route.decisionReceipt.receipt_id,
              receivedAt: new Date().toISOString(),
            };
          }
          reconciled.push({ route: publicRoute(route), receipt: publicDecisionReceipt(route.decisionReceipt) });
        }
        state.health.lastError = null;
        state.health.pausedReason = null;
        state = await this.stateStore.write(state);
        return this.#writeStandaloneStatus(reconciled.length === 1 ? 'DECISION_RECEIPT_INGESTED' : 'DECISION_RECEIPTS_RECONCILED', state, {
          receiptReconciliationCount: reconciled.length,
          reconciled,
          queue: summarizeRoutes(scopedRoutes, state),
        }, { inspectBrowser: false });
      }

      const selectionExactRequest = exactRequest ?? (exactLegacyBinding ? {
        workerId: exactLegacyBinding.worker,
        requestId: exactLegacyBinding.decisionRequestId,
      } : null);
      const selection = selectAuthoritativePendingRoute({ snapshot, routes: scopedRoutes, state, exactRequest: selectionExactRequest });
      if (selection.status !== 'SELECTED') {
        state.health.lastError = null;
        state.health.pausedReason = selection.reason;
        state = await this.stateStore.write(state);
        return this.#writeStandaloneStatus(selection.status, state, {
          exactRequest,
          authoritativePending: selection.authoritativePending,
          eligible: selection.eligible,
          unrelatedRouteCount: allRoutes.length - scopedRoutes.length,
        }, { inspectBrowser: false });
      }
      const routes = [selection.route];
      const candidate = selection.route;

      const ambiguous = state.deliveries[candidate.routeKey]?.status === 'AMBIGUOUS_AFTER_RESTART' ? candidate : null;
      if (ambiguous) {
        state.health.lastError = null;
        state.health.pausedReason = `Route ${ambiguous.routeKey} is ambiguous after a possible browser click; automatic replay is prohibited.`;
        state = await this.stateStore.write(state);
        return this.#writeStandaloneStatus('AMBIGUITY_REQUIRES_OPERATOR', state, { queue: summarizeRoutes(routes, state), route: publicRoute(ambiguous) }, { inspectBrowser: false });
      }

      if (!shouldProcessSupervisoryCycle(candidate, state.deliveries[candidate.routeKey], Date.now(), this.config.runtime.retryDelayMs)) {
        state.health.lastError = null;
        state.health.pausedReason = `The exact current pending route ${candidate.requestId} is not locally processable.`;
        state = await this.stateStore.write(state);
        return this.#writeStandaloneStatus('CURRENT_PENDING_ROUTE_NOT_PROCESSABLE', state, { queue: summarizeRoutes(routes, state), route: publicRoute(candidate) }, { inspectBrowser: false });
      }

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
        return this.#writeStandaloneStatus('PAUSED_MEMORY_HARD', state, { memory, closedTargets, queue: summarizeRoutes(routes, state) });
      }

      if ((candidate.packet.routeSchemaVersion === 5 || candidate.packet.routeSchemaVersion === 6) && this.config.runtime.requestBoundEnabled !== true) {
        return this.#writeStandaloneStatus('REQUEST_BOUND_PROTOCOL_DISABLED', state, { memory, route: publicRoute(candidate) });
      }
      const capability = chatCapabilityState(snapshot, candidate.chat);
      const submitDisabledAction = nextSupervisoryCycleAction(candidate, state.deliveries[candidate.routeKey]);
      const noSendRecoveryAllowed = submitDisabledAction?.type === 'RECOVER_AND_PUBLISH';
      if (!this.config.runtime.submitEnabled && !noSendRecoveryAllowed) {
        state.health.lastError = null;
        state.health.pausedReason = 'MC_RELAY_SUBMIT_ENABLED is not 1; no supervisory browser write was attempted.';
        state = await this.stateStore.write(state);
        return this.#writeStandaloneStatus('DRY_RUN_ROUTE_READY', state, {
          memory,
          queue: summarizeRoutes(routes, state),
          route: publicRoute(candidate),
          capability,
          capabilityReceiptPrerequisite: false,
        });
      }

      return await this.#processSupervisoryCycle(candidate, routes, state, memory);
    } catch (error) {
      if (isCentralSubmissionQueued(error)) {
        state = await this.stateStore.read();
        state.health.lastError = redactError(error);
        state.health.pausedReason = 'The exact provider send is durably queued before the browser boundary.';
        state = await this.stateStore.write(state);
        return this.#writeStandaloneStatus('CENTRAL_SUBMISSION_QUEUED', state, { queueItemId: error.queueItemId ?? null, position: error.position ?? null });
      }
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
    const v6GenerationStarted = current.status === startedCycleStepStatus(IN_BAND_REQUEST_STEP);
    const resolvableAmbiguity = ['SUBMISSION_INTENT_RECORDED', 'AMBIGUOUS_AFTER_RESTART', 'FAILED_RETRYABLE'].includes(current.status);
    if (!resolvableAmbiguity && !(outcome === 'submitted' && v6GenerationStarted)) {
      throw new Error(`Route ${routeKey} is ${current.status}; no ambiguity resolution is permitted.`);
    }
    const resolvedAt = new Date().toISOString();
    if (outcome === 'retry' && current.status === 'FAILED_RETRYABLE'
      && ['EXTRA_HIGH_DECISION', 'PRO_DECISION'].includes(current.cycleStep)) {
      state.deliveries[routeKey] = await this.#restoreUnsentDecisionBinding(routeKey, current, state, resolvedAt);
    } else if (outcome === 'retry') state.deliveries[routeKey] = { ...current, status: 'RETRY_AUTHORIZED', resolvedAt, resolution: 'OPERATOR_AUTHORIZED_RETRY', lastError: null };
    else if (outcome === 'submitted' && v6GenerationStarted) state.deliveries[routeKey] = {
      ...current,
      confirmedAt: resolvedAt,
      resolution: 'OPERATOR_ATTESTED_SUBMITTED_GENERATION_PENDING',
      lastError: null,
    };
    else if (outcome === 'submitted') state.deliveries[routeKey] = { ...current, status: 'SUBMITTED_CONFIRMED', confirmedAt: resolvedAt, resolution: 'OPERATOR_ATTESTED_SUBMITTED', lastError: null };
    else if (outcome === 'discard') state.deliveries[routeKey] = { ...current, status: 'DISCARDED', resolvedAt, resolution: 'OPERATOR_DISCARDED', lastError: null };
    else throw new Error('Resolution outcome must be retry, submitted, or discard.');
    state = await this.stateStore.write(state);
    return this.#writeStandaloneStatus('AMBIGUITY_RESOLVED', state, { routeKey, outcome });
  }

  async #restoreUnsentDecisionBinding(routeKey, current, state, resolvedAt) {
    const require = (condition, reason) => {
      if (!condition) throw new Error(`Unsent decision retry is not verified: ${reason}.`);
    };
    require(current.failureStage === 'PREPARING', 'failure was not before the send boundary');
    const failed = state.providerSessions[current.providerSessionId];
    const binding = state.providerSessions[current.bindingProviderSessionId];
    const identityMatches = (session) => session && session.requestId === current.requestId
      && session.workerId === current.workerId && session.supervisorId === current.supervisorId;
    require(identityMatches(failed) && failed.providerSessionId === current.providerSessionId
      && failed.providerSessionId === current.decisionProviderSessionId
      && failed.bindingProviderSessionId === current.bindingProviderSessionId
      && failed.cycleStep === current.cycleStep && failed.sessionRole === `${current.cycleStep}_SESSION`
      && failed.messageOrdinal === 1 && failed.status === 'FAILED' && failed.failureStage === 'PREPARING'
      && failed.conversationUrl === null && current.conversationUrl === null, 'failed decision session does not match');
    const intentMs = Date.parse(current.intentRecordedAt ?? '');
    const lastSubmissionMs = Date.parse(state.submissionPacing?.lastSubmissionAt ?? '');
    require(Number.isFinite(intentMs) && Number.isFinite(lastSubmissionMs) && lastSubmissionMs < intentMs
      && Date.parse(failed.openedAt) <= intentMs && Date.parse(failed.failedAt) >= intentMs,
    'submission timing is unknown or a submission followed the intent');
    require(identityMatches(binding) && binding.providerSessionId === current.bindingProviderSessionId
      && binding.providerSessionId !== failed.providerSessionId
      && binding.bindingProviderSessionId === binding.providerSessionId && binding.status === 'COMPLETE'
      && binding.cycleStep === MCP_BINDING_PRELOAD_STEP && binding.sessionRole === 'MC_BINDING_PRELOAD_SESSION'
      && binding.messageOrdinal === 1 && /^https:\/\/chatgpt\.com\/c\/(?:WEB:)?[A-Za-z0-9_-]+$/.test(binding.conversationUrl ?? '')
      && Date.parse(binding.completedAt) <= Date.parse(failed.openedAt), 'completed binding session does not match');

    const snapshot = await this.missionControl.fetchFleet();
    const routes = extractQueuedRoutes(snapshot, this.config.runtime.chats, state).filter((route) => route.routeKey === routeKey);
    require(routes.length === 1, 'current authoritative route is missing or ambiguous');
    const route = routes[0];
    require(route.packet.routeSchemaVersion === 4 && !route.decisionReceipt
      && route.workerId === current.workerId && route.requestId === current.requestId && route.supervisorId === current.supervisorId
      && current.cycleStep === (route.packet.reasoningLane === 'PRO_ESCALATED' ? 'PRO_DECISION' : 'EXTRA_HIGH_DECISION')
      && Date.parse(route.queuedAt) <= Date.parse(resolvedAt) && Date.parse(resolvedAt) < Date.parse(route.packet.expiresAt),
    'route binding, decision state, or validity window changed');
    const receipt = route.firstTurnMcpReceipt;
    require(receipt && receipt.providerSessionId === binding.providerSessionId && receipt.supervisorId === current.supervisorId
      && receipt.receiptId === binding.firstTurnMcpReceiptId, 'current binding tool receipt does not match');
    const capsule = deriveBindingCapsule(route, binding.providerSessionId, receipt.receiptId);
    require(canonicalJson(capsule) === canonicalJson(current.bindingCapsule), 'binding capsule differs from authoritative derivation');
    const workers = snapshot.workers.filter((worker) => worker.id === current.workerId);
    require(workers.length === 1, 'authoritative worker history is ambiguous');
    const evidence = workers[0].timeline.filter((event) => event.data?.type === 'evidence_receipt_recorded');
    const exactEvidence = (event, summary, fields) => event.data.summary === summary && event.data.verified === true
      && Array.isArray(event.data.refs) && Object.entries(fields).every(([key, value]) => {
        const matches = event.data.refs.filter((ref) => ref.startsWith(`${key}:`));
        return matches.length === 1 && matches[0] === `${key}:${value}`;
      });
    const common = { request: current.requestId, supervisor: current.supervisorId };
    require(evidence.some((event) => exactEvidence(event, PROVIDER_SESSION_SUMMARY, {
      ...common, provider_session: failed.providerSessionId, binding_provider_session: binding.providerSessionId,
      decision_provider_session: failed.providerSessionId, session_role: failed.sessionRole, message_ordinal: 1,
      lifecycle_status: 'FAILED', conversation_url: 'PENDING_PROVIDER_ASSIGNMENT', url_binding_status: 'PENDING_PROVIDER_ASSIGNMENT',
    })), 'server-observed failed decision session is missing');
    const failedEvidence = evidence.filter((event) => Array.isArray(event.data.refs)
      && event.data.refs.some((ref) => ref === `provider_session:${failed.providerSessionId}`
        || ref === `decision_provider_session:${failed.providerSessionId}`));
    require(!failedEvidence.some((event) => event.data.refs.some((ref) => ['generation_state:STARTED', 'generation_state:COMPLETE',
      'lifecycle_status:COMPLETE', 'lifecycle_status:AMBIGUOUS', 'url_binding_status:EXACT'].includes(ref))
      || event.data.refs.some((ref) => ref.startsWith('conversation_url:') && ref !== 'conversation_url:PENDING_PROVIDER_ASSIGNMENT')),
    'decision start, completion, or provider URL evidence exists');
    require(evidence.some((event) => exactEvidence(event, PROVIDER_SESSION_SUMMARY, {
      ...common, provider_session: binding.providerSessionId, binding_provider_session: binding.providerSessionId,
      session_role: 'MC_BINDING_PRELOAD_SESSION', lifecycle_status: 'COMPLETE', message_ordinal: 1,
      conversation_url: binding.conversationUrl, url_binding_status: 'EXACT', first_turn_mcp_receipt: receipt.receiptId,
    })), 'server-observed completed binding session is missing');
    require(evidence.some((event) => event.data.receipt_id === receipt.receiptId && exactEvidence(event, PROVIDER_SESSION_MCP_SUMMARY, {
      ...common, provider_session: binding.providerSessionId, tool: 'get_supervisory_request_binding', status: 'OK', server_observed: true,
    })), 'server-observed binding tool receipt is missing');
    require(evidence.some((event) => exactEvidence(event, BINDING_ENVELOPE_SUMMARY, {
      ...common, binding_provider_session: binding.providerSessionId, binding_receipt: receipt.receiptId,
      binding_envelope_sha256: capsule.sha256, binding_capsule_sha256: capsule.sha256,
    })), 'server-observed binding envelope is missing');

    const restored = { ...current, status: completedCycleStepStatus(MCP_BINDING_PRELOAD_STEP),
      cycleStep: MCP_BINDING_PRELOAD_STEP, providerSessionId: binding.providerSessionId, decisionProviderSessionId: null,
      conversationUrl: binding.conversationUrl, targetId: binding.targetId, bindingCapsule: capsule,
      generationCompletedAt: binding.completedAt, resolvedAt, resolution: 'OPERATOR_AUTHORIZED_UNSENT_DECISION_RETRY', lastError: null,
      operatorRetryHistory: [...(current.operatorRetryHistory ?? []), {
        providerSessionId: failed.providerSessionId, cycleStep: current.cycleStep, attempt: current.attempt,
        promptSha256: current.promptSha256, intentRecordedAt: current.intentRecordedAt,
        failedAt: current.failedAt, failureStage: current.failureStage, resolvedAt,
      }],
    };
    // The previous binding turn's generation fields were inherited by the
    // failed preparation. They are not evidence that the decision was sent.
    for (const key of ['generationStarted', 'generationStartedAt', 'generationStart', 'generationCompletion',
      'modelUiLabel', 'promptSha256', 'bodySha256', 'bodyLength', 'intentRecordedAt', 'lastAttemptAt', 'failedAt', 'failureStage']) delete restored[key];
    return restored;
  }

  async #processSupervisoryCycle(route, routes, state, memory) {
    const perRequest = route.packet.routeSchemaVersion === 5 || route.packet.routeSchemaVersion === 6;
    const inBandRequest = route.packet.routeSchemaVersion === 6;
    let prior = state.deliveries[route.routeKey] ?? null;
    route = {
      ...route,
      bindingProviderSessionId: prior?.bindingProviderSessionId ?? route.bindingProviderSessionId ?? null,
      bindingCapsule: prior?.bindingCapsule ?? route.bindingCapsule ?? null,
    };
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

    if (route.firstTurnMcpReceipt && !prior?.bindingCapsule
      && prior?.status === completedCycleStepStatus(MCP_BINDING_PRELOAD_STEP)) {
      const bindingProviderSessionId = prior?.bindingProviderSessionId ?? prior?.providerSessionId;
      const session = bindingProviderSessionId ? state.providerSessions[bindingProviderSessionId] : null;
      if (!session || session.sessionRole !== 'MC_BINDING_PRELOAD_SESSION'
        || route.firstTurnMcpReceipt.supervisorId !== route.supervisorId
        || route.firstTurnMcpReceipt.providerSessionId !== bindingProviderSessionId) {
        throw new Error(`First-turn MCP receipt does not match binding provider session ${bindingProviderSessionId ?? 'UNKNOWN'}.`);
      }
      const bindingCapsule = deriveBindingCapsule(route, bindingProviderSessionId, route.firstTurnMcpReceipt.receiptId);
      const completedAt = route.firstTurnMcpReceipt.occurredAt ?? new Date().toISOString();
      const completedSession = { ...session, status: 'COMPLETE', completedAt, firstTurnMcpReceiptId: route.firstTurnMcpReceipt.receiptId };
      state.providerSessions[bindingProviderSessionId] = completedSession;
      state.deliveries[route.routeKey] = {
        ...prior,
        bindingProviderSessionId,
        bindingCapsule,
      };
      await this.#recordProviderSession({ ...route, providerSessionId: bindingProviderSessionId, providerSession: completedSession }, completedSession, 'EXACT');
      await this.#recordBindingCapsule(route, bindingCapsule, completedAt);
      if (completedSession.targetId) this.#rememberReusableTarget(state, completedSession.targetId, completedSession.conversationUrl);
      state = await this.stateStore.write(state);
      prior = state.deliveries[route.routeKey];
      route = { ...route, bindingProviderSessionId, bindingCapsule };
    }

    const action = nextSupervisoryCycleAction(route, prior);
    if (!action) return this.#writeStandaloneStatus('IDLE', state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route) });
    if (action.type === 'WAIT_GITHUB_RECEIPT') {
      state.health.pausedReason = `Waiting for canonical GitHub decision receipt for ${route.requestId}.`;
      state = await this.stateStore.write(state);
      return this.#writeStandaloneStatus('AWAITING_GITHUB_RECEIPT', state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route) });
    }

    let session;
    let target;
    let expectedUrl;

    if (action.type === 'WAIT_GENERATION' || action.type === 'RECOVER_AND_PUBLISH') {
      session = prior?.providerSessionId ? state.providerSessions[prior.providerSessionId] : null;
      const expectedSessionStatus = action.type === 'WAIT_GENERATION' ? 'ACTIVE' : 'COMPLETE';
      if (!session || session.requestId !== route.requestId || session.supervisorId !== route.supervisorId || session.status !== expectedSessionStatus) {
        throw new Error(`Provider session ${prior?.providerSessionId ?? 'UNKNOWN'} is not ${expectedSessionStatus.toLowerCase()} for ${route.requestId}/${action.step}.`);
      }
      if (!session.conversationUrl) throw new Error(`Provider session ${session.providerSessionId} lacks its exact conversation URL after generation start.`);
      const liveTargets = await this.browser.listTargets();
      const boundTarget = session.targetId
        ? liveTargets.find((candidateTarget) => candidateTarget.id === session.targetId) ?? null
        : null;
      if (boundTarget) {
        await this.browser.activateTarget(boundTarget.id);
        target = boundTarget;
      } else {
        if (/^https:\/\/chatgpt\.com\/c\/WEB:/.test(session.conversationUrl)) {
          throw new Error(
            `Provider session ${session.providerSessionId} has a provisional WEB conversation URL but its bound target ${session.targetId ?? 'UNKNOWN'} is unavailable; refusing transient URL navigation.`,
          );
        }
        target = await this.browser.findOrCreateChatTarget(session.conversationUrl, {
          reusableTargetId: session.targetId,
          hardCeiling: Math.min(this.config.runtime.maxHotTabs, MANAGED_CHATGPT_HARD_CEILING_TABS),
        });
      }
      expectedUrl = session.conversationUrl;
      route = { ...route, providerSessionId: session.providerSessionId, providerSession: session };
    } else if (action.type === 'SEND_CONTROL') {
      // Do not allocate a fresh provider session or consume a bounded stage
      // attempt until the universal submission boundary is actually open.
      await this.submissionPacer.assertReady();
      const semanticStage = action.step !== MCP_BINDING_PRELOAD_STEP;
      const directDecisionStage = route.packet.routeSchemaVersion >= 4 && semanticStage;
      if (semanticStage && !perRequest && (!route.bindingCapsule || !route.bindingProviderSessionId)) {
        throw new Error(`Fresh tool stage ${action.step} cannot start before the binding capsule is durably recorded.`);
      }
      const providerSessionId = perRequest && prior?.providerSessionId ? prior.providerSessionId : newProviderSessionId();
      if (semanticStage && !perRequest && providerSessionId === route.bindingProviderSessionId) throw new Error('Stage provider session must differ from the binding provider session.');
      const openedAt = new Date().toISOString();
      target = await this.browser.createFreshChatTarget({
        reusableTargetId: this.#selectReusableTargetId(state, await this.browser.listTargets()),
        hardCeiling: Math.min(this.config.runtime.maxHotTabs, MANAGED_CHATGPT_HARD_CEILING_TABS),
      });
      const mode = await this.browser.ensureExactConsumerControls(target, {
        expectedUrl: 'https://chatgpt.com/',
        controls: consumerControlsForRoute(route),
      });
      const modelReceiptId = `provider-session-model:${providerSessionId}:${sha256(openedAt).slice(0, 12)}`;
      const sessionRole = action.step === MCP_BINDING_PRELOAD_STEP ? 'MC_BINDING_PRELOAD_SESSION' : `${action.step}_SESSION`;
      await this.missionControl.recordEvidence(route.workerId, {
        receiptId: modelReceiptId,
        summary: PROVIDER_SESSION_MODEL_SUMMARY,
        refs: [
          `request:${route.requestId}`,
          `supervisor:${route.supervisorId}`,
          `provider_session:${providerSessionId}`,
          `session_role:${sessionRole}`,
          ...(semanticStage && !perRequest ? [
            `binding_provider_session:${route.bindingProviderSessionId}`,
            `${directDecisionStage ? 'decision' : 'stage'}_provider_session:${providerSessionId}`,
          ] : [`binding_provider_session:${providerSessionId}`]),
          ...consumerControlRefs(consumerControlsForRoute(route)),
          `model_ui_label:${mode.modelVisibleLabel}`,
          `model_option_count:${mode.modelOptionCount}`,
          'assistant_content_observed:false',
          'backend_model_identity_claimed:false',
          `opened_at:${openedAt}`,
        ],
        occurredAt: openedAt,
      });
      session = {
        providerSessionId,
        bindingProviderSessionId: perRequest ? providerSessionId : semanticStage ? route.bindingProviderSessionId : providerSessionId,
        supervisorId: route.supervisorId,
        requestId: route.requestId,
        workerId: route.workerId,
        sessionRole,
        cycleStep: action.step,
        messageOrdinal: 1,
        conversationUrl: null,
        openedAt,
        status: 'ACTIVE',
        modelReceiptId,
        firstTurnMcpReceiptId: null,
        targetId: target.id,
      };
      const stageAttempts = { ...(prior?.stageAttempts ?? {}) };
      stageAttempts[action.step] = (stageAttempts[action.step] ?? 0) + 1;
      state.providerSessions[providerSessionId] = session;
      state.deliveries[route.routeKey] = {
        ...(prior ?? {}),
        status: prior?.status ?? 'UNSEEN',
        requestId: route.requestId,
        workerId: route.workerId,
        supervisorId: route.supervisorId,
        providerSessionId,
        decisionProviderSessionId: directDecisionStage ? providerSessionId : (prior?.decisionProviderSessionId ?? null),
        bindingProviderSessionId: perRequest ? providerSessionId : semanticStage ? route.bindingProviderSessionId : providerSessionId,
        bindingCapsule: route.bindingCapsule,
        stageAttempts,
      };
      this.#rememberTarget(state, route.chat, target, providerSessionId, 'https://chatgpt.com/');
      state = await this.stateStore.write(state);
      route = {
        ...route,
        providerSessionId,
        bindingProviderSessionId: perRequest ? providerSessionId : semanticStage ? route.bindingProviderSessionId : providerSessionId,
        providerSession: session,
      };
      await this.#recordProviderSession(route, session, 'PENDING_PROVIDER_ASSIGNMENT');
      await this.#waitForProviderSessionProjection(route, session, 'PENDING_PROVIDER_ASSIGNMENT');
      prior = state.deliveries[route.routeKey];
      expectedUrl = 'https://chatgpt.com/';
    } else {
      throw new Error(`Unsupported supervisory-cycle action ${action.type}.`);
    }

    const postOpenMetrics = await this.memoryReader(this.config.browser.profileDir);
    memory = this.#memoryState(postOpenMetrics);
    const closedTargets = await this.#applyTabBudget(await this.browser.listTargets(), state, memory.pressure, target.id);
    if (memory.pressure === 'HARD' && action.type !== 'RECOVER_AND_PUBLISH') {
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
      const observation = await this.browser.waitForGenerationComplete(target, {
        expectedUrl,
        generationStarted: prior?.generationStarted === true,
        // A mandatory external-tool stage must never acquire a follow-up turn.
        // Missing durable receipts are recovered in a new provider session.
        allowSameChatRecovery: false,
      });
      state = await this.stateStore.read();
      session = state.providerSessions[session.providerSessionId] ?? session;
      if (observation.conversationUrl && observation.conversationUrl !== session.conversationUrl) {
        session = { ...session, conversationUrl: observation.conversationUrl, urlBoundAt: observation.completedAtObserved };
      }
      session = { ...session, status: 'COMPLETE', completedAt: observation.completedAtObserved };
      state.providerSessions[session.providerSessionId] = session;
      route = { ...route, providerSession: session };
      await this.#recordRelayStage(route, action.step, prior.modelUiLabel, prior.promptSha256, 'COMPLETE', observation.completedAtObserved, null, prior.generationStart?.messageApps ?? null);
      await this.#recordProviderSession(route, session, 'EXACT');
      if (session.targetId) this.#rememberReusableTarget(state, session.targetId, session.conversationUrl);
      state.deliveries[route.routeKey] = {
        ...prior,
        status: inBandRequest ? IN_BAND_COPY_PENDING_STATUS : completedCycleStepStatus(action.step),
        conversationUrl: session.conversationUrl,
        generationCompletedAt: observation.completedAtObserved,
        generationCompletion: observation,
      };
      state.health.lastError = null;
      state.health.pausedReason = null;
      state = await this.stateStore.write(state);
      const completionStatus = inBandRequest ? IN_BAND_COPY_PENDING_STATUS : completedCycleStepStatus(action.step);
      return this.#writeStandaloneStatus(completionStatus, state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route), observation });
    }

    if (action.type === 'RECOVER_AND_PUBLISH') {
      const prompt = cycleControlPrompt(route, action.step);
      const binding = deriveInBandRequestBinding(route, session.providerSessionId);
      let recovered;
      try {
        const turnBinding = providerTurnBindingForRecovery({ route, prior, session, target, promptSha256: prior.promptSha256 });
        const readback = await this.browser.recoverBoundConversationTurns(target, { expectedUrl });
        const observation = { ...readback, boundTargetId: target.id };
        recovered = validateRecoveredDecisionObservation(observation, {
          prompt,
          promptSha256: prior.promptSha256,
          requestId: route.requestId,
          supervisorId: route.supervisorId,
          providerSessionId: session.providerSessionId,
          nonce: route.packet.nonce,
          inBandBindingSha256: binding.in_band_binding_sha256,
          evidenceCapsule: route.packet.evidenceCapsule,
          ownerOutcome: route.packet.ownerOutcome,
          reasoningLane: route.packet.reasoningLane,
          turnBinding,
        });
        const copyInput = {
          requestId: route.requestId,
          supervisorId: route.supervisorId,
          providerSessionId: session.providerSessionId,
          workerId: route.workerId,
          conversationUrl: session.conversationUrl,
          providerPromptSha256: prior.promptSha256,
          canonicalBody: recovered.canonicalBody,
          canonicalBodySha256: recovered.canonicalBodySha256,
          browserTargetIdSha256: sha256(target.id),
          userTurnKeySha256: recovered.userTurnKeySha256,
          assistantTurnKeySha256: recovered.assistantTurnKeySha256,
          sourceReaderApp: 'GitHub',
        };
        await this.missionControl.validateProviderDecision(copyInput);
        const copied = await this.missionControl.copyProviderDecision(copyInput);
        state = await this.stateStore.read();
        state.deliveries[route.routeKey] = {
          ...state.deliveries[route.routeKey],
          status: IN_BAND_COPY_CONFIRMED_STATUS,
          recoveryClassification: recovered.classification,
          canonicalBodySha256: recovered.canonicalBodySha256,
          githubReceipt: copied.githubReceipt,
          decisionIngestedEventId: copied.ingestedEventId,
          copyConfirmedAt: copied.ingestedAt,
          turnBindingMode: recovered.turnBindingMode,
          renderedUserTextSha256: recovered.renderedUserTextSha256,
          renderedUserTextMatchesSource: recovered.renderedUserTextMatchesSource,
          recoveryVersion: IN_BAND_STRUCTURAL_RECOVERY_VERSION,
        };
        state.health.lastError = null;
        state.health.pausedReason = null;
        state = await this.stateStore.write(state);
        return this.#writeStandaloneStatus('DECISION_RECEIPT_INGESTED', state, {
          memory, queue: summarizeRoutes(routes, state), route: publicRoute(route),
          recoveryClassification: recovered.classification,
          canonicalBodySha256: recovered.canonicalBodySha256,
          turnBindingMode: recovered.turnBindingMode,
          githubReceipt: copied.githubReceipt,
        });
      } catch (error) {
        state = await this.stateStore.read();
        const classification = error?.classification ?? (recovered ? 'VALID_DECISION_PRESENT_COPIER_FAILED' : 'READBACK_UNRESOLVED');
        const retryable = recovered && classification === 'VALID_DECISION_PRESENT_COPIER_FAILED';
        const status = retryable ? IN_BAND_COPY_PENDING_STATUS : IN_BAND_RECOVERY_BLOCKED_STATUS;
        state.deliveries[route.routeKey] = {
          ...state.deliveries[route.routeKey],
          status,
          recoveryClassification: classification,
          recoveryError: redactError(error),
          recoveryBlockedAt: retryable ? null : new Date().toISOString(),
          recoveryVersion: IN_BAND_STRUCTURAL_RECOVERY_VERSION,
        };
        state.health.pausedReason = retryable
          ? `Provider decision copy pending for ${route.requestId}; validation/copy will retry without a provider resend.`
          : `Provider decision recovery blocked for ${route.requestId}; no resend is permitted.`;
        state = await this.stateStore.write(state);
        return this.#writeStandaloneStatus(status, state, {
          memory, queue: summarizeRoutes(routes, state), route: publicRoute(route), recoveryClassification: classification,
        });
      }
    }

    const prompt = cycleControlPrompt(route, action.step);
    let model;
    const promptSha256 = sha256(prompt);
    let generationStarted = false;
    try {
      const start = await this.submissionPacer.submit({
        context: submissionSchedulerContext({
          chat: route.chat, target, expectedUrl, providerSessionId: session.providerSessionId, taskId: route.taskId,
          requestId: route.requestId, queueKey: perRequest ? `${route.routeKey}:${action.step}` : `${route.routeKey}:${action.step}:${session.providerSessionId}`, sendPath: `SUPERVISORY_CYCLE_${action.step}`,
          bodySha256: promptSha256,
        }),
        beforeSubmit: async (admission) => {
          model = await this.browser.ensureExactConsumerControls(target, { expectedUrl, controls: consumerControlsForRoute(route) });
          const intentAt = new Date().toISOString();
          if (inBandRequest) {
            const binding = deriveInBandRequestBinding(route, session.providerSessionId);
            await this.missionControl.recordEvidence(route.workerId, {
              receiptId: `in-band-pre-send:${sha256([route.requestId, session.providerSessionId, admission.admissionId].join('\0'))}`,
              summary: IN_BAND_PRE_SEND_SUMMARY,
              refs: [
                `request:${route.requestId}`,
                `supervisor:${route.supervisorId}`,
                `provider_session:${session.providerSessionId}`,
                `worker:${route.workerId}`,
                `binding_protocol:${IN_BAND_REQUEST_PROTOCOL}`,
                `binding_schema:${binding.binding_schema}`,
                `in_band_binding_sha256:${binding.in_band_binding_sha256}`,
                `provider_body_sha256:${promptSha256}`,
                `decision_receipt_target:${binding.decision_receipt_target.immutable_issue_url}`,
                `submission_admission:${admission.admissionId}`,
                `admitted_at:${admission.admittedAt}`,
                `admission_expires_at:${admission.expiresAt}`,
                `trusted_relay_producer:${this.missionControl.producerId}`,
                'semantic_authority:false',
              ],
              occurredAt: intentAt,
            });
          }
          state = await this.stateStore.read();
          const current = state.deliveries[route.routeKey] ?? prior;
          state.deliveries[route.routeKey] = {
            ...current,
            status: 'SUBMISSION_INTENT_RECORDED',
            ...(perRequest ? { preBoundaryAbortConfirmed: false } : {}),
            requestId: route.requestId,
            workerId: route.workerId,
            supervisorId: route.supervisorId,
            providerSessionId: session.providerSessionId,
            conversationUrl: session.conversationUrl,
            cycleStep: action.step,
            reasoningLane: route.packet.reasoningLane,
            modelUiLabel: model.modelVisibleLabel,
            promptSha256,
            bodySha256: promptSha256,
            bodyLength: prompt.length,
            targetId: target.id,
            ...(admission ? {
              submissionAdmissionId: admission.admissionId,
              submissionQueueItemId: admission.queueItemId ?? null,
              submissionAdmittedAt: admission.admittedAt,
              submissionAdmissionExpiresAt: admission.expiresAt,
            } : {}),
            attempt: (current?.attempt ?? 0) + 1,
            intentRecordedAt: intentAt,
            lastAttemptAt: intentAt,
            lastError: null,
          };
          state = await this.stateStore.write(state);
        },
        submit: async (onSubmissionBoundary, _admission, onBeforeSubmissionBoundary) => {
          const appPlan = appSelectionForMessage(route.chat, action.step);
          let messageApps;
          try {
            messageApps = appPlan.requiredLabels.length > 0
              ? await this.browser.selectAppsForMessage(target, appPlan)
              : { status: 'APP_SELECTION_NOT_ATTEMPTED', requiredLabels: [], selectedLabels: [], inspectedAssistantOutput: false };
          } catch (error) {
            if (!perRequest || inBandRequest) throw error;
            messageApps = { status: 'APP_SELECTION_UNCONFIRMED', requiredLabels: appPlan.requiredLabels, selectedLabels: [], inspectedAssistantOutput: false };
          }
          if (perRequest && Date.now() >= Date.parse(route.packet.expiresAt)) {
            const error = new Error('Request expired before provider dispatch; no new send is permitted.');
            error.relayStage = 'PREPARING';
            throw error;
          }
          const start = await this.browser.submitExactMessage(target, { expectedUrl, body: prompt, bodySha256: promptSha256, composerMentions: messageApps.composerMentions ?? [], onBeforeSubmissionBoundary, onSubmissionBoundary });
          return { ...start, messageApps };
        },
      });
      generationStarted = true;
      state = await this.stateStore.read();
      session = state.providerSessions[session.providerSessionId];
      if (!session) throw new Error(`Provider session ${route.providerSessionId} disappeared after submission.`);
      session = { ...session, submittedUserTurnAnchor: start.submittedUserTurnAnchor };
      state.providerSessions[session.providerSessionId] = session;
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
        submittedUserTurnAnchor: start.submittedUserTurnAnchor,
        conversationUrl: session.conversationUrl,
      };
      state = await this.stateStore.write(state);
      await this.#recordRelayStage(route, action.step, model.modelVisibleLabel, promptSha256, 'STARTED', start.startedAtObserved, start.startSignal, start.messageApps ?? null);
      return this.#writeStandaloneStatus(startedCycleStepStatus(action.step), state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route), generationStart: start });
    } catch (error) {
      if (isCentralSubmissionQueued(error)) {
        state = await this.stateStore.read();
        state.health.lastError = redactError(error);
        state.health.pausedReason = 'The exact provider send is durably queued before the browser boundary.';
        state = await this.stateStore.write(state);
        return this.#writeStandaloneStatus('CENTRAL_SUBMISSION_QUEUED', state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route), queueItemId: error.queueItemId ?? null, position: error.position ?? null });
      }
      if (isGlobalSubmissionCooldown(error)) {
        state = await this.stateStore.read();
        session = state.providerSessions[route.providerSessionId] ?? session;
        if (session) {
          session = { ...session, status: 'FAILED', failedAt: new Date().toISOString(), failureStage: 'GLOBAL_SUBMISSION_COOLDOWN' };
          state.providerSessions[session.providerSessionId] = session;
          await this.#recordProviderSession(route, session, session.conversationUrl ? 'EXACT' : 'PENDING_PROVIDER_ASSIGNMENT');
          state = await this.stateStore.write(state);
        }
        return this.#cooldownStatus(state, { memory, queue: summarizeRoutes(routes, state), route: publicRoute(route) }, error);
      }
      const stage = error?.relayStage ?? 'UNKNOWN';
      const afterClick = generationStarted || stage === 'CLICKED' || stage === 'CLICK_DISPATCHED' || stage === 'GENERATION_STARTED'
        || (perRequest && error?.preBoundaryAbortConfirmed !== true);
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
        ...(perRequest ? { preBoundaryAbortConfirmed: error?.preBoundaryAbortConfirmed === true } : {}),
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
    const bindingProviderSessionId = route.bindingProviderSessionId ?? route.providerSessionId;
    const isBindingSession = step === MCP_BINDING_PRELOAD_STEP;
    const isDirectDecision = route.packet.routeSchemaVersion >= 4 && !isBindingSession;
    const refs = [
      `request:${route.requestId}`,
      `supervisor:${route.supervisorId}`,
      `provider_session:${route.providerSessionId}`,
      `binding_provider_session:${bindingProviderSessionId}`,
      ...(isBindingSession ? [] : [`${isDirectDecision ? 'decision' : 'stage'}_provider_session:${route.providerSessionId}`]),
      `conversation_url:${route.providerSession?.conversationUrl ?? 'PENDING_PROVIDER_ASSIGNMENT'}`,
      `step:${step}`,
      'message_ordinal:1',
      'first_message:true',
      `model_ui_label:${modelUiLabel}`,
      ...consumerControlRefs(consumerControlsForRoute(route)),
      `prompt_sha256:${promptSha256}`,
      `generation_state:${generationState}`,
      `observed_at:${observedAt}`,
      'assistant_content_observed:false',
      'backend_model_identity_claimed:false',
      `app_selection_attempted:${messageApps?.status === 'APP_SELECTION_NOT_ATTEMPTED' ? 'false' : 'true'}`,
      `app_selection_status:${messageApps?.status ?? 'UNKNOWN'}`,
      ...((messageApps?.selectedLabels ?? []).map((label) => `selected_app:${label}`)),
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
    const bindingReceiptState = session.firstTurnMcpReceiptId ?? 'PENDING';
    return this.missionControl.recordEvidence(route.workerId, {
      receiptId: `provider-session:${session.providerSessionId}:${session.status}:${sha256(`${urlBindingStatus}:${occurredAt}:${bindingReceiptState}`).slice(0, 12)}`,
      summary: PROVIDER_SESSION_SUMMARY,
      refs: [
        `request:${route.requestId}`,
        `supervisor:${route.supervisorId}`,
        `provider_session:${session.providerSessionId}`,
        `binding_provider_session:${session.bindingProviderSessionId ?? session.providerSessionId}`,
        ...(session.sessionRole === 'MC_BINDING_PRELOAD_SESSION' ? [] : [
          `${route.packet.routeSchemaVersion >= 4 ? 'decision' : 'stage'}_provider_session:${session.providerSessionId}`,
        ]),
        `session_role:${session.sessionRole ?? 'LEGACY'}`,
        `message_ordinal:${session.messageOrdinal ?? 1}`,
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

  async #recordBindingCapsule(route, bindingCapsule, occurredAt) {
    const capsule = bindingCapsule.payload;
    return this.missionControl.recordEvidence(route.workerId, {
      receiptId: `binding-capsule:${route.requestId}:${bindingCapsule.sha256.slice(0, 16)}`,
      summary: route.packet.routeSchemaVersion === 4 ? BINDING_ENVELOPE_SUMMARY : BINDING_CAPSULE_SUMMARY,
      refs: [
        `request:${route.requestId}`,
        `supervisor:${route.supervisorId}`,
        `binding_provider_session:${capsule.binding_provider_session_id}`,
        `binding_receipt:${capsule.binding_receipt_id}`,
        `binding_capsule_id:${capsule.binding_capsule_id}`,
        `binding_capsule_sha256:${bindingCapsule.sha256}`,
        ...(route.packet.routeSchemaVersion === 4 ? [`binding_envelope_sha256:${bindingCapsule.sha256}`] : []),
        `request_nonce_sha256:${sha256(capsule.request_nonce)}`,
        `worker:${capsule.worker_id}`,
        `reasoning_lane:${capsule.reasoning_lane}`,
        `queued_at:${capsule.queued_at}`,
        `expires_at:${capsule.expires_at}`,
        `evidence_capsule:${capsule.evidence_capsule.id}`,
        `evidence_capsule_sha256:${capsule.evidence_capsule.sha256}`,
        `owner_outcome:${capsule.owner_outcome.id}`,
        `owner_outcome_epoch:${capsule.owner_outcome.epoch}`,
        `owner_outcome_sha256:${capsule.owner_outcome.sha256}`,
        `github_repository:${capsule.receipt_targets.repository}`,
        `decision_issue:${capsule.receipt_targets.decision_issue_number}`,
        `stage_issue:${capsule.receipt_targets.stage_issue_number}`,
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

  async #writeStandaloneStatus(status, state, detail = {}, { inspectBrowser = true } = {}) {
    const targets = inspectBrowser ? await this.browser.listTargets().catch(() => null) : null;
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

function consumerControlsForRoute(route) {
  return route.packet?.routeSchemaVersion >= 5 ? route.chat.consumerControls : LEGACY_FIXED_CONSUMER_CONTROLS;
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

function selectAuthoritativePendingRoute({ snapshot, routes, state, exactRequest = null }) {
  const authoritativePending = [];
  for (const worker of snapshot?.workers ?? []) {
    if (!Array.isArray(worker?.authoritativePendingRequestIds)) {
      return routeSelectionFailure(
        'AUTHORITATIVE_PENDING_PROJECTION_UNAVAILABLE',
        `Mission Control did not provide an authoritative pending-request projection for worker ${worker?.id ?? 'unknown'}.`,
        authoritativePending,
        [],
      );
    }
    for (const requestId of worker.authoritativePendingRequestIds) {
      if (typeof requestId !== 'string' || requestId.length === 0) {
        return routeSelectionFailure(
          'AUTHORITATIVE_PENDING_PROJECTION_INVALID',
          `Mission Control returned an invalid pending request identifier for worker ${worker?.id ?? 'unknown'}.`,
          authoritativePending,
          [],
        );
      }
      authoritativePending.push({ workerId: worker.id, requestId });
    }
  }

  const scopedAuthoritative = exactRequest
    ? authoritativePending.filter((request) => request.workerId === exactRequest.workerId
      && request.requestId === exactRequest.requestId)
    : authoritativePending;
  const uniqueAuthoritativeKeys = new Set(scopedAuthoritative.map((request) => `${request.workerId}:${request.requestId}`));
  const eligible = routes.filter((route) => route.routeKind === 'SUPERVISORY_CYCLE'
    && uniqueAuthoritativeKeys.has(`${route.workerId}:${route.requestId}`)
    && !route.decisionReceipt
    && !['DECISION_RECEIPT_INGESTED', 'SUBMITTED_CONFIRMED', 'DISCARDED']
      .includes(state.deliveries[route.routeKey]?.status)
    && (!Number.isFinite(Date.parse(route.packet?.expiresAt)) || Date.parse(route.packet.expiresAt) > Date.now()));
  const publicAuthoritative = scopedAuthoritative.map((request) => ({ ...request }));
  const publicEligible = eligible.map(publicRoute);

  if (scopedAuthoritative.length !== 1 || uniqueAuthoritativeKeys.size !== 1) {
    const status = exactRequest
      ? (scopedAuthoritative.length === 0 ? 'EXACT_REQUEST_ROUTE_UNAVAILABLE' : 'EXACT_REQUEST_ROUTE_AMBIGUOUS')
      : (scopedAuthoritative.length === 0 ? 'AUTHORITATIVE_PENDING_ROUTE_UNAVAILABLE' : 'AUTHORITATIVE_PENDING_ROUTE_AMBIGUOUS');
    return routeSelectionFailure(
      status,
      `Mission Control authoritative pending-request cardinality is ${scopedAuthoritative.length}; exactly one is required.`,
      publicAuthoritative,
      publicEligible,
    );
  }
  if (eligible.length !== 1) {
    const status = exactRequest
      ? (eligible.length === 0 ? 'EXACT_REQUEST_ROUTE_UNAVAILABLE' : 'EXACT_REQUEST_ROUTE_AMBIGUOUS')
      : (eligible.length === 0 ? 'AUTHORITATIVE_PENDING_ROUTE_UNAVAILABLE' : 'AUTHORITATIVE_PENDING_ROUTE_AMBIGUOUS');
    return routeSelectionFailure(
      status,
      `Locally eligible current-route cardinality is ${eligible.length}; exactly one is required.`,
      publicAuthoritative,
      publicEligible,
    );
  }
  return {
    status: 'SELECTED',
    route: eligible[0],
    authoritativePending: { count: publicAuthoritative.length, requests: publicAuthoritative },
    eligible: { count: publicEligible.length, routes: publicEligible },
  };
}

function routeSelectionFailure(status, reason, authoritativePending, eligible) {
  return {
    status,
    reason,
    authoritativePending: { count: authoritativePending.length, requests: authoritativePending },
    eligible: { count: eligible.length, routes: eligible },
  };
}

function providerTurnBindingForRecovery({ route, prior, session, target, promptSha256 }) {
  const fail = (message) => { throw new Error(`Exact provider turn binding is unavailable: ${message}`); };
  if (route.packet.routeSchemaVersion !== 6) fail('only the frozen in-band request protocol is structurally recoverable');
  if (![IN_BAND_COPY_PENDING_STATUS, IN_BAND_RECOVERY_BLOCKED_STATUS].includes(prior?.status)) fail('delivery is not at the no-resend copy boundary');
  if (session?.status !== 'COMPLETE' || session.requestId !== route.requestId
    || session.providerSessionId !== prior.providerSessionId || session.messageOrdinal !== 1) fail('provider session identity or lifecycle mismatch');
  const mismatches = [];
  if (session.conversationUrl !== prior.conversationUrl) mismatches.push('delivery_conversation');
  if (session.targetId !== target.id) mismatches.push('session_target');
  if (prior.targetId !== target.id) mismatches.push('delivery_target');
  if (prior.promptSha256 !== promptSha256) mismatches.push('prompt_digest');
  if (prior.generationStarted !== true) mismatches.push('generation_started');
  if (prior.generationStart?.bodySha256 !== promptSha256) mismatches.push('generation_start_digest');
  if (prior.generationStart?.targetId !== target.id) mismatches.push('generation_start_target');
  const generationStartConversationMatches = prior.generationStart?.conversationUrl === session.conversationUrl
    || (prior.generationCompletion?.conversationUrlCanonicalized === true
      && prior.generationCompletion?.conversationUrl === session.conversationUrl
      && /^https:\/\/chatgpt\.com\/c\/WEB:[A-Za-z0-9_-]+$/.test(prior.generationStart?.conversationUrl ?? '')
      && /^https:\/\/chatgpt\.com\/c\/[A-Za-z0-9_-]+$/.test(session.conversationUrl ?? ''));
  const liveTargetConversationMatches = target.url === session.conversationUrl
    || (generationStartConversationMatches && target.url === prior.generationStart?.conversationUrl);
  if (!liveTargetConversationMatches) mismatches.push('live_target_conversation');
  if (!generationStartConversationMatches) mismatches.push('generation_start_conversation');
  if (mismatches.length > 0) fail(`preserved send-bound identity mismatch (${mismatches.join(',')})`);
  const common = {
    requestId: route.requestId,
    providerSessionId: session.providerSessionId,
    providerPromptSha256: promptSha256,
    conversationUrl: session.conversationUrl,
    targetId: target.id,
    messageOrdinal: session.messageOrdinal,
  };
  const captured = prior.submittedUserTurnAnchor ?? prior.generationStart?.submittedUserTurnAnchor
    ?? session.submittedUserTurnAnchor ?? null;
  if (captured) {
    if (typeof captured.key !== 'string' || !captured.key
      || typeof captured.keySource !== 'string' || !captured.keySource
      || captured.role !== 'user' || captured.messageOrdinal !== 1
      || captured.mentionBindingVerified !== true) fail('captured stable user-turn anchor is incomplete');
    return {
      ...common,
      mode: 'CAPTURED_STABLE_USER_TURN_KEY',
      userTurnKey: captured.key,
      userTurnKeySource: captured.keySource,
      structureKind: captured.structureKind,
      submissionAdmissionId: prior.submissionAdmissionId ?? null,
    };
  }
  if (typeof prior.generationStartedAt !== 'string' || !Number.isFinite(Date.parse(prior.generationStartedAt))) {
    fail('pre-anchor request lacks a durable generation-start observation');
  }
  return {
    ...common,
    mode: 'BOUND_SINGLE_TURN_COMPOUND_ANCHOR',
    generationStartedAt: prior.generationStartedAt,
    submissionAdmissionId: prior.submissionAdmissionId ?? null,
  };
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
    taskId: route.taskId,
    destinationSupervisorId: route.supervisorId,
    providerSessionId: route.providerSessionId,
    bindingProviderSessionId: route.bindingProviderSessionId ?? null,
    decisionProviderSessionId: route.prior?.decisionProviderSessionId ?? null,
    destinationLabel: route.chat.label,
    queuedAt: route.queuedAt,
    bodySha256: route.bodySha256,
    bodyLength: route.body.length,
    routeKind: route.routeKind,
    reasoningLane: route.packet.reasoningLane ?? null,
    missionControlLegacyBinding: route.missionControlLegacyBinding ?? null,
  };
}

function shouldProcessSupervisoryCycle(route, prior, nowMs, retryDelayMs) {
  if (prior?.status === 'DISCARDED') return false;
  if (Number.isFinite(Date.parse(route.packet.expiresAt)) && Date.parse(route.packet.expiresAt) <= nowMs) return false;
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
    bindingProviderSessionId: receipt.binding_provider_session_id ?? null,
    stageProviderSessionId: receipt.stage_provider_session_id ?? null,
    decisionProviderSessionId: receipt.decision_provider_session_id ?? null,
    decisionSessionProvenance: receipt.decision_session_provenance ?? null,
    proProvenance: receipt.decision_session_provenance
      ?? (receipt.pro_decision_block?.used ? 'DURABLE_STAGE_RECEIPT_ATTESTED' : null),
  };
}
