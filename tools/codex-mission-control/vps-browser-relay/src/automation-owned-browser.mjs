import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { managedChatGptTabTelemetry, normalizeConversationUrl, sha256 } from './core.mjs';
import { ChatGptRateLimitRetryError } from './submission-pacing.mjs';

const OWNERSHIP_SCHEMA_VERSION = 1;
const CHATGPT_ROOT = 'https://chatgpt.com/';
const RATE_LIMIT_RETRY_MS = 30_000;

export function installAutomationOwnedBrowser(rawBrowser, options) {
  return new AutomationOwnedBrowser(rawBrowser, options);
}

export class AutomationOwnedBrowser {
  constructor(rawBrowser, {
    ownershipFile,
    cdpHost = '127.0.0.1',
    cdpPort = 9222,
    fetchImpl = fetch,
    WebSocketImpl = WebSocket,
    ownershipStore = null,
    protocol = null,
  }) {
    if (!rawBrowser || typeof rawBrowser.listTargets !== 'function') throw new Error('Automation-owned browser requires a raw browser client.');
    if (!ownershipFile && !ownershipStore) throw new Error('Automation-owned browser requires an ownership file or store.');
    this.rawBrowser = rawBrowser;
    this.WebSocketImpl = rawBrowser.WebSocketImpl ?? WebSocketImpl;
    this.ownershipStore = ownershipStore ?? new FileOwnershipStore(ownershipFile);
    this.protocol = protocol ?? new ChromeOwnershipProtocol({ cdpHost, cdpPort, fetchImpl, WebSocketImpl: this.WebSocketImpl });
    this.targetTransitionCoordinator = null;
  }

  setTargetTransitionCoordinator(coordinator) {
    if (!coordinator || !['prepareTargetTransition', 'beginTargetTransition', 'commitTargetTransition', 'abortTargetTransition']
      .every((method) => typeof coordinator[method] === 'function')) {
      throw new Error('Automation-owned browser target mutations require the central transition coordinator.');
    }
    this.targetTransitionCoordinator = coordinator;
    return this;
  }

  async doctor() {
    const raw = await this.rawBrowser.doctor();
    const all = await this.rawBrowser.listTargets();
    const owned = await this.listTargets();
    const allChatGpt = all.filter(isChatGptPage);
    const ownership = await this.#ensureOwnership();
    return {
      ...raw,
      ...managedChatGptTabTelemetry(owned),
      automationOwnedTabCount: owned.length,
      automationOwnedTargetIdsSha256: sha256(JSON.stringify(owned.map((target) => target.id).sort())),
      foreignChatGptTabCount: Math.max(0, allChatGpt.length - owned.length),
      automationWindowId: ownership.windowId,
      automationWindowOwnershipEnforced: true,
      recencyBasedTargetSelectionAllowed: false,
    };
  }

  async listTargets() {
    const ownership = await this.#ensureOwnership();
    const all = await this.rawBrowser.listTargets();
    const ownedIds = new Set(Object.keys(ownership.targets));
    const result = [];
    for (const target of all) {
      if (!ownedIds.has(target.id)) continue;
      const windowId = await this.protocol.getWindowId(target.id).catch(() => null);
      if (windowId !== ownership.windowId) continue;
      result.push({ ...target, automationOwned: true, automationWindowId: ownership.windowId });
    }
    await this.#reconcileTargetTransition(ownership, result.map((target) => target.id));
    await this.#reconcileUnexpectedDisappearances(ownership, result.map((target) => target.id));
    const currentIds = new Set(Object.keys(ownership.targets));
    return result.filter((target) => currentIds.has(target.id));
  }

  async findOrCreateChatTarget(chatUrl, { reusableTargetId = null, hardCeiling = 3 } = {}) {
    const normalized = normalizeConversationUrl(chatUrl);
    const ownership = await this.#ensureOwnership();
    const owned = await this.listTargets();
    for (const target of owned) {
      try {
        if (normalizeConversationUrl(target.url) === normalized) {
          await this.rawBrowser.activateTarget(target.id);
          await this.#rememberTarget(target.id, { purpose: 'bootstrap', assignedUrl: normalized });
          return { ...target, url: normalized, created: false, reused: true };
        }
      } catch { /* root/new-chat target */ }
    }

    const candidate = this.#reusableTarget(ownership, owned, reusableTargetId, normalized, 'bootstrap');
    if (candidate) return this.#navigateOwnedTarget(candidate, normalized, 'bootstrap');
    return this.#createOwnedTarget(normalized, 'bootstrap', hardCeiling);
  }

  async createFreshChatTarget({ reusableTargetId = null, hardCeiling = 3 } = {}) {
    const ownership = await this.#ensureOwnership();
    const owned = await this.listTargets();
    const candidate = this.#reusableTarget(ownership, owned, reusableTargetId, CHATGPT_ROOT, 'session');
    if (candidate) return this.#navigateOwnedTarget(candidate, CHATGPT_ROOT, 'session');
    return this.#createOwnedTarget(CHATGPT_ROOT, 'session', hardCeiling);
  }

  async requireExactOwnedTarget({ targetId, automationWindowId, expectedUrl } = {}) {
    const target = await this.inspectExactOwnedTargetIdentity({ targetId, automationWindowId });
    const normalizedExpectedUrl = normalizeAutomationTargetUrl(expectedUrl);
    if (target.url !== normalizedExpectedUrl) {
      throw new Error(`EXACT_BROWSER_TARGET_URL_MISMATCH: target ${targetId} is at ${target.url ?? 'UNKNOWN'}, expected ${normalizedExpectedUrl}.`);
    }
    return target;
  }

  async inspectExactOwnedTargetIdentity({ targetId, automationWindowId } = {}) {
    if (typeof targetId !== 'string' || targetId.trim() === '') {
      throw new Error('EXACT_BROWSER_TARGET_ID_REQUIRED: an exact automation-owned target ID is required.');
    }
    if (!Number.isInteger(automationWindowId)) {
      throw new Error('EXACT_AUTOMATION_WINDOW_ID_REQUIRED: an exact automation window ID is required.');
    }
    const ownership = await this.#readOwnership();
    if (ownership.windowId !== automationWindowId) {
      throw new Error(`AUTOMATION_WINDOW_ID_MISMATCH: requested window ${automationWindowId} does not match relay window ${ownership.windowId}.`);
    }
    if (!ownership.targets[targetId]) {
      throw new Error(`UNOWNED_BROWSER_TARGET: refusing to operate on target ${targetId}.`);
    }
    const target = (await this.rawBrowser.listTargets()).find((candidate) => candidate.id === targetId);
    if (!target) throw new Error(`EXACT_BROWSER_TARGET_MISSING: target ${targetId} is not live.`);
    const windowId = await this.protocol.getWindowId(targetId).catch(() => null);
    if (windowId !== automationWindowId) {
      throw new Error(`AUTOMATION_WINDOW_MISMATCH: target ${targetId} is in window ${windowId ?? 'UNKNOWN'}, expected ${automationWindowId}.`);
    }
    let currentUrl = null;
    try { currentUrl = normalizeAutomationTargetUrl(target.url); }
    catch { throw new Error(`EXACT_BROWSER_TARGET_URL_INVALID: target ${targetId} is at ${target.url ?? 'UNKNOWN'}.`); }
    return {
      ...target,
      url: currentUrl,
      automationOwned: true,
      automationWindowId,
    };
  }

