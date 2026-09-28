import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APP_SELECTION_STATE_FN,
  CLICK_SEND_FN,
  CURRENT_MODEL_FN,
  GENERATION_STATE_FN,
  JOURNAL_WRITE_CONFIRMATION_FN,
  APPROVE_JOURNAL_WRITE_CONFIRMATION_FN,
  MODEL_MENU_STATE_FN,
  PAGE_INSPECTION_FN,
  appSelectionState,
  consumerControlSelectionState,
  modelMenuSelectionState,
} from '../src/cdp.mjs';
import { CURRENT_CONSUMER_CONTROLS } from '../src/core.mjs';
import { IDLE_STATE_FN } from '../src/stuck-recovery.mjs';
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

// An entry is a name, optionally followed by a description in its own element ("name|description"), or one
// combined text run when given as { combined: "..." }. Entries are laid out 36 px apart from the list's top; the
// list viewport shows y 100-304, so entries 0-5 are in view and later ones are mounted below it.
const VIEWPORT = { x: 0, y: 100, width: 500, height: 204 };
function appEntry(entry, index, offset = 0) {
  const attrs = { type: 'button', 'data-list-navigation-item': 'true' };
  const rect = { x: 10, y: VIEWPORT.y + index * 36 - offset, width: 400, height: 32 };
  if (typeof entry === 'object') return h('button', attrs, [h('span', { class: 'truncate' }, [], { text: entry.combined })], { rect });
  const [name, description] = entry.split('|');
  return h('button', attrs, [h('span', {}, [], { text: name, rect }), ...(description ? [h('span', {}, [], { text: description, rect })] : [])], { rect });
}

