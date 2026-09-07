import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import { composerTextState, PREPARE_COMPOSER_FN, VERIFY_COMPOSER_FN } from '../src/cdp.mjs';

const text = (nodeValue) => ({ nodeType: 3, nodeValue });
const element = (tagName, childNodes = [], attributes = {}) => ({
  nodeType: 1, tagName, childNodes,
  getAttribute: (name) => attributes[name] ?? null,
  getAttributeNames: () => Object.keys(attributes),
  classList: { contains: (name) => (attributes.class ?? '').split(' ').includes(name) },
  getClientRects: () => attributes.hidden ? [] : [{}],
  focus() { this.focused = true; },
});
const paragraph = (...children) => element('P', children);
const br = (placeholder = false) => element('BR', [], placeholder ? { class: 'ProseMirror-trailingBreak' } : {});
const composer = (...children) => element('DIV', children, { contenteditable: 'true' });
const fromLines = (body) => composer(...body.split('\n').map((line) => paragraph(...(line ? [text(line)] : [br(true)]))));
const publicUrl = 'https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/53#issuecomment-5562255699';
const autolinkAttributes = { href: publicUrl, 'data-rich-text-autolink': '', 'data-rich-text-generated-autolink': '' };

function run(source, composers, expectedBody) {
  const context = vm.createContext({
    document: { querySelectorAll(selector) {
      assert.equal(selector, '#prompt-textarea, [data-testid="prompt-textarea"], textarea[aria-label="Chat with ChatGPT"]');
      return composers;
    } },
    getComputedStyle: () => ({ visibility: 'visible' }),
    expectedBody,
  });
  return JSON.parse(JSON.stringify(vm.runInContext(`(${source})(expectedBody)`, context)));
}

test('five composer paragraphs preserve a synthetic continuation and OWNER fixture in prepare and verify', () => {
  const syntheticOwner = 'SYNTHETIC OWNER FIXTURE '.padEnd(70, 'X');
  const lines = ['A'.repeat(4083), 'B'.repeat(26), syntheticOwner, 'C'.repeat(24), 'D'.repeat(1014)];
  const body = lines.join('\n');
  assert.deepEqual(lines.map((line) => line.length), [4083, 26, 70, 24, 1014]);
  assert.equal(body.length, 5221);
  const input = fromLines(body);
  Object.defineProperties(input, {
    textContent: { get() { throw new Error('textContent loses paragraph boundaries'); } },
    innerText: { get() { throw new Error('innerText adds layout paragraph boundaries'); } },
  });
  assert.deepEqual(run(PREPARE_COMPOSER_FN, [input], body), { ok: true, alreadyExact: true });
  assert.equal(input.focused, true);
  assert.deepEqual(run(VERIFY_COMPOSER_FN, [input], body), { exact: true, length: body.length });
  assert.equal(run(VERIFY_COMPOSER_FN, [input], lines.join('')).exact, false);
  assert.equal(run(VERIFY_COMPOSER_FN, [input], lines.join('\n\n')).exact, false);
});

test('textarea value and all whitespace are compared without trimming or normalization', () => {
  const body = '\n  Amber\t  \n\nIndigo\u00a0\n';
  const input = element('TEXTAREA');
  input.value = body;
  assert.deepEqual(run(PREPARE_COMPOSER_FN, [input], body), { ok: true, alreadyExact: true });
  assert.deepEqual(run(VERIFY_COMPOSER_FN, [input], body), { exact: true, length: body.length });
  assert.equal(run(PREPARE_COMPOSER_FN, [input], body.trim()).reason, 'COMPOSER_CONTAMINATED');
  assert.equal(run(VERIFY_COMPOSER_FN, [input], body.replace('\u00a0', ' ')).exact, false);
  assert.equal(composerTextState(fromLines(body), body).exact, true);
});

test('the editor-generated plaintext autolink preserves the observed 5221-character paragraph shape', () => {
  assert.equal(publicUrl.length, 98);
  const lines = ['A'.repeat(1601) + publicUrl + 'A'.repeat(2384), 'B'.repeat(26),
    'SYNTHETIC OWNER FIXTURE '.padEnd(70, 'X'), 'C'.repeat(24), 'D'.repeat(1014)];
  const input = fromLines(lines.join('\n'));
  input.childNodes[0] = paragraph(text('A'.repeat(1601)), element('A', [text(publicUrl)], autolinkAttributes), text('A'.repeat(2384)));
  assert.deepEqual(lines.map((line) => line.length), [4083, 26, 70, 24, 1014]);
  const body = lines.join('\n');
  assert.equal(body.length, 5221);
  assert.deepEqual(run(PREPARE_COMPOSER_FN, [input], body), { ok: true, alreadyExact: true });
  assert.deepEqual(run(VERIFY_COMPOSER_FN, [input], body), { exact: true, length: 5221 });
});

