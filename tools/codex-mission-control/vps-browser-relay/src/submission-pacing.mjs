export const GLOBAL_SUBMISSION_COOLDOWN = 'GLOBAL_SUBMISSION_COOLDOWN';

export class GlobalSubmissionPacer {
  constructor({ stateStore, minIntervalMs = 60_000, now = Date.now }) {
    if (!stateStore || typeof stateStore.read !== 'function' || typeof stateStore.write !== 'function') {
      throw new Error('Global submission pacing requires a relay state store.');
    }
    if (!Number.isInteger(minIntervalMs) || minIntervalMs < 15_000 || minIntervalMs > 600_000) {
      throw new Error('minIntervalMs must be an integer from 15000 to 600000.');
    }
    this.stateStore = stateStore;
    this.minIntervalMs = minIntervalMs;
    this.now = now;
    this.tail = Promise.resolve();
  }

  status(state, nowMs = this.now()) {
    const lastSubmissionAt = state?.submissionPacing?.lastSubmissionAt ?? null;
    const lastMs = Date.parse(lastSubmissionAt ?? '');
    const nextMs = Number.isFinite(lastMs) ? lastMs + this.minIntervalMs : null;
    const retryAfterMs = nextMs == null ? 0 : Math.max(0, nextMs - nowMs);
    return {
      minimumIntervalMs: this.minIntervalMs,
      lastSubmissionAt,
      retryAfterMs,
      nextSubmissionAt: nextMs == null ? null : new Date(nextMs).toISOString(),
      ready: retryAfterMs === 0,
    };
  }

  async assertReady() {
    const pacing = this.status(await this.stateStore.read());
    if (!pacing.ready) throw new GlobalSubmissionCooldownError(pacing);
    return pacing;
  }

  async submit({ beforeSubmit = null, submit }) {
    if (typeof submit !== 'function') throw new Error('Global submission pacing requires a submit function.');
    const operation = this.tail.then(async () => {
      const state = await this.stateStore.read();
      const pacing = this.status(state);
      if (!pacing.ready) throw new GlobalSubmissionCooldownError(pacing);
      if (beforeSubmit) await beforeSubmit();
      try {
        const result = await submit();
        await this.#recordSubmissionBoundaryOrFailClosed(result?.clickedAtObserved ?? result?.startedAtObserved ?? null);
        return result;
      } catch (error) {
        if (!error?.submissionBoundaryPersistenceAttempted && (error?.relayStage === 'CLICKED' || error?.relayStage === 'GENERATION_STARTED')) {
          await this.#recordSubmissionBoundaryOrFailClosed(error.clickedAtObserved ?? error.startedAtObserved ?? null);
        }
        throw error;
      }
    });
    this.tail = operation.catch(() => {});
    return operation;
  }

  async #recordSubmissionBoundary(observedAt) {
    const observedMs = Date.parse(observedAt ?? '');
    const boundaryAt = Number.isFinite(observedMs) ? new Date(observedMs).toISOString() : new Date(this.now()).toISOString();
    const state = await this.stateStore.read();
    state.submissionPacing = { lastSubmissionAt: boundaryAt };
    await this.stateStore.write(state);
  }

  async #recordSubmissionBoundaryOrFailClosed(observedAt) {
    try {
      await this.#recordSubmissionBoundary(observedAt);
    } catch (error) {
      if (error && typeof error === 'object') {
        error.relayStage = 'CLICKED';
        error.clickedAtObserved = observedAt;
        error.submissionBoundaryPersistenceAttempted = true;
      }
      throw error;
    }
  }
}

export class GlobalSubmissionCooldownError extends Error {
  constructor(pacing) {
    super(`${GLOBAL_SUBMISSION_COOLDOWN}: retry after ${pacing.retryAfterMs} ms.`);
    this.name = 'GlobalSubmissionCooldownError';
    this.code = GLOBAL_SUBMISSION_COOLDOWN;
    Object.assign(this, pacing);
  }
}

export function isGlobalSubmissionCooldown(error) {
  return error?.code === GLOBAL_SUBMISSION_COOLDOWN;
}

export function publicCooldown(error) {
  return {
    minimumIntervalMs: error.minimumIntervalMs,
    lastSubmissionAt: error.lastSubmissionAt,
    retryAfterMs: error.retryAfterMs,
    nextSubmissionAt: error.nextSubmissionAt,
    ready: false,
  };
}
