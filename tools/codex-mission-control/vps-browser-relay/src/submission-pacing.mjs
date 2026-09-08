export const GLOBAL_SUBMISSION_COOLDOWN = 'GLOBAL_SUBMISSION_COOLDOWN';
export const CHATGPT_RATE_LIMIT_RETRY = 'CHATGPT_RATE_LIMIT_RETRY';
export const CHATGPT_RATE_LIMIT_RETRY_EXHAUSTED = 'CHATGPT_RATE_LIMIT_RETRY_EXHAUSTED';

export class GlobalSubmissionPacer {
  constructor({ stateStore, minIntervalMs = 60_000, now = Date.now, sleepImpl = sleep }) {
    if (!stateStore || typeof stateStore.read !== 'function' || typeof stateStore.write !== 'function') {
      throw new Error('Global submission pacing requires a relay state store.');
    }
    if (!Number.isInteger(minIntervalMs) || minIntervalMs < 15_000 || minIntervalMs > 600_000) {
      throw new Error('minIntervalMs must be an integer from 15000 to 600000.');
    }
    if (typeof sleepImpl !== 'function') throw new Error('Global submission pacing requires a sleep function.');
    this.stateStore = stateStore;
    this.minIntervalMs = minIntervalMs;
    this.now = now;
    this.sleepImpl = sleepImpl;
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
      let rateLimitRetries = 0;
      for (;;) {
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
          if (!isChatGptRateLimitRetry(error)) throw error;
          if (rateLimitRetries >= 1) {
            throw new ChatGptRateLimitRetryExhaustedError({
              retryAfterMs: error.retryAfterMs,
              relayStage: error.relayStage,
              clickedAtObserved: error.clickedAtObserved,
              startedAtObserved: error.startedAtObserved,
            });
          }
          rateLimitRetries += 1;
          const postFailurePacing = this.status(await this.stateStore.read());
          const waitMs = Math.max(error.retryAfterMs, postFailurePacing.retryAfterMs);
          await this.sleepImpl(waitMs);
        }
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

export class ChatGptRateLimitRetryError extends Error {
  constructor({ retryAfterMs = 30_000, relayStage = 'UNKNOWN', clickedAtObserved = null, startedAtObserved = null } = {}) {
    super(`${CHATGPT_RATE_LIMIT_RETRY}: provider requested a bounded retry after ${retryAfterMs} ms.`);
    this.name = 'ChatGptRateLimitRetryError';
    this.code = CHATGPT_RATE_LIMIT_RETRY;
    this.retryAfterMs = retryAfterMs;
    this.relayStage = relayStage;
    this.clickedAtObserved = clickedAtObserved;
    this.startedAtObserved = startedAtObserved;
  }
}

export class ChatGptRateLimitRetryExhaustedError extends Error {
  constructor({ retryAfterMs, relayStage, clickedAtObserved, startedAtObserved }) {
    super(`${CHATGPT_RATE_LIMIT_RETRY_EXHAUSTED}: the exact retry also hit the provider rate-limit gate.`);
    this.name = 'ChatGptRateLimitRetryExhaustedError';
    this.code = CHATGPT_RATE_LIMIT_RETRY_EXHAUSTED;
    this.retryAfterMs = retryAfterMs;
    this.relayStage = relayStage ?? 'UNKNOWN';
    this.clickedAtObserved = clickedAtObserved ?? null;
    this.startedAtObserved = startedAtObserved ?? null;
  }
}

export function isGlobalSubmissionCooldown(error) {
  return error?.code === GLOBAL_SUBMISSION_COOLDOWN;
}

export function isChatGptRateLimitRetry(error) {
  return error?.code === CHATGPT_RATE_LIMIT_RETRY;
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

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
