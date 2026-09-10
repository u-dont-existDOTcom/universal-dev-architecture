import {
  MANAGED_CHATGPT_HARD_CEILING_TABS,
  PROVIDER_SESSION_MODEL_SUMMARY,
  PROVIDER_SESSION_SUMMARY,
  RELAY_STAGE_SUMMARY,
  canonicalJson,
  consumerControlRefs,
  cycleControlPrompt,
  extractQueuedRoutes,
  newProviderSessionId,
  sha256,
} from './core.mjs';
import {
  CONTROLLER_ARTIFACT_KINDS,
  CONTROLLER_ARTIFACT_PREFIX,
  ControllerGitHubArtifacts,
} from './controller-github-artifacts.mjs';
import { isGlobalSubmissionCooldown, publicCooldown } from './submission-pacing.mjs';
import { submissionSchedulerContext } from './submission-context.mjs';

export const CONTROLLER_STAGE_SUMMARY = 'MISSION_CONTROL_PM_CONTROLLER_STAGE_V1';
export const CONTROLLER_PM_ID = 'mc-project-manager';

const TERMINAL_STEP = 'COMPLETE';
const ROOT_URL = 'https://chatgpt.com/';
const PROJECTION_TIMEOUT_MS = 30_000;
const ARTIFACT_POLL_INTERVAL_MS = 90_000;

export class ControllerMediatedPmRuntime {
  constructor({ config, missionControl, browser, stateStore, submissionPacer, githubFactory = null }) {
    this.config = config;
    this.missionControl = missionControl;
    this.browser = browser;
    this.stateStore = stateStore;
    if (!submissionPacer || typeof submissionPacer.remoteStatus !== 'function') throw new Error('Controller requires the explicit central submission scheduler.');
    this.submissionPacer = submissionPacer;
    this.githubFactory = githubFactory ?? ((cycle) => new ControllerGitHubArtifacts({
      repository: cycle.artifactChannel.repository,
      issueNumber: cycle.artifactChannel.issueNumber,
      authorizedWriterLogins: cycle.artifactChannel.authorizedWriterLogins,
      requestTimeoutMs: config.missionControl.requestTimeoutMs,
    }));
  }

  async initialize(rawSpec) {
    const spec = parseControllerCycleSpec(rawSpec);
    let state = await this.stateStore.read();
    if (state.controllerCycles?.[spec.cycleId]) throw new Error(`Controller cycle ${spec.cycleId} already exists.`);
    const duplicateRequest = Object.values(state.controllerCycles ?? {}).find((cycle) => cycle?.requestId === spec.requestId && cycle?.step !== TERMINAL_STEP);
    if (duplicateRequest) throw new Error(`Request ${spec.requestId} is already controlled by ${duplicateRequest.cycleId}.`);

    const snapshot = await this.missionControl.fetchFleet();
    const routes = extractQueuedRoutes(snapshot, this.config.runtime.chats, state).filter((route) => route.requestId === spec.requestId);
    if (routes.length !== 1) throw new Error(`Expected one exact pending route for ${spec.requestId}; found ${routes.length}.`);
    const route = routes[0];
    const prior = state.deliveries[route.routeKey];
    if (route.packet.routeSchemaVersion !== 4 || typeof route.packet.continuationOwnerResponseExactText !== 'string') {
      throw new Error('Controller-mediated PM proof requires one route-v4 exact OWNER continuation.');
    }
    if (route.workerId !== spec.workerId || route.supervisorId !== spec.originSupervisorId
      || route.eventId !== spec.routeEventId || route.bodySha256 !== spec.routeBodySha256) {
      throw new Error('Controller cycle spec does not match the exact authoritative origin route.');
    }
    if (route.packet.githubReceipt.repository !== spec.artifactRepository
      || route.packet.githubReceipt.stageIssueNumber !== spec.artifactIssueNumber) {
      throw new Error('Controller artifact channel must equal the route-bound stage issue.');
    }
    if (prior?.status !== 'MCP_BINDING_PRELOAD_COMPLETE' || !prior.bindingCapsule || !prior.bindingProviderSessionId) {
      throw new Error('Controller initialization requires the completed exact binding preload and binding envelope.');
    }
    const bindingSession = state.providerSessions[prior.bindingProviderSessionId];
    if (!bindingSession || bindingSession.status !== 'COMPLETE' || !bindingSession.targetId || !bindingSession.conversationUrl
      || bindingSession.requestId !== route.requestId || bindingSession.supervisorId !== route.supervisorId) {
      throw new Error('Controller origin target is not bound to the completed preload provider session.');
    }
    const pm = this.config.runtime.chats.find((chat) => chat.supervisorId === spec.pmSupervisorId);
    if (!pm || pm.scope !== 'PROJECT_MANAGER' || pm.supervisorId !== CONTROLLER_PM_ID) {
      throw new Error(`Permanent Project Manager ${CONTROLLER_PM_ID} is not registered exactly once.`);
    }
    const doctor = await this.browser.doctor();
    if (!Number.isInteger(doctor.automationWindowId)) throw new Error('Automation-owned window identity is unavailable.');
    await this.browser.requireExactOwnedTarget({
      targetId: bindingSession.targetId,
      automationWindowId: doctor.automationWindowId,
      expectedUrl: bindingSession.conversationUrl,
    });

    const ownerExactText = route.packet.continuationOwnerResponseExactText;
    const ownerBytesSha256 = sha256(ownerExactText);
    const providerSessions = {
      origin: newProviderSessionId(),
      pm: newProviderSessionId(),
      return: newProviderSessionId(),
    };
    const originTargetBindingSha256 = targetBindingSha256({
      targetId: bindingSession.targetId,
      windowId: doctor.automationWindowId,
      providerSessionId: providerSessions.origin,
    });
    const bindingFacts = {
      schema_version: 1,
      cycle_id: spec.cycleId,
      task_id: spec.taskId,
      request_id: spec.requestId,
      worker_id: spec.workerId,
      origin_supervisor_id: spec.originSupervisorId,
      pm_supervisor_id: spec.pmSupervisorId,
      route_event_id: spec.routeEventId,
      route_body_sha256: spec.routeBodySha256,
      binding_envelope_sha256: prior.bindingCapsule.sha256,
      owner_bytes_sha256: ownerBytesSha256,
      origin_artifact_nonce_sha256: sha256(spec.originArtifactNonce),
      pm_artifact_nonce_sha256: sha256(spec.pmArtifactNonce),
      artifact_repository: spec.artifactRepository,
      artifact_issue_number: spec.artifactIssueNumber,
    };
    const now = new Date().toISOString();
    const cycle = {
      schemaVersion: 1,
      cycleId: spec.cycleId,
      taskId: spec.taskId,
      requestId: spec.requestId,
      routeKey: route.routeKey,
      routeEventId: route.eventId,
      routeBodySha256: route.bodySha256,
      workerId: route.workerId,
      originSupervisorId: route.supervisorId,
      pmSupervisorId: pm.supervisorId,
      step: 'ORIGIN_SEND_READY',
      createdAt: now,
      updatedAt: now,
      expiresAt: route.packet.expiresAt,
      ownerBytesSha256,
      bindingProviderSessionId: prior.bindingProviderSessionId,
      bindingEnvelopeSha256: prior.bindingCapsule.sha256,
      controllerBindingSha256: sha256(canonicalJson(bindingFacts)),
      artifactChannel: {
        repository: spec.artifactRepository,
        issueNumber: spec.artifactIssueNumber,
        authorizedWriterLogins: [...spec.authorizedWriterLogins],
      },
      artifactNonces: { origin: spec.originArtifactNonce, pm: spec.pmArtifactNonce },
      providerSessions,
      origin: {
        targetId: bindingSession.targetId,
        automationWindowId: doctor.automationWindowId,
        expectedUrl: bindingSession.conversationUrl,
        targetBindingSha256: originTargetBindingSha256,
      },
      pm: null,
      pmTargetCreation: null,
      navigations: { origin: null, return: null },
      sends: { origin: null, pm: null, return: null },
      artifactPolling: { origin: null, pm: null },
      consumedArtifacts: { origin: null, pm: null },
      final: null,
      lastError: null,
    };
    state.controllerCycles ??= {};
    state.controllerCycles[cycle.cycleId] = cycle;
    state = await this.stateStore.write(state);
    await this.#recordControllerStage(cycle, 'INITIALIZED');
    return this.#status('CONTROLLER_CYCLE_INITIALIZED', state.controllerCycles[cycle.cycleId]);
  }