  async navigateExactOwnedTarget({ targetId, automationWindowId, expectedUrl, url, purpose = null } = {}) {
    const target = await this.requireExactOwnedTarget({ targetId, automationWindowId, expectedUrl });
    const normalizedUrl = normalizeAutomationTargetUrl(url);
    if (purpose !== null && (typeof purpose !== 'string' || purpose.trim() === '')) {
      throw new Error('Automation-owned target purpose must be a non-empty string when provided.');
    }
    await this.rawBrowser.activateTarget(targetId);
    await this.protocol.navigate(target, normalizedUrl);
    const navigated = await this.requireExactOwnedTarget({
      targetId,
      automationWindowId,
      expectedUrl: normalizedUrl,
    });
    const ownership = await this.#readOwnership();
    ownership.targets[targetId] = {
      ...ownership.targets[targetId],
      ...(purpose === null ? {} : { purpose }),
      assignedUrl: normalizedUrl,
      lastUsedAt: new Date().toISOString(),
    };
    await this.ownershipStore.write(ownership);
    return { ...navigated, created: false, reused: true };
  }

  async forceCreateOwnedTarget({ url, hardCeiling = 3, purpose = 'session', anchorTargetId, automationWindowId, anchorExpectedUrl } = {}) {
    const normalizedUrl = normalizeAutomationTargetUrl(url);
    if (typeof purpose !== 'string' || purpose.trim() === '') {
      throw new Error('Automation-owned target purpose must be a non-empty string.');
    }
    const anchor = await this.requireExactOwnedTarget({
      targetId: anchorTargetId,
      automationWindowId,
      expectedUrl: anchorExpectedUrl,
    });
    return this.#createOwnedTarget(normalizedUrl, purpose, hardCeiling, anchor);
  }

  async recoverExactOwnedTargetByPurpose({ purpose, automationWindowId, expectedUrl } = {}) {
    if (typeof purpose !== 'string' || purpose.trim() === '') throw new Error('Exact recovery purpose is required.');
    if (!Number.isInteger(automationWindowId)) throw new Error('EXACT_AUTOMATION_WINDOW_ID_REQUIRED: an exact automation window ID is required.');
    const ownership = await this.#readOwnership();
    if (ownership.windowId !== automationWindowId) throw new Error('AUTOMATION_WINDOW_ID_MISMATCH: exact recovery window changed.');
    const ids = Object.values(ownership.targets).filter((record) => record?.purpose === purpose).map((record) => record.targetId);
    if (ids.length === 0) {
      const intent = ownership.creationIntents?.[purpose];
      if (!intent) return null;
      const normalizedExpectedUrl = normalizeAutomationTargetUrl(expectedUrl);
      if (intent.windowId !== automationWindowId || intent.url !== normalizedExpectedUrl) {
        throw new Error('OWNED_TARGET_CREATION_INTENT_MISMATCH: exact recovery binding changed.');
      }
      const baseline = new Set(intent.baselineTargetIds);
      const candidates = await this.#waitForCreationDifference(baseline, automationWindowId);
      if (candidates.length === 0) {
        await this.#settleFailedTargetMutation(ownership, ownership.targetTransition);
        return null;
      }
      if (candidates.length !== 1) {
        throw new Error(`OWNED_TARGET_CREATION_RECOVERY_AMBIGUOUS: found ${candidates.length} post-intent targets in the exact automation window.`);
      }
      const target = candidates[0];
      let currentUrl = null;
      try { currentUrl = normalizeAutomationTargetUrl(target.url); } catch { /* exact mismatch below */ }
      if (target.type !== 'page' || currentUrl !== normalizedExpectedUrl) {
        throw new Error('OWNED_TARGET_CREATION_RECOVERY_MISMATCH: the unique post-intent target does not match the exact requested page and URL.');
      }
      const now = new Date().toISOString();
      ownership.targets[target.id] = {
        targetId: target.id,
        purpose,
        assignedUrl: normalizedExpectedUrl,
        createdAt: intent.intentRecordedAt,
        lastUsedAt: now,
      };
      delete ownership.creationIntents[purpose];
      await this.ownershipStore.write(ownership);
      await this.#reconcileTargetTransition(ownership, Object.keys(ownership.targets));
      const ready = await this.#waitForRawTarget(target.id);
      await this.protocol.waitForReady(ready, normalizedExpectedUrl);
      return { ...ready, url: normalizedExpectedUrl, created: true, reused: false, recovered: true, automationOwned: true, automationWindowId };
    }
    if (ids.length !== 1) throw new Error(`OWNED_TARGET_PURPOSE_AMBIGUOUS: found ${ids.length} targets for ${purpose}.`);
    return this.requireExactOwnedTarget({ targetId: ids[0], automationWindowId, expectedUrl });
  }

  async assertOwnedTarget(target) {
    await this.#assertOwned(target?.id);
    return true;
  }

  async activateTarget(targetId) {
    await this.#assertOwned(targetId);
    return this.rawBrowser.activateTarget(targetId);
  }

