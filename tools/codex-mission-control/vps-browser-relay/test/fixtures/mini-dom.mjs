// A small DOM for running the relay's in-page functions against recorded ChatGPT page structures.
// It supports the selector forms those functions use: tag, #id, .class, [attr], [attr="v"], [attr^="v"],
// [attr*="v"], compound selectors, descendant combinators and comma lists. It is not a browser.
import vm from 'node:vm';

function parseCompound(text) {
  const parts = { tag: null, id: null, classes: [], attrs: [] };
  const re = /^([a-zA-Z][a-zA-Z0-9-]*|\*)|#([A-Za-z0-9_-]+)|\.([A-Za-z0-9_-]+)|\[([a-zA-Z0-9_:-]+)(?:(\^=|\*=|=)"([^"]*)")?\]/g;
  let consumed = 0;
  for (const match of text.matchAll(re)) {
    if (match.index !== consumed) throw new Error(`mini-dom cannot parse selector part ${JSON.stringify(text)}`);
    consumed += match[0].length;
    if (match[1]) parts.tag = match[1] === '*' ? null : match[1].toUpperCase();
    else if (match[2]) parts.id = match[2];
    else if (match[3]) parts.classes.push(match[3]);
    else parts.attrs.push({ name: match[4], op: match[5] ?? null, value: match[6] ?? null });
  }
  if (consumed !== text.length) throw new Error(`mini-dom cannot parse selector part ${JSON.stringify(text)}`);
  return parts;
}

// Splits on a separator only outside [...] and quoted attribute values.
function splitTopLevel(text, isSeparator) {
  const parts = []; let current = ''; let depth = 0; let quote = null;
  for (const character of text) {
    if (quote) { if (character === quote) quote = null; current += character; continue; }
    if (character === '"' || character === "'") { quote = character; current += character; continue; }
    if (character === '[') depth += 1;
    if (character === ']') depth -= 1;
    if (depth === 0 && isSeparator(character)) { if (current.trim()) parts.push(current.trim()); current = ''; continue; }
    current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function compile(selector) {
  return splitTopLevel(selector, (character) => character === ',')
    .map((single) => splitTopLevel(single, (character) => /\s/.test(character)).map(parseCompound));
}

function matchesCompound(element, parts) {
  if (parts.tag && element.tagName !== parts.tag) return false;
  if (parts.id && element.getAttribute('id') !== parts.id) return false;
  for (const name of parts.classes) if (!element.classList.contains(name)) return false;
  for (const attr of parts.attrs) {
    const value = element.getAttribute(attr.name);
    if (value === null) return false;
    if (attr.op === '=' && value !== attr.value) return false;
    if (attr.op === '^=' && !value.startsWith(attr.value)) return false;
    if (attr.op === '*=' && !value.includes(attr.value)) return false;
  }
  return true;
}

function matchesChain(element, chain) {
  if (!matchesCompound(element, chain[chain.length - 1])) return false;
  let index = chain.length - 2;
  for (let ancestor = element.parentElement; index >= 0 && ancestor; ancestor = ancestor.parentElement) {
    if (matchesCompound(ancestor, chain[index])) index -= 1;
  }
  return index < 0;
}

export class MiniElement {
  constructor(tagName, attributes = {}, children = [], { text = '', rect = null, hidden = false } = {}) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this._attributes = new Map(Object.entries(attributes).map(([name, value]) => [name, String(value)]));
    this.children = [];
    this.parentElement = null;
    this._text = text;
    this._rect = rect ?? { x: 10, y: 10, width: 40, height: 20 };
    this._hidden = hidden;
    this.clicks = 0;
    for (const child of children) this.append(child);
  }

  append(child) { child.parentElement = this; this.children.push(child); return child; }
  get childNodes() { return this.children; }
  get id() { return this.getAttribute('id') ?? ''; }
  get attributes() { return [...this._attributes].map(([name, value]) => ({ name, value })); }
  get className() { return this.getAttribute('class') ?? ''; }
  get classList() { return { contains: (name) => (this.getAttribute('class') ?? '').split(/\s+/).includes(name) }; }
  getAttribute(name) { return this._attributes.has(name) ? this._attributes.get(name) : null; }
  hasAttribute(name) { return this._attributes.has(name); }
  getAttributeNames() { return [...this._attributes.keys()]; }
  setAttribute(name, value) { this._attributes.set(name, String(value)); }
  get innerText() { return this._hidden ? '' : [this._text, ...this.children.map((child) => child.innerText)].filter(Boolean).join('\n'); }
  get textContent() { return [this._text, ...this.children.map((child) => child.textContent)].filter(Boolean).join(''); }
  getClientRects() { return this.isHidden() ? [] : [this._rect]; }
  getBoundingClientRect() { return this.isHidden() ? { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0 } : { ...this._rect, top: this._rect.y, left: this._rect.x, bottom: this._rect.y + this._rect.height, right: this._rect.x + this._rect.width }; }
  isHidden() { for (let node = this; node; node = node.parentElement) if (node._hidden) return true; return false; }
  *descendants() { for (const child of this.children) { yield child; yield* child.descendants(); } }
  matches(selector) { return compile(selector).some((chain) => matchesChain(this, chain)); }
  querySelectorAll(selector) { const chains = compile(selector); return [...this.descendants()].filter((element) => chains.some((chain) => matchesChain(element, chain))); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  contains(other) { for (let node = other; node; node = node.parentElement) if (node === this) return true; return false; }
  focus() { this.ownerDocument.activeElement = this; }
  click() { this.clicks += 1; }
}

export const h = (tag, attributes = {}, children = [], options = {}) => new MiniElement(tag, attributes, children, options);

export function miniDocument(body, { href = 'https://chatgpt.com/' } = {}) {
  const url = new URL(href);
  const document = {
    body,
    documentElement: body,
    activeElement: null,
    querySelectorAll: (selector) => [body, ...body.descendants()].filter((element) => element.matches(selector)),
    querySelector: (selector) => document.querySelectorAll(selector)[0] ?? null,
    getElementById: (id) => [body, ...body.descendants()].find((element) => element.getAttribute('id') === id) ?? null,
  };
  for (const element of [body, ...body.descendants()]) element.ownerDocument = document;
  return {
    document,
    location: { href: url.href, origin: url.origin, pathname: url.pathname },
    getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
    innerHeight: 1000,
    innerWidth: 1600,
    URL,
  };
}

export function runInPage(source, globals, args = []) {
  const context = vm.createContext({ ...globals, __args: args });
  return JSON.parse(JSON.stringify(vm.runInContext(`(${source})(...__args)`, context)));
}
