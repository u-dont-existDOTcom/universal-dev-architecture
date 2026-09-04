import { normalizeConversationUrl } from './core.mjs';

const PAGE_INSPECTION_FN = `function(expectedUrl) {
  const normalize = (value) => {
    try {
      const url = new URL(value);
      const match = url.pathname.match(/^\\/c\\/([A-Za-z0-9_-]+)\\/?$/);
      return url.protocol === 'https:' && url.hostname === 'chatgpt.com' && match ? 'https://chatgpt.com/c/' + match[1] : null;
    } catch { return null; }
  };
  const composer = document.querySelector('#prompt-textarea') || document.querySelector('[data-testid="prompt-textarea"]') || document.querySelector('textarea[aria-label="Chat with ChatGPT"]');
  return {
    currentUrl: location.href,
    urlMismatch: expectedUrl === 'https://chatgpt.com/'
      ? new URL(location.href).origin !== 'https://chatgpt.com' || new URL(location.href).pathname !== '/'
      : normalize(location.href) !== expectedUrl,
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
  const current = new URL(location.href);
  const mismatch = expectedUrl === 'https://chatgpt.com/'
    ? current.origin !== 'https://chatgpt.com' || current.pathname !== '/'
    : normalizeUrl(location.href) !== expectedUrl;
  if (mismatch) return { urlMismatch: true, currentUrl: location.href };
  const visible = (element) => {
    if (!element || !element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  };
  const visibleLabel = (element) => ((element && (element.innerText || element.getAttribute('aria-label'))) || '').trim().replace(/\\s+/g, ' ');
  const tested = [...document.querySelectorAll('button[data-testid="model-switcher-dropdown-button"]')].filter(visible);
  const composer = document.querySelector('#prompt-textarea') || document.querySelector('[data-testid="prompt-textarea"]') || document.querySelector('textarea[aria-label="Chat with ChatGPT"]');
  const composerForm = composer?.closest('form') || null;
  const scoped = composerForm
    ? [...composerForm.querySelectorAll('button[aria-haspopup="menu"], button[aria-haspopup="listbox"]')]
      .filter(visible)
      .filter((element) => visibleLabel(element))
      .filter((element) => element.getAttribute('data-testid') !== 'composer-plus-btn')
    : [];
  const candidates = tested.length ? tested : scoped;
  if (candidates.length !== 1) {
    return { urlMismatch: false, controlFound: false, ambiguous: candidates.length > 1, reason: candidates.length ? 'MODEL_CONTROL_AMBIGUOUS' : 'MODEL_CONTROL_NOT_FOUND' };
  }
  const control = candidates[0];
  const rect = control.getBoundingClientRect();
  return {
    urlMismatch: false,
    controlFound: true,
    label: visibleLabel(control),
    controlId: control.id || null,
    expanded: control.getAttribute('aria-expanded') === 'true',
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  };
}`;

const OPEN_MODEL_MENU_FN = CURRENT_MODEL_FN;