  async closeTarget(targetId) {
    const ownership = await this.#assertOwned(targetId);
    this.#requireTargetTransitionCoordinator();
    const priorOwnedTargetIds = (await this.listTargets()).map((target) => target.id).sort();
    if (priorOwnedTargetIds.length <= 1) throw new Error('AUTOMATION_OWNED_TARGET_LAST_CLOSE_FORBIDDEN: at least one exact owned target must remain.');
    let transition = ownership.targetTransition;
    if (!transition) {
      transition = await this.targetTransitionCoordinator.prepareTargetTransition({
        operation: 'REMOVE', automationWindowId: ownership.windowId, priorOwnedTargetIds, targetId,
      });
      ownership.targetTransition = transition;
      await this.ownershipStore.write(ownership);
    }
    assertLocalTargetTransition(transition, { operation: 'REMOVE', automationWindowId: ownership.windowId, priorOwnedTargetIds, targetId });
    await this.targetTransitionCoordinator.beginTargetTransition(transition);
    try {
      const result = await this.rawBrowser.closeTarget(targetId);
      if (result !== true) throw new Error('AUTOMATION_OWNED_TARGET_CLOSE_REJECTED: browser did not confirm target closure.');
      if ((await this.rawBrowser.listTargets()).some((target) => target.id === targetId)) {
        throw new Error('AUTOMATION_OWNED_TARGET_CLOSE_UNCONFIRMED: target remains live after browser closure response.');
      }
      delete ownership.targets[targetId];
      await this.ownershipStore.write(ownership);
      await this.#reconcileTargetTransition(ownership, Object.keys(ownership.targets));
      return result;
    } catch (error) {
      await this.#settleFailedTargetMutation(ownership, transition).catch(() => {});
      throw error;
    }
  }

  async inspectChat(target, expectedUrl) {
    await this.#assertOwned(target?.id);
    return this.rawBrowser.inspectChat(target, expectedUrl);
  }

  async currentModelLabel(target, expectedUrl) {
    await this.#assertOwned(target?.id);
    return this.rawBrowser.currentModelLabel(target, expectedUrl);
  }

  async selectAppsForMessage(target, input) {
    await this.#assertOwned(target?.id);
    return this.rawBrowser.selectAppsForMessage(target, input);
  }

  async ensureExactConsumerControls(target, input) {
    await this.#assertOwned(target?.id);
    return this.rawBrowser.ensureExactConsumerControls(target, input);
  }

  async submitExactMessage(target, input) {
    await this.#assertOwned(target?.id);
    try {
      return await this.rawBrowser.submitExactMessage(target, input);
    } catch (error) {
      const recovery = await this.protocol.dismissRateLimit(target).catch(() => ({ present: false, dismissed: false }));
      if (!recovery?.present) throw error;
      if (!recovery.dismissed) {
        const blocked = new Error(`CHATGPT_RATE_LIMIT_MODAL_AMBIGUOUS: ${recovery.reason ?? 'exact Got it control unavailable'}.`);
        blocked.code = 'CHATGPT_RATE_LIMIT_MODAL_AMBIGUOUS';
        blocked.relayStage = error?.relayStage ?? 'UNKNOWN';
        blocked.clickedAtObserved = error?.clickedAtObserved ?? null;
        blocked.startedAtObserved = error?.startedAtObserved ?? null;
        throw blocked;
      }
      const retry = new ChatGptRateLimitRetryError({
        retryAfterMs: RATE_LIMIT_RETRY_MS,
        relayStage: error?.relayStage ?? 'UNKNOWN',
        clickedAtObserved: error?.clickedAtObserved ?? null,
        startedAtObserved: error?.startedAtObserved ?? null,
      });
      if (error?.submissionBoundaryPersistenceAttempted) retry.submissionBoundaryPersistenceAttempted = true;
      throw retry;
    }
  }

  async waitForGenerationComplete(target, input) {
    await this.#assertOwned(target?.id);
    return this.rawBrowser.waitForGenerationComplete(target, input);
  }

  #reusableTarget(ownership, owned, reusableTargetId, wantedUrl, purpose) {
    const byId = new Map(owned.map((target) => [target.id, target]));
    const explicit = reusableTargetId && byId.get(reusableTargetId);
    if (explicit && this.#canRepurpose(ownership.targets[explicit.id], wantedUrl, purpose)) return explicit;
    for (const target of owned) {
      if (this.#canRepurpose(ownership.targets[target.id], wantedUrl, purpose)) return target;
    }
    return null;
  }

  #canRepurpose(record, wantedUrl, purpose) {
    if (!record) return false;
    if (record.assignedUrl === wantedUrl) return true;
    if (purpose === 'session') return record.purpose === 'scratch' || record.purpose === 'session';
    return record.purpose === 'scratch' || record.purpose === 'session';
  }