  async cycle(cycleId) {
    let state = await this.stateStore.read();
    let cycle = state.controllerCycles?.[cycleId];
    if (!cycle) throw new Error(`Unknown controller cycle: ${cycleId}.`);
    if (cycle.step === TERMINAL_STEP) return this.#status('CONTROLLER_CYCLE_COMPLETE', cycle);

    try {
      const snapshot = await this.missionControl.fetchFleet();
      const routes = extractQueuedRoutes(snapshot, this.config.runtime.chats, state).filter((route) => route.requestId === cycle.requestId);
      if (routes.length !== 1) throw new Error(`Expected one exact active controller route for ${cycle.requestId}; found ${routes.length}.`);
      let route = routes[0];
      this.#validateRoute(cycle, route);

      const final = this.#findFinalProof(snapshot, cycle, route);
      if (final) {
        await this.#revalidateConsumedArtifacts(cycle, route);
        return this.#complete(state, cycle, route, final);
      }

      if (Date.now() > Date.parse(cycle.expiresAt)) throw new Error('CONTROLLER_CYCLE_EXPIRED: the exact route validity window elapsed.');

      if (cycle.step === 'ORIGIN_SEND_STARTED' || cycle.step === 'WAIT_ORIGIN_ARTIFACT') {
        const poll = await this.#reconcileArtifactOnSchedule(state, cycle, 'origin', this.#originExpectation(cycle, route));
        ({ state, cycle } = poll);
        if (!poll.due) {
          return this.#status(artifactWaitStatus(cycle, 'origin', 'ORIGIN_SEND_STARTED', 'WAIT_ORIGIN_ARTIFACT', 'ORIGIN_SEND_AMBIGUOUS_NO_REPLAY'), cycle);
        }
        const artifact = poll.artifact;
        if (artifact) {
          ({ state, cycle } = await this.#confirmArtifactSendBoundary(state, cycle, 'origin', artifact));
          cycle.consumedArtifacts.origin = publicArtifactReceipt(artifact);
          cycle.step = 'ORIGIN_ARTIFACT_VALIDATED';
          cycle.updatedAt = new Date().toISOString();
          cycle.lastError = null;
          state.controllerCycles[cycle.cycleId] = cycle;
          state = await this.stateStore.write(state);
          await this.#recordControllerStage(cycle, 'ORIGIN_ARTIFACT_VALIDATED', artifact);
          return this.#status('ORIGIN_ARTIFACT_VALIDATED', state.controllerCycles[cycle.cycleId]);
        }
        return this.#status(artifactWaitStatus(cycle, 'origin', 'ORIGIN_SEND_STARTED', 'WAIT_ORIGIN_ARTIFACT', 'ORIGIN_SEND_AMBIGUOUS_NO_REPLAY'), cycle);
      }

      if (cycle.step === 'PM_SEND_STARTED' || cycle.step === 'WAIT_PM_ARTIFACT') {
        const poll = await this.#reconcileArtifactOnSchedule(state, cycle, 'pm', this.#pmExpectation(cycle, route));
        ({ state, cycle } = poll);
        if (!poll.due) {
          return this.#status(artifactWaitStatus(cycle, 'pm', 'PM_SEND_STARTED', 'WAIT_PM_ARTIFACT', 'PM_SEND_AMBIGUOUS_NO_REPLAY'), cycle);
        }
        const artifact = poll.artifact;
        if (artifact) {
          await this.#revalidateConsumedArtifacts(cycle, route);
          ({ state, cycle } = await this.#confirmArtifactSendBoundary(state, cycle, 'pm', artifact));
          cycle.consumedArtifacts.pm = publicArtifactReceipt(artifact);
          cycle.step = 'PM_ARTIFACT_VALIDATED';
          cycle.updatedAt = new Date().toISOString();
          cycle.lastError = null;
          state.controllerCycles[cycle.cycleId] = cycle;
          state = await this.stateStore.write(state);
          await this.#recordControllerStage(cycle, 'PM_ARTIFACT_VALIDATED', artifact);
          return this.#status('PM_ARTIFACT_VALIDATED', state.controllerCycles[cycle.cycleId]);
        }
        return this.#status(artifactWaitStatus(cycle, 'pm', 'PM_SEND_STARTED', 'WAIT_PM_ARTIFACT', 'PM_SEND_AMBIGUOUS_NO_REPLAY'), cycle);
      }

      if (cycle.step === 'RETURN_SEND_STARTED') {
        ({ state, cycle } = await this.#recoverReturnClickBoundary(state, cycle, route));
        if (cycle.sends.return?.status === 'BOUNDARY_VERIFIED'
          && state.providerSessions[cycle.providerSessions.return]?.conversationUrl) {
          await this.#revalidateConsumedArtifacts(cycle, route);
          return await this.#completeReturnTransport(state, cycle, route);
        }
        if (cycle.sends.return?.status === 'CLICK_BOUNDARY_PERSISTED') {
          return this.#status('WAIT_RETURN_TARGET_TRANSITION', cycle);
        }
        return this.#status('RETURN_SEND_AMBIGUOUS_NO_REPLAY', cycle);
      }
      if (cycle.step === 'WAIT_RETURN_ARTIFACT_OR_ACK') {
        return this.#status('WAIT_RETURN_ARTIFACT_OR_ACK', cycle);
      }

      if (cycle.step === 'ORIGIN_ARTIFACT_VALIDATED') {
        await this.#revalidateConsumedArtifacts(cycle, route);
        return await this.#preparePm(state, cycle);
      }
      if (cycle.step === 'PM_ARTIFACT_VALIDATED') {
        await this.#revalidateConsumedArtifacts(cycle, route);
        return await this.#prepareReturn(state, cycle, route);
      }
      if (['ORIGIN_SEND_READY', 'PM_SEND_READY', 'RETURN_SEND_READY'].includes(cycle.step)
        && !this.config.runtime.submitEnabled) {
        return this.#status('CONTROLLER_SEND_DISABLED', cycle);
      }
      if (cycle.step === 'ORIGIN_SEND_READY') return await this.#sendOrigin(state, cycle, route);
      if (cycle.step === 'PM_SEND_READY') {
        await this.submissionPacer.assertReady();
        await this.#revalidateConsumedArtifacts(cycle, route);
        return await this.#sendPm(state, cycle);
      }
      if (cycle.step === 'RETURN_SEND_READY') {
        await this.submissionPacer.assertReady();
        await this.#revalidateConsumedArtifacts(cycle, route);
        return await this.#sendReturn(state, cycle, route);
      }
      throw new Error(`Unsupported controller cycle step ${cycle.step}.`);
    } catch (error) {
      state = await this.stateStore.read();
      cycle = state.controllerCycles?.[cycleId] ?? cycle;
      cycle.lastError = safeError(error);
      cycle.updatedAt = new Date().toISOString();
      state.controllerCycles[cycleId] = cycle;
      state = await this.stateStore.write(state);
      if (isGlobalSubmissionCooldown(error)) {
        return this.#status('GLOBAL_SUBMISSION_COOLDOWN', state.controllerCycles[cycleId], {
          submissionPacing: publicCooldown(error),
        });
      }
      return this.#status('CONTROLLER_CYCLE_ERROR', state.controllerCycles[cycleId], { error: publicErrorCode(safeError(error)) });
    }
  }

  async #sendOrigin(state, cycle, route) {
    ({ state, cycle } = await this.#navigateOriginRestartSafe(state, cycle, 'origin', `controller-origin:${cycle.cycleId}`));
    const target = await this.browser.requireExactOwnedTarget({
      targetId: cycle.origin.targetId,
      automationWindowId: cycle.origin.automationWindowId,
      expectedUrl: ROOT_URL,
    });
    const prompt = originPrompt(cycle, route);
    const result = await this.#submitArtifactMessage({
      state, cycle, lane: 'origin', target, expectedUrl: ROOT_URL, prompt,
      chat: route.chat, readyStep: 'ORIGIN_SEND_READY', startedStep: 'ORIGIN_SEND_STARTED', waitingStep: 'WAIT_ORIGIN_ARTIFACT',
    });
    await this.#recordControllerStage(result.cycle, 'WAIT_ORIGIN_ARTIFACT');
    return this.#status('WAIT_ORIGIN_ARTIFACT', result.cycle);
  }

  async #preparePm(state, cycle) {
    const pmChat = this.config.runtime.chats.find((chat) => chat.supervisorId === cycle.pmSupervisorId);
    const purpose = `controller-pm:${cycle.cycleId}`;
    if (!cycle.pmTargetCreation) {
      cycle.pmTargetCreation = {
        status: 'INTENT_RECORDED', purpose,
        anchorTargetBindingSha256: cycle.origin.targetBindingSha256,
        intentRecordedAt: new Date().toISOString(), completedAt: null,
      };
      cycle.updatedAt = cycle.pmTargetCreation.intentRecordedAt;
      state.controllerCycles[cycle.cycleId] = cycle;
      state = await this.stateStore.write(state);
    }
    if (cycle.pmTargetCreation.purpose !== purpose
      || cycle.pmTargetCreation.anchorTargetBindingSha256 !== cycle.origin.targetBindingSha256) {
      throw new Error('CONTROLLER_PM_TARGET_CREATION_BINDING_MISMATCH.');
    }
    let target = await this.browser.recoverExactOwnedTargetByPurpose({
      purpose,
      automationWindowId: cycle.origin.automationWindowId,
      expectedUrl: pmChat.bootstrapCapability.url,
    });
    if (!target) {
      const owned = await this.browser.listTargets();
      if (owned.length !== 1 || owned[0].id !== cycle.origin.targetId) {
        throw new Error('CONTROLLER_PM_TRANSITION_TAB_SET_MISMATCH.');
      }
      target = await this.browser.forceCreateOwnedTarget({
        url: pmChat.bootstrapCapability.url,
        hardCeiling: Math.min(this.config.runtime.maxHotTabs, MANAGED_CHATGPT_HARD_CEILING_TABS),
        purpose,
        anchorTargetId: cycle.origin.targetId,
        automationWindowId: cycle.origin.automationWindowId,
        anchorExpectedUrl: cycle.origin.expectedUrl,
      });
    } else {
      const ids = new Set((await this.browser.listTargets()).map((item) => item.id));
      if (ids.size !== 2 || !ids.has(cycle.origin.targetId) || !ids.has(target.id)) {
        throw new Error('CONTROLLER_PM_RECOVERY_TAB_SET_MISMATCH.');
      }
    }
    if (target.automationWindowId !== cycle.origin.automationWindowId) throw new Error('CONTROLLER_PM_WINDOW_MISMATCH.');
    cycle.pm = {
      targetId: target.id,
      automationWindowId: target.automationWindowId,
      expectedUrl: pmChat.bootstrapCapability.url,
      targetBindingSha256: targetBindingSha256({
        targetId: target.id,
        windowId: target.automationWindowId,
        providerSessionId: cycle.providerSessions.pm,
      }),
      closedAt: null,
    };
    cycle.step = 'PM_SEND_READY';
    cycle.pmTargetCreation = { ...cycle.pmTargetCreation, status: 'COMPLETE', completedAt: new Date().toISOString() };
    cycle.updatedAt = new Date().toISOString();
    cycle.lastError = null;
    state.controllerCycles[cycle.cycleId] = cycle;
    state = await this.stateStore.write(state);
    await this.#recordControllerStage(cycle, 'PM_SEND_READY');
    return this.#status('PM_SEND_READY', state.controllerCycles[cycle.cycleId]);
  }

  async #sendPm(state, cycle) {
    const pmChat = this.config.runtime.chats.find((chat) => chat.supervisorId === cycle.pmSupervisorId);
    const target = await this.browser.requireExactOwnedTarget({
      targetId: cycle.pm.targetId,
      automationWindowId: cycle.pm.automationWindowId,
      expectedUrl: cycle.pm.expectedUrl,
    });
    const prompt = pmPrompt(cycle);
    const result = await this.#submitArtifactMessage({
      state, cycle, lane: 'pm', target, expectedUrl: cycle.pm.expectedUrl, prompt,
      chat: pmChat, readyStep: 'PM_SEND_READY', startedStep: 'PM_SEND_STARTED', waitingStep: 'WAIT_PM_ARTIFACT',
    });
    await this.#recordControllerStage(result.cycle, 'WAIT_PM_ARTIFACT');
    return this.#status('WAIT_PM_ARTIFACT', result.cycle);
  }

  async #submitArtifactMessage({ state, cycle, lane, target, expectedUrl, prompt, chat, readyStep, startedStep, waitingStep }) {
    if (cycle.step !== readyStep) throw new Error(`Controller lane ${lane} is not ready to send.`);
    let model;
    const promptSha256 = sha256(prompt);
    let start;
    try {
      start = await this.submissionPacer.submit({
        context: submissionSchedulerContext({
          chat, target, expectedUrl,
          providerSessionId: lane === 'origin' ? cycle.bindingProviderSessionId : cycle.providerSessions?.[lane],
          requestId: cycle.requestId, queueKey: `controller:${cycle.cycleId}:${lane}`,
          sendPath: `CONTROLLER_${lane.toUpperCase()}`, bodySha256: promptSha256,
        }),
        beforeSubmit: async () => {
          model = await this.browser.ensureExactConsumerControls(target, { expectedUrl, controls: chat.consumerControls });
          state = await this.stateStore.read();
          cycle = state.controllerCycles[cycle.cycleId];
          const intentAt = new Date().toISOString();
          cycle.step = startedStep;
          cycle.sends[lane] = {
            status: 'INTENT_RECORDED', promptSha256, bodyLength: prompt.length,
            attempt: (cycle.sends[lane]?.attempt ?? 0) + 1,
            intentRecordedAt: intentAt, boundaryObservedAt: null, generationCompletedAt: null,
          };
          cycle.updatedAt = intentAt;
          cycle.lastError = null;
          state.controllerCycles[cycle.cycleId] = cycle;
          await this.stateStore.write(state);
        },
        recordBoundary: (boundaryState, { boundaryAt, result }) => {
          const boundaryCycle = boundaryState.controllerCycles?.[cycle.cycleId];
          if (!boundaryCycle || boundaryCycle.step !== startedStep
            || !['INTENT_RECORDED', 'CLICK_BOUNDARY_PERSISTED'].includes(boundaryCycle.sends?.[lane]?.status)
            || boundaryCycle.sends[lane].promptSha256 !== promptSha256) {
            throw new Error(`CONTROLLER_${lane.toUpperCase()}_ATOMIC_BOUNDARY_INTENT_MISMATCH.`);
          }
          if (result?.generationStarted !== true) {
            boundaryCycle.sends[lane] = {
              ...boundaryCycle.sends[lane],
              status: 'CLICK_BOUNDARY_PERSISTED',
              boundaryObservedAt: boundaryAt,
              clickedAtObserved: result?.clickedAtObserved ?? boundaryAt,
            };
            boundaryCycle.updatedAt = new Date().toISOString();
            boundaryState.controllerCycles[boundaryCycle.cycleId] = boundaryCycle;
            return;
          }
          const laneState = lane === 'origin' ? boundaryCycle.origin : boundaryCycle.pm;
          laneState.expectedUrl = result.conversationUrl;
          boundaryCycle.sends[lane] = {
            ...boundaryCycle.sends[lane],
            status: 'BOUNDARY_VERIFIED',
            boundaryObservedAt: boundaryAt,
            generationStartedAt: result.startedAtObserved,
            startSignal: result.startSignal ?? null,
          };
          boundaryCycle.step = waitingStep;
          boundaryCycle.updatedAt = new Date().toISOString();
          boundaryCycle.lastError = null;
          boundaryState.controllerCycles[boundaryCycle.cycleId] = boundaryCycle;
        },
        submit: async (onSubmissionBoundary, _admission, onBeforeSubmissionBoundary) => {
          const messageApps = await this.browser.selectAppsForMessage(target, {
            knownLabels: [chat.requiredApps.missionControl, chat.requiredApps.github],
            requiredLabels: [chat.requiredApps.github],
            referencedLabels: [],
          });
          const submitted = await this.browser.submitExactMessage(target, {
            expectedUrl, body: prompt, bodySha256: promptSha256, onBeforeSubmissionBoundary, onSubmissionBoundary,
          });
          return { ...submitted, messageApps };
        },
      });
    } catch (error) {
      if (!isGlobalSubmissionCooldown(error) && !crossedSendBoundary(error)) {
        state = await this.stateStore.read();
        cycle = state.controllerCycles[cycle.cycleId];
        cycle.step = readyStep;
        cycle.sends[lane] = { ...cycle.sends[lane], status: 'FAILED_PRECLICK', failedAt: new Date().toISOString(), failureStage: error?.relayStage ?? 'UNKNOWN' };
        cycle.updatedAt = cycle.sends[lane].failedAt;
        state.controllerCycles[cycle.cycleId] = cycle;
        await this.stateStore.write(state);
      } else if (crossedSendBoundary(error)) {
        state = await this.stateStore.read();
        cycle = state.controllerCycles[cycle.cycleId];
        cycle.sends[lane] = {
          ...cycle.sends[lane],
          boundaryObservedAt: error.clickedAtObserved ?? error.startedAtObserved ?? state.submissionPacing?.lastSubmissionAt ?? null,
          failureStage: error.relayStage ?? 'CLICKED',
        };
        cycle.updatedAt = new Date().toISOString();
        state.controllerCycles[cycle.cycleId] = cycle;
        await this.stateStore.write(state);
      }
      throw error;
    }
    state = await this.stateStore.read();
    cycle = state.controllerCycles[cycle.cycleId];
    if (cycle.step !== waitingStep || cycle.sends?.[lane]?.status !== 'BOUNDARY_VERIFIED'
      || (lane === 'origin' ? cycle.origin.expectedUrl : cycle.pm.expectedUrl) !== start.conversationUrl) {
      throw new Error(`CONTROLLER_${lane.toUpperCase()}_ATOMIC_BOUNDARY_PERSISTENCE_MISSING.`);
    }
    return { state, cycle: state.controllerCycles[cycle.cycleId] };
  }

  async #prepareReturn(state, cycle, route) {
    ({ state, cycle } = await this.#navigateOriginRestartSafe(state, cycle, 'return', `controller-return:${cycle.cycleId}`));
    const target = await this.browser.requireExactOwnedTarget({
      targetId: cycle.origin.targetId,
      automationWindowId: cycle.origin.automationWindowId,
      expectedUrl: ROOT_URL,
    });
    const step = decisionStep(route);
    await this.browser.ensureExactConsumerControls(target, {
      expectedUrl: ROOT_URL,
      controls: route.chat.consumerControls,
    });
    const sessionId = cycle.providerSessions.return;
    if (!cycle.returnPreparation) {
      const openedAt = new Date().toISOString();
      cycle.returnPreparation = {
        status: 'INTENT_RECORDED',
        openedAt,
        modelReceiptId: `provider-session-model:${sessionId}:${sha256(openedAt).slice(0, 12)}`,
        sessionProjectedAt: null,
        pmCleanupIntentAt: null,
        completedAt: null,
      };
      cycle.updatedAt = openedAt;
      state.controllerCycles[cycle.cycleId] = cycle;
      state = await this.stateStore.write(state);
    }
    const { openedAt, modelReceiptId } = cycle.returnPreparation;
    await this.missionControl.recordEvidence(route.workerId, {
      receiptId: modelReceiptId,
      summary: PROVIDER_SESSION_MODEL_SUMMARY,
      refs: [
        `request:${route.requestId}`, `supervisor:${route.supervisorId}`, `provider_session:${sessionId}`,
        `session_role:${step}_SESSION`, `binding_provider_session:${cycle.bindingProviderSessionId}`,
        `decision_provider_session:${sessionId}`, ...consumerControlRefs(route.chat.consumerControls),
        'assistant_content_observed:false', 'backend_model_identity_claimed:false', `opened_at:${openedAt}`,
      ],
      occurredAt: openedAt,
    });
    const session = {
      providerSessionId: sessionId,
      bindingProviderSessionId: cycle.bindingProviderSessionId,
      supervisorId: route.supervisorId,
      requestId: route.requestId,
      workerId: route.workerId,
      sessionRole: `${step}_SESSION`,
      cycleStep: step,
      messageOrdinal: 1,
      conversationUrl: null,
      openedAt,
      status: 'ACTIVE',
      modelReceiptId,
      firstTurnMcpReceiptId: null,
      targetId: target.id,
      controllerCycleId: cycle.cycleId,
    };
    state.providerSessions[sessionId] = session;
    state.deliveries[route.routeKey] = {
      ...(state.deliveries[route.routeKey] ?? {}),
      providerSessionId: sessionId,
      decisionProviderSessionId: sessionId,
      bindingProviderSessionId: cycle.bindingProviderSessionId,
      cycleStep: step,
    };
    cycle.returnPreparation.status = 'SESSION_PERSISTED';
    cycle.updatedAt = new Date().toISOString();
    cycle.lastError = null;
    state.controllerCycles[cycle.cycleId] = cycle;
    state = await this.stateStore.write(state);
    await this.#recordProviderSession(route, session, 'PENDING_PROVIDER_ASSIGNMENT');
    await this.#waitForSessionProjection(route, session);
    state = await this.stateStore.read();
    cycle = state.controllerCycles[cycle.cycleId];
    cycle.returnPreparation.status = 'SESSION_PROJECTED';
    cycle.returnPreparation.sessionProjectedAt = new Date().toISOString();
    if (!cycle.returnPreparation.pmCleanupIntentAt) cycle.returnPreparation.pmCleanupIntentAt = new Date().toISOString();
    cycle.updatedAt = cycle.returnPreparation.pmCleanupIntentAt;
    state.controllerCycles[cycle.cycleId] = cycle;
    state = await this.stateStore.write(state);
    if (cycle.pm && !cycle.pm.closedAt) {
      let pmExists = true;
      try {
        await this.browser.requireExactOwnedTarget({
          targetId: cycle.pm.targetId,
          automationWindowId: cycle.pm.automationWindowId,
          expectedUrl: cycle.pm.expectedUrl,
        });
      } catch (error) {
        if (!String(error?.message ?? '').startsWith('EXACT_BROWSER_TARGET_MISSING')) throw error;
        pmExists = false;
      }
      if (pmExists) await this.browser.closeTarget(cycle.pm.targetId);
      state = await this.stateStore.read();
      cycle = state.controllerCycles[cycle.cycleId];
      cycle.pm.closedAt = new Date().toISOString();
      cycle.updatedAt = cycle.pm.closedAt;
      state.controllerCycles[cycle.cycleId] = cycle;
      state = await this.stateStore.write(state);
    }
    state = await this.stateStore.read();
    cycle = state.controllerCycles[cycle.cycleId];
    cycle.step = 'RETURN_SEND_READY';
    cycle.returnPreparation.status = 'COMPLETE';
    cycle.returnPreparation.completedAt = new Date().toISOString();
    cycle.updatedAt = cycle.returnPreparation.completedAt;
    state.controllerCycles[cycle.cycleId] = cycle;
    state = await this.stateStore.write(state);
    await this.#recordControllerStage(cycle, 'RETURN_SEND_READY');
    return this.#status('RETURN_SEND_READY', state.controllerCycles[cycle.cycleId]);
  }

  async #sendReturn(state, cycle, route) {
    const target = await this.browser.requireExactOwnedTarget({
      targetId: cycle.origin.targetId,
      automationWindowId: cycle.origin.automationWindowId,
      expectedUrl: cycle.origin.expectedUrl,
    });
    const step = decisionStep(route);
    route = {
      ...route,
      providerSessionId: cycle.providerSessions.return,
      bindingProviderSessionId: cycle.bindingProviderSessionId,
      bindingCapsule: state.deliveries[route.routeKey].bindingCapsule,
      providerSession: state.providerSessions[cycle.providerSessions.return],
      controllerPmArtifact: cycle.consumedArtifacts.pm,
    };
    let model;
    const prompt = returnPrompt(cycle, route, step);
    const promptSha256 = sha256(prompt);
    let start;
    try {
      start = await this.submissionPacer.submit({
        context: submissionSchedulerContext({
          chat: route.chat, target, expectedUrl: ROOT_URL, providerSessionId: cycle.providerSessions.return,
          requestId: cycle.requestId, queueKey: `controller:${cycle.cycleId}:return`,
          sendPath: 'CONTROLLER_RETURN', bodySha256: promptSha256,
        }),
        beforeSubmit: async () => {
          model = await this.browser.ensureExactConsumerControls(target, { expectedUrl: ROOT_URL, controls: route.chat.consumerControls });
          state = await this.stateStore.read();
          cycle = state.controllerCycles[cycle.cycleId];
          const intentAt = new Date().toISOString();
          cycle.step = 'RETURN_SEND_STARTED';
          cycle.sends.return = {
            status: 'INTENT_RECORDED', promptSha256, bodyLength: prompt.length,
            attempt: (cycle.sends.return?.attempt ?? 0) + 1,
            intentRecordedAt: intentAt, boundaryObservedAt: null, generationCompletedAt: null,
          };
          cycle.updatedAt = intentAt;
          state.controllerCycles[cycle.cycleId] = cycle;
          const delivery = state.deliveries[route.routeKey];
          state.deliveries[route.routeKey] = {
            ...delivery, status: 'SUBMISSION_INTENT_RECORDED', requestId: route.requestId,
            workerId: route.workerId, supervisorId: route.supervisorId,
            providerSessionId: cycle.providerSessions.return, decisionProviderSessionId: cycle.providerSessions.return,
            bindingProviderSessionId: cycle.bindingProviderSessionId, cycleStep: step,
            reasoningLane: route.packet.reasoningLane, modelUiLabel: model.modelVisibleLabel,
            promptSha256, bodySha256: promptSha256, bodyLength: prompt.length,
            targetId: cycle.origin.targetId, intentRecordedAt: intentAt, lastAttemptAt: intentAt,
          };
          await this.stateStore.write(state);
        },
        recordBoundary: (boundaryState, { boundaryAt, result }) => {
          const boundaryCycle = boundaryState.controllerCycles?.[cycle.cycleId];
          if (!boundaryCycle || boundaryCycle.step !== 'RETURN_SEND_STARTED'
            || !['INTENT_RECORDED', 'CLICK_BOUNDARY_PERSISTED'].includes(boundaryCycle.sends?.return?.status)
            || boundaryCycle.sends.return.promptSha256 !== promptSha256) {
            throw new Error('CONTROLLER_RETURN_ATOMIC_BOUNDARY_INTENT_MISMATCH.');
          }
          if (result?.generationStarted !== true) {
            boundaryCycle.sends.return = {
              ...boundaryCycle.sends.return,
              status: 'CLICK_BOUNDARY_PERSISTED',
              boundaryObservedAt: boundaryAt,
              clickedAtObserved: result?.clickedAtObserved ?? boundaryAt,
            };
            boundaryCycle.updatedAt = new Date().toISOString();
            boundaryState.controllerCycles[boundaryCycle.cycleId] = boundaryCycle;
            return;
          }
          const boundarySession = boundaryState.providerSessions?.[boundaryCycle.providerSessions.return];
          if (!boundarySession || boundarySession.targetId !== boundaryCycle.origin.targetId) {
            throw new Error('CONTROLLER_RETURN_ATOMIC_BOUNDARY_SESSION_MISMATCH.');
          }
          boundaryCycle.origin.expectedUrl = result.conversationUrl;
          boundaryCycle.sends.return = {
            ...boundaryCycle.sends.return,
            status: 'BOUNDARY_VERIFIED',
            boundaryObservedAt: boundaryAt,
            generationStartedAt: result.startedAtObserved,
            startSignal: result.startSignal ?? null,
          };
          boundaryCycle.step = 'RETURN_SEND_STARTED';
          boundaryCycle.updatedAt = new Date().toISOString();
          boundaryState.controllerCycles[boundaryCycle.cycleId] = boundaryCycle;
          boundaryState.providerSessions[boundarySession.providerSessionId] = {
            ...boundarySession,
            conversationUrl: result.conversationUrl,
            urlBoundAt: result.startedAtObserved,
          };
          boundaryState.deliveries[route.routeKey] = {
            ...boundaryState.deliveries[route.routeKey],
            status: `${step}_GENERATION_STARTED`,
            generationStarted: true,
            generationStartedAt: result.startedAtObserved,
            generationStart: result,
            conversationUrl: result.conversationUrl,
          };
        },
        submit: (onSubmissionBoundary, _admission, onBeforeSubmissionBoundary) => this.browser.submitExactMessage(target, {
          expectedUrl: ROOT_URL, body: prompt, bodySha256: promptSha256, onBeforeSubmissionBoundary, onSubmissionBoundary,
        }),
      });
    } catch (error) {
      if (!isGlobalSubmissionCooldown(error) && !crossedSendBoundary(error)) {
        state = await this.stateStore.read();
        cycle = state.controllerCycles[cycle.cycleId];
        cycle.step = 'RETURN_SEND_READY';
        cycle.sends.return = { ...cycle.sends.return, status: 'FAILED_PRECLICK', failedAt: new Date().toISOString(), failureStage: error?.relayStage ?? 'UNKNOWN' };
        cycle.updatedAt = cycle.sends.return.failedAt;
        state.controllerCycles[cycle.cycleId] = cycle;
        state.deliveries[route.routeKey] = { ...state.deliveries[route.routeKey], status: 'CONTROLLER_RETURN_FAILED_PRECLICK' };
        await this.stateStore.write(state);
      } else if (crossedSendBoundary(error)) {
        state = await this.stateStore.read();
        cycle = state.controllerCycles[cycle.cycleId];
        cycle.sends.return = {
          ...cycle.sends.return,
          boundaryObservedAt: error.clickedAtObserved ?? error.startedAtObserved ?? state.submissionPacing?.lastSubmissionAt ?? null,
          failureStage: error.relayStage ?? 'CLICKED',
        };
        cycle.updatedAt = new Date().toISOString();
        state.controllerCycles[cycle.cycleId] = cycle;
        await this.stateStore.write(state);
      }
      throw error;
    }
    state = await this.stateStore.read();
    cycle = state.controllerCycles[cycle.cycleId];
    const session = state.providerSessions[cycle.providerSessions.return];
    if (cycle.step !== 'RETURN_SEND_STARTED' || cycle.sends?.return?.status !== 'BOUNDARY_VERIFIED'
      || cycle.origin.expectedUrl !== start.conversationUrl || session?.conversationUrl !== start.conversationUrl) {
      throw new Error('CONTROLLER_RETURN_ATOMIC_BOUNDARY_PERSISTENCE_MISSING.');
    }
    return this.#completeReturnTransport(state, cycle, route);
  }

  async #completeReturnTransport(state, cycle, route) {
    const send = cycle.sends.return;
    const step = decisionStep(route);
    let session = state.providerSessions[cycle.providerSessions.return];
    if (!send || send.status !== 'BOUNDARY_VERIFIED' || !send.generationStartedAt || !send.promptSha256
      || !session?.conversationUrl || session.targetId !== cycle.origin.targetId) {
      throw new Error('RETURN_TRANSPORT_START_EVIDENCE_INCOMPLETE.');
    }
    const target = await this.browser.requireExactOwnedTarget({
      targetId: cycle.origin.targetId,
      automationWindowId: cycle.origin.automationWindowId,
      expectedUrl: session.conversationUrl,
    });
    route = {
      ...route,
      providerSessionId: session.providerSessionId,
      bindingProviderSessionId: cycle.bindingProviderSessionId,
      bindingCapsule: state.deliveries[route.routeKey].bindingCapsule,
      providerSession: session,
      controllerPmArtifact: cycle.consumedArtifacts.pm,
    };
    await this.#recordProviderSession(route, session, 'EXACT');
    await this.#recordRelayStage(route, step, state.deliveries[route.routeKey].modelUiLabel, send.promptSha256, 'STARTED', send.generationStartedAt, send.startSignal ?? null);
    let completion = state.deliveries[route.routeKey].generationCompletion ?? null;
    if (send.generationCompletedAt && session.status === 'COMPLETE') {
      completion ??= {
        status: 'GENERATION_COMPLETE', generationStarted: true,
        completedAtObserved: send.generationCompletedAt, inspectedAssistantOutput: false,
      };
      await this.#recordRelayStage(route, step, state.deliveries[route.routeKey].modelUiLabel, send.promptSha256, 'COMPLETE', send.generationCompletedAt, null);
    } else {
      completion = await this.browser.waitForGenerationComplete(target, {
        expectedUrl: session.conversationUrl,
        generationStarted: true,
        allowSameChatRecovery: false,
      });
      await this.#recordRelayStage(route, step, state.deliveries[route.routeKey].modelUiLabel, send.promptSha256, 'COMPLETE', completion.completedAtObserved, null);
      state = await this.stateStore.read();
      cycle = state.controllerCycles[cycle.cycleId];
      cycle.sends.return.generationCompletedAt = completion.completedAtObserved;
      cycle.updatedAt = new Date().toISOString();
      state.controllerCycles[cycle.cycleId] = cycle;
      session = { ...state.providerSessions[cycle.providerSessions.return], status: 'COMPLETE', completedAt: completion.completedAtObserved };
      state.providerSessions[session.providerSessionId] = session;
      state.deliveries[route.routeKey] = {
        ...state.deliveries[route.routeKey], status: `${step}_COMPLETE`,
        generationCompletedAt: completion.completedAtObserved, generationCompletion: completion,
      };
      state = await this.stateStore.write(state);
    }
    route = { ...route, providerSession: session };
    await this.#recordProviderSession(route, session, 'EXACT');
    state = await this.stateStore.read();
    cycle = state.controllerCycles[cycle.cycleId];
    cycle.step = 'WAIT_RETURN_ARTIFACT_OR_ACK';
    cycle.updatedAt = new Date().toISOString();
    state.controllerCycles[cycle.cycleId] = cycle;
    state = await this.stateStore.write(state);
    await this.#recordControllerStage(cycle, 'WAIT_RETURN_ARTIFACT_OR_ACK');
    return this.#status('WAIT_RETURN_ARTIFACT_OR_ACK', state.controllerCycles[cycle.cycleId]);
  }

  #findFinalProof(snapshot, cycle, route) {
    if (!route.decisionReceipt) return null;
    const receipt = route.decisionReceipt;
    const pm = cycle.consumedArtifacts.pm;
    if (!pm || receipt.request_id !== cycle.requestId || receipt.worker !== cycle.workerId
      || receipt.supervisor_id !== cycle.originSupervisorId
      || receipt.decision_provider_session_id !== cycle.providerSessions.return
      || receipt.binding_provider_session_id !== cycle.bindingProviderSessionId
      || receipt.decision_block?.exact_text !== route.packet.continuationOwnerResponseExactText
      || receipt.decision_block?.sha256 !== cycle.ownerBytesSha256
      || pm.semanticPayloadSha256 !== cycle.ownerBytesSha256
      || canonicalJson(receipt.continuation_binding) !== canonicalJson(route.packet.continuationBinding)
      || receipt.continuation_binding_sha256 !== route.packet.continuationBindingSha256) {
      throw new Error('FINAL_CONTROLLER_RECEIPT_BINDING_OR_OWNER_BYTES_MISMATCH.');
    }
    const worker = snapshot.workers.find((item) => item.id === cycle.workerId);
    const resolution = worker?.timeline?.find((event) => event?.data?.type === 'reasoning_message_recorded'
      && event.data.message_id === `github-owner-resolution:${route.packet.continuationBinding.continuation_id}`
      && event.data.thread_id === cycle.providerSessions.return
      && event.data.parent_message_id === route.packet.continuationBinding.supervisor_delivery.message_id
      && event.data.body_sha256 === cycle.ownerBytesSha256
      && event.data.exact_visible_body === route.packet.continuationOwnerResponseExactText
      && event.data.sent_at_source === null
      && event.data.provenance_status === 'UNVERIFIED');
    if (!resolution) throw new Error('FINAL_CONTROLLER_MISSION_CONTROL_RESOLUTION_MISSING.');
    return { receipt, resolution };
  }

  async #complete(state, cycle, route, final) {
    const receipt = final.receipt;
    state.deliveries[route.routeKey] = {
      ...(state.deliveries[route.routeKey] ?? {}), status: 'DECISION_RECEIPT_INGESTED',
      receiptId: receipt.receipt_id, receivedAt: new Date().toISOString(),
    };
    cycle.step = TERMINAL_STEP;
    cycle.updatedAt = new Date().toISOString();
    cycle.lastError = null;
    cycle.final = {
      receiptId: receipt.receipt_id,
      githubCommentId: String(receipt.github_receipt.comment_id),
      immutableUrl: receipt.github_receipt.immutable_url,
      decisionBlockSha256: receipt.decision_block.sha256,
      providerSessionId: receipt.decision_provider_session_id,
      missionControlResolutionMessageId: final.resolution.data.message_id,
      providerSourceTimestamp: null,
      provenanceStatus: 'UNVERIFIED',
      completedAt: cycle.updatedAt,
    };
    state.controllerCycles[cycle.cycleId] = cycle;
    state = await this.stateStore.write(state);
    await this.#recordControllerStage(cycle, TERMINAL_STEP);
    return this.#status('CONTROLLER_CYCLE_COMPLETE', state.controllerCycles[cycle.cycleId]);
  }

  #validateRoute(cycle, route) {
    if (route.eventId !== cycle.routeEventId || route.bodySha256 !== cycle.routeBodySha256
      || route.workerId !== cycle.workerId || route.supervisorId !== cycle.originSupervisorId
      || route.packet.routeSchemaVersion !== 4
      || sha256(route.packet.continuationOwnerResponseExactText) !== cycle.ownerBytesSha256
      || route.packet.githubReceipt.repository !== cycle.artifactChannel.repository
      || route.packet.githubReceipt.stageIssueNumber !== cycle.artifactChannel.issueNumber
      || route.packet.expiresAt !== cycle.expiresAt) {
      throw new Error('CONTROLLER_ROUTE_CHANGED_OR_STALE.');
    }
  }

  #originExpectation(cycle, route) {
    return {
      artifactKind: CONTROLLER_ARTIFACT_KINDS.ORIGIN,
      cycleId: cycle.cycleId,
      taskId: cycle.taskId,
      requestId: cycle.requestId,
      artifactNonce: cycle.artifactNonces.origin,
      producerSupervisorId: cycle.originSupervisorId,
      consumerSupervisorId: cycle.pmSupervisorId,
      sourceProviderSessionId: cycle.providerSessions.origin,
      sourceTargetBindingSha256: cycle.origin.targetBindingSha256,
      controllerBindingSha256: cycle.controllerBindingSha256,
      ownerBytesSha256: cycle.ownerBytesSha256,
      ownerExactText: route.packet.continuationOwnerResponseExactText,
      predecessor: null,
      notBefore: artifactNotBefore(cycle.sends.origin, 'origin'),
      notAfter: cycle.expiresAt,
    };
  }

  async #reconcileArtifactOnSchedule(state, cycle, lane, expectation) {
    cycle.artifactPolling ??= { origin: null, pm: null };
    const prior = cycle.artifactPolling[lane];
    const nowMs = Date.now();
    const nextMs = Date.parse(prior?.nextPollAt ?? '');
    if (Number.isFinite(nextMs) && nowMs < nextMs) {
      return { state, cycle, due: false, artifact: null };
    }
    const reservedAt = new Date(nowMs).toISOString();
    cycle.artifactPolling[lane] = {
      intervalMs: ARTIFACT_POLL_INTERVAL_MS,
      reservedAt,
      nextPollAt: new Date(nowMs + ARTIFACT_POLL_INTERVAL_MS).toISOString(),
    };
    state.controllerCycles[cycle.cycleId] = cycle;
    state = await this.stateStore.write(state);
    cycle = state.controllerCycles[cycle.cycleId];
    const artifact = await this.githubFactory(cycle).reconcile(expectation);
    return { state, cycle, due: true, artifact };
  }

  async #confirmArtifactSendBoundary(state, cycle, lane, artifact) {
    const send = cycle.sends?.[lane];
    if (!send || send.status === 'BOUNDARY_VERIFIED' || send.status === 'ARTIFACT_CONFIRMED_BOUNDARY') {
      return { state, cycle };
    }
    if (!['INTENT_RECORDED', 'CLICK_BOUNDARY_PERSISTED'].includes(send.status)) {
      throw new Error(`CONTROLLER_${lane.toUpperCase()}_SEND_BOUNDARY_STATE_INVALID.`);
    }
    const laneState = lane === 'origin' ? cycle.origin : cycle.pm;
    const exact = await this.browser.inspectExactOwnedTargetIdentity({
      targetId: laneState.targetId,
      automationWindowId: laneState.automationWindowId,
    });
    if (lane === 'origin') {
      if (laneState.expectedUrl !== ROOT_URL || exact.url === ROOT_URL) {
        throw new Error('CONTROLLER_ORIGIN_POST_CLICK_TARGET_TRANSITION_MISSING.');
      }
      laneState.expectedUrl = exact.url;
    } else if (exact.url !== laneState.expectedUrl) {
      throw new Error('CONTROLLER_PM_POST_CLICK_TARGET_CHANGED.');
    }
    const boundaryAt = send.boundaryObservedAt ?? send.intentRecordedAt;
    if (!Number.isFinite(Date.parse(boundaryAt ?? ''))) throw new Error(`CONTROLLER_${lane.toUpperCase()}_SEND_TIME_MISSING.`);
    cycle.sends[lane] = {
      ...send,
      status: 'ARTIFACT_CONFIRMED_BOUNDARY',
      boundaryObservedAt: boundaryAt,
      artifactConfirmedAt: artifact.createdAt,
    };
    cycle.updatedAt = new Date().toISOString();
    state.controllerCycles[cycle.cycleId] = cycle;
    const priorPacingMs = Date.parse(state.submissionPacing?.lastSubmissionAt ?? '');
    const artifactMs = Date.parse(artifact.createdAt ?? '');
    if (Number.isFinite(artifactMs) && (!Number.isFinite(priorPacingMs) || artifactMs > priorPacingMs)) {
      state.submissionPacing = { lastSubmissionAt: artifact.createdAt };
    }
    state = await this.stateStore.write(state);
    return { state, cycle: state.controllerCycles[cycle.cycleId] };
  }

  async #recoverReturnClickBoundary(state, cycle, route) {
    const send = cycle.sends?.return;
    if (!send || send.status === 'BOUNDARY_VERIFIED') return { state, cycle };
    if (!['INTENT_RECORDED', 'CLICK_BOUNDARY_PERSISTED'].includes(send.status)) return { state, cycle };
    if (cycle.origin.expectedUrl !== ROOT_URL) throw new Error('CONTROLLER_RETURN_RECOVERY_SOURCE_URL_CHANGED.');
    const exact = await this.browser.inspectExactOwnedTargetIdentity({
      targetId: cycle.origin.targetId,
      automationWindowId: cycle.origin.automationWindowId,
    });
    if (exact.url === ROOT_URL) return { state, cycle };
    const recoveredAt = new Date().toISOString();
    const boundaryAt = send.boundaryObservedAt ?? send.intentRecordedAt;
    if (!Number.isFinite(Date.parse(boundaryAt ?? ''))) throw new Error('CONTROLLER_RETURN_SEND_TIME_MISSING.');
    const session = state.providerSessions?.[cycle.providerSessions.return];
    if (!session || session.targetId !== cycle.origin.targetId || session.conversationUrl !== null) {
      throw new Error('CONTROLLER_RETURN_RECOVERY_SESSION_MISMATCH.');
    }
    const recoveredStart = {
      status: 'GENERATION_STARTED',
      targetId: exact.id,
      conversationUrl: exact.url,
      bodySha256: send.promptSha256,
      bodyLength: send.bodyLength,
      clickedAtObserved: boundaryAt,
      generationStarted: true,
      startSignal: 'CONVERSATION_URL_ASSIGNED',
      startedAtObserved: boundaryAt,
      providerSourceTime: null,
      inspectedAssistantOutput: false,
      limitations: ['Generation start was recovered only from the durable click intent and exact bound target URL transition; assistant content was not inspected.'],
    };
    cycle.origin.expectedUrl = exact.url;
    cycle.sends.return = {
      ...send,
      status: 'BOUNDARY_VERIFIED',
      boundaryObservedAt: boundaryAt,
      generationStartedAt: boundaryAt,
      startSignal: recoveredStart.startSignal,
      recoveryObservedAt: recoveredAt,
    };
    cycle.updatedAt = recoveredAt;
    state.controllerCycles[cycle.cycleId] = cycle;
    state.providerSessions[session.providerSessionId] = {
      ...session,
      conversationUrl: exact.url,
      urlBoundAt: recoveredAt,
    };
    const step = decisionStep(route);
    state.deliveries[route.routeKey] = {
      ...state.deliveries[route.routeKey],
      status: `${step}_GENERATION_STARTED`,
      generationStarted: true,
      generationStartedAt: recoveredAt,
      generationStart: recoveredStart,
      conversationUrl: exact.url,
    };
    const priorPacingMs = Date.parse(state.submissionPacing?.lastSubmissionAt ?? '');
    if (!Number.isFinite(priorPacingMs) || Date.parse(recoveredAt) > priorPacingMs) {
      state.submissionPacing = { lastSubmissionAt: recoveredAt };
    }
    state = await this.stateStore.write(state);
    return { state, cycle: state.controllerCycles[cycle.cycleId] };
  }

  async #revalidateConsumedArtifacts(cycle, route) {
    const github = this.githubFactory(cycle);
    if (cycle.consumedArtifacts.origin) {
      const current = await github.reconcile(this.#originExpectation(cycle, route));
      if (!current || !sameArtifactReceipt(cycle.consumedArtifacts.origin, current)) {
        throw new Error('CONSUMED_ORIGIN_ARTIFACT_CHANGED_OR_MISSING.');
      }
    }
    if (cycle.consumedArtifacts.pm) {
      const current = await github.reconcile(this.#pmExpectation(cycle, route));
      if (!current || !sameArtifactReceipt(cycle.consumedArtifacts.pm, current)) {
        throw new Error('CONSUMED_PM_ARTIFACT_CHANGED_OR_MISSING.');
      }
    }
  }

  async #navigateOriginRestartSafe(state, cycle, lane, purpose) {
    cycle.navigations ??= { origin: null, return: null };
    let navigation = cycle.navigations[lane];
    if (!navigation) {
      navigation = {
        status: 'INTENT_RECORDED',
        targetBindingSha256: cycle.origin.targetBindingSha256,
        fromUrl: cycle.origin.expectedUrl,
        toUrl: ROOT_URL,
        intentRecordedAt: new Date().toISOString(),
        completedAt: null,
      };
      cycle.navigations[lane] = navigation;
      cycle.updatedAt = navigation.intentRecordedAt;
      state.controllerCycles[cycle.cycleId] = cycle;
      state = await this.stateStore.write(state);
    }
    if (navigation.targetBindingSha256 !== cycle.origin.targetBindingSha256 || navigation.toUrl !== ROOT_URL) {
      throw new Error('CONTROLLER_NAVIGATION_BINDING_MISMATCH.');
    }
    let target;
    try {
      target = await this.browser.requireExactOwnedTarget({
        targetId: cycle.origin.targetId,
        automationWindowId: cycle.origin.automationWindowId,
        expectedUrl: navigation.toUrl,
      });
    } catch {
      await this.browser.requireExactOwnedTarget({
        targetId: cycle.origin.targetId,
        automationWindowId: cycle.origin.automationWindowId,
        expectedUrl: navigation.fromUrl,
      });
      target = await this.browser.navigateExactOwnedTarget({
        targetId: cycle.origin.targetId,
        automationWindowId: cycle.origin.automationWindowId,
        expectedUrl: navigation.fromUrl,
        url: navigation.toUrl,
        purpose,
      });
    }
    state = await this.stateStore.read();
    cycle = state.controllerCycles[cycle.cycleId];
    cycle.origin.expectedUrl = navigation.toUrl;
    cycle.navigations[lane] = {
      ...cycle.navigations[lane],
      status: 'COMPLETE',
      completedAt: new Date().toISOString(),
    };
    cycle.updatedAt = cycle.navigations[lane].completedAt;
    state.controllerCycles[cycle.cycleId] = cycle;
    state = await this.stateStore.write(state);
    return { state, cycle, target };
  }

  #pmExpectation(cycle, route) {
    const origin = cycle.consumedArtifacts.origin;
    if (!origin || !cycle.pm) throw new Error('PM artifact cannot be reconciled before the exact origin artifact and PM target are bound.');
    return {
      artifactKind: CONTROLLER_ARTIFACT_KINDS.PM,
      cycleId: cycle.cycleId,
      taskId: cycle.taskId,
      requestId: cycle.requestId,
      artifactNonce: cycle.artifactNonces.pm,
      producerSupervisorId: cycle.pmSupervisorId,
      consumerSupervisorId: cycle.originSupervisorId,
      sourceProviderSessionId: cycle.providerSessions.pm,
      sourceTargetBindingSha256: cycle.pm.targetBindingSha256,
      controllerBindingSha256: cycle.controllerBindingSha256,
      ownerBytesSha256: cycle.ownerBytesSha256,
      ownerExactText: route.packet.continuationOwnerResponseExactText,
      predecessor: { comment_id: origin.commentId, body_sha256: origin.bodySha256 },
      notBefore: artifactNotBefore(cycle.sends.pm, 'pm'),
      notAfter: cycle.expiresAt,
    };
  }

  async #recordControllerStage(cycle, step, artifact = null) {
    return this.missionControl.recordEvidence(cycle.workerId, {
      receiptId: `pm-controller:${cycle.cycleId}:${step}:${sha256(`${cycle.updatedAt}:${artifact?.commentId ?? ''}`).slice(0, 12)}`,
      summary: CONTROLLER_STAGE_SUMMARY,
      refs: [
        `cycle:${cycle.cycleId}`, `task:${cycle.taskId}`, `request:${cycle.requestId}`,
        `origin_supervisor:${cycle.originSupervisorId}`, `pm_supervisor:${cycle.pmSupervisorId}`,
        `step:${step}`, `controller_binding_sha256:${cycle.controllerBindingSha256}`,
        `owner_bytes_sha256:${cycle.ownerBytesSha256}`, `origin_target_binding_sha256:${cycle.origin.targetBindingSha256}`,
        ...(cycle.pm?.targetBindingSha256 ? [`pm_target_binding_sha256:${cycle.pm.targetBindingSha256}`] : []),
        ...(artifact ? [`github_comment_id:${artifact.commentId}`, `github_body_sha256:${artifact.bodySha256}`] : []),
        'assistant_content_observed:false', 'semantic_authority:false',
      ],
      occurredAt: cycle.updatedAt,
    });
  }

  async #recordProviderSession(route, session, urlBindingStatus) {
    const occurredAt = session.completedAt ?? session.urlBoundAt ?? session.openedAt;
    return this.missionControl.recordEvidence(route.workerId, {
      receiptId: `provider-session:${session.providerSessionId}:${session.status}:${sha256(`${urlBindingStatus}:${occurredAt}`).slice(0, 12)}`,
      summary: PROVIDER_SESSION_SUMMARY,
      refs: [
        `request:${route.requestId}`, `supervisor:${route.supervisorId}`,
        `provider_session:${session.providerSessionId}`, `binding_provider_session:${session.bindingProviderSessionId}`,
        `decision_provider_session:${session.providerSessionId}`, `session_role:${session.sessionRole}`,
        'message_ordinal:1', `conversation_url:${session.conversationUrl ?? 'PENDING_PROVIDER_ASSIGNMENT'}`,
        `url_binding_status:${urlBindingStatus}`, `opened_at:${session.openedAt}`,
        `lifecycle_status:${session.status}`, `model_receipt:${session.modelReceiptId}`,
        'first_turn_mcp_receipt:PENDING', 'binding_preload_receipt:PENDING', 'semantic_authority:false',
      ],
      occurredAt,
    });
  }

  async #recordRelayStage(route, step, modelUiLabel, promptSha256, generationState, occurredAt, startSignal) {
    return this.missionControl.recordEvidence(route.workerId, {
      receiptId: `relay-stage:${route.requestId}:${step}:${generationState}:${sha256(occurredAt).slice(0, 12)}`,
      summary: RELAY_STAGE_SUMMARY,
      refs: [
        `request:${route.requestId}`, `supervisor:${route.supervisorId}`,
        `provider_session:${route.providerSessionId}`, `binding_provider_session:${route.bindingProviderSessionId}`,
        `decision_provider_session:${route.providerSessionId}`, `conversation_url:${route.providerSession.conversationUrl}`,
        `step:${step}`, 'message_ordinal:1', 'first_message:true', `model_ui_label:${modelUiLabel}`,
        ...consumerControlRefs(route.chat.consumerControls),
        `prompt_sha256:${promptSha256}`, `generation_state:${generationState}`, `observed_at:${occurredAt}`,
        'assistant_content_observed:false', 'backend_model_identity_claimed:false',
        'app_selection_attempted:false', 'app_selection_status:APP_SELECTION_NOT_ATTEMPTED',
        ...(startSignal ? [`generation_start_signal:${startSignal}`] : []),
        ...(route.controllerPmArtifact ? [
          `controller_pm_github_comment:${route.controllerPmArtifact.immutableUrl}`,
          `controller_pm_github_body_sha256:${route.controllerPmArtifact.bodySha256}`,
        ] : []),
        'semantic_authority:false',
      ],
      occurredAt,
    });
  }

  async #waitForSessionProjection(route, session) {
    const deadline = Date.now() + PROJECTION_TIMEOUT_MS;
    for (;;) {
      const snapshot = await this.missionControl.fetchFleet();
      const worker = snapshot.workers.find((item) => item.id === route.workerId);
      const visible = worker?.timeline?.some((event) => event?.data?.type === 'evidence_receipt_recorded'
        && event.data.summary === PROVIDER_SESSION_SUMMARY && event.data.verified === true
        && event.data.refs?.includes(`request:${route.requestId}`)
        && event.data.refs?.includes(`supervisor:${route.supervisorId}`)
        && event.data.refs?.includes(`provider_session:${session.providerSessionId}`)
        && event.data.refs?.includes('url_binding_status:PENDING_PROVIDER_ASSIGNMENT')
        && event.data.refs?.includes('lifecycle_status:ACTIVE'));
      if (visible) return;
      if (Date.now() >= deadline) throw new Error(`Return provider session ${session.providerSessionId} was not visible before send.`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  async #status(status, cycle, detail = {}) {
    const state = await this.stateStore.read();
    const value = {
      schemaVersion: 1,
      status,
      generatedAt: new Date().toISOString(),
      submitEnabled: this.config.runtime.submitEnabled,
      submissionPacing: this.submissionPacer.status(state),
      controllerCycle: publicControllerCycle(cycle),
      ...detail,
    };
    await this.stateStore.writeStatus(value);
    return value;
  }
}

