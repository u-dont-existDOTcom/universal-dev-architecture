import { normalizeConversationUrl } from './core.mjs';

export class ChromeDevtoolsBrowser {
  constructor({ host = '127.0.0.1', port = 9222, pageReadyTimeoutMs = 90_000, submitTimeoutMs = 30_000, generationTimeoutMs = 900_000, fetchImpl = fetch, WebSocketImpl = WebSocket }) {
    this.baseUrl = `http://${host}:${port}`;
    this.pageReadyTimeoutMs = pageReadyTimeoutMs;
    this.submitTimeoutMs = submitTimeoutMs;
    this.generationTimeoutMs = generationTimeoutMs;
    this.fetchImpl = fetchImpl;
    this.WebSocketImpl = WebSocketImpl;
  }

  async doctor() {
    const version = await this.#json('/json/version');
    const targets = await this.listTargets();
    return {
      browser: version.Browser ?? 'UNKNOWN',
      protocolVersion: version['Protocol-Version'] ?? 'UNKNOWN',
      targetCount: targets.length,
      webSocketDebuggerUrlPresent: typeof version.webSocketDebuggerUrl === 'string',
    };
  }

  async listTargets() {
    const value = await this.#json('/json/list');
    if (!Array.isArray(value)) throw new Error('Chrome DevTools /json/list did not return an array.');
    return value.map((target) => ({
      id: target.id,
      type: target.type,
      title: target.title,
      url: target.url,
      webSocketDebuggerUrl: target.webSocketDebuggerUrl,
    }));
  }

  async findOrCreateChatTarget(chatUrl) {
    const normalized = normalizeConversationUrl(chatUrl);
    const targets = await this.listTargets();
    for (const target of targets) {
      if (target.type !== 'page') continue;
      try {
        if (normalizeConversationUrl(target.url) === normalized) {
          await this.activateTarget(target.id);
          return { ...target, url: normalized, created: false };
        }
      } catch {
        // Not a registered conversation target.
      }
    }
    const created = await this.#json(`/json/new?${encodeURIComponent(normalized)}`, { method: 'PUT' });
    if (!created?.id || !created?.webSocketDebuggerUrl) throw new Error('Chrome did not create a debuggable page target.');
    await this.activateTarget(created.id);
    return {
      id: created.id,
      type: created.type ?? 'page',
      title: created.title ?? '',
      url: normalized,
      webSocketDebuggerUrl: created.webSocketDebuggerUrl,
      created: true,
    };
  }

  async activateTarget(targetId) {
    return this.#withBrowserClient((client) => client.send('Target.activateTarget', { targetId }));
  }

  async closeTarget(targetId) {
    const result = await this.#withBrowserClient((client) => client.send('Target.closeTarget', { targetId }));
    return result?.success !== false;
  }