function appList(names, { scrollTop = 0, offset = 0 } = {}) {
  const scroll = h('div', { 'data-mention-list-scroll-area': '' }, [h('div', {}, names.map((name, index) => appEntry(name, index, offset)))], { rect: VIEWPORT });
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

test('journal app confirmation detector returns only structured app, tool and button labels', () => {
  const dialog = h('div', { role: 'dialog', 'data-app-name': 'InnerSignal', 'data-tool-name': 'submit_journal_work_result' }, [
    h('div', {}, [], { text: 'PRIVATE-JOURNAL-TEXT-SENTINEL' }),
    h('button', {}, [], { text: 'Cancel' }),
    h('button', {}, [], { text: 'Always allow' }),
  ]);
  const conversation = 'https://chatgpt.com/c/journal-confirmation';
  assert.deepEqual(runInPage(JOURNAL_WRITE_CONFIRMATION_FN, page([dialog], conversation), [conversation]), {
    present: true, appName: 'InnerSignal', toolName: 'submit_journal_work_result', buttons: ['Cancel', 'Always allow'],
  });
  assert.deepEqual(runInPage(JOURNAL_WRITE_CONFIRMATION_FN, page([], conversation), [conversation]), {
    present: false, appName: null, toolName: null, buttons: [],
  });
});

test('journal confirmation detection and approval fail closed after navigation away from the bound conversation', () => {
  const approveButton = h('button', {}, [], { text: 'Always allow' });
  const dialog = h('div', { role: 'dialog', 'data-app-name': 'InnerSignal', 'data-tool-name': 'submit_journal_work_result' }, [
    approveButton,
  ]);
  const expectedUrl = 'https://chatgpt.com/c/bound-journal';
  const navigatedPage = page([dialog], 'https://chatgpt.com/c/unrelated');
  assert.deepEqual(runInPage(JOURNAL_WRITE_CONFIRMATION_FN, navigatedPage, [expectedUrl]), {
    present: false, appName: null, toolName: null, buttons: [], urlMismatch: true,
  });
  assert.deepEqual(runInPage(APPROVE_JOURNAL_WRITE_CONFIRMATION_FN, navigatedPage, [expectedUrl, 'InnerSignal', 'submit_journal_work_result', 'Always allow']), {
    approved: false, reason: 'URL_MISMATCH',
  });
  assert.equal(approveButton.clicks, 0);
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

test('the documented three-label journal calibration verifies exact controls', () => {
  const controls = { modelVisibleLabel: 'Calibrated model button', thinkingControlLabel: 'Power', thinkingVisibleLabel: 'Pro' };
  const observation = {
    menuFound: true, directMatchCount: 1, powerControlCount: 1, sliderCount: 1,
    thinkingControlObservedLabel: 'Power', currentPowerLabel: 'Pro',
    sliderPosition: 4, sliderMinimum: 1, sliderMaximum: 5,
  };
  const verified = consumerControlSelectionState({ label: 'Calibrated model button' }, observation, controls);
  assert.equal(verified.status, 'CALIBRATED_CONSUMER_CONTROLS_VERIFIED');
  assert.equal(verified.modelVisibleLabel, controls.modelVisibleLabel);
  assert.equal(verified.thinkingVisibleLabel, controls.thinkingVisibleLabel);
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
  const firstPage = ['Add photos & files', 'Web search', 'AskRigor Reviewer|Better research', 'Mission Control|Read-only exact-bound Mission Control metadata', 'InnerSignal', '', '', ''];
  const scroll = runInPage(APP_SELECTION_STATE_FN, page([composerForm(), appList(firstPage)]), [['Mission Control', 'GitHub'], 'GitHub']);
  assert.equal(scroll.listOpen, true);
  assert.equal(scroll.listMatchCount, 0);
  assert.equal(scroll.listAtEnd, false);
  assert.deepEqual(appSelectionState(scroll, 'GitHub'), { type: 'SCROLL_LIST' });

  const mission = runInPage(APP_SELECTION_STATE_FN, page([composerForm(), appList(firstPage)]), [['Mission Control', 'GitHub'], 'Mission Control']);
  assert.deepEqual(appSelectionState(mission, 'Mission Control'), { type: 'LIST_OPTION', label: 'Mission Control' });
  assert.ok(mission.listRect);

  // Exact names only: "GitHub Copilot" never matches "GitHub", nor does a longer name's prefix.
  const later = ['Wolfram|Add computation & knowledge', 'Railway', 'GitHub Copilot', 'GitHub', 'Template Creator'];
  const github = runInPage(APP_SELECTION_STATE_FN, page([composerForm(), appList(later, { scrollTop: 800 })]), [['Mission Control', 'GitHub'], 'GitHub']);
  assert.equal(github.listMatchCount, 1);
  assert.deepEqual(appSelectionState(github, 'GitHub'), { type: 'LIST_OPTION', label: 'GitHub' });
  const copilotOnly = runInPage(APP_SELECTION_STATE_FN, page([composerForm(), appList(['Railway', 'GitHub Copilot', ''], { scrollTop: 800 })]), [['Mission Control', 'GitHub'], 'GitHub']);
  assert.equal(copilotOnly.listMatchCount, 0);
  assert.deepEqual(appSelectionState(copilotOnly, 'GitHub'), { type: 'SCROLL_LIST' });
  const twice = runInPage(APP_SELECTION_STATE_FN, page([composerForm(), appList(['GitHub', 'GitHub|Second copy'], { scrollTop: 800 })]), [['Mission Control', 'GitHub'], 'GitHub']);
  assert.throws(() => appSelectionState(twice, 'GitHub'), /ambiguous/);
  const combined = runInPage(APP_SELECTION_STATE_FN, page([composerForm(), appList([{ combined: 'Mission Control Read-only exact-bound metadata' }, ''])]), [['Mission Control', 'GitHub'], 'Mission Control']);
  assert.equal(combined.listMatchCount, 0);

  const selected = runInPage(APP_SELECTION_STATE_FN, page([composerForm({ chips: ['GitHub'] })]), [['Mission Control', 'GitHub'], null]);
  assert.deepEqual(selected.chipCounts, { 'Mission Control': 0, GitHub: 1 });
  // A list already scrolled to the end is rewound once before the app can be declared absent.
  const end = runInPage(APP_SELECTION_STATE_FN, page([composerForm(), appList(['Notion', 'Slack'], { scrollTop: 1380 })]), [['Mission Control', 'GitHub'], 'GitHub']);
  assert.equal(end.listAtEnd, true);
  assert.equal(end.listAtTop, false);
  assert.deepEqual(appSelectionState(end, 'GitHub', { listRewound: false }), { type: 'REWIND_LIST' });
  assert.throws(() => appSelectionState(end, 'GitHub', { listRewound: true }), /not in the ChatGPT app list/);
  assert.equal(scroll.listAtTop, true);
  assert.deepEqual(appSelectionState(scroll, 'GitHub', { listRewound: false }), { type: 'SCROLL_LIST' });
  // Clearing earlier pills ignores an open list, so a list left open never aborts that step.
  assert.deepEqual(appSelectionState(end, 'GitHub', { considerList: false }), { type: 'OPEN_TOOLS' });
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
  // A hidden legacy Stop control earlier in the page must not hide the composer's visible one.
  const hiddenLegacy = h('button', { 'data-testid': 'stop-button' }, [], { hidden: true });
  const shadowed = runInPage(GENERATION_STATE_FN, page([hiddenLegacy, composerForm({ extra: [h('button', { type: 'button', 'aria-label': 'Stop' })] })], conversation), [conversation]);
  assert.equal(shadowed.stopVisible, true);
  assert.equal(shadowed.idleReady, false);
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

test('a hidden composer earlier in the page does not shadow the visible one', () => {
  const conversation = 'https://chatgpt.com/c/abc123';
  const hiddenLegacy = h('div', { id: 'prompt-textarea', contenteditable: 'true' }, [], { hidden: true });
  const state = runInPage(GENERATION_STATE_FN, page([hiddenLegacy, composerForm()], conversation), [conversation]);
  assert.equal(state.composerVisible, true);
  assert.equal(state.idleReady, true);
  const inspection = runInPage(PAGE_INSPECTION_FN, page([hiddenLegacy, composerForm()]), [ROOT]);
  assert.equal(inspection.composerFound, true);
});

test('stuck recovery reads the visible composer and Stop control on the September 2026 page', () => {
  const conversation = 'https://chatgpt.com/c/abc123';
  const hiddenForm = h('form', { 'data-chatgpt-composer': '' }, [h('div', { contenteditable: 'true', role: 'textbox' })], { hidden: true });
  const idle = runInPage(IDLE_STATE_FN, page([hiddenForm, composerForm()], conversation), [conversation]);
  assert.equal(idle.composerVisible, true);
  assert.equal(idle.idleReady, true);
  const stopping = runInPage(IDLE_STATE_FN, page([hiddenForm, composerForm({ extra: [h('button', { type: 'button', 'aria-label': 'Stop' })] })], conversation), [conversation]);
  assert.equal(stopping.stopVisible, true);
  assert.equal(stopping.idleReady, false);
});

test('app selection carries the list rewind state through every wait', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/cdp.mjs', import.meta.url), 'utf8');
  const flow = source.slice(source.indexOf('async selectAppsForMessage'), source.indexOf('async ensureExactConsumerControls'));
  assert.equal(flow.match(/appSelectionState\(next, label, \{ listRewound \}\)/g)?.length, 1);
  assert.equal(flow.match(/appSelectionState\(observation, label, \{ listRewound \}\)/g)?.length, 1);
  assert.equal(flow.match(/\{ considerList: false \}/g)?.length, 2);
});

test('app entries count as clickable only inside the list viewport', () => {
  const below = ['Add photos & files', 'Web search', 'Sketch', 'Deep research', 'Wolfram', 'Railway', 'Presentations', 'PDF', 'GitHub'];
  const seen = runInPage(APP_SELECTION_STATE_FN, page([composerForm(), appList(below)]), [['Mission Control', 'GitHub'], 'GitHub']);
  assert.equal(seen.listMatchCount, 0);
  assert.equal(seen.listMatchTotal, 1);
  assert.equal(seen.listMatchBelow, true);
  assert.deepEqual(appSelectionState(seen, 'GitHub', { listRewound: true }), { type: 'SCROLL_LIST' });

  // In view once scrolled to it; scrolled past it (above the list viewport, still on screen), scroll back up.
  const inView = runInPage(APP_SELECTION_STATE_FN, page([composerForm(), appList(below, { scrollTop: 150, offset: 150 })]), [['Mission Control', 'GitHub'], 'GitHub']);
  assert.equal(inView.listMatchCount, 1);
  assert.deepEqual(appSelectionState(inView, 'GitHub'), { type: 'LIST_OPTION', label: 'GitHub' });
  const past = runInPage(APP_SELECTION_STATE_FN, page([composerForm(), appList(below, { scrollTop: 330, offset: 330 })]), [['Mission Control', 'GitHub'], 'GitHub']);
  assert.equal(past.listMatchAbove, true);
  assert.deepEqual(appSelectionState(past, 'GitHub', { listRewound: false }), { type: 'SCROLL_LIST_UP' });

  const twiceOffscreen = runInPage(APP_SELECTION_STATE_FN, page([composerForm(), appList(['GitHub', 'Web search', 'Sketch', 'Deep research', 'Wolfram', 'Railway', 'PDF', 'GitHub'])]), [['Mission Control', 'GitHub'], 'GitHub']);
  assert.throws(() => appSelectionState(twiceOffscreen, 'GitHub'), /ambiguous/);
});
