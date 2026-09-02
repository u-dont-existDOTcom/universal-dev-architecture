export class MissionControlClient {
  constructor({ url, producerId, token, requestTimeoutMs = 30_000, fetchImpl = fetch }) {
    this.url = url;
    this.producerId = producerId;
    this.token = token;
    this.requestTimeoutMs = requestTimeoutMs;
    this.fetchImpl = fetchImpl;
  }

  async fetchFleet() {
    const response = await this.fetchImpl(`${this.url}/api/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'x-mission-control-producer-id': this.producerId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `relay-fleet-${Date.now()}`,
        method: 'tools/call',
        params: { name: 'mission_control_get_fleet', arguments: {} },
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
    if (!structured || !Array.isArray(structured.workers)) {
      throw new Error('Mission Control MCP response is missing structured fleet content.');
    }
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
