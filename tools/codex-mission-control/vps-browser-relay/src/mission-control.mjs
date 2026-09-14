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

  async fetchWorkCreationAuthorization(worker, authorizationId) {
    const payload = await this.#requestJson(`/api/work-task-creation/${encodeURIComponent(worker)}?authorizationId=${encodeURIComponent(authorizationId)}`, { method: 'GET' });
    if (!payload?.authorization) throw new Error('WORK_CREATION_AUTHORITY_UNAVAILABLE');
    return payload.authorization;
  }

  async recordWorkCreation(authorization, selection, locator) {
    const occurredAt = new Date().toISOString();
    const evidenceId = `browser-setter:${sha256(`${authorization.authorization_id}:${locator}`).slice(0, 32)}`;
    const payload = await this.#requestJson('/api/events', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schema_version: 2, event_id: evidenceId, mission_id: 'mission-control-live', occurred_at: occurredAt,
        data: { type: 'work_task_creation_selection_applied', worker: authorization.worker,
          evidence_id: evidenceId, authorization_id: authorization.authorization_id,
          directive_id: authorization.directive_id, directive_revision: authorization.directive_revision,
          task_id: authorization.task_id, authorized_profile: authorization.authorized_profile,
          model_setter: selection.model, effort_setter: selection.effort,
          fast_request: authorization.authorized_profile.fastModeRequest, fast_setter: null,
          producer_id: this.producerId, source: 'TRUSTED_MANAGED_BROWSER_TASK_CREATION_BOUNDARY',
          browser_selection: { status: selection.status, model: selection.model, effort: selection.effort,
            managed_target_verified: selection.managed_target_verified, fast_observed: null },
          provider_task_locator: locator, applied_at: occurredAt,
        } }),
    });
    if (payload?.event?.data?.evidence_id !== evidenceId) throw new Error('WORK_CREATION_EVIDENCE_NOT_PERSISTED_DO_NOT_REPLAY');
    return evidenceId;
  }

  async fetchFleet() {
    return this.fetchWorkers(this.workerIds);
  }

  async fetchWorkers(workerIds) {
    if (!Array.isArray(workerIds) || workerIds.length === 0) throw new Error('At least one scoped Mission Control worker ID is required.');
    const workers = [];
    for (const worker of [...new Set(workerIds)]) {
      const structured = await this.#callTool('mission_control_get_worker', { worker });
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

  async #requestJson(path, options) {
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
    if (!response.ok) throw new Error(`Mission Control ${path} failed with HTTP ${response.status}: ${safeMessage(payload)}`);
    return payload;
  }
}

function safeMessage(value) {
  try { return JSON.stringify(value).slice(0, 1000); }
  catch { return 'unreadable error'; }
}