export function parseControllerCycleSpec(value) {
  const keys = [
    'schemaVersion', 'cycleId', 'taskId', 'requestId', 'workerId', 'originSupervisorId', 'pmSupervisorId',
    'routeEventId', 'routeBodySha256', 'artifactRepository', 'artifactIssueNumber',
    'originArtifactNonce', 'pmArtifactNonce', 'authorizedWriterLogins',
  ];
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))
    || value.schemaVersion !== 1
    || !['cycleId', 'taskId', 'requestId', 'workerId', 'originSupervisorId', 'pmSupervisorId', 'routeEventId', 'artifactRepository', 'originArtifactNonce', 'pmArtifactNonce']
      .every((key) => typeof value[key] === 'string' && value[key].trim() !== '')
    || value.pmSupervisorId !== CONTROLLER_PM_ID
    || !/^[0-9a-f]{64}$/.test(value.routeBodySha256 ?? '')
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.artifactRepository)
    || !Number.isInteger(value.artifactIssueNumber) || value.artifactIssueNumber < 1
    || !Array.isArray(value.authorizedWriterLogins) || value.authorizedWriterLogins.length === 0
    || value.authorizedWriterLogins.some((login) => typeof login !== 'string' || login.trim() === '')) {
    throw new Error('Invalid exact controller cycle spec.');
  }
  return structuredClone(value);
}

