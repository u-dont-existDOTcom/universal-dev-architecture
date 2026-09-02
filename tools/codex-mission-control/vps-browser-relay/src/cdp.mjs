import { normalizeConversationUrl } from './core.mjs';

const PAGE_INSPECTION_FN = `function(expectedUrl) {
  const normalize = (value) => {
    try {
      const url = new URL(value);
      const match = url.pathname.match(/^\\/c\\/([A-Za-z0-9_-]+)\\/?$/);
      return url.protocol === 'https:' && url.hostname === 'chatgpt.com' && match ? 'https://chatgpt.com/c/' + match[1] : null;
    } catch { return null; }
  };
  const composer = document.querySelector('#prompt-textarea, [data-testid="prompt-textarea"], div.ProseMirror[contenteditable="true"], textarea[placeholder]');
  return {
    currentUrl: location.href,
    urlMismatch: normalize(location.href) !== expectedUrl,
    composerFound: Boolean(composer),
    loginRequired: location.pathname.startsWith('/auth/') || Boolean(document.querySelector('a[href*="/auth/login"], button[data-testid="login-button"]')),
  };
}`;

const CURRENT_MODEL_FN = `function(expectedUrl) {
  const normalizeUrl = (value) => {
    try {
      const url = new URL(value);
      const match = url.pathname.match(/^\\/c\\/([A-Za-z0-9_-]+)\\/?$/);
      return url.protocol === 'https:' && url.hostname === 'chatgpt.com' && match ? 'https://chatgpt.com/c/' + match[1] : null;
    } catch { return null; }
  };
  if (normalizeUrl(location.href) !== expectedUrl) return { urlMismatch: true, currentUrl: location.href };
  const visible = (element) => Boolean(element && element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  const label = (element) => ((element && (element.getAttribute('aria-label') || element.innerText)) || '').trim().replace(/\\s+/g, ' ');
  const candidates = [...document.querySelectorAll('button[data-testid="model-switcher-dropdown-button"], button[aria-haspopup="menu"], button[aria-haspopup="listbox"]')].filter(visible);
  const control = candidates.find((element) => element.matches('button[data-testid="model-switcher-dropdown-button"]')) || candidates[0] || null;
  return { urlMismatch: false, controlFound: Boolean(control), label: control ? label(control) : null };
}`;

const OPEN_MODEL_MENU_FN = `function(expectedUrl) {
  const normalizeUrl = (value) => {
    try {
      const url = new URL(value);
      const match = url.pathname.match(/^\\/c\\/([A-Za-z0-9_-]+)\\/?$/);
      return url.protocol === 'https:' && url.hostname === 'chatgpt.com' && match ? 'https://chatgpt.com/c/' + match[1] : null;
    } catch { return null; }
  };
  if (normalizeUrl(location.href) !== expectedUrl) return { urlMismatch: true, currentUrl: location.href };
  const visible = (element) => Boolean(element && element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  const candidates = [...document.querySelectorAll('button[data-testid="model-switcher-dropdown-button"], button[aria-haspopup="menu"], button[aria-haspopup="listbox"]')].filter(visible);
  const control = candidates.find((element) => element.matches('button[data-testid="model-switcher-dropdown-button"]')) || candidates[0] || null;
  if (!control) return { opened: false, reason: 'MODEL_CONTROL_NOT_FOUND' };
  control.click();
  return { opened: true };
}`;

const MODEL_OPTION_LABELS_FN = `function() {
  const visible = (element) => Boolean(element && element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  const label = (element) => ((element && (element.getAttribute('aria-label') || element.innerText)) || '').trim().replace(/\\s+/g, ' ');
  return [...document.querySelectorAll('[role="menuitem"], [role="option"]')].filter(visible).map(label).filter(Boolean);
}`;

const SELECT_MODEL_OPTION_FN = `function(labelWanted) {
  const visible = (element) => Boolean(element && element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  const label = (element) => ((element && (element.getAttribute('aria-label') || element.innerText)) || '').trim().replace(/\\s+/g, ' ');
  const options = [...document.querySelectorAll('[role="menuitem"], [role="option"]')].filter(visible);
  const option = options.find((element) => label(element) === labelWanted) || null;
  if (!option) return { selected: false, availableLabels: options.map(label).filter(Boolean) };
  option.click();
  return { selected: true, selectedLabel: label(option) };
}`;