  async inspectChat(target, expectedUrl) {
    return this.#withPageClient(target, async (client) => {
      const result = await client.evaluate(chatInspectionExpression(expectedUrl));
      return result;
    });
  }

  async testChatControls(target, { expectedUrl, modelLabels }) {
    return this.#withPageClient(target, async (client) => {
      const inspection = await client.evaluate(chatInspectionExpression(expectedUrl));
      if (inspection.urlMismatch || inspection.loginRequired || !inspection.composerFound) {
        throw new Error('Registered supervisor chat is not ready for control-plane testing.');
      }
      const result = await client.evaluate(modelControlInspectionExpression(modelLabels));
      if (!result.modelControlFound) throw new Error('ChatGPT model/mode switch control is unavailable.');
      return {
        composer: 'PASSED',
        modeSwitching: 'PASSED',
        registeredCapabilityTests: 'PASSED',
        inspectedAssistantOutput: false,
      };
    });
  }

  async switchModel(target, { expectedUrl, label }) {
    return this.#withPageClient(target, async (client) => {
      await client.send('Runtime.enable');
      const current = await client.evaluate(modelSelectionExpression(expectedUrl, label, 'CURRENT_OR_OPEN'));
      if (current.urlMismatch) throw new Error(`Chat target navigated to an unexpected URL: ${current.currentUrl}`);
      if (current.selected) return { selectedLabel: label, changed: false };
      if (!current.opened) throw new Error(`ChatGPT model/mode switch control is unavailable: ${current.reason ?? 'UNKNOWN'}.`);
      const selected = await waitFor(
        () => client.evaluate(modelSelectionExpression(expectedUrl, label, 'SELECT_OPTION')),
        this.pageReadyTimeoutMs,
        300,
        `ChatGPT model/mode option ${label} did not become available.`,
      );
      if (!selected.selected) throw new Error(`ChatGPT model/mode option ${label} could not be selected.`);
      return { selectedLabel: label, changed: true };
    });
  }

  async waitForGenerationComplete(target, { expectedUrl }) {
    return this.#withPageClient(target, async (client) => {
      await client.send('Runtime.enable');
      let observedGenerating = false;
      let consecutiveIdle = 0;
      const completed = await waitFor(async () => {
        const state = await client.evaluate(generationStateExpression(expectedUrl));
        if (state.urlMismatch) throw new Error(`Chat target changed while waiting for generation: ${state.currentUrl}`);
        if (state.loginRequired) throw new Error('ChatGPT login is required in the VPS browser profile.');
        if (state.generating) {
          observedGenerating = true;
          consecutiveIdle = 0;
          return false;
        }
        consecutiveIdle = state.composerReady ? consecutiveIdle + 1 : 0;
        return consecutiveIdle >= 3 ? state : false;
      }, this.generationTimeoutMs, 500, 'ChatGPT generation did not reach a stable complete UI state.');
      return {
        status: 'GENERATION_COMPLETE',
        observedGenerating,
        completedBy: completed.completedBy,
        inspectedAssistantOutput: false,
        completedAtObserved: new Date().toISOString(),
      };
    });
  }

  async submitExactMessage(target, { expectedUrl, body, bodySha256 }) {
    if (!body || typeof body !== 'string') throw new Error('Cannot submit an empty message.');
    let relayStage = 'CONNECTING';
    try {
      return await this.#withPageClient(target, async (client) => {
      relayStage = 'PREPARING';
      await client.send('Runtime.enable');
      await client.send('Page.enable');
      await waitFor(async () => {
        const result = await client.evaluate(chatInspectionExpression(expectedUrl));
        if (result.urlMismatch) throw new Error(`Chat target navigated to an unexpected URL: ${result.currentUrl}`);
        if (result.loginRequired) throw new Error('ChatGPT login is required in the VPS browser profile.');
        return result.composerFound;
      }, this.pageReadyTimeoutMs, 500, 'ChatGPT composer did not become ready.');

      const composer = await client.evaluate(composerPreparationExpression(body));
      if (!composer.ok) {
        if (composer.reason === 'COMPOSER_CONTAMINATED') {
          throw new Error('Composer contains different text; relay refused to overwrite it.');
        }
        throw new Error(`Composer is not ready: ${composer.reason ?? 'UNKNOWN'}.`);
      }
      if (!composer.alreadyExact) {
        await client.send('Input.insertText', { text: body });
      }
      const verified = await client.evaluate(composerVerificationExpression(body));
      if (!verified.exact) {
        throw new Error(`Composer byte check failed before submission (expected ${body.length} characters, observed ${verified.length ?? 'unknown'}).`);
      }

      relayStage = 'READY_TO_CLICK';
      const send = await client.evaluate(sendButtonExpression());
      if (!send.ok) throw new Error(`ChatGPT send control is unavailable: ${send.reason ?? 'UNKNOWN'}.`);
      relayStage = 'CLICKED';

      const confirmed = await waitFor(async () => {
        const result = await client.evaluate(submissionConfirmationExpression(body, expectedUrl));
        if (result.urlMismatch) throw new Error(`Chat target changed during submission: ${result.currentUrl}`);
        return result.confirmed ? result : false;
      }, this.submitTimeoutMs, 400, 'Submitted user message was not confirmed before the timeout.');

      relayStage = 'CONFIRMED';
      return {
        status: 'SUBMITTED_CONFIRMED',
        targetId: target.id,
        conversationUrl: normalizeConversationUrl(expectedUrl),
        bodySha256,
        bodyLength: body.length,
        confirmedBy: confirmed.confirmedBy,
        submittedAtObserved: new Date().toISOString(),
        providerSourceTime: null,
        limitations: [
          'The relay confirmed only the exact outbound user message; it did not read or extract assistant output.',
          'submittedAtObserved is a relay observation time, not a provider-issued source timestamp.',
        ],
      };
      });
    } catch (error) {
      if (error && typeof error === 'object') error.relayStage = relayStage;
      throw error;
    }
  }

  async outboundMessagePresent(target, { expectedUrl, body }) {
    return this.#withPageClient(target, async (client) => {
      const result = await client.evaluate(submissionConfirmationExpression(body, expectedUrl));
      return Boolean(result.confirmed);
    });
  }

  async #withBrowserClient(callback) {
    const version = await this.#json('/json/version');
    if (typeof version.webSocketDebuggerUrl !== 'string') throw new Error('Chrome browser debugging WebSocket is unavailable.');
    const client = await CdpConnection.connect(version.webSocketDebuggerUrl, this.WebSocketImpl);
    try {
      return await callback(client);
    } finally {
      client.close();
    }
  }

  async #withPageClient(target, callback) {
    let page = target;
    if (!page.webSocketDebuggerUrl) {
      page = (await this.listTargets()).find((candidate) => candidate.id === target.id);
    }
    if (!page?.webSocketDebuggerUrl) throw new Error(`Page target ${target.id} has no debugging WebSocket.`);
    const client = await CdpConnection.connect(page.webSocketDebuggerUrl, this.WebSocketImpl);
    try {
      return await callback(client);
    } finally {
      client.close();
    }
  }

  async #json(path, options = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...options,
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error(`Chrome DevTools endpoint ${path} returned non-JSON HTTP ${response.status}.`);
    }
    if (!response.ok) throw new Error(`Chrome DevTools endpoint ${path} failed with HTTP ${response.status}.`);
    return value;
  }
}