const MODEL_MENU_STATE_FN = `function(labelWanted) {
  const visible = (element) => {
    if (!element || !element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  };
  const visibleLabel = (element) => ((element && element.innerText) || '').trim().replace(/\\s+/g, ' ');
  const accessibleLabel = (element) => ((element && (element.getAttribute('aria-label') || element.innerText)) || '').trim().replace(/\\s+/g, ' ');
  const tested = [...document.querySelectorAll('button[data-testid="model-switcher-dropdown-button"]')].filter(visible);
  const composer = document.querySelector('#prompt-textarea') || document.querySelector('[data-testid="prompt-textarea"]') || document.querySelector('textarea[aria-label="Chat with ChatGPT"]');
  const composerForm = composer?.closest('form') || null;
  const scoped = composerForm
    ? [...composerForm.querySelectorAll('button[aria-haspopup="menu"], button[aria-haspopup="listbox"]')]
      .filter(visible)
      .filter((element) => visibleLabel(element) || element.getAttribute('aria-label'))
      .filter((element) => element.getAttribute('data-testid') !== 'composer-plus-btn')
    : [];
  const controls = tested.length ? tested : scoped;
  if (controls.length !== 1) return { menuFound: false, ambiguous: controls.length > 1, reason: controls.length ? 'MODEL_CONTROL_AMBIGUOUS' : 'MODEL_CONTROL_NOT_FOUND' };
  const control = controls[0];
  const roots = [...document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"]')].filter(visible);
  const controlledId = control.getAttribute('aria-controls');
  const related = roots.filter((root) => (
    (controlledId && root.id === controlledId)
    || (control.id && (root.getAttribute('aria-labelledby') || '').split(/\\s+/).includes(control.id))
  ));
  const fallback = control.getAttribute('aria-expanded') === 'true'
    ? roots.filter((root) => ['menu', 'listbox'].includes(root.getAttribute('role')))
    : [];
  const candidates = related.length ? related : (fallback.length === 1 ? fallback : []);
  if (candidates.length !== 1) return { menuFound: false, ambiguous: roots.length > 1, reason: roots.length ? 'MODEL_MENU_AMBIGUOUS_OR_UNRELATED' : 'MODEL_MENU_NOT_FOUND' };
  const menu = candidates[0];
  const selectable = [...menu.querySelectorAll('button, [role="menuitem"], [role="menuitemradio"], [role="option"]')].filter(visible);
  const directMatches = labelWanted == null ? [] : selectable.filter((element) => accessibleLabel(element) === labelWanted);
  const powerControls = [...menu.querySelectorAll('[role="menuitem"][aria-label="Power"]')].filter(visible);
  const powerIndicators = [...menu.querySelectorAll('[role="menuitem"][aria-label="Select model"]')].filter(visible);
  const sliders = powerControls.length === 1 ? [...powerControls[0].querySelectorAll('[role="slider"]')] : [];
  const slider = sliders.length === 1 ? sliders[0] : null;
  return {
    menuFound: true,
    menuRole: menu.getAttribute('role'),
    directMatchCount: directMatches.length,
    availableLabels: selectable.map(accessibleLabel).filter(Boolean),
    powerControlCount: powerControls.length,
    powerIndicatorCount: powerIndicators.length,
    sliderCount: sliders.length,
    currentPowerLabel: powerIndicators.length === 1 ? visibleLabel(powerIndicators[0]) : null,
    sliderPosition: slider ? Number(slider.getAttribute('aria-valuenow')) : null,
    sliderMinimum: slider ? Number(slider.getAttribute('aria-valuemin')) : null,
    sliderMaximum: slider ? Number(slider.getAttribute('aria-valuemax')) : null,
  };
}`;

const SELECT_MODEL_OPTION_FN = `function(labelWanted) {
  const visible = (element) => {
    if (!element || !element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  };
  const visibleLabel = (element) => ((element && element.innerText) || '').trim().replace(/\\s+/g, ' ');
  const accessibleLabel = (element) => ((element && (element.getAttribute('aria-label') || element.innerText)) || '').trim().replace(/\\s+/g, ' ');
  const tested = [...document.querySelectorAll('button[data-testid="model-switcher-dropdown-button"]')].filter(visible);
  const composer = document.querySelector('#prompt-textarea') || document.querySelector('[data-testid="prompt-textarea"]') || document.querySelector('textarea[aria-label="Chat with ChatGPT"]');
  const composerForm = composer?.closest('form') || null;
  const scoped = composerForm
    ? [...composerForm.querySelectorAll('button[aria-haspopup="menu"], button[aria-haspopup="listbox"]')]
      .filter(visible)
      .filter((element) => visibleLabel(element) || element.getAttribute('aria-label'))
      .filter((element) => element.getAttribute('data-testid') !== 'composer-plus-btn')
    : [];
  const controls = tested.length ? tested : scoped;
  if (controls.length !== 1) return { selected: false, ambiguous: controls.length > 1, reason: controls.length ? 'MODEL_CONTROL_AMBIGUOUS' : 'MODEL_CONTROL_NOT_FOUND' };
  const control = controls[0];
  const roots = [...document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"]')].filter(visible);
  const controlledId = control.getAttribute('aria-controls');
  const related = roots.filter((root) => (
    (controlledId && root.id === controlledId)
    || (control.id && (root.getAttribute('aria-labelledby') || '').split(/\\s+/).includes(control.id))
  ));
  const fallback = control.getAttribute('aria-expanded') === 'true'
    ? roots.filter((root) => ['menu', 'listbox'].includes(root.getAttribute('role')))
    : [];
  const menus = related.length ? related : (fallback.length === 1 ? fallback : []);
  if (menus.length !== 1) return { selected: false, ambiguous: roots.length > 1, reason: roots.length ? 'MODEL_MENU_AMBIGUOUS_OR_UNRELATED' : 'MODEL_MENU_NOT_FOUND' };
  const options = [...menus[0].querySelectorAll('button, [role="menuitem"], [role="menuitemradio"], [role="option"]')].filter(visible);
  const matches = options.filter((element) => accessibleLabel(element) === labelWanted);
  if (matches.length !== 1) return { selected: false, ambiguous: matches.length > 1, reason: matches.length ? 'MODEL_OPTION_AMBIGUOUS' : 'MODEL_OPTION_NOT_FOUND', availableLabels: options.map(accessibleLabel).filter(Boolean) };
  matches[0].click();
  return { selected: true, selectedLabel: accessibleLabel(matches[0]) };
}`;