test('transformed, decorated, or non-generated links fail closed', () => {
  const missingMarker = { ...autolinkAttributes };
  delete missingMarker['data-rich-text-generated-autolink'];
  for (const link of [
    element('A', [text(publicUrl)], { ...autolinkAttributes, href: publicUrl + '/other' }),
    element('A', [text('different label')], autolinkAttributes),
    element('A', [text(publicUrl)], { ...autolinkAttributes, class: 'decorated' }),
    element('A', [text(publicUrl)], { ...autolinkAttributes, onclick: 'alert(1)' }),
    element('A', [text(publicUrl)], { ...autolinkAttributes, 'data-rich-text-autolink': 'true' }),
    element('A', [text(publicUrl)], missingMarker),
    element('A', [element('SPAN', [text(publicUrl)])], autolinkAttributes),
    element('A', [text(publicUrl.slice(0, 10)), text(publicUrl.slice(10))], autolinkAttributes),
  ]) {
    const input = composer(paragraph(link));
    assert.equal(run(PREPARE_COMPOSER_FN, [input], publicUrl).reason, 'COMPOSER_MARKUP_UNSUPPORTED');
    assert.deepEqual(run(VERIFY_COMPOSER_FN, [input], publicUrl),
      { exact: false, length: null, reason: 'COMPOSER_MARKUP_UNSUPPORTED' });
    assert.equal(input.focused, undefined);
  }
});

test('empty paragraphs, internal BR, and explicit trailing placeholders preserve LF count', () => {
  for (const input of [composer(), composer(paragraph()), composer(paragraph(br())), composer(paragraph(br(true)))]) {
    assert.deepEqual(run(PREPARE_COMPOSER_FN, [input], 'next'), { ok: true, alreadyExact: false });
    assert.equal(composerTextState(input, '').exact, true);
  }
  for (const [input, body] of [
    [composer(paragraph(text('Amber'), br(), text('Indigo'))), 'Amber\nIndigo'],
    [composer(paragraph(text('Amber'), br(), br(true))), 'Amber\n'],
    [composer(paragraph(br()), paragraph(text('Amber')), paragraph(br(true))), '\nAmber\n'],
    [composer(text('Amber'), br(), text('Indigo')), 'Amber\nIndigo'],
    [composer(paragraph(text('Amber'), br(true))), 'Amber'],
  ]) {
    assert.equal(composerTextState(input, body).exact, true);
    assert.deepEqual(run(VERIFY_COMPOSER_FN, [input], body), { exact: true, length: body.length });
  }
});

test('contaminated whitespace fails before focus and never returns input text', () => {
  for (const actual of [' ', '\n', 'Amber ', ' Amber', 'Amber\n\nIndigo']) {
    const input = fromLines(actual);
    const result = run(PREPARE_COMPOSER_FN, [input], 'Amber\nIndigo');
    assert.deepEqual(result, { ok: false, reason: 'COMPOSER_CONTAMINATED', length: actual.length });
    assert.equal(input.focused, undefined);
    assert.deepEqual(Object.keys(result).sort(), ['length', 'ok', 'reason']);
  }
});

test('unsupported or ambiguous composer markup fails closed', () => {
  for (const input of [
    composer(paragraph(text('Amber')), text('Indigo')),
    composer(element('DIV', [text('Amber')])),
    composer(paragraph(element('SPAN', [text('Amber')]))),
    composer(paragraph(element('IMG'))),
    composer(paragraph({ nodeType: 8, nodeValue: 'comment' })),
    composer(paragraph(text('Amber'), br())),
    composer(paragraph(br(true), text('Amber'))),
    element('DIV', [text('Amber')], { contenteditable: 'false' }),
  ]) {
    assert.deepEqual(run(PREPARE_COMPOSER_FN, [input], 'Amber'),
      { ok: false, reason: 'COMPOSER_MARKUP_UNSUPPORTED', length: null });
    assert.deepEqual(run(VERIFY_COMPOSER_FN, [input], 'Amber'),
      { exact: false, reason: 'COMPOSER_MARKUP_UNSUPPORTED', length: null });
    assert.equal(input.focused, undefined);
  }
});

test('only one visible identified input composer can satisfy either check', () => {
  const first = fromLines('Amber'), second = fromLines('Amber');
  const hidden = element('DIV', [], { hidden: true, contenteditable: 'true' });
  for (const source of [PREPARE_COMPOSER_FN, VERIFY_COMPOSER_FN]) {
    assert.equal(run(source, [], 'Amber').reason, 'COMPOSER_NOT_FOUND');
    assert.equal(run(source, [hidden], 'Amber').reason, 'COMPOSER_NOT_VISIBLE');
    assert.equal(run(source, [first, second], 'Amber').reason, 'COMPOSER_AMBIGUOUS');
  }
  assert.equal(first.focused, undefined);
  assert.equal(second.focused, undefined);
  assert.deepEqual(run(PREPARE_COMPOSER_FN, [hidden, first], 'Amber'), { ok: true, alreadyExact: true });
});