class CdpConnection {
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
    return new CdpConnection(socket);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (result?.exceptionDetails) {
      throw new Error(`Browser expression failed: ${result.exceptionDetails.text ?? 'unknown exception'}`);
    }
    return result?.result?.value;
  }

  close() {
    try { this.socket.close(); } catch { /* ignore */ }
  }

  async #onMessage(event) {
    let raw = event.data;
    if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
    else if (ArrayBuffer.isView(raw)) raw = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString('utf8');
    else if (typeof raw !== 'string' && raw?.text) raw = await raw.text();
    if (typeof raw !== 'string') return;
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (!message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(`CDP ${message.error.code}: ${message.error.message}`));
    else pending.resolve(message.result);
  }

  #rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

function chatInspectionExpression(expectedUrl) {
  return wrapExpression(`
    const expected = ${JSON.stringify(normalizeConversationUrl(expectedUrl))};
    const normalize = (value) => {
      try {
        const url = new URL(value);
        const match = url.pathname.match(/^\\/c\\/([A-Za-z0-9_-]+)\\/?$/);
        return url.protocol === 'https:' && url.hostname === 'chatgpt.com' && match ? 'https://chatgpt.com/c/' + match[1] : null;
      } catch { return null; }
    };
    const current = normalize(location.href);
    const composer = document.querySelector('#prompt-textarea, [data-testid="prompt-textarea"], div.ProseMirror[contenteditable="true"], textarea[placeholder]');
    return {
      currentUrl: location.href,
      urlMismatch: current !== expected,
      composerFound: Boolean(composer),
      loginRequired: location.pathname.startsWith('/auth/') || Boolean(document.querySelector('a[href*="/auth/login"], button[data-testid="login-button"]')),
    };
  `);
}

function modelControlInspectionExpression(modelLabels) {
  return wrapExpression(`
    const labels = ${JSON.stringify([modelLabels.extraHigh, modelLabels.pro])};
    const buttons = [...document.querySelectorAll('button')];
    const modelControl = document.querySelector('button[data-testid="model-switcher-dropdown-button"], button[aria-haspopup="menu"]')
      || buttons.find((button) => labels.some((label) => (button.getAttribute('aria-label') ?? '').includes(label)));
    return { modelControlFound: Boolean(modelControl) };
  `);
}

function modelSelectionExpression(expectedUrl, label, stage) {
  return wrapExpression(`
    const expected = ${JSON.stringify(normalizeConversationUrl(expectedUrl))};
    const wanted = ${JSON.stringify(label)};
    const stage = ${JSON.stringify(stage)};
    const normalize = (value) => {
      try {
        const url = new URL(value);
        const match = url.pathname.match(/^\\/c\\/([A-Za-z0-9_-]+)\\/?$/);
        return url.protocol === 'https:' && url.hostname === 'chatgpt.com' && match ? 'https://chatgpt.com/c/' + match[1] : null;
      } catch { return null; }
    };
    if (normalize(location.href) !== expected) return { urlMismatch: true, currentUrl: location.href };
    const normalizedText = (element) => (element.innerText ?? element.getAttribute('aria-label') ?? '').trim();
    const visible = (element) => Boolean(element?.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
    const controls = [...document.querySelectorAll('button[data-testid="model-switcher-dropdown-button"], button[aria-haspopup="menu"], button[aria-haspopup="listbox"]')]
      .filter(visible);
    if (controls.some((button) => normalizedText(button).includes(wanted))) return { selected: true, opened: false };
    if (stage === 'CURRENT_OR_OPEN') {
      const control = controls[0];
      if (!control) return { selected: false, opened: false, reason: 'MODEL_CONTROL_NOT_FOUND' };
      control.click();
      return { selected: false, opened: true };
    }
    const options = [...document.querySelectorAll('[role="menuitem"], [role="option"], button')].filter(visible);
    const option = options.find((element) => normalizedText(element) === wanted || normalizedText(element).startsWith(wanted + ' '));
    if (!option) return false;
    option.click();
    return { selected: true, opened: true };
  `);
}