  async #navigateOwnedTarget(target, url, purpose) {
    const ownership = await this.#assertOwned(target.id);
    await this.rawBrowser.activateTarget(target.id);
    await this.protocol.navigate(target, url);
    ownership.targets[target.id] = {
      ...ownership.targets[target.id],
      purpose,
      assignedUrl: url,
      lastUsedAt: new Date().toISOString(),
    };
    await this.ownershipStore.write(ownership);
    const current = (await this.rawBrowser.listTargets()).find((candidate) => candidate.id === target.id) ?? target;
    return { ...current, url, created: false, reused: true, automationOwned: true, automationWindowId: ownership.windowId };
  }

  async #createOwnedTarget(url, purpose, hardCeiling, exactAnchor = null) {
    if (!Number.isInteger(hardCeiling) || hardCeiling < 1 || hardCeiling > 3) throw new Error('Automation-owned ChatGPT hard ceiling must be 1-3.');
    this.#requireTargetTransitionCoordinator();
    const ownership = await this.#ensureOwnership();
    const pendingIntent = ownership.creationIntents?.[purpose];
    if (pendingIntent) {
      if (pendingIntent.url !== url || pendingIntent.windowId !== ownership.windowId) {
        throw new Error('OWNED_TARGET_CREATION_INTENT_MISMATCH: pending creation uses different exact bindings.');
      }
      const candidates = await this.#waitForCreationDifference(new Set(pendingIntent.baselineTargetIds), ownership.windowId);
      if (candidates.length > 1) throw new Error(`OWNED_TARGET_CREATION_RECOVERY_AMBIGUOUS: found ${candidates.length} post-intent targets in the exact automation window.`);
      if (candidates.length === 1) {
        const candidate = candidates[0];
        let currentUrl = null;
        try { currentUrl = normalizeAutomationTargetUrl(candidate.url); } catch { /* exact mismatch below */ }
        if (candidate.type !== 'page' || currentUrl !== url) throw new Error('OWNED_TARGET_CREATION_RECOVERY_MISMATCH: post-intent target does not match the exact requested page and URL.');
        ownership.targets[candidate.id] = {
          targetId: candidate.id, purpose, assignedUrl: url,
          createdAt: pendingIntent.intentRecordedAt, lastUsedAt: new Date().toISOString(),
        };
        delete ownership.creationIntents[purpose];
        await this.ownershipStore.write(ownership);
        await this.#reconcileTargetTransition(ownership, Object.keys(ownership.targets));
        const ready = await this.#waitForRawTarget(candidate.id);
        await this.protocol.waitForReady(ready, url);
        return { ...ready, url, created: true, reused: false, recovered: true, automationOwned: true, automationWindowId: ownership.windowId };
      }
      await this.#settleFailedTargetMutation(ownership, ownership.targetTransition);
    }
    const owned = await this.listTargets();
    if (owned.length >= hardCeiling) throw new Error(`MANAGED_CHATGPT_TAB_HARD_CEILING: refusing to create automation-owned tab ${owned.length + 1}; ceiling is ${hardCeiling}.`);
    const anchor = exactAnchor ?? owned[0];
    if (!anchor) throw new Error('Automation-owned window has no anchor target.');
    if (exactAnchor && !owned.some((target) => target.id === exactAnchor.id)) throw new Error('EXACT_CREATION_ANCHOR_MISSING.');
    ownership.creationIntents ??= {};
    const priorOwnedTargetIds = owned.map((target) => target.id).sort();
    let intentRecordedAt = new Date().toISOString();
    const priorIntent = ownership.creationIntents[purpose];
    if (priorIntent) {
      if (priorIntent.url !== url || priorIntent.windowId !== ownership.windowId || priorIntent.anchorTargetId !== anchor.id
        || JSON.stringify(priorIntent.baselineTargetIds) !== JSON.stringify(priorOwnedTargetIds)) {
        throw new Error('OWNED_TARGET_CREATION_INTENT_MISMATCH: refusing to reuse a pending creation intent with changed exact bindings.');
      }
      intentRecordedAt = priorIntent.intentRecordedAt;
    } else {
      ownership.creationIntents[purpose] = {
        purpose,
        url,
        windowId: ownership.windowId,
        anchorTargetId: anchor.id,
        baselineTargetIds: priorOwnedTargetIds,
        intentRecordedAt,
      };
    }
    let transition = ownership.targetTransition;
    if (!transition) {
      transition = await this.targetTransitionCoordinator.prepareTargetTransition({
        operation: 'ADD', automationWindowId: ownership.windowId, priorOwnedTargetIds, anchorTargetId: anchor.id,
      });
      ownership.targetTransition = transition;
    }
    await this.ownershipStore.write(ownership);
    assertLocalTargetTransition(transition, { operation: 'ADD', automationWindowId: ownership.windowId, priorOwnedTargetIds, anchorTargetId: anchor.id });
    await this.targetTransitionCoordinator.beginTargetTransition(transition);
    try {
      await this.rawBrowser.activateTarget(anchor.id);
      const created = await this.protocol.createTarget(url);
      const windowId = await this.protocol.getWindowId(created.targetId);
      if (windowId !== ownership.windowId) {
        await this.rawBrowser.closeTarget(created.targetId).catch(() => {});
        throw new Error(`AUTOMATION_WINDOW_TARGET_CREATION_MISMATCH: created target landed in window ${windowId}, expected ${ownership.windowId}.`);
      }
      ownership.targets[created.targetId] = {
        targetId: created.targetId,
        purpose,
        assignedUrl: url,
        createdAt: intentRecordedAt,
        lastUsedAt: new Date().toISOString(),
      };
      delete ownership.creationIntents[purpose];
      await this.ownershipStore.write(ownership);
      await this.#reconcileTargetTransition(ownership, Object.keys(ownership.targets));
      const target = await this.#waitForRawTarget(created.targetId);
      await this.protocol.waitForReady(target, url);
      return { ...target, url, created: true, reused: false, automationOwned: true, automationWindowId: ownership.windowId };
    } catch (error) {
      await this.#settleFailedTargetMutation(ownership, transition).catch(() => {});
      throw error;
    }
  }

  #requireTargetTransitionCoordinator() {
    if (!this.targetTransitionCoordinator) {
      throw new Error('CENTRAL_TARGET_TRANSITION_COORDINATOR_REQUIRED: browser target-set mutations are disabled.');
    }
  }

  async #reconcileTargetTransition(ownership, observedTargetIds) {
    const transition = ownership.targetTransition;
    if (!transition) return false;
    this.#requireTargetTransitionCoordinator();
    const observed = [...observedTargetIds].sort();
    const prior = [...transition.priorOwnedTargetIds].sort();
    let added = observed.filter((targetId) => !prior.includes(targetId));
    let removed = prior.filter((targetId) => !observed.includes(targetId));
    if (transition.operation === 'RECONCILE_REMOVE') {
      if (observed.includes(transition.targetId)) {
        if (added.length === 0 && removed.length === 0) {
          await this.targetTransitionCoordinator.beginTargetTransition(transition);
          await this.targetTransitionCoordinator.abortTargetTransition(transition, {
            observedAutomationWindowId: ownership.windowId,
            observedOwnedTargetIds: observed,
          });
          ownership.targetTransition = null;
          await this.ownershipStore.write(ownership);
          return true;
        }
        throw new Error('AUTOMATION_OWNED_TARGET_TRANSITION_AMBIGUOUS: disappeared target became live while another target-set delta was observed.');
      }
      const postOwnedTargetIds = prior.filter((targetId) => targetId !== transition.targetId);
      const commit = () => this.targetTransitionCoordinator.commitTargetTransition(transition, {
        postOwnedTargetIds, transitionedTargetId: transition.targetId,
      });
      try {
        await commit();
      } catch (error) {
        if (error?.code !== 'RELAY_TARGET_TRANSITION_MISSING') throw error;
        await this.targetTransitionCoordinator.beginTargetTransition(transition);
        await commit();
      }
      delete ownership.targets[transition.targetId];
      ownership.targetTransition = null;
      await this.ownershipStore.write(ownership);
      return true;
    }
    if (added.length === 0 && removed.length === 0) {
      await this.targetTransitionCoordinator.beginTargetTransition(transition);
      return false;
    }
    const transitionedTargetId = transition.operation === 'ADD' && added.length === 1 && removed.length === 0
      ? added[0]
      : transition.operation === 'REMOVE' && removed.length === 1 && added.length === 0
        ? removed[0]
        : null;
    if (!transitionedTargetId || (transition.operation === 'REMOVE' && transitionedTargetId !== transition.targetId)) {
      throw new Error('AUTOMATION_OWNED_TARGET_TRANSITION_AMBIGUOUS: live target-set delta does not match the durable transition.');
    }
    try {
      await this.targetTransitionCoordinator.beginTargetTransition(transition);
    } catch (error) {
      if (!['RELAY_TARGET_TRANSITION_PRIOR_SET_MISMATCH', 'RELAY_TARGET_TRANSITION_REVISION_MISMATCH']
        .includes(error?.code)) throw error;
    }
    await this.targetTransitionCoordinator.commitTargetTransition(transition, {
      postOwnedTargetIds: observed,
      transitionedTargetId,
    });
    ownership.targetTransition = null;
    await this.ownershipStore.write(ownership);
    return true;
  }

  async #reconcileUnexpectedDisappearances(ownership, observedTargetIds) {
    const observed = new Set(observedTargetIds);
    for (;;) {
      const missing = Object.keys(ownership.targets).sort().filter((targetId) => !observed.has(targetId));
      if (missing.length === 0) return;
      this.#requireTargetTransitionCoordinator();
      if (Object.keys(ownership.targets).length <= 1) {
        throw new Error('AUTOMATION_WINDOW_REPLACEMENT_REQUIRED: the durable automation window lost its final owned target.');
      }
      const targetId = missing[0];
      const priorOwnedTargetIds = Object.keys(ownership.targets).sort();
      let transition = ownership.targetTransition;
      if (!transition) {
        transition = await this.targetTransitionCoordinator.prepareTargetTransition({
          operation: 'RECONCILE_REMOVE',
          automationWindowId: ownership.windowId,
          priorOwnedTargetIds,
          targetId,
        });
        ownership.targetTransition = transition;
        await this.ownershipStore.write(ownership);
        await this.targetTransitionCoordinator.beginTargetTransition(transition);
      }
      assertLocalTargetTransition(transition, {
        operation: 'RECONCILE_REMOVE', automationWindowId: ownership.windowId, priorOwnedTargetIds, targetId,
      });
      await this.#reconcileTargetTransition(ownership, [...observed]);
    }
  }

  async #settleFailedTargetMutation(ownership, transition) {
    if (!transition) return false;
    this.#requireTargetTransitionCoordinator();
    const observed = await this.#liveWindowTargetIds(ownership.windowId);
    const prior = [...transition.priorOwnedTargetIds].sort();
    if (JSON.stringify(observed) === JSON.stringify(prior)) {
      try {
        await this.targetTransitionCoordinator.beginTargetTransition(transition);
      } catch (error) {
        if (error?.code !== 'RELAY_TARGET_TRANSITION_BUSY') throw error;
      }
      await this.targetTransitionCoordinator.abortTargetTransition(transition, { observedOwnedTargetIds: observed });
      ownership.targetTransition = null;
      for (const [purpose, intent] of Object.entries(ownership.creationIntents ?? {})) {
        if (intent.windowId === transition.automationWindowId
          && JSON.stringify([...intent.baselineTargetIds].sort()) === JSON.stringify(prior)) delete ownership.creationIntents[purpose];
      }
      await this.ownershipStore.write(ownership);
      return true;
    }
    if (transition.operation === 'REMOVE' && !observed.includes(transition.targetId)) {
      delete ownership.targets[transition.targetId];
      await this.ownershipStore.write(ownership);
      return this.#reconcileTargetTransition(ownership, observed);
    }
    return false;
  }

  async #liveWindowTargetIds(windowId) {
    const result = [];
    for (const target of await this.rawBrowser.listTargets()) {
      if (await this.protocol.getWindowId(target.id).catch(() => null) === windowId) result.push(target.id);
    }
    return result.sort();
  }

  async #ensureOwnership() {
    const current = await this.ownershipStore.read();
    if (current) {
      validateOwnership(current);
      const all = await this.rawBrowser.listTargets();
      const live = new Set(all.map((target) => target.id));
      for (const targetId of Object.keys(current.targets)) {
        if (!live.has(targetId)) continue;
        const windowId = await this.protocol.getWindowId(targetId).catch(() => null);
        if (windowId === current.windowId) return current;
      }
      if (this.targetTransitionCoordinator) return this.#replaceAutomationWindow(current, all);
    }

    const created = await this.protocol.createDedicatedWindow(CHATGPT_ROOT);
    const ownership = {
      schemaVersion: OWNERSHIP_SCHEMA_VERSION,
      windowId: created.windowId,
      targets: {
        [created.targetId]: {
          targetId: created.targetId,
          purpose: 'scratch',
          assignedUrl: CHATGPT_ROOT,
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
        },
      },
      creationIntents: {},
      targetTransition: null,
      windowReplacementIntent: null,
      updatedAt: new Date().toISOString(),
    };
    await this.ownershipStore.write(ownership);
    const target = await this.#waitForRawTarget(created.targetId);
    await this.protocol.waitForReady(target, CHATGPT_ROOT);
    return ownership;
  }

  async #replaceAutomationWindow(ownership, initialTargets) {
    this.#requireTargetTransitionCoordinator();
    const priorOwnedTargetIds = Object.keys(ownership.targets).sort();
    let transition = ownership.targetTransition;
    if (transition && transition.operation !== 'WINDOW_REPLACE') {
      throw new Error('AUTOMATION_WINDOW_REPLACEMENT_BLOCKED_BY_TARGET_TRANSITION: resolve the exact prior target mutation first.');
    }
    if (!transition) {
      transition = await this.targetTransitionCoordinator.prepareTargetTransition({
        operation: 'WINDOW_REPLACE',
        automationWindowId: ownership.windowId,
        priorOwnedTargetIds,
      });
      ownership.targetTransition = transition;
    }
    assertLocalTargetTransition(transition, {
      operation: 'WINDOW_REPLACE', automationWindowId: ownership.windowId, priorOwnedTargetIds,
    });
    let intent = ownership.windowReplacementIntent;
    if (!intent) {
      intent = {
        transitionId: transition.transitionId,
        priorWindowId: ownership.windowId,
        baselineTargetIds: initialTargets.map((target) => target.id).sort(),
        markerUrl: `data:text/plain,mission-control-window-${randomUUID()}`,
        intentRecordedAt: new Date().toISOString(),
        createdWindowId: null,
        createdTargetId: null,
      };
      ownership.windowReplacementIntent = intent;
      await this.ownershipStore.write(ownership);
    }
    if (intent.transitionId !== transition.transitionId || intent.priorWindowId !== ownership.windowId) {
      throw new Error('AUTOMATION_WINDOW_REPLACEMENT_INTENT_MISMATCH: durable replacement intent differs from the open transition.');
    }

    let candidate = await this.#recoverReplacementCandidate(intent);
    if (!candidate) {
      await this.ownershipStore.write(ownership);
      await this.targetTransitionCoordinator.beginTargetTransition(transition);
      const created = await this.protocol.createDedicatedWindow(intent.markerUrl);
      candidate = await this.#validateReplacementCandidate(created, intent);
      intent.createdWindowId = candidate.windowId;
      intent.createdTargetId = candidate.targetId;
    }
    await this.ownershipStore.write(ownership);
    const candidateTarget = await this.#waitForRawTarget(candidate.targetId);
    if (candidateTarget.url !== CHATGPT_ROOT) {
      if (candidateTarget.url !== intent.markerUrl) {
        throw new Error('AUTOMATION_WINDOW_REPLACEMENT_CANDIDATE_INVALID: replacement target lost its exact durable marker.');
      }
      await this.protocol.navigate(candidateTarget, CHATGPT_ROOT);
    }
    const readyTarget = await this.#waitForRawTarget(candidate.targetId);
    let readyUrl = null;
    try { readyUrl = normalizeAutomationTargetUrl(readyTarget.url); } catch { /* exact mismatch below */ }
    if (readyUrl !== CHATGPT_ROOT) {
      throw new Error('AUTOMATION_WINDOW_REPLACEMENT_CANDIDATE_INVALID: replacement target did not reach the exact ChatGPT root.');
    }
    await this.protocol.waitForReady(readyTarget, CHATGPT_ROOT);

    try {
      await this.targetTransitionCoordinator.commitTargetTransition(transition, {
        postAutomationWindowId: candidate.windowId,
        postOwnedTargetIds: [candidate.targetId],
        transitionedTargetId: candidate.targetId,
      });
    } catch (error) {
      if (error?.code !== 'RELAY_TARGET_TRANSITION_MISSING') throw error;
      await this.targetTransitionCoordinator.beginTargetTransition(transition);
      await this.targetTransitionCoordinator.commitTargetTransition(transition, {
        postAutomationWindowId: candidate.windowId,
        postOwnedTargetIds: [candidate.targetId],
        transitionedTargetId: candidate.targetId,
      });
    }
    const now = new Date().toISOString();
    ownership.windowId = candidate.windowId;
    ownership.targets = {
      [candidate.targetId]: {
        targetId: candidate.targetId,
        purpose: 'scratch',
        assignedUrl: CHATGPT_ROOT,
        createdAt: intent.intentRecordedAt,
        lastUsedAt: now,
      },
    };
    ownership.creationIntents = {};
    ownership.targetTransition = null;
    ownership.windowReplacementIntent = null;
    await this.ownershipStore.write(ownership);
    return ownership;
  }

  async #recoverReplacementCandidate(intent) {
    if (intent.createdTargetId !== null || intent.createdWindowId !== null) {
      if (typeof intent.createdTargetId !== 'string' || !Number.isInteger(intent.createdWindowId)) {
        throw new Error('AUTOMATION_WINDOW_REPLACEMENT_INTENT_INVALID: recorded candidate is incomplete.');
      }
      const live = await this.rawBrowser.listTargets();
      if (!live.some((target) => target.id === intent.createdTargetId)) {
        intent.baselineTargetIds = [...new Set([...intent.baselineTargetIds, ...live.map((target) => target.id)])].sort();
        intent.createdTargetId = null;
        intent.createdWindowId = null;
        return null;
      }
      return this.#validateReplacementCandidate({ targetId: intent.createdTargetId, windowId: intent.createdWindowId }, intent);
    }
    const baseline = new Set(intent.baselineTargetIds);
    const candidates = [];
    for (const target of await this.rawBrowser.listTargets()) {
      if (baseline.has(target.id)) continue;
      if (target.type !== 'page' || target.url !== intent.markerUrl) continue;
      const windowId = await this.protocol.getWindowId(target.id).catch(() => null);
      if (Number.isInteger(windowId) && windowId !== intent.priorWindowId) candidates.push({ targetId: target.id, windowId });
    }
    if (candidates.length === 0) return null;
    if (candidates.length !== 1) {
      throw new Error(`AUTOMATION_WINDOW_REPLACEMENT_RECOVERY_AMBIGUOUS: found ${candidates.length} possible fresh window targets.`);
    }
    const candidate = await this.#validateReplacementCandidate(candidates[0], intent);
    intent.createdWindowId = candidate.windowId;
    intent.createdTargetId = candidate.targetId;
    return candidate;
  }

  async #validateReplacementCandidate(candidate, intent) {
    if (!candidate || typeof candidate.targetId !== 'string' || !Number.isInteger(candidate.windowId)
      || candidate.windowId === intent.priorWindowId || intent.baselineTargetIds.includes(candidate.targetId)) {
      throw new Error('AUTOMATION_WINDOW_REPLACEMENT_CANDIDATE_INVALID: replacement must be one fresh target in one fresh window.');
    }
    const all = await this.rawBrowser.listTargets();
    const target = all.find((item) => item.id === candidate.targetId);
    const recordedCandidate = intent.createdTargetId === candidate.targetId && intent.createdWindowId === candidate.windowId;
    let isRoot = false;
    try { isRoot = normalizeAutomationTargetUrl(target?.url) === CHATGPT_ROOT; } catch { /* marker or mismatch */ }
    const sameWindow = [];
    for (const item of all) {
      if (await this.protocol.getWindowId(item.id).catch(() => null) === candidate.windowId) sameWindow.push(item);
    }
    if (!target || target.type !== 'page' || (target.url !== intent.markerUrl && !(recordedCandidate && isRoot)) || sameWindow.length !== 1) {
      throw new Error('AUTOMATION_WINDOW_REPLACEMENT_CANDIDATE_INVALID: replacement window is not an exact single root target.');
    }
    return candidate;
  }

  async #readOwnership() {
    const ownership = await this.ownershipStore.read();
    if (!ownership) throw new Error('BROWSER_OWNERSHIP_STATE_MISSING: exact target operations require existing ownership state.');
    validateOwnership(ownership);
    return ownership;
  }

  async #assertOwned(targetId) {
    if (!targetId) throw new Error('Automation-owned browser operation requires an exact target ID.');
    const ownership = await this.#ensureOwnership();
    if (!ownership.targets[targetId]) throw new Error(`UNOWNED_BROWSER_TARGET: refusing to operate on target ${targetId}.`);
    const windowId = await this.protocol.getWindowId(targetId).catch(() => null);
    if (windowId !== ownership.windowId) throw new Error(`AUTOMATION_WINDOW_MISMATCH: target ${targetId} is not in relay window ${ownership.windowId}.`);
    return ownership;
  }

  async #rememberTarget(targetId, fields) {
    const ownership = await this.#assertOwned(targetId);
    ownership.targets[targetId] = { ...ownership.targets[targetId], ...fields, lastUsedAt: new Date().toISOString() };
    await this.ownershipStore.write(ownership);
  }

  async #waitForRawTarget(targetId) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const target = (await this.rawBrowser.listTargets()).find((candidate) => candidate.id === targetId);
      if (target?.webSocketDebuggerUrl) return target;
      await sleep(100);
    }
    throw new Error(`Automation-owned target ${targetId} did not become debuggable.`);
  }

  async #waitForCreationDifference(baseline, automationWindowId) {
    const deadline = Date.now() + 2_000;
    for (;;) {
      const candidates = [];
      for (const target of await this.rawBrowser.listTargets()) {
        if (baseline.has(target.id)) continue;
        const windowId = await this.protocol.getWindowId(target.id).catch(() => null);
        if (windowId === automationWindowId) candidates.push(target);
      }
      if (candidates.length > 0 || Date.now() >= deadline) return candidates;
      await sleep(100);
    }
  }
}

