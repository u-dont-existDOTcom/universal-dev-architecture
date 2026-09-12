import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  appSelectionState,
  consumerControlSelectionState,
  exactModelSelectionState,
  modelMenuSelectionState,
} from '../src/cdp.mjs';

const controls = {
  modelVisibleLabel: 'GPT-5.6 Sol', thinkingControlLabel: 'Thinking effort', thinkingVisibleLabel: 'Extra High', thinkingOrdinal: '4 of 5',
  accountPlanLabel: 'Pro', accountPlanRole: 'PROVENANCE_METADATA_ONLY', accountPlanIsReasoningMode: false,
};

function currentPowerMenu(overrides = {}) {
  return {
    menuFound: true,
    menuRole: 'menu',
    directMatchCount: 0,
    availableLabels: ['Select model', 'Power', 'GPT-5.6 Sol', 'GPT-5.5'],
    powerControlCount: 1,
    powerIndicatorCount: 1,
    thinkingLabelMatchCount: 1,
    sliderCount: 1,
    thinkingControlObservedLabel: 'Thinking effort',
    currentPowerLabel: 'Extra High',
    sliderPosition: 3,
    sliderMinimum: 0,
    sliderMaximum: 4,
    ...overrides,
  };
}

test('current ChatGPT thinking slider structure discovers the exact visible setting', () => {
  assert.deepEqual(modelMenuSelectionState(currentPowerMenu(), 'Extra High'), {
    type: 'POWER_CURRENT',
    observedLabels: ['Extra High'],
  });
  assert.deepEqual(modelMenuSelectionState(currentPowerMenu(), 'High'), {
    type: 'POWER_SEARCH',
    initialLabel: 'Extra High',
    position: 3,
    minimum: 0,
    maximum: 4,
    observedLabels: ['Extra High'],
  });
});

test('current combined model control requires one exact thinking-label segment', () => {
  const observation = currentPowerMenu({ directMatchCount: 1, thinkingLabelMatchCount: 0 });
  assert.throws(() => consumerControlSelectionState({ label: 'GPT-5.6 Sol' }, observation, controls), /thinking label Extra High must appear once/);
});

test('the exact GPT-5.6 Sol selector is a direct model option', () => {
  assert.deepEqual(modelMenuSelectionState({
    menuFound: true,
    directMatchCount: 1,
    availableLabels: ['GPT-5.6 Sol', 'GPT-5.5'],
    powerControlCount: 0,
    powerIndicatorCount: 0,
    sliderCount: 0,
  }, 'GPT-5.6 Sol'), {
    type: 'DIRECT_OPTION',
    observedLabels: ['GPT-5.6 Sol'],
  });
});

test('nested model menu accepts one semantically selected exact option when the outer control is Thinking effort', () => {
  assert.deepEqual(exactModelSelectionState({ label: 'Thinking effort' }, {
    menuFound: true,
    directMatchCount: 1,
    selectedModelMatchCount: 1,
  }, 'GPT-5.6 Sol'), {
    type: 'SEMANTIC_MENU_SELECTION',
    selectedLabel: 'GPT-5.6 Sol',
  });
});

test('nested model menu requires selection and fails closed on ambiguous selected state', () => {
  assert.deepEqual(exactModelSelectionState({ label: 'Thinking effort' }, {
    menuFound: true,
    directMatchCount: 1,
    selectedModelMatchCount: 0,
  }, 'GPT-5.6 Sol'), {
    type: 'SELECTION_REQUIRED',
    selectedLabel: null,
  });
  assert.throws(() => exactModelSelectionState({ label: 'Thinking effort' }, {
    menuFound: true,
    directMatchCount: 1,
    selectedModelMatchCount: 2,
  }, 'GPT-5.6 Sol'), /selected model UI label.*ambiguous/);
});

test('fixed controls verify GPT-5.6 Sol plus Thinking effort Extra High, 4 of 5 and treat Pro only as account metadata', () => {
  const observation = currentPowerMenu({ directMatchCount: 1 });
  assert.deepEqual(consumerControlSelectionState({ label: 'GPT-5.6 Sol' }, observation, controls), {
    status: 'FIXED_CONSUMER_CONTROLS_VERIFIED', modelVisibleLabel: 'GPT-5.6 Sol', thinkingControlLabel: 'Thinking effort',
    thinkingVisibleLabel: 'Extra High', thinkingOrdinal: '4 of 5', accountPlanLabel: 'Pro', accountPlanRole: 'PROVENANCE_METADATA_ONLY',
    accountPlanIsReasoningMode: false, backendModelIdentityClaimed: false,
  });
  assert.throws(() => consumerControlSelectionState({ label: 'GPT-5.6 Sol' }, { ...observation, currentPowerLabel: 'Pro' }, controls), /thinking label mismatch/);
  assert.throws(() => consumerControlSelectionState({ label: 'GPT-5.6 Sol' }, observation, { ...controls, accountPlanIsReasoningMode: true }), /fixed GPT-5.6 Sol/);
});