const PREPARE_COMPOSER_FN = `function(expectedBody) {
  const element = document.querySelector('#prompt-textarea, [data-testid="prompt-textarea"], div.ProseMirror[contenteditable="true"], textarea[placeholder]');
  if (!element) return { ok: false, reason: 'COMPOSER_NOT_FOUND' };
  const visible = Boolean(element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  if (!visible) return { ok: false, reason: 'COMPOSER_NOT_VISIBLE' };
  const value = typeof element.value === 'string' ? element.value : (element.textContent || '');
  if (value && value !== expectedBody) return { ok: false, reason: 'COMPOSER_CONTAMINATED', length: value.length };
  element.focus();
  return { ok: true, alreadyExact: value === expectedBody };
}`;

const VERIFY_COMPOSER_FN = `function(expectedBody) {
  const element = document.querySelector('#prompt-textarea, [data-testid="prompt-textarea"], div.ProseMirror[contenteditable="true"], textarea[placeholder]');
  if (!element) return { exact: false, length: null };
  const value = typeof element.value === 'string' ? element.value : (element.textContent || '');
  return { exact: value === expectedBody, length: value.length };
}`;

const CLICK_SEND_FN = `function() {
  const selectors = [
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label="Send message"]',
    'button[data-testid="fruitjuice-send-button"]'
  ];
  const visible = (element) => Boolean(element && element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  const button = selectors.map((selector) => document.querySelector(selector)).find((element) => visible(element));
  if (!button) return { ok: false, reason: 'SEND_BUTTON_NOT_FOUND' };
  if (button.disabled || button.getAttribute('aria-disabled') === 'true') return { ok: false, reason: 'SEND_BUTTON_DISABLED' };
  button.click();
  return { ok: true };
}`;

