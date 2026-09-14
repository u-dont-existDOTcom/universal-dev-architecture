import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { APP_SELECTION_OBSERVATION_FN, matchAppSelectionRow } from '../src/app-selection-dom.mjs';

const known = ['Mission Control', 'GitHub'];

// Minimal public DOM fixture. No browser, network, provider, or runtime files.
class Element {
  constructor(tag, attrs = {}, text = '', layout = {}) {
    this.nodeType = 1; this.tagName = tag.toUpperCase(); this.attrs = attrs; this.ownText = text;
    this.children = []; this.parentElement = null;
    this.bounds = { x: 20, y: 20, width: 400, height: 200, ...layout };
    this.style = { display: 'block', visibility: 'visible', opacity: '1', overflow: 'visible' };
    this.clientHeight = this.bounds.height; this.scrollHeight = this.clientHeight;
    this.hidden = false; this.disabled = false; this.rects = true;
  }
  get id() { return this.attrs.id || ''; }
  get classList() { return { contains: (name) => (this.attrs.class || '').split(/\s+/).includes(name) }; }
  get textContent() { return this.ownText + this.children.map((child) => child.textContent).join(''); }
  get innerText() { return this.textContent; }
  getAttribute(key) { return Object.hasOwn(this.attrs, key) ? this.attrs[key] : null; }
  hasAttribute(key) { return Object.hasOwn(this.attrs, key); }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } return this; }
  contains(node) { return !!node && (node === this || this.children.some((child) => child.contains(node))); }
  matches(selector) { return selector.split(',').some((part) => matchesSelector(this, part.trim())); }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  querySelectorAll(selector) {
    const result = [];
    const walk = (node) => { for (const child of node.children) { if (child.matches(selector)) result.push(child); walk(child); } };
    walk(this); return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  cloneNode(deep = false) {
    const clone = new Element(this.tagName, { ...this.attrs }, this.ownText, { ...this.bounds });
    clone.style = { ...this.style }; clone.clientHeight = this.clientHeight; clone.scrollHeight = this.scrollHeight;
    clone.hidden = this.hidden; clone.disabled = this.disabled; clone.rects = this.rects;
    if (deep) clone.append(...this.children.map((child) => child.cloneNode(true)));
    return clone;
  }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  getClientRects() { return this.rects ? [this.getBoundingClientRect()] : []; }
  getBoundingClientRect() { const { x, y, width, height } = this.bounds; return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height }; }
  focus() { throw new Error('DOM_MUTATION_FORBIDDEN'); }
  click() { throw new Error('DOM_MUTATION_FORBIDDEN'); }
  scrollIntoView() { throw new Error('DOM_MUTATION_FORBIDDEN'); }
}
function matchesSelector(node, selector) {
  const parts = selector.match(/(?:\[[^\]]*\]|[^\s])+/g) || [];
  const simple = (element, part) => {
    const tag = part.match(/^[a-z]+/i)?.[0];
    if (tag && element.tagName !== tag.toUpperCase()) return false;
    const className = part.match(/\.([\w-]+)/)?.[1];
    if (className && !element.classList.contains(className)) return false;
    const id = part.match(/#([\w-]+)/)?.[1];
    if (id && element.id !== id) return false;
    for (const [, attr, operator, value] of part.matchAll(/\[([\w-]+)(?:(\^=|\*=|=)"([^"]*)")?\]/g)) {
      const actual = element.getAttribute(attr);
      if (actual === null || (operator === '=' && actual !== value) || (operator === '^=' && !actual.startsWith(value)) || (operator === '*=' && !actual.includes(value))) return false;
    }
    return true;
  };
  if (!parts.length || !simple(node, parts.at(-1))) return false;
  let parent = node.parentElement;
  for (let index = parts.length - 2; index >= 0; index--) {
    while (parent && !simple(parent, parts[index])) parent = parent.parentElement;
    if (!parent) return false;
    parent = parent.parentElement;
  }
  return true;
}
const el = (...args) => new Element(...args);
function fixture() {
  const document = el('body', {}, '', { x: 0, y: 0, width: 1000, height: 1000 });
  const form = el('form'), composer = el('div', { id: 'prompt-textarea' });
  const tools = el('button', { 'data-testid': 'composer-plus-btn', id: 'tools', 'aria-expanded': 'true' }, 'Tools');
  document.append(form.append(composer, tools)); document.activeElement = composer;
  return { document, form, composer, tools };
}
function plugin(title, description = '', attrs = {}, layout = {}) {
  const wrapper = el('div', { 'data-composer-plugin-impression-id': 'public-synthetic' });
  const group = el('div', { role: 'group' });
  const row = el('div', { 'data-fill': '', tabindex: '0', ...attrs }, '', layout);
  row.append(el('span', {}, title), el('span', {}, description)); wrapper.append(group.append(row));
  return { wrapper, group, row };
}
function popup(f, rows, attrs = { 'aria-busy': 'false' }, parent = f.form) {
  const root = el('div', attrs); root.append(...rows.map((row) => row.wrapper ?? row)); parent.append(root); return root;
}
function observe(f, label = 'Mission Control', scratch, labels = known) {
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(${APP_SELECTION_OBSERVATION_FN})(labels, label, scratch)`, {
    document: f.document, getComputedStyle: (node) => node.style, innerHeight: 1000, innerWidth: 1000, labels, label, scratch,
  })));
}
function assertBlocked(value, reason) {
  assert.equal(value.blocked, true); assert.equal(value.blockReason, reason);
  for (const key of ['appRect', 'chipRect', 'toolsRect', 'moreRect', 'scrollCandidate']) assert.equal(value[key], null);
}

test('pure row matcher accepts only an exact first title SPAN inside a plugin/group row', () => {
  assert.equal(matchAppSelectionRow(plugin('GitHub', 'Find Mission Control files').row, known), 'GitHub');
  assert.equal(matchAppSelectionRow(plugin('Mission Control Plus', 'Mission Control').row, known), null);
  assert.equal(matchAppSelectionRow(plugin('Unknown', 'GitHub').row, known), null);
  assert.equal(matchAppSelectionRow(plugin('Mission Control').row, ['Mission Control', 'Mission Control']), null);
});

test('files/folders without a plugin wrapper and rows without a group are not apps', () => {
  const row = el('div', { 'data-fill': '', tabindex: '0' }).append(el('span', {}, 'Mission Control'));
  el('div', { role: 'group' }).append(row);
  assert.equal(matchAppSelectionRow(row, known), null);
  const noGroup = el('div', { 'data-composer-plugin-impression-id': 'test' }).append(el('div', { 'data-fill': '', tabindex: '0' }).append(el('span', {}, 'GitHub')));
  assert.equal(matchAppSelectionRow(noGroup.children[0], known), null);
});

test('serialized generic observation is self-contained, exact-title-only, and returns visible geometry', () => {
  const f = fixture(); popup(f, [plugin('Mission Control', 'Description'), plugin('GitHub', 'Mission Control')]);
  const result = observe(f);
  assert.equal(result.blocked, false); assert.equal(result.visibleMenuCount, 1);
  assert.equal(result.appMatchCount, 1); assert.equal(result.renderedAppMatchCount, 1);
  assert.deepEqual(result.availableAppLabels, known); assert.ok(result.appRect);
  assert.equal(result.composerEmpty, true); assert.equal(result.scrollCandidate, null);
});

test('description substrings and generic files rows never satisfy the requested app', () => {
  const f = fixture();
  const file = el('div', { role: 'group' }).append(el('div', { 'data-fill': '', tabindex: '0' }).append(el('span', {}, 'Mission Control')));
  popup(f, [plugin('GitHub', 'Mission Control'), file, el('div', { role: 'option', 'aria-label': 'Mission Control' })]);
  assert.equal(observe(f).appMatchCount, 0); assert.deepEqual(observe(f).availableAppLabels, ['GitHub']);
});

for (const role of ['menu', 'listbox']) test(`legacy ${role} is scoped to composer-linked root; global options are ignored`, () => {
  const f = fixture(); f.tools.attrs['aria-controls'] = 'owned-popup';
  popup(f, [el('div', { role: role === 'menu' ? 'menuitemradio' : 'option', 'aria-label': 'Mission Control' })], { role, id: 'owned-popup' }, f.document);
  popup(f, [el('div', { role: 'option', 'aria-label': 'Mission Control' })], { role: 'listbox', id: 'unrelated-popup' }, f.document);
  const result = observe(f); assert.equal(result.visibleMenuCount, 1); assert.equal(result.appMatchCount, 1);
});

test('legacy More remains exact and scoped, not a global button', () => {
  const f = fixture(); popup(f, [el('div', { role: 'menuitem' }, 'More')], { role: 'menu' });
  f.document.append(el('button', {}, 'More'));
  assert.equal(observe(f).moreMatchCount, 1); assert.ok(observe(f).moreRect);
});

test('unbound portal is not a current popup, even if it contains a known app', () => {
  const f = fixture(); popup(f, [plugin('Mission Control')], { 'aria-busy': 'false' }, f.document);
  assert.equal(observe(f).visibleMenuCount, 0); assert.equal(observe(f).appMatchCount, 0);
});

test('duplicate controlled popup IDs explicitly fail closed', () => {
  const f = fixture(); f.tools.attrs['aria-controls'] = 'duplicated-id';
  popup(f, [plugin('Mission Control')], { role: 'listbox', id: 'duplicated-id' }, f.document);
  f.document.append(el('div', { id: 'duplicated-id' }));
  assertBlocked(observe(f), 'APP_POPUP_ID_AMBIGUOUS');
});

test('active scratch query does not bind an unrelated legacy file/listbox portal', () => {
  const f = fixture(); f.composer.ownText = 'Mission Control';
  popup(f, [el('div', { role: 'option', 'aria-label': 'Mission Control' })], { role: 'listbox' }, f.document);
  assert.equal(observe(f, 'Mission Control', 'Mission Control').appMatchCount, 0);
});

test('owned exact active scratch query may bind a unique portal while Tools is collapsed', () => {
  const f = fixture(); f.tools.attrs['aria-expanded'] = 'false'; f.composer.ownText = 'Mission Control';
  popup(f, [plugin('Mission Control')], { 'aria-busy': 'false' }, f.document);
  assertBlocked(observe(f), 'COMPOSER_NOT_EMPTY_OR_OWNED_SCRATCH');
  const result = observe(f, 'Mission Control', 'Mission Control');
  assert.equal(result.scratchQueryOwned, true); assert.equal(result.appMatchCount, 1);
  f.document.activeElement = f.tools;
  assert.equal(observe(f, 'Mission Control', 'Mission Control').visibleMenuCount, 0);
});

test('scratch ownership is exact: no arbitrary drafts, extra whitespace, wrong label or missing query', () => {
  const f = fixture(); popup(f, [plugin('Mission Control')]);
  for (const text of ['Draft', 'Mission Control ', 'Mission Control\n', 'GitHub']) {
    f.composer.ownText = text; assertBlocked(observe(f, 'Mission Control', 'Mission Control'), 'COMPOSER_NOT_EMPTY_OR_OWNED_SCRATCH');
  }
  assertBlocked(observe(f, 'Mission Control', 'GitHub'), 'SCRATCH_QUERY_INVALID');
});

test('current protected inline app pill counts as the exact selected app while prompt text stays empty', () => {
  const f = fixture();
  const cursor = el('span', { 'data-inline-selection-pill-cursor-target': '', contenteditable: 'false' }, ' ');
  const pill = el('span', {
    'data-inline-selection-pill': '', contenteditable: 'false', 'data-keyword': 'Mission Control',
    'data-system-hint-type': 'plugin:synthetic',
  }).append(el('a', {}, 'Mission Control'));
  f.composer.append(cursor, pill, el('span', {}, ' '));
  const result = observe(f);
  assert.equal(result.composerEmpty, true);
  assert.equal(result.chipMatchCount, 1);
  assert.equal(result.inlineChipMatchCount, 1);
  assert.equal(result.inlineChipCounts['Mission Control'], 1);
});

test('one structural separator after an inline app pill preserves exact scratch-query ownership', () => {
  const f = fixture();
  const cursor = el('span', { 'data-inline-selection-pill-cursor-target': '', contenteditable: 'false' }, ' ');
  const pill = el('span', {
    'data-inline-selection-pill': '', contenteditable: 'false', 'data-keyword': 'Mission Control',
    'data-system-hint-type': 'plugin:synthetic',
  }).append(el('a', {}, 'Mission Control'));
  f.composer.append(cursor, pill, el('span', {}, ' GitHub'));
  assert.equal(observe(f, 'GitHub', 'GitHub').scratchQueryOwned, true);
  f.composer.children.at(-1).ownText = '  GitHub';
  assertBlocked(observe(f, 'GitHub', 'GitHub'), 'COMPOSER_NOT_EMPTY_OR_OWNED_SCRATCH');
});

test('unknown or malformed inline app pills fail closed', () => {
  const f = fixture();
  f.composer.append(el('span', {
    'data-inline-selection-pill': '', contenteditable: 'false', 'data-keyword': 'Other',
    'data-system-hint-type': 'plugin:synthetic',
  }).append(el('a', {}, 'Other')));
  assertBlocked(observe(f), 'APP_INLINE_PILL_INVALID_OR_UNKNOWN');
});

test('current class-based plugin row is accepted without legacy ARIA option roles', () => {
  const f = fixture();
  const current = plugin('Mission Control');
  delete current.row.attrs['data-fill']; current.row.attrs.class = '__menu-item';
  popup(f, [current]);
  const result = observe(f);
  assert.equal(result.appMatchCount, 1);
  assert.ok(result.appRect);
});

test('duplicate composer or missing form fails closed', () => {
  const f = fixture(); f.form.append(el('div', { 'data-testid': 'prompt-textarea' }));
  assertBlocked(observe(f), 'COMPOSER_AMBIGUOUS');
  const other = fixture(); other.composer.parentElement = null;
  assertBlocked(observe(other), 'COMPOSER_FORM_MISSING');
});

test('Tools must be unique and enabled', () => {
  const f = fixture(); f.form.append(el('button', { 'aria-label': 'Tools' }));
  assertBlocked(observe(f), 'TOOLS_CONTROL_AMBIGUOUS_OR_UNAVAILABLE');
  const other = fixture(); other.tools.disabled = true;
  assertBlocked(observe(other), 'TOOLS_CONTROL_AMBIGUOUS_OR_UNAVAILABLE');
});

test('duplicate bound roots fail closed even if only one contains the wanted app', () => {
  const f = fixture(); popup(f, [plugin('Mission Control')]); popup(f, [plugin('GitHub')]);
  assertBlocked(observe(f), 'APP_POPUP_AMBIGUOUS');
});

test('duplicate known labels fail closed, including an off-screen duplicate or a different wanted label', () => {
  const f = fixture(); popup(f, [plugin('GitHub'), plugin('GitHub', '', {}, { y: 1500 }), plugin('Mission Control')]);
  assertBlocked(observe(f), 'APP_LABEL_AMBIGUOUS');
});

for (const attrs of [{ role: 'navigation' }, { 'data-message-author-role': 'assistant' }, { 'data-testid': 'sidebar' }]) {
  test(`excludes app-shaped transcript/sidebar/navigation content ${JSON.stringify(attrs)}`, () => {
    const f = fixture(), region = el('div', attrs); f.document.append(region);
    popup(f, [plugin('Mission Control')], { role: 'listbox', 'aria-labelledby': 'tools' }, region);
    popup(f, [plugin('GitHub')]);
    assert.equal(observe(f).appMatchCount, 0); assert.deepEqual(observe(f).availableAppLabels, ['GitHub']);
  });
}

test('exact legacy chip labels remain composer-scoped; duplicate chips fail closed', () => {
  const f = fixture(); f.form.append(el('button', { 'aria-label': 'Mission Control, click to remove' }));
  f.document.append(el('button', { 'aria-label': 'Mission Control, click to remove' }));
  assert.equal(observe(f).chipMatchCount, 1); assert.ok(observe(f).chipRect);
  f.form.append(el('button', { 'aria-label': 'Mission Control, click to remove' }));
  assertBlocked(observe(f), 'APP_CHIP_AMBIGUOUS');
});

test('off-screen unique row returns a bounded scroll candidate, not a click or focus action', () => {
  const f = fixture(); const root = popup(f, [plugin('Mission Control', '', {}, { y: 500 })]);
  root.style.overflowY = 'auto'; root.scrollHeight = 800;
  const result = observe(f);
  assert.equal(result.renderedAppMatchCount, 1); assert.equal(result.appMatchCount, 0); assert.equal(result.appRect, null);
  assert.deepEqual(result.scrollCandidate, { label: 'Mission Control', direction: 'down', containerRect: { x: 20, y: 20, width: 400, height: 200 } });
});

test('hidden and disabled rows never produce click/scroll actions; busy popup fails closed', () => {
  const f = fixture(), hidden = plugin('Mission Control'); hidden.row.attrs['aria-hidden'] = 'true'; popup(f, [hidden]);
  assert.equal(observe(f).renderedAppMatchCount, 0); assert.equal(observe(f).scrollCandidate, null);
  hidden.row.attrs['aria-hidden'] = 'false'; hidden.row.disabled = true;
  assert.equal(observe(f).appRect, null); assert.equal(observe(f).scrollCandidate, null);
  hidden.wrapper.parentElement.attrs['aria-busy'] = 'true';
  assertBlocked(observe(f), 'APP_POPUP_BUSY');
});

test('unknown or duplicated input labels fail closed', () => {
  const f = fixture(); assertBlocked(observe(f, 'Not Allowed'), 'APP_LABELS_INVALID');
  assertBlocked(observe(f, 'GitHub', undefined, ['GitHub', 'GitHub']), 'APP_LABELS_INVALID');
});