test('duplicate exact menu options fail closed as ambiguous', () => {
  assert.throws(() => modelMenuSelectionState({
    menuFound: true,
    directMatchCount: 2,
    availableLabels: ['Pro', 'Pro'],
  }, 'Pro'), /ambiguous inside the model menu/);
});

test('missing fixed thinking label fails closed instead of accepting a nearby label', () => {
  assert.throws(() => modelMenuSelectionState(currentPowerMenu({
    currentPowerLabel: '',
    availableLabels: ['Extra High', 'Plus'],
  }), 'Extra High'), /was not found in one supported model-menu control/);
});

test('browser control code does not use generic transcript-editable selectors', async () => {
  const source = await readFile(new URL('../src/cdp.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /div\.ProseMirror\[contenteditable/);
  assert.doesNotMatch(source, /textarea\[placeholder\]/);
  assert.match(source, /document\.querySelector\('\#prompt-textarea'\)/);
  assert.match(source, /\[role="menu"\], \[role="listbox"\], \[role="dialog"\]/);
});

test('model control falls back to one labeled page-wide menu button when ChatGPT moves it outside the composer form', async () => {
  const source = await readFile(new URL('../src/cdp.mjs', import.meta.url), 'utf8');
  assert.equal(source.match(/const pageWide = \[\.\.\.document\.querySelectorAll\('button\[aria-haspopup="menu"\], button\[aria-haspopup="listbox"\]'\)\]/g)?.length, 3);
  assert.equal(source.match(/tested\.length \? tested : \(scoped\.length \? scoped : pageWide\)/g)?.length, 3);
  assert.ok((source.match(/data-testid'\) !== 'composer-plus-btn'/g)?.length ?? 0) >= 6);
});

test('fresh provider conversations use an explicit CDP navigation instead of trusting json/new', async () => {
  const source = await readFile(new URL('../src/cdp.mjs', import.meta.url), 'utf8');
  assert.match(source, /#prepareTarget\(target, url, requireModelControl\)/);
  assert.match(source, /client\.send\('Page\.navigate', \{ url \}\)/);
  assert.match(source, /this\.#prepareTarget\(target, freshUrl, true\)/);
  assert.match(source, /ChatGPT navigation failed/);
  assert.match(source, /Fresh ChatGPT model control did not become ready/);
  assert.match(source, /model\/mode switch control did not become ready after navigation/);
  assert.match(source, /conversationAssigned \? 'CONVERSATION_URL_ASSIGNED'/);
  assert.match(source, /model menu did not become ready for exact label/);
  assert.match(source, /if \(normalized === 'https:\/\/chatgpt\.com\/'\) return false/);
});

test('exact app selection walks Tools then More then one exact app option', () => {
  const base = { composerFormFound: true, toolsControlCount: 1, chipMatchCount: 0, appMatchCount: 0, moreMatchCount: 0 };
  assert.deepEqual(appSelectionState(base, 'Mission Control'), { type: 'OPEN_TOOLS' });
  assert.deepEqual(appSelectionState({ ...base, moreMatchCount: 1 }, 'Mission Control'), { type: 'OPEN_MORE' });
  assert.deepEqual(appSelectionState({ ...base, renderedAppMatchCount: 1 }, 'Mission Control'), { type: 'FOCUS_APP', label: 'Mission Control' });
  assert.deepEqual(appSelectionState({ ...base, appMatchCount: 1 }, 'Mission Control'), { type: 'APP_OPTION', label: 'Mission Control' });
});

test('app selection fails closed on missing or ambiguous exact controls', () => {
  const base = { composerFormFound: true, toolsControlCount: 1, chipMatchCount: 0, appMatchCount: 0, moreMatchCount: 0 };
  assert.throws(() => appSelectionState({ ...base, toolsControlCount: 0 }, 'Mission Control'), /unavailable/);
  assert.throws(() => appSelectionState({ ...base, appMatchCount: 2 }, 'Mission Control'), /ambiguous/);
  assert.throws(() => appSelectionState({ ...base, chipMatchCount: 2 }, 'Mission Control'), /chip.*ambiguous/);
});
