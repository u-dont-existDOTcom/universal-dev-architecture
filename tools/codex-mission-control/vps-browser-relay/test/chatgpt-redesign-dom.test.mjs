import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APP_SELECTION_STATE_FN,
  CLICK_SEND_FN,
  CURRENT_MODEL_FN,
  GENERATION_STATE_FN,
  MODEL_MENU_STATE_FN,
  PAGE_INSPECTION_FN,
  appSelectionState,
  consumerControlSelectionState,
  modelMenuSelectionState,
} from '../src/cdp.mjs';
import { CURRENT_CONSUMER_CONTROLS } from '../src/core.mjs';
import { h, miniDocument, runInPage } from './fixtures/mini-dom.mjs';

// Structures recorded from the relay's own ChatGPT tab on 2026-09-26 (September 2026 page). Labels and
// attributes are the page's; message text is never part of these fixtures.
const ROOT = 'https://chatgpt.com/';

function composerForm({ open = false, effortLabel = 'Medium', chips = [], extra = [] } = {}) {
  const textbox = h('div', { contenteditable: 'true', role: 'textbox', 'aria-label': 'Ask ChatGPT', class: 'ProseMirror', 'data-composer-markdown': '' },
    [h('p', { 'data-empty-paragraph': 'true' }, [h('br', { class: 'ProseMirror-trailingBreak' })])]);
  const model = h('button', {
    type: 'button', 'aria-label': 'Select ChatGPT model', id: 'radix-_r_19_', 'aria-haspopup': 'menu',
    'aria-expanded': String(open), 'data-state': open ? 'open' : 'closed', 'data-codex-intelligence-trigger': 'true',
    'data-composer-navigation-target': 'reasoning', 'data-selected-reasoning-effort': effortLabel.toLowerCase(),
    ...(open ? { 'aria-controls': 'radix-_r_1a_' } : {}),
  }, [], { text: open ? 'Thinking effort' : effortLabel });
  return h('form', { 'data-chatgpt-composer': '', 'data-composer-placement': 'home' }, [
    h('div', {}, [textbox]),
    ...chips.map((label) => h('button', { type: 'button', 'aria-label': `Remove ${label}` }, [], { text: label })),
    h('button', { type: 'button', 'aria-label': 'Add files and more', 'aria-expanded': 'false', 'data-composer-navigation-target': 'add-context' }),
    model,
    h('button', { type: 'button', 'aria-label': 'Dictate' }),
    ...extra,
  ]);
}

function modelMenu({ position = 1, label = 'Medium', total = 5 } = {}) {
  return h('div', { 'data-radix-popper-content-wrapper': '' }, [
    h('div', { role: 'menu', id: 'radix-_r_1a_', 'aria-labelledby': 'radix-_r_19_', 'data-radix-menu-content': '', 'data-state': 'open' }, [
      h('div', { role: 'menuitem', 'aria-label': 'Select model', 'data-model-picker-view-toggle': 'true' }, [h('span', {}, [], { text: 'Latest' })]),
      h('span', { role: 'status', 'aria-live': 'polite', id: '_r_84_' }, [], { text: `${label}, ${position + 1} of ${total}.` }),
      h('div', { role: 'menuitem', 'aria-label': 'Power', 'aria-describedby': '_r_84_ _r_85_', 'data-reasoning-slider': 'true' }, [
        h('div', { 'data-model-picker-power-slider': '' }, [
          h('span', { role: 'slider', 'aria-valuemin': '0', 'aria-valuemax': String(total - 1), 'aria-valuenow': String(position), 'aria-hidden': 'true' }),
        ]),
      ]),
      h('div', { role: 'menuitemradio', 'aria-checked': 'true', 'data-model-selected': 'true' }, [], { text: 'Latest' }),
      h('div', { role: 'menuitemradio', 'aria-checked': 'false' }, [], { text: 'GPT-5.6 Sol' }),
      h('div', { role: 'menuitemradio', 'aria-checked': 'false' }, [], { text: 'GPT-5.5\nLeaving on October 14' }),
    ]),
  ]);
}

