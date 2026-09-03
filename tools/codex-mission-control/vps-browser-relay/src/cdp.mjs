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
      const result = await this.#currentModel(client, normalizeConversationUrl(expectedUrl));
      return result.label;
    });
  }

  async switchModel(target, { expectedUrl, label }) {
    const normalized = normalizeConversationUrl(expectedUrl);
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

  async verifyModelRoundTrip(target, { expectedUrl, extraHighLabel, proLabel }) {
    const normalized = normalizeConversationUrl(expectedUrl);
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

  async submitExactMessage(target, { expectedUrl, body, bodySha256 }) {
    if (!body || typeof body !== 'string') throw new Error('Cannot submit an empty message.');
    let relayStage = 'CONNECTING';
    let clickedAtObserved = null;
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
        clickedAtObserved = new Date().toISOString();

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
