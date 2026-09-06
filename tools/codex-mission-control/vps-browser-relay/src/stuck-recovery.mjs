import { normalizeConversationUrl, sha256 } from './core.mjs';

const STOP_GENERATION_FN = `function(expectedUrl) {
  const normalize = (value) => {
    try {
      const url = new URL(value);
      const match = url.pathname.match(/^\\/c\\/([A-Za-z0-9_-]+)\\/?$/);
      return url.protocol === 'https:' && url.hostname === 'chatgpt.com' && match ? 'https://chatgpt.com/c/' + match[1] : null;
    } catch { return null; }
  };
  if (normalize(location.href) !== expectedUrl) return { urlMismatch: true, currentUrl: location.href };
  const visible = (element) => Boolean(element && element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  const stop = [...document.querySelectorAll('button[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Stop streaming"]')].find(visible) || null;
  if (!stop) return { urlMismatch: false, stopped: false, reason: 'STOP_CONTROL_NOT_VISIBLE' };
  stop.click();
  return { urlMismatch: false, stopped: true, stopControlObserved: true };
}`;

const IDLE_STATE_FN = `function(expectedUrl) {
  const normalize = (value) => {
    try {
      const url = new URL(value);
      const match = url.pathname.match(/^\\/c\\/([A-Za-z0-9_-]+)\\/?$/);
      return url.protocol === 'https:' && url.hostname === 'chatgpt.com' && match ? 'https://chatgpt.com/c/' + match[1] : null;
    } catch { return null; }
  };
  if (normalize(location.href) !== expectedUrl) return { urlMismatch: true, currentUrl: location.href };
  const visible = (element) => Boolean(element && element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  const stop = [...document.querySelectorAll('button[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Stop streaming"]')].find(visible) || null;
  const composer = document.querySelector('#prompt-textarea, [data-testid="prompt-textarea"], div.ProseMirror[contenteditable="true"], textarea[placeholder]');
  const composerVisible = visible(composer);
  const composerDisabled = Boolean(composer && (composer.disabled || composer.getAttribute('aria-disabled') === 'true' || composer.getAttribute('contenteditable') === 'false'));
  return {
    urlMismatch: false,
    stopVisible: visible(stop),
    composerVisible,
    composerDisabled,
    idleReady: !visible(stop) && composerVisible && !composerDisabled,
  };
}`;

const RECOVERABLE_CONTROL_FN = `function(expectedUrl) {
  const normalize = (value) => {
    try {
      const url = new URL(value);
      const match = url.pathname.match(/^\\/c\\/([A-Za-z0-9_-]+)\\/?$/);
      return url.protocol === 'https:' && url.hostname === 'chatgpt.com' && match ? 'https://chatgpt.com/c/' + match[1] : null;
    } catch { return null; }
  };
  if (normalize(location.href) !== expectedUrl) return { urlMismatch: true, currentUrl: location.href };
  const visible = (element) => Boolean(element && element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  const normalizeLabel = (value) => String(value || '').trim().replace(/\\s+/g, ' ').toLowerCase();
  const accepted = new Map([
    ['continue', 'Continue'],
    ['continue generating', 'Continue generating'],
    ['resume', 'Resume'],
    ['retry', 'Retry'],
    ['try again', 'Try again'],
  ]);
  for (const element of [...document.querySelectorAll('button, [role="button"]')].filter(visible)) {
    const raw = element.getAttribute('aria-label') || element.innerText || '';
    const canonical = accepted.get(normalizeLabel(raw));
    if (canonical) return { urlMismatch: false, recoverable: true, controlLabel: canonical };
  }
  return { urlMismatch: false, recoverable: false, controlLabel: null };
}`;

export function installStuckRecovery(browser, {
  maxNudges = 3,
  logger = console,
  submitMessage = null,
  beforeRecoverySend = null,
  stopStalledGeneration = null,
  inspectRecoverableControl = null,
} = {}) {
  if (!browser || typeof browser.waitForGenerationComplete !== 'function' || typeof browser.submitExactMessage !== 'function') {
    throw new Error('A ChromeDevtoolsBrowser-compatible instance is required for stuck recovery.');
  }
  if (!Number.isInteger(maxNudges) || maxNudges < 1 || maxNudges > 20) throw new Error('maxNudges must be an integer from 1 to 20.');

  const originalWait = browser.waitForGenerationComplete.bind(browser);
  const submitFn = submitMessage ?? ((target, input) => browser.submitExactMessage(target, input));
  const stopFn = stopStalledGeneration ?? ((target, expectedUrl) => interruptStalledGeneration(browser, target, expectedUrl));
  const inspectFn = inspectRecoverableControl ?? ((target, expectedUrl) => detectRecoverableControl(browser, target, expectedUrl));

  browser.waitForGenerationComplete = async (target, options) => {
    if (options?.allowSameChatRecovery === false) return originalWait(target, options);
    const recoveries = [];
    for (;;) {
      try {
        const completed = await originalWait(target, options);
        const control = await inspectFn(target, options.expectedUrl);
        if (control?.recoverable) {
          if (recoveries.length >= maxNudges) {
            throw new Error(`ChatGPT recoverable stall control ${control.controlLabel} persisted after ${maxNudges} continue nudges.`);
          }
          if (beforeRecoverySend) await beforeRecoverySend();
          const recovery = await sendContinue(submitFn, target, options, recoveries.length + 1, maxNudges, logger, {
            source: 'RECOVERABLE_UI_CONTROL',
            controlLabel: control.controlLabel,
            interruption: { stoppedGeneration: false, stopReason: 'ALREADY_IDLE', inspectedAssistantOutput: false },
          });
          recoveries.push(recovery);
          options = { ...options, generationStarted: true };
          continue;
        }
        return recoveries.length === 0 ? completed : {
          ...completed,
          stuckRecovery: {
            nudgesSent: recoveries.length,
            maxNudges,
            recoveries,
            inspectedAssistantOutput: false,
          },
        };
      } catch (error) {
        if (!isGenerationStallTimeout(error) || recoveries.length >= maxNudges) throw error;
        if (beforeRecoverySend) await beforeRecoverySend();
        const interruption = await stopFn(target, options.expectedUrl);
        const recovery = await sendContinue(submitFn, target, options, recoveries.length + 1, maxNudges, logger, {
          source: 'ACTIVE_GENERATION_TIMEOUT',
          controlLabel: null,
          interruption,
        });
        recoveries.push(recovery);
        options = { ...options, generationStarted: true };
      }
    }
  };

  return browser;
}

