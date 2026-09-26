import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import { readinessExpression } from '../src/automation-owned-browser.mjs';
import { h, miniDocument } from './fixtures/mini-dom.mjs';

// ChatGPT's September 2026 page: the composer is an unlabeled ProseMirror textbox inside
// form[data-chatgpt-composer]; #prompt-textarea and the send/stop test IDs no longer exist.

function textbox(hidden = false) {
  return h('form', { 'data-chatgpt-composer': '' }, [
    h('div', { contenteditable: 'true', role: 'textbox', 'aria-label': 'Ask ChatGPT' }, [], { hidden }),
  ]);
}

function readiness(children, { pathname = '/' } = {}) {
  const globals = miniDocument(h('body', {}, children), { href: `https://chatgpt.com${pathname}` });
  return vm.runInContext(readinessExpression('https://chatgpt.com/'), vm.createContext(globals));
}

test('readiness recognizes the September 2026 composer textbox inside the composer form', () => {
  const state = readiness([textbox()]);
  assert.equal(state.ready, true);
  assert.equal(state.composerFound, true);
  assert.equal(state.loginRequired, false);
});

test('readiness still recognizes the earlier composer selectors', () => {
  assert.equal(readiness([h('div', { id: 'prompt-textarea', contenteditable: 'true' })]).ready, true);
  assert.equal(readiness([h('div', { 'data-testid': 'prompt-textarea' })]).ready, true);
});

test('readiness takes the visible composer and fails closed without one, off the root, or behind a login control', () => {
  assert.equal(readiness([h('div', { id: 'prompt-textarea' }, [], { hidden: true }), textbox()]).ready, true);
  assert.equal(readiness([textbox(true)]).ready, false);
  assert.equal(readiness([]).ready, false);
  assert.equal(readiness([textbox()], { pathname: '/c/abc' }).ready, false);
  const login = readiness([textbox(), h('a', { href: '/auth/login' })]);
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
  assert.match(source, /COMPOSER_QUERY = `\(\[\.\.\.document\.querySelectorAll\('\$\{COMPOSER_SELECTOR_LIST\}'\)\]\.find\(/);
  assert.equal(source.match(/querySelectorAll\('\$\{MODEL_CONTROL_SELECTOR_LIST\}'\)/g)?.length, 3);
  const stuck = await readFile(new URL('../src/stuck-recovery.mjs', import.meta.url), 'utf8');
  assert.equal(stuck.match(/form\[data-chatgpt-composer\] button\[aria-label="Stop"\]/g)?.length, 2);
  assert.match(stuck, /'form\[data-chatgpt-composer\] button\[aria-label="Send"\]'/);
});
