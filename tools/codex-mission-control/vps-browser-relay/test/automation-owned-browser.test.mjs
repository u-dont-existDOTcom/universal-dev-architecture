import assert from 'node:assert/strict';
import test from 'node:test';
import { AutomationOwnedBrowser } from '../src/automation-owned-browser.mjs';
import { CHATGPT_RATE_LIMIT_RETRY } from '../src/submission-pacing.mjs';

const rootUrl = 'https://chatgpt.com/';
const chatA = 'https://chatgpt.com/c/chat-a';
const chatB = 'https://chatgpt.com/c/chat-b';

test('only explicitly owned targets in the dedicated window are visible to relay selection', async () => {
  const raw = new FakeRawBrowser([
    page('user-other-window', chatA, 1),
    page('user-same-window', chatB, 7),
    page('owned', rootUrl, 7),
  ]);
  const store = new MemoryOwnershipStore(ownership(7, { owned: record('owned', 'scratch', rootUrl) }));
  const protocol = new FakeProtocol(raw);
  const browser = new AutomationOwnedBrowser(raw, { ownershipStore: store, protocol });

  const targets = await browser.listTargets();
  assert.deepEqual(targets.map((target) => target.id), ['owned']);
  const doctor = await browser.doctor();
  assert.equal(doctor.automationWindowId, 7);
  assert.equal(doctor.automationOwnedTabCount, 1);
  assert.equal(doctor.foreignChatGptTabCount, 2);
  assert.equal(doctor.recencyBasedTargetSelectionAllowed, false);
});

test('same conversation open in a user tab is ignored and the owned scratch tab is navigated instead', async () => {
  const raw = new FakeRawBrowser([
    page('user-latest', chatA, 1),
    page('owned-scratch', rootUrl, 7),
  ]);
  const store = new MemoryOwnershipStore(ownership(7, { 'owned-scratch': record('owned-scratch', 'scratch', rootUrl) }));
  const protocol = new FakeProtocol(raw);
  const browser = new AutomationOwnedBrowser(raw, { ownershipStore: store, protocol });

  const target = await browser.findOrCreateChatTarget(chatA, { reusableTargetId: 'user-latest' });
  assert.equal(target.id, 'owned-scratch');
  assert.equal(raw.byId('user-latest').url, chatA);
  assert.equal(raw.byId('owned-scratch').url, chatA);
  assert.equal(raw.activations.includes('user-latest'), false);
});

test('an owned bootstrap tab is not repurposed for a different registered chat', async () => {
  const raw = new FakeRawBrowser([page('bootstrap-a', chatA, 7)]);
  const store = new MemoryOwnershipStore(ownership(7, { 'bootstrap-a': record('bootstrap-a', 'bootstrap', chatA) }));
  const protocol = new FakeProtocol(raw, { defaultWindowId: 7 });
  const browser = new AutomationOwnedBrowser(raw, { ownershipStore: store, protocol });

  const target = await browser.findOrCreateChatTarget(chatB, { hardCeiling: 3 });
  assert.notEqual(target.id, 'bootstrap-a');
  assert.equal(raw.byId('bootstrap-a').url, chatA);
  assert.equal(raw.byId(target.id).url, chatB);
  assert.equal((await store.read()).targets[target.id].purpose, 'bootstrap');
});

test('missing ownership state creates a dedicated window instead of adopting an existing user tab', async () => {
  const raw = new FakeRawBrowser([page('user-only', chatA, 1)]);
  const store = new MemoryOwnershipStore(null);
  const protocol = new FakeProtocol(raw, { dedicatedWindowId: 11 });
  const browser = new AutomationOwnedBrowser(raw, { ownershipStore: store, protocol });

  const targets = await browser.listTargets();
  assert.equal(protocol.dedicatedWindowCreates, 1);
  assert.equal(targets.length, 1);
  assert.notEqual(targets[0].id, 'user-only');
  assert.equal(targets[0].automationWindowId, 11);
  assert.equal(raw.byId('user-only').url, chatA);
});

test('unowned targets cannot be activated or closed through the automation browser', async () => {
  const raw = new FakeRawBrowser([page('user', chatA, 1), page('owned', rootUrl, 7)]);
  const store = new MemoryOwnershipStore(ownership(7, { owned: record('owned', 'scratch', rootUrl) }));
  const browser = new AutomationOwnedBrowser(raw, { ownershipStore: store, protocol: new FakeProtocol(raw) });

  await assert.rejects(browser.activateTarget('user'), /UNOWNED_BROWSER_TARGET/);
  await assert.rejects(browser.closeTarget('user'), /UNOWNED_BROWSER_TARGET/);
  assert.ok(raw.byId('user'));
});