export function publicControllerCycle(cycle) {
  return {
    cycleId: cycle.cycleId,
    taskId: cycle.taskId,
    requestId: cycle.requestId,
    workerId: cycle.workerId,
    originSupervisorId: cycle.originSupervisorId,
    pmSupervisorId: cycle.pmSupervisorId,
    step: cycle.step,
    controllerBindingSha256: cycle.controllerBindingSha256,
    ownerBytesSha256: cycle.ownerBytesSha256,
    originTargetBindingSha256: cycle.origin.targetBindingSha256,
    pmTargetBindingSha256: cycle.pm?.targetBindingSha256 ?? null,
    consumedArtifacts: Object.fromEntries(Object.entries(cycle.consumedArtifacts).map(([key, artifact]) => [key, artifact ? {
      commentId: artifact.commentId,
      immutableUrl: artifact.immutableUrl,
      bodySha256: artifact.bodySha256,
      authorLogin: artifact.authorLogin,
      createdAt: artifact.createdAt,
      artifactKind: artifact.artifactKind,
      semanticPayloadSha256: artifact.semanticPayloadSha256,
    } : null])),
    sends: cycle.sends,
    final: cycle.final,
    createdAt: cycle.createdAt,
    updatedAt: cycle.updatedAt,
    expiresAt: cycle.expiresAt,
    lastError: cycle.lastError ? publicErrorCode(cycle.lastError) : null,
  };
}