function generationStateExpression(expectedUrl) {
  return wrapExpression(`
    const expected = ${JSON.stringify(normalizeConversationUrl(expectedUrl))};
    const normalize = (value) => {
      try {
        const url = new URL(value);
        const match = url.pathname.match(/^\\/c\\/([A-Za-z0-9_-]+)\\/?$/);
        return url.protocol === 'https:' && url.hostname === 'chatgpt.com' && match ? 'https://chatgpt.com/c/' + match[1] : null;
      } catch { return null; }
    };
    const stop = document.querySelector('button[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Stop streaming"]');
    const composer = document.querySelector('#prompt-textarea, [data-testid="prompt-textarea"], div.ProseMirror[contenteditable="true"], textarea[placeholder]');
    const composerReady = Boolean(composer?.getClientRects().length) && getComputedStyle(composer).visibility !== 'hidden';
    const generating = Boolean(stop?.getClientRects().length) && getComputedStyle(stop).visibility !== 'hidden';
    return {
      currentUrl: location.href,
      urlMismatch: normalize(location.href) !== expected,
      loginRequired: location.pathname.startsWith('/auth/') || Boolean(document.querySelector('a[href*="/auth/login"], button[data-testid="login-button"]')),
      generating,
      composerReady,
      completedBy: !generating && composerReady ? 'STABLE_COMPOSER_WITHOUT_STOP_CONTROL' : null,
    };
  `);
}

function composerPreparationExpression(body) {
  return wrapExpression(`
    const expected = ${JSON.stringify(body)};
    const element = document.querySelector('#prompt-textarea, [data-testid="prompt-textarea"], div.ProseMirror[contenteditable="true"], textarea[placeholder]');
    if (!element) return { ok: false, reason: 'COMPOSER_NOT_FOUND' };
    const visible = Boolean(element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
    if (!visible) return { ok: false, reason: 'COMPOSER_NOT_VISIBLE' };
    const value = typeof element.value === 'string' ? element.value : (element.textContent ?? '');
    if (value && value !== expected) return { ok: false, reason: 'COMPOSER_CONTAMINATED', length: value.length };
    element.focus();
    return { ok: true, alreadyExact: value === expected };
  `);
}

function composerVerificationExpression(body) {
  return wrapExpression(`
    const expected = ${JSON.stringify(body)};
    const element = document.querySelector('#prompt-textarea, [data-testid="prompt-textarea"], div.ProseMirror[contenteditable="true"], textarea[placeholder]');
    if (!element) return { exact: false, length: null };
    const value = typeof element.value === 'string' ? element.value : (element.textContent ?? '');
    return { exact: value === expected, length: value.length };
  `);
}

function sendButtonExpression() {
  return wrapExpression(`
    const selectors = [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send message"]',
      'button[data-testid="fruitjuice-send-button"]'
    ];
    const button = selectors.map((selector) => document.querySelector(selector)).find(Boolean);
    if (!button) return { ok: false, reason: 'SEND_BUTTON_NOT_FOUND' };
    if (button.disabled || button.getAttribute('aria-disabled') === 'true') return { ok: false, reason: 'SEND_BUTTON_DISABLED' };
    if (!button.getClientRects().length) return { ok: false, reason: 'SEND_BUTTON_NOT_VISIBLE' };
    button.click();
    return { ok: true };
  `);
}

function submissionConfirmationExpression(body, expectedUrl = null) {
  const normalizedExpected = expectedUrl ? normalizeConversationUrl(expectedUrl) : null;
  return wrapExpression(`
    const expectedBody = ${JSON.stringify(body)};
    const expectedUrl = ${JSON.stringify(normalizedExpected)};
    const normalizeUrl = (value) => {
      try {
        const url = new URL(value);
        const match = url.pathname.match(/^\\/c\\/([A-Za-z0-9_-]+)\\/?$/);
        return url.protocol === 'https:' && url.hostname === 'chatgpt.com' && match ? 'https://chatgpt.com/c/' + match[1] : null;
      } catch { return null; }
    };
    const userMessages = [...document.querySelectorAll('[data-message-author-role="user"]')];
    const exactUserMessage = userMessages.some((element) => {
      const candidates = [element, ...element.querySelectorAll('div, p, pre')];
      return candidates.some((candidate) => (candidate.textContent ?? '') === expectedBody);
    });
    return {
      confirmed: exactUserMessage,
      confirmedBy: exactUserMessage ? 'EXACT_USER_MESSAGE_DOM' : null,
      urlMismatch: expectedUrl ? normalizeUrl(location.href) !== expectedUrl : false,
      currentUrl: location.href,
    };
  `);
}

function wrapExpression(body) {
  return `(() => { ${body} })()`;
}

async function waitFor(check, timeoutMs, intervalMs, timeoutMessage) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
      if (/unexpected URL|login is required|changed during submission/.test(error.message)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (lastError) throw lastError;
  throw new Error(timeoutMessage);
}