const FOCUS_MODEL_POWER_FN = `function() {
  const visible = (element) => {
    if (!element || !element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  };
  const menus = [...document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"]')].filter(visible);
  const controls = menus.flatMap((menu) => [...menu.querySelectorAll('[role="menuitem"][aria-label="Power"]')].filter(visible));
  if (controls.length !== 1) return { focused: false, ambiguous: controls.length > 1, reason: controls.length ? 'MODEL_POWER_CONTROL_AMBIGUOUS' : 'MODEL_POWER_CONTROL_NOT_FOUND' };
  controls[0].focus();
  return { focused: document.activeElement === controls[0] };
}`;

export function modelMenuSelectionState(observation, labelWanted) {
  if (!observation?.menuFound) {
    throw new Error(`ChatGPT model menu is unavailable: ${observation?.reason ?? 'UNKNOWN'}.`);
  }
  if (observation.directMatchCount > 1) {
    throw new Error(`Exact model UI label ${labelWanted} is ambiguous inside the model menu.`);
  }
  if (observation.directMatchCount === 1) return { type: 'DIRECT_OPTION', observedLabels: [labelWanted] };

  const sliderBoundsValid = Number.isInteger(observation.sliderPosition)
    && Number.isInteger(observation.sliderMinimum)
    && Number.isInteger(observation.sliderMaximum)
    && observation.sliderMinimum <= observation.sliderPosition
    && observation.sliderPosition <= observation.sliderMaximum;
  const sliderStructureExact = observation.powerControlCount === 1
    && observation.powerIndicatorCount === 1
    && observation.sliderCount === 1
    && sliderBoundsValid
    && typeof observation.currentPowerLabel === 'string'
    && observation.currentPowerLabel.length > 0;
  if (!sliderStructureExact) {
    throw new Error(`Exact model UI label ${labelWanted} was not found in one supported model-menu control.`);
  }
  if (observation.currentPowerLabel === labelWanted) {
    return { type: 'POWER_CURRENT', observedLabels: [observation.currentPowerLabel] };
  }
  return {
    type: 'POWER_SEARCH',
    initialLabel: observation.currentPowerLabel,
    position: observation.sliderPosition,
    minimum: observation.sliderMinimum,
    maximum: observation.sliderMaximum,
    observedLabels: [observation.currentPowerLabel],
  };
}

