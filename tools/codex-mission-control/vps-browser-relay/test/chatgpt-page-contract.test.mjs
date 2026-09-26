import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import { readinessExpression } from '../src/automation-owned-browser.mjs';

// ChatGPT's September 2026 page: the composer is an unlabeled ProseMirror textbox inside
// form[data-chatgpt-composer]; #prompt-textarea and the send/stop test IDs no longer exist.
const FORM_TEXTBOX = 'form[data-chatgpt-composer] [contenteditable="true"][role="textbox"]';

function readiness(selectorsPresent, { pathname = '/', loginControl = false } = {}) {
  const context = vm.createContext({
    location: { href: `https://chatgpt.com${pathname}`, origin: 'https://chatgpt.com', pathname },
    document: {
      querySelector(selector) {
        if (selector.includes('/auth/login')) return loginControl ? {} : null;
        return selectorsPresent.includes(selector) ? {} : null;
      },
    },
  });
  return vm.runInContext(readinessExpression('https://chatgpt.com/'), context);
}

test('readiness recognizes the September 2026 composer textbox inside the composer form', () => {
  const state = readiness([FORM_TEXTBOX]);
  assert.equal(state.ready, true);
  assert.equal(state.composerFound, true);
  assert.equal(state.loginRequired, false);
});

test('readiness still recognizes the earlier composer selectors', () => {
  assert.equal(readiness(['#prompt-textarea']).ready, true);
  assert.equal(readiness(['[data-testid="prompt-textarea"]']).ready, true);
});

test('readiness fails closed without a composer, off the root, or behind a login control', () => {
  assert.equal(readiness([]).ready, false);
  assert.equal(readiness([FORM_TEXTBOX], { pathname: '/c/abc' }).ready, false);
  const login = readiness([FORM_TEXTBOX], { loginControl: true });
  assert.equal(login.ready, false);
  assert.equal(login.loginRequired, true);
});

test('every relay contenteditable selector is scoped to the ChatGPT composer form', async () => {
  for (const file of ['../src/cdp.mjs', '../src/automation-owned-browser.mjs']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    const occurrences = [...source.matchAll(/\[contenteditable="true"\]/g)];
    assert.ok(occurrences.length > 0, `${file} has no composer textbox selector`);
    for (const match of occurrences) {
      assert.equal(source.slice(match.index - 'form[data-chatgpt-composer] '.length, match.index), 'form[data-chatgpt-composer] ',
        `${file} uses an unscoped contenteditable selector`);
    }
  }
});

test('the relay page contract names the redesigned model, tools, send and stop controls', async () => {
  const source = await readFile(new URL('../src/cdp.mjs', import.meta.url), 'utf8');
  assert.match(source, /MODEL_CONTROL_SELECTOR_LIST = '[^']*form\[data-chatgpt-composer\] button\[data-codex-intelligence-trigger\]\[aria-haspopup="menu"\]'/);
  assert.match(source, /TOOLS_CONTROL_SELECTOR_LIST = '[^']*button\[aria-label="Add files and more"\]'/);
  assert.match(source, /STOP_CONTROL_SELECTOR_LIST = '[^']*form\[data-chatgpt-composer\] button\[aria-label="Stop"\]/);
  assert.match(source, /'form\[data-chatgpt-composer\] button\[aria-label="Send"\]'/);
  assert.equal(source.match(/const composer = \$\{COMPOSER_QUERY\};/g)?.length, 5);
  assert.equal(source.match(/querySelectorAll\('\$\{MODEL_CONTROL_SELECTOR_LIST\}'\)/g)?.length, 3);
  const stuck = await readFile(new URL('../src/stuck-recovery.mjs', import.meta.url), 'utf8');
  assert.equal(stuck.match(/form\[data-chatgpt-composer\] button\[aria-label="Stop"\]/g)?.length, 2);
  assert.match(stuck, /'form\[data-chatgpt-composer\] button\[aria-label="Send"\]'/);
});