const GENERATION_STATE_FN = `function(expectedUrl) {
  const normalizeUrl = (value) => {
    try {
      const url = new URL(value);
      const match = url.pathname.match(/^\\/c\\/([A-Za-z0-9_-]+)\\/?$/);
      return url.protocol === 'https:' && url.hostname === 'chatgpt.com' && match ? 'https://chatgpt.com/c/' + match[1] : null;
    } catch { return null; }
  };
  const visible = (element) => Boolean(element && element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  const stop = document.querySelector('button[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Stop streaming"]');
  const composer = document.querySelector('#prompt-textarea, [data-testid="prompt-textarea"], div.ProseMirror[contenteditable="true"], textarea[placeholder]');
  const composerVisible = visible(composer);
  const composerDisabled = Boolean(composer && (composer.disabled || composer.getAttribute('aria-disabled') === 'true' || composer.getAttribute('contenteditable') === 'false'));
  const stopVisible = visible(stop);
  return {
    currentUrl: location.href,
    urlMismatch: normalizeUrl(location.href) !== expectedUrl,
    loginRequired: location.pathname.startsWith('/auth/') || Boolean(document.querySelector('a[href*="/auth/login"], button[data-testid="login-button"]')),
    stopVisible,
    composerVisible,
    composerDisabled,
    generating: stopVisible || !composerVisible || composerDisabled,
    idleReady: !stopVisible && composerVisible && !composerDisabled,
    startSignal: stopVisible ? 'STOP_CONTROL_VISIBLE' : (!composerVisible ? 'COMPOSER_UNAVAILABLE' : (composerDisabled ? 'COMPOSER_DISABLED' : null)),
  };
}`;

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
    return value.map((target) => ({ id: target.id, type: target.type, title: target.title, url: target.url, webSocketDebuggerUrl: target.webSocketDebuggerUrl }));
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
      } catch { /* unrelated page */ }
    }
    const created = await this.#json(`/json/new?${encodeURIComponent(normalized)}`, { method: 'PUT' });
    if (!created?.id || !created?.webSocketDebuggerUrl) throw new Error('Chrome did not create a debuggable page target.');
    await this.activateTarget(created.id);
    return { id: created.id, type: created.type ?? 'page', title: created.title ?? '', url: normalized, webSocketDebuggerUrl: created.webSocketDebuggerUrl, created: true };
  }

  async activateTarget(targetId) {
    return this.#withBrowserClient((client) => client.send('Target.activateTarget', { targetId }));
  }

  async closeTarget(targetId) {
    const result = await this.#withBrowserClient((client) => client.send('Target.closeTarget', { targetId }));
    return result?.success !== false;
  }

  async inspectChat(target, expectedUrl) {
    return this.#withPageClient(target, (client) => client.callFunction(PAGE_INSPECTION_FN, [normalizeConversationUrl(expectedUrl)]));
  }

  async currentModelLabel(target, expectedUrl) {
    return this.#withPageClient(target, async (client) => {
      const result = await client.callFunction(CURRENT_MODEL_FN, [normalizeConversationUrl(expectedUrl)]);
      if (result?.urlMismatch) throw new Error(`Chat target navigated to an unexpected URL: ${result.currentUrl}`);
      return result?.label ?? null;
    });
  }

  async switchModel(target, { expectedUrl, label }) {
    const normalized = normalizeConversationUrl(expectedUrl);
    return this.#withPageClient(target, async (client) => {
      const current = await client.callFunction(CURRENT_MODEL_FN, [normalized]);
      if (current?.urlMismatch) throw new Error(`Chat target navigated to an unexpected URL: ${current.currentUrl}`);
      if (current?.label === label) return { selectedLabel: label, observedLabel: current.label, changed: false };
      const opened = await client.callFunction(OPEN_MODEL_MENU_FN, [normalized]);
      if (opened?.urlMismatch) throw new Error(`Chat target navigated to an unexpected URL: ${opened.currentUrl}`);
      if (!opened?.opened) throw new Error(`ChatGPT model/mode switch control is unavailable: ${opened?.reason ?? 'UNKNOWN'}.`);
      const selected = await waitFor(async () => {
        const result = await client.callFunction(SELECT_MODEL_OPTION_FN, [label]);
        return result?.selected ? result : false;
      }, this.pageReadyTimeoutMs, 300, `ChatGPT model/mode option ${label} did not become available.`);
      const verified = await waitFor(async () => {
        const result = await client.callFunction(CURRENT_MODEL_FN, [normalized]);
        return result?.label === label ? result : false;
      }, this.pageReadyTimeoutMs, 300, `ChatGPT model/mode control did not report exact label ${label}.`);
      return { selectedLabel: label, observedLabel: verified.label, changed: true, menuSelectedLabel: selected.selectedLabel };
    });
  }

  async verifyModelRoundTrip(target, { expectedUrl, extraHighLabel, proLabel }) {
    const normalized = normalizeConversationUrl(expectedUrl);
    return this.#withPageClient(target, async (client) => {
      const inspection = await client.callFunction(PAGE_INSPECTION_FN, [normalized]);
      if (inspection?.urlMismatch || inspection?.loginRequired || !inspection?.composerFound) {
        throw new Error('Registered supervisor chat is not ready for model capability verification.');
      }
      const opened = await client.callFunction(OPEN_MODEL_MENU_FN, [normalized]);
      if (!opened?.opened) throw new Error('ChatGPT model/mode switch control is unavailable.');
      const availableLabels = await waitFor(async () => {
        const labels = await client.callFunction(MODEL_OPTION_LABELS_FN, []);
        return Array.isArray(labels) && labels.includes(extraHighLabel) && labels.includes(proLabel) ? labels : false;
      }, this.pageReadyTimeoutMs, 300, 'Exact Extra High and Pro UI labels were not both observable.');
      // Close the open menu by selecting Extra High, then perform a full exact-label round trip.
      const selectExtra = await client.callFunction(SELECT_MODEL_OPTION_FN, [extraHighLabel]);
      if (!selectExtra?.selected) throw new Error(`Could not select exact Extra High UI label ${extraHighLabel}.`);
      await waitFor(() => client.callFunction(CURRENT_MODEL_FN, [normalized]).then((value) => value?.label === extraHighLabel ? value : false), this.pageReadyTimeoutMs, 300, 'Extra High label did not become current.');
      const openedPro = await client.callFunction(OPEN_MODEL_MENU_FN, [normalized]);
      if (!openedPro?.opened) throw new Error('Could not reopen model switcher for Pro verification.');
      const selectPro = await waitFor(() => client.callFunction(SELECT_MODEL_OPTION_FN, [proLabel]).then((value) => value?.selected ? value : false), this.pageReadyTimeoutMs, 300, `Could not select exact Pro UI label ${proLabel}.`);
      const proCurrent = await waitFor(() => client.callFunction(CURRENT_MODEL_FN, [normalized]).then((value) => value?.label === proLabel ? value : false), this.pageReadyTimeoutMs, 300, 'Pro label did not become current.');
      const openedRestore = await client.callFunction(OPEN_MODEL_MENU_FN, [normalized]);
      if (!openedRestore?.opened) throw new Error('Could not reopen model switcher to restore Extra High.');
      const restore = await waitFor(() => client.callFunction(SELECT_MODEL_OPTION_FN, [extraHighLabel]).then((value) => value?.selected ? value : false), this.pageReadyTimeoutMs, 300, `Could not restore exact Extra High UI label ${extraHighLabel}.`);
      const extraCurrent = await waitFor(() => client.callFunction(CURRENT_MODEL_FN, [normalized]).then((value) => value?.label === extraHighLabel ? value : false), this.pageReadyTimeoutMs, 300, 'Extra High label did not become current after round trip.');
      return {
        status: 'MODE_ROUND_TRIP_VERIFIED',
        availableLabels,
        extraHighObserved: extraCurrent.label,
        proObserved: proCurrent.label,
        restoredObserved: extraCurrent.label,
        menuSelections: [selectExtra.selectedLabel, selectPro.selectedLabel, restore.selectedLabel],
        inspectedAssistantOutput: false,
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
        const normalized = normalizeConversationUrl(expectedUrl);
        await waitFor(async () => {
          const result = await client.callFunction(PAGE_INSPECTION_FN, [normalized]);
          if (result?.urlMismatch) throw new Error(`Chat target navigated to an unexpected URL: ${result.currentUrl}`);
          if (result?.loginRequired) throw new Error('ChatGPT login is required in the VPS browser profile.');
          return result?.composerFound;
        }, this.pageReadyTimeoutMs, 500, 'ChatGPT composer did not become ready.');

        const composer = await client.callFunction(PREPARE_COMPOSER_FN, [body]);
        if (!composer?.ok) {
          if (composer?.reason === 'COMPOSER_CONTAMINATED') throw new Error('Composer contains different text; relay refused to overwrite it.');
          throw new Error(`Composer is not ready: ${composer?.reason ?? 'UNKNOWN'}.`);
        }
        if (!composer.alreadyExact) await client.send('Input.insertText', { text: body });
        const verified = await client.callFunction(VERIFY_COMPOSER_FN, [body]);
        if (!verified?.exact) throw new Error(`Composer byte check failed before submission (expected ${body.length} characters, observed ${verified?.length ?? 'unknown'}).`);

        relayStage = 'READY_TO_CLICK';
        const send = await client.callFunction(CLICK_SEND_FN, []);
        if (!send?.ok) throw new Error(`ChatGPT send control is unavailable: ${send?.reason ?? 'UNKNOWN'}.`);
        relayStage = 'CLICKED';

        let started;
        try {
          started = await waitFor(async () => {
            const state = await client.callFunction(GENERATION_STATE_FN, [normalized]);
            if (state?.urlMismatch) throw new Error(`Chat target changed during submission: ${state.currentUrl}`);
            if (state?.loginRequired) throw new Error('ChatGPT login is required in the VPS browser profile.');
            return state?.generating && state?.startSignal ? state : false;
          }, this.submitTimeoutMs, 200, 'GENERATION_START_UNVERIFIED');
        } catch (error) {
          const startError = new Error('GENERATION_START_UNVERIFIED: no post-submit generation UI transition was observed.');
          startError.cause = error;
          throw startError;
        }

        relayStage = 'GENERATION_STARTED';
        return {
          status: 'GENERATION_STARTED',
          targetId: target.id,
          conversationUrl: normalized,
          bodySha256,
          bodyLength: body.length,
          generationStarted: true,
          startSignal: started.startSignal,
          startedAtObserved: new Date().toISOString(),
          providerSourceTime: null,
          inspectedAssistantOutput: false,
          limitations: [
            'The relay observed only composer/model/generation controls; it did not read or extract conversation message content.',
            'startedAtObserved is a relay UI observation time, not a provider-issued source timestamp.',
          ],
        };
      });
    } catch (error) {
      if (error && typeof error === 'object') error.relayStage = relayStage;
      throw error;
    }
  }

  async waitForGenerationComplete(target, { expectedUrl, generationStarted }) {
    if (generationStarted !== true) throw new Error('GENERATION_START_UNVERIFIED: completion cannot be inferred without a prior observed generation-start transition.');
    const normalized = normalizeConversationUrl(expectedUrl);
    return this.#withPageClient(target, async (client) => {
      let consecutiveIdle = 0;
      const completed = await waitFor(async () => {
        const state = await client.callFunction(GENERATION_STATE_FN, [normalized]);
        if (state?.urlMismatch) throw new Error(`Chat target changed while waiting for generation: ${state.currentUrl}`);
        if (state?.loginRequired) throw new Error('ChatGPT login is required in the VPS browser profile.');
        consecutiveIdle = state?.idleReady ? consecutiveIdle + 1 : 0;
        return consecutiveIdle >= 3 ? state : false;
      }, this.generationTimeoutMs, 500, 'ChatGPT generation did not reach a stable complete UI state.');
      return {
        status: 'GENERATION_COMPLETE',
        generationStarted: true,
        completedBy: completed.idleReady ? 'STABLE_COMPOSER_WITHOUT_GENERATION_CONTROL' : null,
        inspectedAssistantOutput: false,
        completedAtObserved: new Date().toISOString(),
      };
    });
  }

  async #withBrowserClient(callback) {
    const version = await this.#json('/json/version');
    if (typeof version.webSocketDebuggerUrl !== 'string') throw new Error('Chrome browser debugging WebSocket is unavailable.');
    const client = await CdpConnection.connect(version.webSocketDebuggerUrl, this.WebSocketImpl);
    try { return await callback(client); } finally { client.close(); }
  }

  async #withPageClient(target, callback) {
    let page = target;
    if (!page.webSocketDebuggerUrl) page = (await this.listTargets()).find((candidate) => candidate.id === target.id);
    if (!page?.webSocketDebuggerUrl) throw new Error(`Page target ${target.id} has no debugging WebSocket.`);
    const client = await CdpConnection.connect(page.webSocketDebuggerUrl, this.WebSocketImpl);
    try { return await callback(client); } finally { client.close(); }
  }

  async #json(path, options = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...options, signal: AbortSignal.timeout(10_000) });
    const text = await response.text();
    let value;
    try { value = JSON.parse(text); } catch { throw new Error(`Chrome DevTools endpoint ${path} returned non-JSON HTTP ${response.status}.`); }
    if (!response.ok) throw new Error(`Chrome DevTools endpoint ${path} failed with HTTP ${response.status}.`);
    return value;
  }
}

class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.globalObjectId = null;
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

  async callFunction(functionDeclaration, args = []) {
    if (!this.globalObjectId) {
      const root = await this.send('Runtime.evaluate', { expression: 'globalThis', returnByValue: false });
      this.globalObjectId = root?.result?.objectId ?? null;
      if (!this.globalObjectId) throw new Error('Chrome DevTools could not resolve the page global object.');
    }
    const result = await this.send('Runtime.callFunctionOn', {
      objectId: this.globalObjectId,
      functionDeclaration,
      arguments: args.map((value) => ({ value })),
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (result?.exceptionDetails) throw new Error(`Browser function failed: ${result.exceptionDetails.text ?? 'unknown exception'}`);
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

async function waitFor(check, timeoutMs, intervalMs, timeoutMessage) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
      if (/unexpected URL|login is required|changed while waiting|changed during submission/.test(error.message)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (lastError) throw lastError;
  throw new Error(timeoutMessage);
}