const APP_SELECTION_STATE_FN = `function(knownLabels, labelWanted) {
  const visible = (element) => {
    if (!element || !element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  };
  const accessibleLabel = (element) => ((element && (element.getAttribute('aria-label') || element.innerText)) || '').trim().replace(/\\s+/g, ' ');
  const rect = (element) => {
    const value = element.getBoundingClientRect();
    return { x: value.x, y: value.y, width: value.width, height: value.height };
  };
  const composers = [...document.querySelectorAll('#prompt-textarea, [data-testid="prompt-textarea"], textarea[aria-label="Chat with ChatGPT"]')].filter(visible);
  const composer = composers.length === 1 ? composers[0] : null;
  const composerForm = composer?.closest('form') || null;
  if (!composerForm) return { composerFound: composers.length > 0, composerAmbiguous: composers.length > 1, composerFormFound: false };
  const controls = [...composerForm.querySelectorAll('button[data-testid="composer-plus-btn"]')].filter(visible);
  const chipCounts = Object.fromEntries(knownLabels.map((label) => [label, [...composerForm.querySelectorAll('button')].filter(visible).filter((element) => element.getAttribute('aria-label') === label + ', click to remove').length]));
  const chipMatches = labelWanted == null ? [] : [...composerForm.querySelectorAll('button')].filter(visible).filter((element) => element.getAttribute('aria-label') === labelWanted + ', click to remove');
  const roots = [...document.querySelectorAll('[role="menu"], [role="listbox"]')].filter(visible);
  const items = roots.flatMap((root) => [...root.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"], button')].filter(visible));
  const renderedAppMatches = labelWanted == null ? [] : [...document.querySelectorAll('[role="menuitemradio"], [role="option"]')].filter((element) => accessibleLabel(element) === labelWanted);
  const appMatches = renderedAppMatches.filter(visible);
  const moreMatches = items.filter((element) => accessibleLabel(element) === 'More' && element.getAttribute('role') === 'menuitem');
  return {
    composerFound: true,
    composerFormFound: true,
    toolsControlCount: controls.length,
    toolsExpanded: controls.length === 1 && controls[0].getAttribute('aria-expanded') === 'true',
    toolsRect: controls.length === 1 ? rect(controls[0]) : null,
    chipCounts,
    chipMatchCount: chipMatches.length,
    chipRect: chipMatches.length === 1 ? rect(chipMatches[0]) : null,
    visibleMenuCount: roots.length,
    moreMatchCount: moreMatches.length,
    moreRect: moreMatches.length === 1 ? rect(moreMatches[0]) : null,
    appMatchCount: appMatches.length,
    renderedAppMatchCount: renderedAppMatches.length,
    appRect: appMatches.length === 1 ? rect(appMatches[0]) : null,
    availableAppLabels: items.filter((element) => ['menuitemradio', 'option'].includes(element.getAttribute('role'))).map(accessibleLabel).filter(Boolean),
  };
}`;

const FOCUS_APP_OPTION_FN = `function(labelWanted) {
  const accessibleLabel = (element) => ((element && (element.getAttribute('aria-label') || element.innerText)) || '').trim().replace(/\\s+/g, ' ');
  const matches = [...document.querySelectorAll('[role="menuitemradio"], [role="option"]')].filter((element) => accessibleLabel(element) === labelWanted);
  if (matches.length !== 1) return { focused: false, matchCount: matches.length };
  matches[0].focus();
  return { focused: document.activeElement === matches[0], matchCount: 1 };
}`;

export function appSelectionState(observation, labelWanted) {
  if (!observation?.composerFormFound) throw new Error('ChatGPT composer form is unavailable for app selection.');
  if (observation.toolsControlCount !== 1) throw new Error(`ChatGPT Tools control is ${observation.toolsControlCount > 1 ? 'ambiguous' : 'unavailable'}.`);
  if ((observation.chipMatchCount ?? 0) > 1) throw new Error(`Selected app chip ${labelWanted} is ambiguous.`);
  if ((observation.appMatchCount ?? 0) > 1) throw new Error(`Exact app label ${labelWanted} is ambiguous.`);
  if ((observation.renderedAppMatchCount ?? 0) > 1) throw new Error(`Exact rendered app label ${labelWanted} is ambiguous.`);
  if ((observation.appMatchCount ?? 0) === 1) return { type: 'APP_OPTION', label: labelWanted };
  if ((observation.renderedAppMatchCount ?? 0) === 1) return { type: 'FOCUS_APP', label: labelWanted };
  if ((observation.moreMatchCount ?? 0) > 1) throw new Error('ChatGPT Tools More control is ambiguous.');
  if ((observation.moreMatchCount ?? 0) === 1) return { type: 'OPEN_MORE' };
  return { type: 'OPEN_TOOLS' };
}

