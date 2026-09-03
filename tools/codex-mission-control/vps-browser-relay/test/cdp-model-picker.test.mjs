import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { appSelectionState, modelMenuSelectionState } from '../src/cdp.mjs';

function currentPowerMenu(overrides = {}) {
  return {
    menuFound: true,
    menuRole: 'menu',
    directMatchCount: 0,
    availableLabels: ['Select model', 'Power', 'GPT-5.6 Sol', 'GPT-5.5'],
    powerControlCount: 1,
    powerIndicatorCount: 1,
    sliderCount: 1,
    currentPowerLabel: 'Extra High',
    sliderPosition: 3,
    sliderMinimum: 0,
    sliderMaximum: 4,
    ...overrides,
  };
}

test('current ChatGPT Power slider structure discovers exact labels without a numeric model mapping', () => {
  assert.deepEqual(modelMenuSelectionState(currentPowerMenu(), 'Extra High'), {
    type: 'POWER_CURRENT',
    observedLabels: ['Extra High'],
  });
  assert.deepEqual(modelMenuSelectionState(currentPowerMenu(), 'Pro'), {
    type: 'POWER_SEARCH',
    initialLabel: 'Extra High',
    position: 3,
    minimum: 0,
    maximum: 4,
    observedLabels: ['Extra High'],
  });
});

test('existing exact menu-option structure remains supported', () => {
  assert.deepEqual(modelMenuSelectionState({
    menuFound: true,
    directMatchCount: 1,
    availableLabels: ['Extra High', 'Pro'],
    powerControlCount: 0,
    powerIndicatorCount: 0,
    sliderCount: 0,
  }, 'Pro'), {
    type: 'DIRECT_OPTION',
    observedLabels: ['Pro'],
  });
});

test('unrelated page text Pro cannot satisfy a model-menu selection', () => {
  assert.throws(() => modelMenuSelectionState({
    menuFound: true,
    directMatchCount: 0,
    availableLabels: [],
    outsidePageText: ['Pro'],
    powerControlCount: 0,
    powerIndicatorCount: 0,
    sliderCount: 0,
  }, 'Pro'), /was not found in one supported model-menu control/);
});

test('duplicate exact menu options fail closed as ambiguous', () => {
  assert.throws(() => modelMenuSelectionState({
    menuFound: true,
    directMatchCount: 2,
    availableLabels: ['Pro', 'Pro'],
  }, 'Pro'), /ambiguous inside the model menu/);
});

test('missing Pro fails closed instead of accepting a nearby label', () => {
  assert.throws(() => modelMenuSelectionState(currentPowerMenu({
    currentPowerLabel: '',
    availableLabels: ['Extra High', 'Plus'],
  }), 'Pro'), /was not found in one supported model-menu control/);
});

test('browser control code does not use generic transcript-editable selectors', async () => {
  const source = await readFile(new URL('../src/cdp.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /div\.ProseMirror\[contenteditable/);
  assert.doesNotMatch(source, /textarea\[placeholder\]/);
  assert.match(source, /document\.querySelector\('\#prompt-textarea'\)/);
  assert.match(source, /\[role="menu"\], \[role="listbox"\], \[role="dialog"\]/);
});

test('fresh provider conversations use an explicit CDP navigation instead of trusting json/new', async () => {
  const source = await readFile(new URL('../src/cdp.mjs', import.meta.url), 'utf8');
  assert.match(source, /client\.send\('Page\.navigate', \{ url: freshUrl \}\)/);
  assert.match(source, /Fresh ChatGPT navigation failed/);
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