function originPrompt(cycle, route) {
  const artifact = {
    schema_version: 1,
    artifact_kind: CONTROLLER_ARTIFACT_KINDS.ORIGIN,
    cycle_id: cycle.cycleId,
    task_id: cycle.taskId,
    request_id: cycle.requestId,
    artifact_nonce: cycle.artifactNonces.origin,
    producer_supervisor_id: cycle.originSupervisorId,
    consumer_supervisor_id: cycle.pmSupervisorId,
    source_provider_session_id: cycle.providerSessions.origin,
    source_target_binding_sha256: cycle.origin.targetBindingSha256,
    controller_binding_sha256: cycle.controllerBindingSha256,
    predecessor: null,
    owner_bytes_sha256: cycle.ownerBytesSha256,
    semantic_payload: { exact_text: route.packet.continuationOwnerResponseExactText, sha256: cycle.ownerBytesSha256 },
  };
  return `Mission Control controller-mediated PM origin step for request ${cycle.requestId}. This is the first and only message in provider session ${cycle.providerSessions.origin}. Use the connected ${route.chat.requiredApps.github} app to write exactly one comment to https://github.com/${cycle.artifactChannel.repository}/issues/${cycle.artifactChannel.issueNumber}. The comment must be the exact prefix and JSON below:\n${CONTROLLER_ARTIFACT_PREFIX}${JSON.stringify(artifact)}\nPerform this ordinary GitHub write yourself in this reasoning chat. Do not delegate any GitHub read or write to Work or Codex. Do not answer with prose instead of attempting the write. Preserve the OWNER text, including all whitespace and Unicode bytes, without normalization or reinterpretation. If the GitHub write fails, fail closed.`;
}