function normalizeExpectedSurfaceUrl(value) {
  const url = new URL(value);
  if (url.protocol === 'https:' && url.hostname === 'chatgpt.com' && !url.username && !url.password && url.pathname === '/') {
    return 'https://chatgpt.com/';
  }
  return normalizeConversationUrl(value);
}

const PREPARE_COMPOSER_FN = `function(expectedBody) {
  const element = document.querySelector('#prompt-textarea') || document.querySelector('[data-testid="prompt-textarea"]') || document.querySelector('textarea[aria-label="Chat with ChatGPT"]');
  if (!element) return { ok: false, reason: 'COMPOSER_NOT_FOUND' };
  const visible = Boolean(element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  if (!visible) return { ok: false, reason: 'COMPOSER_NOT_VISIBLE' };
  const value = typeof element.value === 'string' ? element.value : (element.textContent || '');
  if (value && value !== expectedBody) return { ok: false, reason: 'COMPOSER_CONTAMINATED', length: value.length };
  element.focus();
  return { ok: true, alreadyExact: value === expectedBody };
}`;

const VERIFY_COMPOSER_FN = `function(expectedBody) {
  const element = document.querySelector('#prompt-textarea') || document.querySelector('[data-testid="prompt-textarea"]') || document.querySelector('textarea[aria-label="Chat with ChatGPT"]');
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
  const composer = document.querySelector('#prompt-textarea') || document.querySelector('[data-testid="prompt-textarea"]') || document.querySelector('textarea[aria-label="Chat with ChatGPT"]');
  const composerVisible = visible(composer);
  const composerDisabled = Boolean(composer && (composer.disabled || composer.getAttribute('aria-disabled') === 'true' || composer.getAttribute('contenteditable') === 'false'));
  const stopVisible = visible(stop);
  const normalizedCurrent = normalizeUrl(location.href);
  const current = new URL(location.href);
  const creatingConversation = expectedUrl === 'https://chatgpt.com/';
  return {
    currentUrl: location.href,
    conversationUrl: normalizedCurrent,
    urlMismatch: creatingConversation
      ? current.origin !== 'https://chatgpt.com' || (current.pathname !== '/' && !normalizedCurrent)
      : normalizedCurrent !== expectedUrl,
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

  async createFreshChatTarget() {
    const freshUrl = 'https://chatgpt.com/';
    const created = await this.#json(`/json/new?${encodeURIComponent(freshUrl)}`, { method: 'PUT' });
    if (!created?.id || !created?.webSocketDebuggerUrl) throw new Error('Chrome did not create a debuggable fresh-chat page target.');
    await this.activateTarget(created.id);
    const target = { id: created.id, type: created.type ?? 'page', title: created.title ?? '', url: freshUrl, webSocketDebuggerUrl: created.webSocketDebuggerUrl, created: true };
    await this.#withPageClient(target, async (client) => {
      // Brave can acknowledge /json/new before applying its query-string URL,
      // leaving a durable about:blank target. Make the requested navigation an
      // explicit CDP operation so a fresh supervisory cycle is never bound to
      // an uninitialized provider surface.
      const navigation = await client.send('Page.navigate', { url: freshUrl });
      if (navigation?.errorText) throw new Error(`Fresh ChatGPT navigation failed: ${navigation.errorText}`);
      await waitFor(async () => {
        const result = await client.callFunction(PAGE_INSPECTION_FN, [freshUrl]);
        if (result?.loginRequired) throw new Error('ChatGPT login is required in the VPS browser profile.');
        if (result?.urlMismatch) return false;
        return result?.composerFound ? result : false;
      }, this.pageReadyTimeoutMs, 500, 'Fresh ChatGPT composer did not become ready.');
      await waitFor(async () => {
        const result = await client.callFunction(CURRENT_MODEL_FN, [freshUrl]);
        if (result?.urlMismatch) return false;
        return result?.controlFound ? result : false;
      }, this.pageReadyTimeoutMs, 300, 'Fresh ChatGPT model control did not become ready.');
    });
    return target;
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
      const result = await this.#currentModel(client, normalizeConversationUrl(expectedUrl));
      return result.label;
    });
  }

  async switchModel(target, { expectedUrl, label }) {
    const normalized = normalizeExpectedSurfaceUrl(expectedUrl);
    return this.#withPageClient(target, async (client) => {
      const current = await this.#currentModel(client, normalized);
      if (current?.label === label) return { selectedLabel: label, observedLabel: current.label, changed: false };
      await this.#openModelMenu(client, normalized);
      const selected = await this.#selectOpenModelMenu(client, label);
      const verified = await waitFor(async () => {
        const result = await this.#currentModel(client, normalized);
        return result?.label === label ? result : false;
      }, this.pageReadyTimeoutMs, 300, `ChatGPT model/mode control did not report exact label ${label}.`);
      return { selectedLabel: label, observedLabel: verified.label, changed: true, menuSelectedLabel: selected.selectedLabel, selectionMechanism: selected.mechanism };
    });
  }

  async selectAppsForMessage(target, { knownLabels, requiredLabels }) {
    if (!Array.isArray(knownLabels) || !Array.isArray(requiredLabels)) throw new Error('App selection requires knownLabels and requiredLabels arrays.');
    if (new Set(knownLabels).size !== knownLabels.length || new Set(requiredLabels).size !== requiredLabels.length) throw new Error('App labels must be unique.');
    if (requiredLabels.some((label) => !knownLabels.includes(label))) throw new Error('Every required app label must be present in knownLabels.');
    return this.#withPageClient(target, async (client) => {
      const removedLabels = [];
      for (const label of knownLabels) {
        const observation = await client.callFunction(APP_SELECTION_STATE_FN, [knownLabels, label]);
        appSelectionState(observation, label);
        if (observation.chipMatchCount === 1) {
          await this.#clickRect(client, observation.chipRect);
          await waitFor(async () => {
            const next = await client.callFunction(APP_SELECTION_STATE_FN, [knownLabels, label]);
            appSelectionState(next, label);
            return next.chipMatchCount === 0 ? next : false;
          }, this.pageReadyTimeoutMs, 150, `Selected app chip ${label} did not clear before per-message reselection.`);
          removedLabels.push(label);
        }
      }

      const selectedLabels = [];
      for (const label of requiredLabels) {
        for (;;) {
          const observation = await client.callFunction(APP_SELECTION_STATE_FN, [knownLabels, label]);
          const action = appSelectionState(observation, label);
          if (observation.chipMatchCount === 1) break;
          if (action.type === 'OPEN_TOOLS') {
            await this.#clickRect(client, observation.toolsRect);
          } else if (action.type === 'OPEN_MORE') {
            await this.#clickRect(client, observation.moreRect);
          } else if (action.type === 'FOCUS_APP') {
            const focused = await client.callFunction(FOCUS_APP_OPTION_FN, [label]);
            if (!focused?.focused || focused.matchCount !== 1) throw new Error(`Could not focus exact app label ${label}.`);
            await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
            await client.send('Input.dispatchKeyEvent', { type: 'char', text: '\r', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
            await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
          } else {
            await this.#clickRect(client, observation.appRect);
          }
          const selected = await waitFor(async () => {
            const next = await client.callFunction(APP_SELECTION_STATE_FN, [knownLabels, label]);
            appSelectionState(next, label);
            if (next.chipMatchCount === 1) return next;
            if (action.type === 'OPEN_TOOLS') return next.toolsExpanded || next.moreMatchCount === 1 || next.renderedAppMatchCount === 1 ? next : false;
            if (action.type === 'OPEN_MORE') return next.renderedAppMatchCount === 1 ? next : false;
            if (action.type === 'FOCUS_APP') return next.chipMatchCount === 1 ? next : false;
            return false;
          }, this.pageReadyTimeoutMs, 150, `ChatGPT did not expose or select exact app label ${label}.`);
          if (selected.chipMatchCount === 1) break;
        }
        selectedLabels.push(label);
      }

      const verified = await client.callFunction(APP_SELECTION_STATE_FN, [knownLabels, null]);
      appSelectionState(verified, null);
      for (const label of knownLabels) {
        const expected = requiredLabels.includes(label) ? 1 : 0;
        if (verified.chipCounts?.[label] !== expected) throw new Error(`Per-message app chip verification failed for exact label ${label}.`);
      }
      return {
        status: 'MESSAGE_APPS_SELECTED',
        requiredLabels,
        selectedLabels,
        clearedPriorLabels: removedLabels,
        verifiedChipCounts: verified.chipCounts,
        inspectedAssistantOutput: false,
      };
    });
  }

  async verifyModelRoundTrip(target, { expectedUrl, extraHighLabel, proLabel }) {
    const normalized = normalizeExpectedSurfaceUrl(expectedUrl);
    return this.#withPageClient(target, async (client) => {
      const inspection = await client.callFunction(PAGE_INSPECTION_FN, [normalized]);
      if (inspection?.urlMismatch || inspection?.loginRequired || !inspection?.composerFound) {
        throw new Error('Registered supervisor chat is not ready for model capability verification.');
      }
      await this.#openModelMenu(client, normalized);
      const selectExtra = await this.#selectOpenModelMenu(client, extraHighLabel);
      await waitFor(() => this.#currentModel(client, normalized).then((value) => value?.label === extraHighLabel ? value : false), this.pageReadyTimeoutMs, 300, 'Extra High label did not become current.');
      await this.#openModelMenu(client, normalized);
      const selectPro = await this.#selectOpenModelMenu(client, proLabel);
      const proCurrent = await waitFor(() => this.#currentModel(client, normalized).then((value) => value?.label === proLabel ? value : false), this.pageReadyTimeoutMs, 300, 'Pro label did not become current.');
      await this.#openModelMenu(client, normalized);
      const restore = await this.#selectOpenModelMenu(client, extraHighLabel);
      const extraCurrent = await waitFor(() => this.#currentModel(client, normalized).then((value) => value?.label === extraHighLabel ? value : false), this.pageReadyTimeoutMs, 300, 'Extra High label did not become current after round trip.');
      const availableLabels = [...new Set([
        ...selectExtra.observedLabels,
        ...selectPro.observedLabels,
        ...restore.observedLabels,
      ])];
      if (!availableLabels.includes(extraHighLabel) || !availableLabels.includes(proLabel)) {
        throw new Error('Exact Extra High and Pro UI labels were not both observable.');
      }
      return {
        status: 'MODE_ROUND_TRIP_VERIFIED',
        availableLabels,
        extraHighObserved: extraCurrent.label,
        proObserved: proCurrent.label,
        restoredObserved: extraCurrent.label,
        menuSelections: [selectExtra.selectedLabel, selectPro.selectedLabel, restore.selectedLabel],
        selectionMechanisms: [selectExtra.mechanism, selectPro.mechanism, restore.mechanism],
        inspectedAssistantOutput: false,
      };
    });
  }

  async #currentModel(client, normalized) {
    const result = await client.callFunction(CURRENT_MODEL_FN, [normalized]);
    if (result?.urlMismatch) throw new Error(`Chat target navigated to an unexpected URL: ${result.currentUrl}`);
    if (!result?.controlFound) throw new Error(`ChatGPT model/mode switch control is unavailable: ${result?.reason ?? 'UNKNOWN'}.`);
    return result;
  }

  async #openModelMenu(client, normalized) {
    const control = await client.callFunction(OPEN_MODEL_MENU_FN, [normalized]);
    if (control?.urlMismatch) throw new Error(`Chat target navigated to an unexpected URL: ${control.currentUrl}`);
    if (!control?.rect) throw new Error(`ChatGPT model/mode switch control is unavailable: ${control?.reason ?? 'UNKNOWN'}.`);
    if (!control.expanded) {
      const x = control.rect.x + control.rect.width / 2;
      const y = control.rect.y + control.rect.height / 2;
      await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
    return waitFor(async () => {
      const observation = await client.callFunction(MODEL_MENU_STATE_FN, [null]);
      return observation?.menuFound ? observation : false;
    }, this.pageReadyTimeoutMs, 200, 'ChatGPT model/mode menu did not open.');
  }

  async #selectOpenModelMenu(client, labelWanted) {
    let observation = await client.callFunction(MODEL_MENU_STATE_FN, [labelWanted]);
    const selection = modelMenuSelectionState(observation, labelWanted);
    if (selection.type === 'DIRECT_OPTION') {
      const selected = await client.callFunction(SELECT_MODEL_OPTION_FN, [labelWanted]);
      if (!selected?.selected) throw new Error(`Could not select exact model UI label ${labelWanted}: ${selected?.reason ?? 'UNKNOWN'}.`);
      return { selectedLabel: selected.selectedLabel, observedLabels: selection.observedLabels, mechanism: 'DIRECT_MENU_OPTION' };
    }

    const observedLabels = new Set(selection.observedLabels);
    const initialLabel = observation.currentPowerLabel;
    if (selection.type === 'POWER_CURRENT') {
      await this.#closeModelMenu(client);
      return { selectedLabel: labelWanted, observedLabels: [...observedLabels], mechanism: 'POWER_SLIDER_EXACT_LABEL' };
    }

    const step = async (direction) => {
      const focus = await client.callFunction(FOCUS_MODEL_POWER_FN, []);
      if (!focus?.focused) throw new Error(`ChatGPT model Power control is unavailable: ${focus?.reason ?? 'UNKNOWN'}.`);
      const before = observation.sliderPosition;
      const key = direction > 0 ? 'ArrowRight' : 'ArrowLeft';
      const code = direction > 0 ? 39 : 37;
      await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
      observation = await waitFor(async () => {
        const next = await client.callFunction(MODEL_MENU_STATE_FN, [labelWanted]);
        modelMenuSelectionState(next, labelWanted);
        return next.sliderPosition !== before ? next : false;
      }, Math.min(this.pageReadyTimeoutMs, 5_000), 100, `ChatGPT model Power control did not move ${key}.`);
      observedLabels.add(observation.currentPowerLabel);
      return observation.currentPowerLabel === labelWanted;
    };

    while (observation.sliderPosition < observation.sliderMaximum) {
      if (await step(1)) {
        await this.#closeModelMenu(client);
        return { selectedLabel: labelWanted, observedLabels: [...observedLabels], mechanism: 'POWER_SLIDER_EXACT_LABEL' };
      }
    }
    while (observation.sliderPosition > observation.sliderMinimum) {
      if (await step(-1)) {
        await this.#closeModelMenu(client);
        return { selectedLabel: labelWanted, observedLabels: [...observedLabels], mechanism: 'POWER_SLIDER_EXACT_LABEL' };
      }
    }

    while (observation.currentPowerLabel !== initialLabel && observation.sliderPosition < observation.sliderMaximum) {
      await step(1);
    }
    await this.#closeModelMenu(client);
    throw new Error(`Exact model UI label ${labelWanted} was not observable in the model Power control.`);
  }

  async #closeModelMenu(client) {
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  }

  async #clickRect(client, rect) {
    if (!rect || !Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
      throw new Error('Browser control did not expose a usable click rectangle.');
    }
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async submitExactMessage(target, { expectedUrl, body, bodySha256 }) {
    if (!body || typeof body !== 'string') throw new Error('Cannot submit an empty message.');
    let relayStage = 'CONNECTING';
    let clickedAtObserved = null;
    try {
      return await this.#withPageClient(target, async (client) => {
        relayStage = 'PREPARING';
        await client.send('Runtime.enable');
        await client.send('Page.enable');
        const normalized = normalizeExpectedSurfaceUrl(expectedUrl);
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
        clickedAtObserved = new Date().toISOString();

        let started;
        try {
          started = await waitFor(async () => {
            const state = await client.callFunction(GENERATION_STATE_FN, [normalized]);
            if (state?.urlMismatch) throw new Error(`Chat target changed during submission: ${state.currentUrl}`);
            if (state?.loginRequired) throw new Error('ChatGPT login is required in the VPS browser profile.');
            if (normalized === 'https://chatgpt.com/' && !state?.conversationUrl) return false;
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
          conversationUrl: normalized === 'https://chatgpt.com/' ? started.conversationUrl : normalized,
          bodySha256,
          bodyLength: body.length,
          clickedAtObserved,
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
      if (error && typeof error === 'object') {
        error.relayStage = relayStage;
        if (clickedAtObserved) error.clickedAtObserved = clickedAtObserved;
      }
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