function appList(names, { scrollTop = 0 } = {}) {
  const scroll = h('div', { 'data-mention-list-scroll-area': '' }, [h('div', {}, names.map((name) => h('button', { type: 'button', 'data-list-navigation-item': 'true' }, [], { text: name })))]);
  Object.assign(scroll, { scrollTop, scrollHeight: 1584, clientHeight: 204 });
  return h('div', { 'data-composer-overlay-floating-ui': 'true' }, [h('div', {}, [scroll])]);
}

const page = (children, href = ROOT) => miniDocument(h('body', {}, children), { href });

test('page inspection and the model control recognize the September 2026 composer', () => {
  const inspection = runInPage(PAGE_INSPECTION_FN, page([composerForm()]), [ROOT]);
  assert.deepEqual({ ...inspection, currentUrl: undefined }, { currentUrl: undefined, urlMismatch: false, composerFound: true, loginRequired: false });
  const model = runInPage(CURRENT_MODEL_FN, page([composerForm()]), [ROOT]);
  assert.equal(model.controlFound, true);
  assert.equal(model.label, 'Medium');
  assert.equal(model.controlId, 'radix-_r_19_');
});

test('the open model menu exposes the top model, the Power slider and its status line', () => {
  const observation = runInPage(MODEL_MENU_STATE_FN, page([composerForm({ open: true }), modelMenu()]), [null, 'Thinking effort', null]);
  assert.equal(observation.menuFound, true);
  assert.equal(observation.modelOptionCount, 3);
  assert.equal(observation.topModelLabel, 'Latest');
  assert.equal(observation.topModelSelected, true);
  assert.equal(observation.powerControlCount, 1);
  assert.equal(observation.sliderCount, 1);
  assert.equal(observation.currentPowerLabel, 'Medium');
  assert.equal(observation.powerStatusOrdinal, '2 of 5');
  assert.deepEqual([observation.sliderPosition, observation.sliderMinimum, observation.sliderMaximum], [1, 0, 4]);
  assert.equal(observation.thinkingControlObservedLabel, 'Thinking effort');
  assert.deepEqual(modelMenuSelectionState(observation, 'Extra High', { allowDirect: false }), {
    type: 'POWER_SEARCH', initialLabel: 'Medium', position: 1, minimum: 0, maximum: 4, observedLabels: ['Medium'],
  });
});

test('Extra High, 4 of 5 on the Power slider verifies the current consumer controls', () => {
  const observation = runInPage(MODEL_MENU_STATE_FN, page([composerForm({ open: true }), modelMenu({ position: 3, label: 'Extra High' })]),
    [null, 'Thinking effort', 'Extra High']);
  assert.equal(observation.thinkingLabelMatchCount, 1);
  const verified = consumerControlSelectionState({ modelVisibleLabel: 'Latest', modelSelectorIndex: 0 }, observation, CURRENT_CONSUMER_CONTROLS);
  assert.equal(verified.status, 'CURRENT_CONSUMER_CONTROLS_VERIFIED');
  assert.equal(verified.modelVisibleLabel, 'Latest');
  assert.equal(verified.thinkingVisibleLabel, 'Extra High');
  assert.equal(verified.thinkingOrdinal, '4 of 5');
});

test('the Power slider fails closed on the wrong effort or a status that disagrees with the slider', () => {
  const high = runInPage(MODEL_MENU_STATE_FN, page([composerForm({ open: true }), modelMenu({ position: 2, label: 'High' })]), [null, 'Thinking effort', 'Extra High']);
  assert.throws(() => consumerControlSelectionState({ modelVisibleLabel: 'Latest', modelSelectorIndex: 0 }, high, CURRENT_CONSUMER_CONTROLS), /thinking label mismatch/);
  const menu = modelMenu({ position: 3, label: 'Extra High' });
  menu.querySelector('[role="status"]')._text = 'Extra High, 3 of 5.';
  const skewed = runInPage(MODEL_MENU_STATE_FN, page([composerForm({ open: true }), menu]), [null, 'Thinking effort', 'Extra High']);
  assert.throws(() => consumerControlSelectionState({ modelVisibleLabel: 'Latest', modelSelectorIndex: 0 }, skewed, CURRENT_CONSUMER_CONTROLS), /disagrees with the slider/);
});