function pmPrompt(cycle) {
  const origin = cycle.consumedArtifacts.origin;
  const fixed = {
    schema_version: 1,
    artifact_kind: CONTROLLER_ARTIFACT_KINDS.PM,
    cycle_id: cycle.cycleId,
    task_id: cycle.taskId,
    request_id: cycle.requestId,
    artifact_nonce: cycle.artifactNonces.pm,
    producer_supervisor_id: cycle.pmSupervisorId,
    consumer_supervisor_id: cycle.originSupervisorId,
    source_provider_session_id: cycle.providerSessions.pm,
    source_target_binding_sha256: cycle.pm.targetBindingSha256,
    controller_binding_sha256: cycle.controllerBindingSha256,
    predecessor: { comment_id: origin.commentId, body_sha256: origin.bodySha256 },
    owner_bytes_sha256: cycle.ownerBytesSha256,
  };
  return `Mission Control controller-mediated PM step for request ${cycle.requestId}. Use the connected GitHub app yourself in this reasoning chat; do not delegate any GitHub read or write to Work or Codex. Read only the immutable origin artifact ${origin.immutableUrl} and verify its full comment-body SHA-256 is ${origin.bodySha256}. Verify all bindings and its semantic payload SHA-256 ${cycle.ownerBytesSha256}. Then write exactly one ${CONTROLLER_ARTIFACT_PREFIX.trim()} comment to https://github.com/${cycle.artifactChannel.repository}/issues/${cycle.artifactChannel.issueNumber}. Use these exact fixed fields: ${canonicalJson(fixed)}. Add semantic_payload with exactly two fields: exact_text copied byte-for-byte from the origin artifact semantic_payload, and sha256 ${cycle.ownerBytesSha256}. Do not source the OWNER text from this prompt or prior memory, normalize it, reinterpret it, or answer with prose instead of attempting both GitHub operations. Fail closed on any mismatch or GitHub failure.`;
}

