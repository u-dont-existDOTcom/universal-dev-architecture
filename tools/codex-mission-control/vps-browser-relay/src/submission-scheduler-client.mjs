import { createHmac } from 'node:crypto';

export class SubmissionSchedulerClient {
  constructor({ url, token, producerId, attestorKey, pacingDomain, requestTimeoutMs = 10_000, fetchImpl = fetch }) {
    if (!url || !token || token.length < 32 || !producerId) throw new Error('Submission scheduler client requires URL, producer identity, and a 32+ character token.');
    if (typeof attestorKey !== 'string' || attestorKey.length < 32) throw new Error('Submission scheduler client requires a distinct 32+ character target-binding attestor key.');
    if (attestorKey === token) throw new Error('Target-binding attestor key must differ from the ordinary relay bearer token.');
    if (typeof pacingDomain !== 'string' || pacingDomain.trim() === '') throw new Error('Submission scheduler client requires the exact shared pacing domain.');
    this.url = url.replace(/\/$/, '');
    this.token = token;
    this.producerId = producerId;
    this.attestorKey = attestorKey;
    this.pacingDomain = pacingDomain;
    this.requestTimeoutMs = requestTimeoutMs;
    this.fetchImpl = fetchImpl;
  }

  status() { return this.#request('/status', { method: 'GET' }); }
  admit(input) { return this.#json('/admissions', input); }
  validateAdmission(input) { return this.#json('/admissions/validate', input); }
  recordBoundary(input) { return this.#json('/boundaries', input); }
  bindTarget(input) { return this.#json('/target-bindings', input); }
  beginTargetTransition(input) { return this.#signedTargetTransition('/relay-target-transitions/begin', 'BEGIN', input); }
  commitTargetTransition(input) { return this.#signedTargetTransition('/relay-target-transitions/commit', 'COMMIT', input); }
  abortTargetTransition(input) { return this.#signedTargetTransition('/relay-target-transitions/abort', 'ABORT', input); }
  recordRateLimit(input) { return this.#json('/provider-rate-limits', input); }
  abortBeforeBoundary(input) { return this.#json('/aborts', input); }
  recordOutcome(input) { return this.#json('/outcomes', input); }
  reportHealth(input) { return this.#json('/relay-health', input); }
  ledger(limit = 200) { return this.#request(`/ledger?limit=${encodeURIComponent(limit)}`, { method: 'GET' }); }

  #json(path, body) {
    return this.#request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }

  #signedTargetTransition(path, phase, input) {
    const payload = targetTransitionPayload(phase, {
      ...input,
      pacingDomain: this.pacingDomain,
      producerId: this.producerId,
    });
    const proof = createHmac('sha256', this.attestorKey).update(canonicalJson(payload)).digest('hex');
    return this.#json(path, { ...payload, proof });
  }

  async #request(path, options) {
    let response;
    try {
      response = await this.fetchImpl(`${this.url}${path}`, {
        ...options,
        headers: {
          authorization: `Bearer ${this.token}`,
          'x-mission-control-producer-id': this.producerId,
          ...(options.headers ?? {}),
        },
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (cause) {
      const error = new Error('CENTRAL_SCHEDULER_UNREACHABLE: no browser send is permitted while the central scheduler is unavailable.', { cause });
      error.code = 'CENTRAL_SCHEDULER_UNREACHABLE';
      throw error;
    }
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); }
    catch { payload = { error: `non-JSON HTTP ${response.status}` }; }
    if (!response.ok) {
      const error = new Error(typeof payload?.error === 'string' ? payload.error : `Submission scheduler HTTP ${response.status}.`);
      error.code = typeof payload?.code === 'string' ? payload.code : 'CENTRAL_SCHEDULER_REJECTED';
      error.statusCode = response.status;
      if (payload && typeof payload === 'object') Object.assign(error, payload);
      throw error;
    }
    return payload;
  }
}

function targetTransitionPayload(phase, input) {
  const common = {
    phase,
    pacingDomain: input.pacingDomain,
    producerId: input.producerId,
    transitionId: input.transitionId,
    operation: input.operation,
    reason: input.reason,
    hostAlias: input.hostAlias,
    hostRole: input.hostRole,
    deploymentEpoch: input.deploymentEpoch,
    leaseId: input.leaseId,
    automationWindowId: input.automationWindowId,
    priorBindingRevision: input.priorBindingRevision,
    priorOwnedTargetIds: [...input.priorOwnedTargetIds].sort(),
    anchorTargetId: input.operation === 'ADD' ? input.anchorTargetId : null,
    targetId: ['REMOVE', 'RECONCILE_REMOVE'].includes(input.operation) ? input.targetId : null,
  };
  if (phase === 'COMMIT') return {
    ...common,
    postAutomationWindowId: input.postAutomationWindowId,
    postOwnedTargetIds: [...input.postOwnedTargetIds].sort(),
    transitionedTargetId: input.transitionedTargetId,
  };
  if (phase === 'ABORT') return {
    ...common,
    observedAutomationWindowId: input.observedAutomationWindowId,
    observedOwnedTargetIds: [...input.observedOwnedTargetIds].sort(),
  };
  return common;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