test('app selection scrolls the September 2026 list, picks one exact entry and verifies the Remove pill', () => {
  const firstPage = ['Add photos & files', 'Web search', 'AskRigor Reviewer\nBetter research', 'Mission Control\nRead-only exact-bound Mission Control metadata', 'InnerSignal', '', '', ''];
  const scroll = runInPage(APP_SELECTION_STATE_FN, page([composerForm(), appList(firstPage)]), [['Mission Control', 'GitHub'], 'GitHub']);
  assert.equal(scroll.listOpen, true);
  assert.equal(scroll.listMatchCount, 0);
  assert.equal(scroll.listAtEnd, false);
  assert.deepEqual(appSelectionState(scroll, 'GitHub'), { type: 'SCROLL_LIST' });

  const mission = runInPage(APP_SELECTION_STATE_FN, page([composerForm(), appList(firstPage)]), [['Mission Control', 'GitHub'], 'Mission Control']);
  assert.deepEqual(appSelectionState(mission, 'Mission Control'), { type: 'LIST_OPTION', label: 'Mission Control' });
  assert.ok(mission.listRect);

  const later = ['Wolfram', 'Railway', 'GitHub', 'Template Creator', 'GitHub Copilot'];
  const github = runInPage(APP_SELECTION_STATE_FN, page([composerForm(), appList(later, { scrollTop: 800 })]), [['Mission Control', 'GitHub'], 'GitHub']);
  assert.throws(() => appSelectionState(github, 'GitHub'), /ambiguous/);
  const unique = runInPage(APP_SELECTION_STATE_FN, page([composerForm(), appList(later.slice(0, 4), { scrollTop: 800 })]), [['Mission Control', 'GitHub'], 'GitHub']);
  assert.deepEqual(appSelectionState(unique, 'GitHub'), { type: 'LIST_OPTION', label: 'GitHub' });

  const selected = runInPage(APP_SELECTION_STATE_FN, page([composerForm({ chips: ['GitHub'] })]), [['Mission Control', 'GitHub'], null]);
  assert.deepEqual(selected.chipCounts, { 'Mission Control': 0, GitHub: 1 });
  const end = runInPage(APP_SELECTION_STATE_FN, page([composerForm(), appList(['Notion', 'Slack'], { scrollTop: 1380 })]), [['Mission Control', 'GitHub'], 'GitHub']);
  assert.throws(() => appSelectionState(end, 'GitHub'), /not in the ChatGPT app list/);
});

test('send and stop use the September 2026 composer controls', () => {
  const send = h('button', { type: 'submit', 'aria-label': 'Send' });
  const clicked = runInPage(CLICK_SEND_FN, page([composerForm({ extra: [send] })]));
  assert.deepEqual(clicked, { ok: true });
  assert.equal(send.clicks, 1);

  const conversation = 'https://chatgpt.com/c/abc123';
  const generating = runInPage(GENERATION_STATE_FN, page([composerForm({ extra: [h('button', { type: 'button', 'aria-label': 'Stop' })] })], conversation), [conversation]);
  assert.equal(generating.stopVisible, true);
  assert.equal(generating.generating, true);
  assert.equal(generating.idleReady, false);
  const idle = runInPage(GENERATION_STATE_FN, page([composerForm()], conversation), [conversation]);
  assert.equal(idle.stopVisible, false);
  assert.equal(idle.idleReady, true);
});

test('in-page functions keep their regular-expression escapes after template evaluation', async () => {
  const cdp = await import('../src/cdp.mjs');
  const sources = Object.entries(cdp).filter(([name, value]) => name.endsWith('_FN') && typeof value === 'string');
  assert.ok(sources.length >= 10);
  for (const [name, source] of sources) {
    // A single backslash inside a template literal is dropped, turning /\s+/ into /s+/ and (\d+) into (d+).
    assert.doesNotMatch(source, /\/s\+\/|\(d\+\)|\/\^s|\.split\(\/s/, `${name} lost a regular-expression escape`);
  }
});