function returnPrompt(cycle, route, step) {
  const pm = cycle.consumedArtifacts.pm;
  const ordinary = cycleControlPrompt({ ...route, controllerPmArtifact: pm }, step, { omitContinuationOwnerExactText: true });
  return `Controller-mediated return binding. First use GitHub yourself in this reasoning chat to read immutable PM artifact ${pm.immutableUrl} and verify its full comment-body SHA-256 is ${pm.bodySha256}, controller binding ${cycle.controllerBindingSha256}, and exact OWNER semantic-payload SHA-256 ${cycle.ownerBytesSha256}. Do not delegate GitHub operations to Work or Codex. Treat only the exact PM artifact semantic payload as the returned OWNER bytes, and preserve those bytes exactly in the canonical decision_block. Fail closed on any mismatch.\n\n${ordinary}`;
}

function publicArtifactReceipt(artifact) {
  return {
    commentId: artifact.commentId,
    immutableUrl: artifact.immutableUrl,
    bodySha256: artifact.bodySha256,
    authorLogin: artifact.authorLogin,
    createdAt: artifact.createdAt,
    artifactKind: artifact.artifact.artifact_kind,
    semanticPayloadSha256: artifact.artifact.semantic_payload.sha256,
  };
}

function targetBindingSha256({ targetId, windowId, providerSessionId }) {
  return sha256(canonicalJson({ target_id: targetId, automation_window_id: windowId, provider_session_id: providerSessionId }));
}