export function isGenerationStallTimeout(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('ChatGPT generation did not reach a stable complete UI state.');
}

async function sendContinue(submitMessage, target, options, index, maxNudges, logger, context) {
  const recoveredAt = new Date().toISOString();
  const body = 'continue';
  const start = await submitMessage(target, {
    expectedUrl: options.expectedUrl,
    body,
    bodySha256: sha256(body),
  });
  const recovery = {
    index,
    recoveredAt,
    source: context.source,
    observedControl: context.controlLabel,
    interruption: context.interruption,
    continueGenerationStartedAt: start.startedAtObserved,
    modelChanged: false,
    assistantContentObserved: false,
  };
  logger.warn?.(JSON.stringify({
    time: recoveredAt,
    event: 'chat_generation_stuck_continue_sent',
    recoveryIndex: recovery.index,
    recoverySource: recovery.source,
    observedControl: recovery.observedControl,
    maxNudges,
    targetId: target.id,
    conversationUrl: normalizeConversationUrl(options.expectedUrl),
    assistantContentObserved: false,
  }));
  return recovery;
}

async function detectRecoverableControl(browser, target, expectedUrl) {
  const { client, normalized } = await openRecoveryClient(browser, target, expectedUrl);
  try {
    const result = await client.callFunction(RECOVERABLE_CONTROL_FN, [normalized]);
    if (result?.urlMismatch) throw new Error(`Chat target changed while checking recovery controls: ${result.currentUrl}`);
    return result ?? { recoverable: false, controlLabel: null };
  } finally {
    client.close();
  }
}

async function interruptStalledGeneration(browser, target, expectedUrl) {
  const { client, normalized } = await openRecoveryClient(browser, target, expectedUrl);
  try {
    const before = await client.callFunction(IDLE_STATE_FN, [normalized]);
    if (before?.urlMismatch) throw new Error(`Chat target changed before stuck recovery: ${before.currentUrl}`);
    let stopResult = { stopped: false, reason: 'ALREADY_IDLE' };
    if (!before?.idleReady) {
      stopResult = await client.callFunction(STOP_GENERATION_FN, [normalized]);
      if (stopResult?.urlMismatch) throw new Error(`Chat target changed during stuck recovery: ${stopResult.currentUrl}`);
      if (!stopResult?.stopped) throw new Error(`Stuck generation could not be interrupted safely: ${stopResult?.reason ?? 'UNKNOWN'}.`);
    }
    await waitFor(async () => {
      const state = await client.callFunction(IDLE_STATE_FN, [normalized]);
      if (state?.urlMismatch) throw new Error(`Chat target changed while waiting for stuck recovery: ${state.currentUrl}`);
      return state?.idleReady ? state : false;
    }, 30_000, 250, 'ChatGPT composer did not become idle after stopping a stalled generation.');
    return {
      stoppedGeneration: Boolean(stopResult.stopped),
      stopReason: stopResult.reason ?? null,
      inspectedAssistantOutput: false,
    };
  } finally {
    client.close();
  }
}

async function openRecoveryClient(browser, target, expectedUrl) {
  const normalized = normalizeConversationUrl(expectedUrl);
  const targetWithSocket = target.webSocketDebuggerUrl
    ? target
    : (await browser.listTargets()).find((candidate) => candidate.id === target.id);
  if (!targetWithSocket?.webSocketDebuggerUrl) throw new Error(`Page target ${target.id} has no debugging WebSocket for stuck recovery.`);
  const client = await PageClient.connect(targetWithSocket.webSocketDebuggerUrl, browser.WebSocketImpl ?? WebSocket);
  return { client, normalized };
}

class PageClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.globalObjectId = null;
    socket.addEventListener('message', (event) => this.#onMessage(event));
    socket.addEventListener('close', () => this.#rejectAll(new Error('Stuck-recovery DevTools WebSocket closed.')));
    socket.addEventListener('error', () => this.#rejectAll(new Error('Stuck-recovery DevTools WebSocket failed.')));
  }

  static async connect(url, WebSocketImpl) {
    const socket = new WebSocketImpl(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Stuck-recovery DevTools WebSocket connection timed out.')), 10_000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Stuck-recovery DevTools WebSocket connection failed.')); }, { once: true });
    });
    return new PageClient(socket);
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
      if (!this.globalObjectId) throw new Error('Stuck-recovery DevTools could not resolve the page global object.');
    }
    const result = await this.send('Runtime.callFunctionOn', {
      objectId: this.globalObjectId,
      functionDeclaration,
      arguments: args.map((value) => ({ value })),
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (result?.exceptionDetails) throw new Error(`Stuck-recovery browser function failed: ${result.exceptionDetails.text ?? 'unknown exception'}`);
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
    if (!message?.id || !this.pending.has(message.id)) return;
    const pending = this.pending.get(message.id);
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message ?? 'Stuck-recovery DevTools command failed.'));
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
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (lastError) throw lastError;
  throw new Error(timeoutMessage);
}
