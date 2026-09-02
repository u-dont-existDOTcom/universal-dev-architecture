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
    if (!Array.isArray(workerIds) || workerIds.length === 0) {
      throw new Error('At least one scoped Mission Control worker ID is required.');
    }
    const workers = [];
    for (const worker of [...new Set(workerIds)]) {
      const structured = await this.#callTool('mission_control_get_worker', { worker });
      if (!structured || typeof structured !== 'object' || Array.isArray(structured) || structured.id !== worker) {
        throw new Error(`Mission Control returned an invalid scoped worker snapshot for ${worker}.`);
      }
      workers.push(structured);
    }
    return { generatedAt: new Date().toISOString(), workers };
  }

  async #callTool(name, args) {
    const response = await this.fetchImpl(`${this.url}/api/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'x-mission-control-producer-id': this.producerId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `relay-${name}-${Date.now()}`,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`Mission Control MCP returned non-JSON HTTP ${response.status}.`);
    }
    if (!response.ok) {
      throw new Error(`Mission Control MCP read failed with HTTP ${response.status}: ${safeMessage(payload)}`);
    }
    if (payload?.error) throw new Error(`Mission Control MCP error: ${payload.error.message ?? safeMessage(payload.error)}`);
    const structured = payload?.result?.structuredContent;
    if (!structured) throw new Error(`Mission Control MCP response is missing structured content for ${name}.`);
    return structured;
  }
}

function safeMessage(value) {
  try {
    return JSON.stringify(value).slice(0, 1000);
  } catch {
    return 'unreadable error';
  }
}