function decisionStep(route) {
  return route.packet.reasoningLane === 'PRO_ESCALATED' ? 'PRO_DECISION' : 'EXTRA_HIGH_DECISION';
}

function safeError(error) {
  return error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000);
}

function sameArtifactReceipt(stored, current) {
  return stored.commentId === current.commentId
    && stored.immutableUrl === current.immutableUrl
    && stored.bodySha256 === current.bodySha256
    && stored.authorLogin === current.authorLogin
    && stored.createdAt === current.createdAt
    && stored.artifactKind === current.artifact.artifact_kind
    && stored.semanticPayloadSha256 === current.artifact.semantic_payload.sha256;
}

function artifactNotBefore(send, lane) {
  const value = send?.boundaryObservedAt ?? send?.intentRecordedAt ?? null;
  if (!Number.isFinite(Date.parse(value ?? ''))) throw new Error(`CONTROLLER_${lane.toUpperCase()}_SEND_TIME_MISSING.`);
  return value;
}

function artifactWaitStatus(cycle, lane, startedStep, waitingStatus, ambiguousStatus) {
  if (cycle.step !== startedStep) return waitingStatus;
  return cycle.sends?.[lane]?.status === 'CLICK_BOUNDARY_PERSISTED' ? waitingStatus : ambiguousStatus;
}

function crossedSendBoundary(error) {
  return ['CLICKED', 'GENERATION_STARTED'].includes(error?.relayStage)
    || Number.isFinite(Date.parse(error?.clickedAtObserved ?? ''))
    || Number.isFinite(Date.parse(error?.startedAtObserved ?? ''));
}

function publicErrorCode(message) {
  const code = String(message).match(/^([A-Z][A-Z0-9_]{4,})(?::|\.|$)/)?.[1];
  return code ?? 'CONTROLLER_INTERNAL_ERROR';
}
