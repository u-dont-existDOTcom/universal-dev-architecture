import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { managedChatGptTabTelemetry, normalizeConversationUrl } from './core.mjs';
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
    let changed = false;
    for (const target of all) {
      if (!ownedIds.has(target.id)) continue;
      const windowId = await this.protocol.getWindowId(target.id).catch(() => null);
      if (windowId !== ownership.windowId) {
        delete ownership.targets[target.id];
        changed = true;
        continue;
      }
      result.push({ ...target, automationOwned: true, automationWindowId: ownership.windowId });
    }
    if (changed) await this.ownershipStore.write(ownership);
    return result;
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
    const result = await this.rawBrowser.closeTarget(targetId);
    delete ownership.targets[targetId];
    await this.ownershipStore.write(ownership);
    return result;
  }

  async inspectChat(target, expectedUrl) {
    await this.#assertOwned(target?.id);
    return this.rawBrowser.inspectChat(target, expectedUrl);
  }

  async currentModelLabel(target, expectedUrl) {
    await this.#assertOwned(target?.id);
    return this.rawBrowser.currentModelLabel(target, expectedUrl);
  }

  async switchModel(target, input) {
    await this.#assertOwned(target?.id);
    return this.rawBrowser.switchModel(target, input);
  }

  async selectAppsForMessage(target, input) {
    await this.#assertOwned(target?.id);
    return this.rawBrowser.selectAppsForMessage(target, input);
  }

  async verifyModelRoundTrip(target, input) {
    await this.#assertOwned(target?.id);
    return this.rawBrowser.verifyModelRoundTrip(target, input);
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
      throw new ChatGptRateLimitRetryError({
        retryAfterMs: RATE_LIMIT_RETRY_MS,
        relayStage: error?.relayStage ?? 'UNKNOWN',
        clickedAtObserved: error?.clickedAtObserved ?? null,
        startedAtObserved: error?.startedAtObserved ?? null,
      });
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

  async #createOwnedTarget(url, purpose, hardCeiling) {
    if (!Number.isInteger(hardCeiling) || hardCeiling < 1 || hardCeiling > 3) throw new Error('Automation-owned ChatGPT hard ceiling must be 1-3.');
    const ownership = await this.#ensureOwnership();
    const owned = await this.listTargets();
    if (owned.length >= hardCeiling) throw new Error(`MANAGED_CHATGPT_TAB_HARD_CEILING: refusing to create automation-owned tab ${owned.length + 1}; ceiling is ${hardCeiling}.`);
    const anchor = owned[0];
    if (!anchor) throw new Error('Automation-owned window has no anchor target.');
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
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    };
    await this.ownershipStore.write(ownership);
    const target = await this.#waitForRawTarget(created.targetId);
    await this.protocol.waitForReady(target, url);
    return { ...target, url, created: true, reused: false, automationOwned: true, automationWindowId: ownership.windowId };
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
      updatedAt: new Date().toISOString(),
    };
    await this.ownershipStore.write(ownership);
    const target = await this.#waitForRawTarget(created.targetId);
    await this.protocol.waitForReady(target, CHATGPT_ROOT);
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
}

function isChatGptPage(target) {
  if (target?.type !== 'page' || typeof target.url !== 'string') return false;
  try { return new URL(target.url).hostname === 'chatgpt.com'; } catch { return false; }
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
