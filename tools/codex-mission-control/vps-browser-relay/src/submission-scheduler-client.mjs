export class SubmissionSchedulerClient {
  constructor({ url, token, producerId, requestTimeoutMs = 10_000, fetchImpl = fetch }) {
    if (!url || !token || token.length < 32 || !producerId) throw new Error('Submission scheduler client requires URL, producer identity, and a 32+ character token.');
    this.url = url.replace(/\/$/, '');
    this.token = token;
    this.producerId = producerId;
    this.requestTimeoutMs = requestTimeoutMs;
    this.fetchImpl = fetchImpl;
  }

  status() { return this.#request('/status', { method: 'GET' }); }
  admit(input) { return this.#json('/admissions', input); }
  validateAdmission(input) { return this.#json('/admissions/validate', input); }
  recordBoundary(input) { return this.#json('/boundaries', input); }
  bindTarget(input) { return this.#json('/target-bindings', input); }
  recordRateLimit(input) { return this.#json('/provider-rate-limits', input); }
  abortBeforeBoundary(input) { return this.#json('/aborts', input); }
  recordOutcome(input) { return this.#json('/outcomes', input); }
  ledger(limit = 200) { return this.#request(`/ledger?limit=${encodeURIComponent(limit)}`, { method: 'GET' }); }

  #json(path, body) {
    return this.#request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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