test('exact provider rate-limit dialog is dismissed and converted to one bounded retry signal', async () => {
  const raw = new FakeRawBrowser([page('owned', chatA, 7)]);
  raw.submitError = Object.assign(new Error('generation did not start'), {
    relayStage: 'CLICKED',
    clickedAtObserved: '2026-09-08T12:00:00.000Z',
  });
  const store = new MemoryOwnershipStore(ownership(7, { owned: record('owned', 'bootstrap', chatA) }));
  const protocol = new FakeProtocol(raw);
  protocol.rateLimitResult = { present: true, dismissed: true };
  const browser = new AutomationOwnedBrowser(raw, { ownershipStore: store, protocol });

  await assert.rejects(
    browser.submitExactMessage(raw.byId('owned'), { expectedUrl: chatA, body: 'x', bodySha256: 'x' }),
    (error) => error.code === CHATGPT_RATE_LIMIT_RETRY && error.retryAfterMs === 30_000 && error.relayStage === 'CLICKED',
  );
  assert.equal(protocol.rateLimitDismissals, 1);
});

class MemoryOwnershipStore {
  constructor(value) { this.value = value ? structuredClone(value) : null; }
  async read() { return this.value ? structuredClone(this.value) : null; }
  async write(value) { this.value = structuredClone(value); return structuredClone(value); }
}

class FakeRawBrowser {
  constructor(targets) {
    this.targets = targets.map((target) => ({ ...target }));
    this.activations = [];
    this.submitError = null;
  }
  async listTargets() { return this.targets.map((target) => ({ ...target })); }
  async doctor() { return { browser: 'Fake', protocolVersion: '1', targetCount: this.targets.length, managedChatGptTabCount: this.targets.length }; }
  async activateTarget(id) { this.activations.push(id); return {}; }
  async closeTarget(id) { this.targets = this.targets.filter((target) => target.id !== id); return true; }
  async submitExactMessage() { if (this.submitError) throw this.submitError; return { generationStarted: true }; }
  byId(id) { return this.targets.find((target) => target.id === id); }
}

class FakeProtocol {
  constructor(raw, { defaultWindowId = 7, dedicatedWindowId = 9 } = {}) {
    this.raw = raw;
    this.defaultWindowId = defaultWindowId;
    this.dedicatedWindowId = dedicatedWindowId;
    this.windows = new Map(raw.targets.map((target) => [target.id, target.windowId]));
    this.nextId = 1;
    this.dedicatedWindowCreates = 0;
    this.rateLimitDismissals = 0;
    this.rateLimitResult = { present: false, dismissed: false };
  }
  async getWindowId(targetId) {
    const value = this.windows.get(targetId);
    if (!Number.isInteger(value)) throw new Error('missing target window');
    return value;
  }
  async createDedicatedWindow(url) {
    this.dedicatedWindowCreates += 1;
    const targetId = `dedicated-${this.nextId++}`;
    this.raw.targets.push(page(targetId, url, this.dedicatedWindowId));
    this.windows.set(targetId, this.dedicatedWindowId);
    return { targetId, windowId: this.dedicatedWindowId };
  }
  async createTarget(url) {
    const targetId = `created-${this.nextId++}`;
    this.raw.targets.push(page(targetId, url, this.defaultWindowId));
    this.windows.set(targetId, this.defaultWindowId);
    return { targetId };
  }
  async navigate(target, url) { this.raw.byId(target.id).url = url; }
  async waitForReady() {}
  async dismissRateLimit() { this.rateLimitDismissals += 1; return this.rateLimitResult; }
}

function page(id, url, windowId) {
  return { id, type: 'page', title: id, url, windowId, webSocketDebuggerUrl: `ws://${id}` };
}

function ownership(windowId, targets) {
  return { schemaVersion: 1, windowId, targets, updatedAt: '2026-09-08T00:00:00.000Z' };
}

function record(targetId, purpose, assignedUrl) {
  return { targetId, purpose, assignedUrl, createdAt: '2026-09-08T00:00:00.000Z', lastUsedAt: '2026-09-08T00:00:00.000Z' };
}