export class FileOwnershipStore {
  constructor(path) { this.path = path; }

  async read() {
    try {
      const value = JSON.parse(await readFile(this.path, 'utf8'));
      validateOwnership(value);
      return value;
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      if (error instanceof SyntaxError) throw new Error(`BROWSER_OWNERSHIP_STATE_INVALID: ${this.path} contains invalid JSON.`);
      throw error;
    }
  }

  async write(value) {
    validateOwnership(value);
    value.updatedAt = new Date().toISOString();
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.path);
    return value;
  }
}

export class ChromeOwnershipProtocol {
  constructor({ cdpHost, cdpPort, fetchImpl = fetch, WebSocketImpl = WebSocket }) {
    this.baseUrl = `http://${cdpHost}:${cdpPort}`;
    this.fetchImpl = fetchImpl;
    this.WebSocketImpl = WebSocketImpl;
  }

  async createDedicatedWindow(url) {
    return this.#withBrowser(async (client) => {
      const created = await client.send('Target.createTarget', { url, newWindow: true });
      if (!created?.targetId) throw new Error('Chrome did not create a dedicated automation window target.');
      const window = await client.send('Browser.getWindowForTarget', { targetId: created.targetId });
      if (!Number.isInteger(window?.windowId)) throw new Error('Chrome did not expose the dedicated automation window ID.');
      return { targetId: created.targetId, windowId: window.windowId };
    });
  }

  async createTarget(url) {
    return this.#withBrowser(async (client) => {
      const created = await client.send('Target.createTarget', { url, background: false });
      if (!created?.targetId) throw new Error('Chrome did not create an automation-owned page target.');
      return { targetId: created.targetId };
    });
  }

  async getWindowId(targetId) {
    return this.#withBrowser(async (client) => {
      const window = await client.send('Browser.getWindowForTarget', { targetId });
      if (!Number.isInteger(window?.windowId)) throw new Error(`Chrome did not expose a window ID for target ${targetId}.`);
      return window.windowId;
    });
  }

  async navigate(target, url) {
    return this.#withPage(target, async (client) => {
      const result = await client.send('Page.navigate', { url });
      if (result?.errorText) throw new Error(`ChatGPT navigation failed: ${result.errorText}`);
      await this.#waitForReadyClient(client, url);
    });
  }

  async waitForReady(target, url) {
    return this.#withPage(target, (client) => this.#waitForReadyClient(client, url));
  }

  async dismissRateLimit(target) {
    return this.#withPage(target, async (client) => {
      const result = await client.send('Runtime.evaluate', {
        expression: RATE_LIMIT_DISMISS_EXPRESSION,
        returnByValue: true,
        awaitPromise: false,
      });
      return result?.result?.value ?? { present: false, dismissed: false };
    });
  }

  async #waitForReadyClient(client, expectedUrl) {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const result = await client.send('Runtime.evaluate', {
        expression: readinessExpression(expectedUrl),
        returnByValue: true,
      });
      const value = result?.result?.value;
      if (value?.loginRequired) throw new Error('ChatGPT login is required in the automation-owned browser window.');
      if (value?.ready) return value;
      await sleep(250);
    }
    throw new Error(`ChatGPT did not become ready in the automation-owned window for ${expectedUrl}.`);
  }

  async #withBrowser(callback) {
    const response = await this.fetchImpl(`${this.baseUrl}/json/version`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Chrome DevTools /json/version failed with HTTP ${response.status}.`);
    const version = await response.json();
    if (typeof version.webSocketDebuggerUrl !== 'string') throw new Error('Chrome browser debugging WebSocket is unavailable.');
    const client = await MiniCdpClient.connect(version.webSocketDebuggerUrl, this.WebSocketImpl);
    try { return await callback(client); } finally { client.close(); }
  }

  async #withPage(target, callback) {
    if (!target?.webSocketDebuggerUrl) throw new Error(`Page target ${target?.id ?? 'UNKNOWN'} has no debugging WebSocket.`);
    const client = await MiniCdpClient.connect(target.webSocketDebuggerUrl, this.WebSocketImpl);
    try { return await callback(client); } finally { client.close(); }
  }
}

class MiniCdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', (event) => this.#onMessage(event));
    socket.addEventListener('close', () => this.#rejectAll(new Error('Chrome DevTools WebSocket closed.')));
    socket.addEventListener('error', () => this.#rejectAll(new Error('Chrome DevTools WebSocket failed.')));
  }

  static async connect(url, WebSocketImpl) {
    const socket = new WebSocketImpl(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Chrome DevTools WebSocket connection timed out.')), 10_000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Chrome DevTools WebSocket connection failed.')); }, { once: true });
    });
    return new MiniCdpClient(socket);
  }

  async send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { try { this.socket.close(); } catch { /* ignore */ } }

  async #onMessage(event) {
    let raw = event.data;
    if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
    else if (ArrayBuffer.isView(raw)) raw = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString('utf8');
    else if (typeof raw !== 'string' && raw?.text) raw = await raw.text();
    if (typeof raw !== 'string') return;
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (!Number.isInteger(message.id)) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(`Chrome DevTools ${message.error.message ?? 'command failed'}.`));
    else pending.resolve(message.result ?? {});
  }

  #rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

function validateOwnership(value) {
  if (!value || value.schemaVersion !== OWNERSHIP_SCHEMA_VERSION || !Number.isInteger(value.windowId) || !value.targets || typeof value.targets !== 'object' || Array.isArray(value.targets)) {
    throw new Error('BROWSER_OWNERSHIP_STATE_INVALID: ownership record is malformed.');
  }
  for (const [targetId, record] of Object.entries(value.targets)) {
    if (!record || record.targetId !== targetId || typeof record.purpose !== 'string') throw new Error(`BROWSER_OWNERSHIP_STATE_INVALID: target record ${targetId} is malformed.`);
  }
  if (value.creationIntents !== undefined) {
    if (!value.creationIntents || typeof value.creationIntents !== 'object' || Array.isArray(value.creationIntents)) {
      throw new Error('BROWSER_OWNERSHIP_STATE_INVALID: creation intents are malformed.');
    }
    for (const [purpose, intent] of Object.entries(value.creationIntents)) {
      if (!intent || intent.purpose !== purpose || typeof intent.url !== 'string'
        || !Number.isInteger(intent.windowId) || intent.windowId !== value.windowId
        || typeof intent.anchorTargetId !== 'string' || intent.anchorTargetId.trim() === ''
        || !Array.isArray(intent.baselineTargetIds)
        || intent.baselineTargetIds.some((id) => typeof id !== 'string' || id.trim() === '')
        || new Set(intent.baselineTargetIds).size !== intent.baselineTargetIds.length
        || !Number.isFinite(Date.parse(intent.intentRecordedAt ?? ''))) {
        throw new Error(`BROWSER_OWNERSHIP_STATE_INVALID: creation intent ${purpose} is malformed.`);
      }
    }
  }
  if (value.targetTransition != null) {
    const transition = value.targetTransition;
    if (!transition || typeof transition.transitionId !== 'string' || transition.transitionId.trim() === ''
      || !['ADD', 'REMOVE', 'RECONCILE_REMOVE', 'WINDOW_REPLACE'].includes(transition.operation)
      || !Number.isInteger(transition.automationWindowId) || transition.automationWindowId !== value.windowId
      || !Number.isInteger(transition.priorBindingRevision) || transition.priorBindingRevision < 1
      || !Array.isArray(transition.priorOwnedTargetIds) || transition.priorOwnedTargetIds.length < 1
      || transition.priorOwnedTargetIds.length > 3
      || transition.priorOwnedTargetIds.some((id) => typeof id !== 'string' || id.trim() === '')
      || new Set(transition.priorOwnedTargetIds).size !== transition.priorOwnedTargetIds.length
      || (transition.operation === 'ADD' && (typeof transition.anchorTargetId !== 'string' || transition.targetId !== null))
      || (['REMOVE', 'RECONCILE_REMOVE'].includes(transition.operation) && (typeof transition.targetId !== 'string' || transition.anchorTargetId !== null))
      || (transition.operation === 'WINDOW_REPLACE' && (transition.targetId !== null || transition.anchorTargetId !== null))) {
      throw new Error('BROWSER_OWNERSHIP_STATE_INVALID: target transition is malformed.');
    }
  }
  if (value.windowReplacementIntent != null) {
    const intent = value.windowReplacementIntent;
    if (!intent || typeof intent.transitionId !== 'string' || intent.transitionId.trim() === ''
      || !Number.isInteger(intent.priorWindowId) || intent.priorWindowId !== value.windowId
      || !Array.isArray(intent.baselineTargetIds)
      || intent.baselineTargetIds.some((id) => typeof id !== 'string' || id.trim() === '')
      || new Set(intent.baselineTargetIds).size !== intent.baselineTargetIds.length
      || typeof intent.markerUrl !== 'string' || !intent.markerUrl.startsWith('data:text/plain,mission-control-window-')
      || !Number.isFinite(Date.parse(intent.intentRecordedAt ?? ''))
      || ((intent.createdTargetId === null) !== (intent.createdWindowId === null))
      || (intent.createdTargetId !== null && (typeof intent.createdTargetId !== 'string' || !Number.isInteger(intent.createdWindowId)))
      || value.targetTransition?.operation !== 'WINDOW_REPLACE'
      || value.targetTransition.transitionId !== intent.transitionId) {
      throw new Error('BROWSER_OWNERSHIP_STATE_INVALID: window replacement intent is malformed.');
    }
  }
}

function assertLocalTargetTransition(transition, expected) {
  const samePrior = JSON.stringify([...transition.priorOwnedTargetIds].sort()) === JSON.stringify([...expected.priorOwnedTargetIds].sort());
  if (transition.operation !== expected.operation || transition.automationWindowId !== expected.automationWindowId || !samePrior
    || (expected.operation === 'ADD' && transition.anchorTargetId !== expected.anchorTargetId)
    || (['REMOVE', 'RECONCILE_REMOVE'].includes(expected.operation) && transition.targetId !== expected.targetId)) {
    throw new Error('AUTOMATION_OWNED_TARGET_TRANSITION_MISMATCH: pending transition differs from the requested exact mutation.');
  }
}

function isChatGptPage(target) {
  if (target?.type !== 'page' || typeof target.url !== 'string') return false;
  try { return new URL(target.url).hostname === 'chatgpt.com'; } catch { return false; }
}

function normalizeAutomationTargetUrl(value) {
  if (value === CHATGPT_ROOT) return CHATGPT_ROOT;
  return normalizeConversationUrl(value);
}

function readinessExpression(expectedUrl) {
  const encoded = JSON.stringify(expectedUrl);
  return `(() => {
    const expected = ${encoded};
    const current = location.href;
    const isRoot = expected === 'https://chatgpt.com/';
    const urlReady = isRoot
      ? location.origin === 'https://chatgpt.com' && location.pathname === '/'
      : current === expected || current === expected + '/';
    const composer = document.querySelector('#prompt-textarea') || document.querySelector('[data-testid="prompt-textarea"]') || document.querySelector('textarea[aria-label="Chat with ChatGPT"]');
    const loginRequired = location.pathname.startsWith('/auth/') || Boolean(document.querySelector('a[href*="/auth/login"], button[data-testid="login-button"]'));
    return { ready: urlReady && Boolean(composer) && !loginRequired, loginRequired, urlReady, composerFound: Boolean(composer) };
  })()`;
}

const RATE_LIMIT_DISMISS_EXPRESSION = `(() => {
  const visible = (element) => {
    if (!element || !element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const normalize = (value) => String(value || '').trim().replace(/\\s+/g, ' ').toLowerCase();
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible);
  const matched = dialogs.filter((dialog) => {
    const text = normalize(dialog.innerText);
    return text.includes('too many chat requests are coming too quick') || text.includes('too many chat requests are coming too quickly');
  });
  const buttons = matched.flatMap((dialog) => [...dialog.querySelectorAll('button')].filter(visible).filter((button) => normalize(button.innerText || button.getAttribute('aria-label')) === 'got it'));
  if (matched.length === 0) return { present: false, dismissed: false, dialogCount: 0, gotItCount: 0 };
  if (matched.length !== 1 || buttons.length !== 1) return { present: true, dismissed: false, reason: 'RATE_LIMIT_MODAL_OR_GOT_IT_AMBIGUOUS', dialogCount: matched.length, gotItCount: buttons.length };
  buttons[0].click();
  return { present: true, dismissed: true, dialogCount: 1, gotItCount: 1 };
})()`;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
