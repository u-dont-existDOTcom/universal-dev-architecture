import { sha256 } from './core.mjs';

export class MissionControlClient {
  constructor({ url, producerId, token, workerIds = [], requestTimeoutMs = 30_000, fetchImpl = fetch }) {
    this.url = url;
    this.producerId = producerId;
    this.token = token;
    this.workerIds = workerIds;
    this.requestTimeoutMs = requestTimeoutMs;
    this.fetchImpl = fetchImpl;
  }

  async fetchFleet() {
    return this.fetchWorkers(this.workerIds);
  }

  async fetchWorkers(workerIds) {
    if (!Array.isArray(workerIds) || workerIds.length === 0) throw new Error('At least one scoped Mission Control worker ID is required.');
    const workers = [];
    for (const worker of [...new Set(workerIds)]) {
      const structured = await this.#callTool('mission_control_get_worker_transport', { worker });
      const snapshot = structured?.worker && typeof structured.worker === 'object' && !Array.isArray(structured.worker)
        ? structured.worker
        : structured;
      if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || snapshot.id !== worker) {
        throw new Error(`Mission Control returned an invalid scoped worker snapshot for ${worker}.`);
      }
      workers.push(snapshot);
    }
    return { generatedAt: new Date().toISOString(), workers };
  }

  async recordEvidence(worker, { receiptId, summary, refs, occurredAt = new Date().toISOString() }) {
    if (!worker || !receiptId || !summary || !Array.isArray(refs) || refs.length === 0) {
      throw new Error('Mission Control evidence requires worker, receiptId, summary, and refs.');
    }
    const event = {
      schema_version: 2,
      event_id: `relay-evidence:${sha256(`${this.producerId}:${receiptId}`).slice(0, 32)}`,
      mission_id: 'mission-control-live',
      occurred_at: occurredAt,
      data: {
        type: 'evidence_receipt_recorded',
        worker,
        receipt_id: receiptId,
        producer_id: this.producerId,
        producer_role: 'COLLECTOR',
        evidence_class: 'ARTIFACT',
        independence: 'SAME_PROVENANCE',
        freshness: 'CURRENT',
        exact_candidate_sha256: null,
        summary,
        refs,
        verified: true,
        changed_path_manifest: null,
      },
    };
    const payload = await this.#requestJson('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!payload?.event) throw new Error('Mission Control evidence ingestion did not return a stored event.');
    return payload.event;
  }

  async copyProviderDecision(input) {
    const payload = await this.#requestJson('/api/github/decision-receipts/copy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }, { allowConflict: true });
    if (payload?.status !== 'INGESTED' || payload?.requestId !== input.requestId
      || payload?.providerSessionId !== input.providerSessionId
      || payload?.canonicalBodySha256 !== input.canonicalBodySha256) {
      throw new Error(`Mission Control deterministic decision copy did not confirm exact ingestion: ${safeMessage(payload)}`);
    }
    return payload;
  }

  async validateProviderDecision(input) {
    let payload;
    try {
      payload = await this.#requestJson('/api/github/decision-receipts/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }, { allowConflict: true });
    } catch (error) {
      throw recoveryFailure('VALID_DECISION_PRESENT_COPIER_FAILED', `Mission Control canonical-schema validation was unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    if (payload?.code === 'CANONICAL_SCHEMA_OR_IDENTITY_INVALID') {
      throw recoveryFailure('ASSISTANT_RESPONSE_PRESENT_BUT_INVALID', `Mission Control authoritative canonical-schema validation rejected the recovered response: ${safeMessage(payload)}`);
    }
    if (payload?.status !== 'VALIDATED'
      || payload?.validationScope !== 'CANONICAL_SCHEMA_AND_REQUEST_IDENTITY'
      || payload?.ingestionAuthorized !== false
      || payload?.requestId !== input.requestId
      || payload?.providerSessionId !== input.providerSessionId
      || payload?.canonicalBodySha256 !== input.canonicalBodySha256) {
      throw recoveryFailure('READBACK_UNRESOLVED', `Mission Control canonical-schema validation did not confirm exact request/session/body identity: ${safeMessage(payload)}`);
    }
    return payload;
  }

  async requestExecutionAdmission(worker, input) {
    return this.#requestJson(`/api/worker-channel/${encodeURIComponent(worker)}/admission`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }, { allowConflict: true });
  }

  async requestWorkExecutionPreflight(worker, input) {
    return this.#requestJson(`/api/worker-channel/${encodeURIComponent(worker)}/preflight`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }, { allowConflict: true });
  }

  async recordWorkerEvents(worker, events) {
    const payload = await this.#requestJson(`/api/worker-channel/${encodeURIComponent(worker)}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events }),
    });
    if (!Array.isArray(payload?.events) || payload.events.length !== events.length) {
      throw new Error('Mission Control worker-channel ingestion did not persist every lifecycle event.');
    }
    return payload;
  }

  async #callTool(name, args) {
    const payload = await this.#requestJson('/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `relay-${name}-${Date.now()}`,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });
    if (payload?.error) throw new Error(`Mission Control MCP error: ${payload.error.message ?? safeMessage(payload.error)}`);
    const structured = payload?.result?.structuredContent;
    if (!structured) throw new Error(`Mission Control MCP response is missing structured content for ${name}.`);
    return structured;
  }

  async #requestJson(path, options, { allowConflict = false } = {}) {
    const response = await this.fetchImpl(`${this.url}${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${this.token}`,
        'x-mission-control-producer-id': this.producerId,
        ...(options.headers ?? {}),
      },
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); }
    catch { throw new Error(`Mission Control ${path} returned non-JSON HTTP ${response.status}.`); }
    if (!response.ok && !(allowConflict && response.status === 409)) {
      throw new Error(`Mission Control ${path} failed with HTTP ${response.status}: ${safeMessage(payload)}`);
    }
    return payload;
  }
}

function safeMessage(value) {
  try { return JSON.stringify(value).slice(0, 1000); }
  catch { return 'unreadable error'; }
}

function recoveryFailure(classification, message) {
  const error = new Error(message);
  error.code = 'PROVIDER_DECISION_RECOVERY_FAILED';
  error.classification = classification;
  return error;
}
