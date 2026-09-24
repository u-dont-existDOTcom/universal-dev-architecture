import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import {
  RESET_GENERATION_PROGRESS_FN,
  advanceGenerationProgressTracker,
  generationProgressIsStalled,
} from '../src/cdp.mjs';

function container(key) {
  const descendants = new Set();
  return {
    id: '',
    descendants,
    contentSurface: false,
    querySelector() { return this.contentSurface ? {} : null; },
    getAttribute(name) {
      if (name === 'data-turn-id') return key;
      if (name === 'data-testid') return null;
      return null;
    },
    contains(node) { return descendants.has(node); },
  };
}

function assistantRole(turn, messageId = null) {
  return {
    getAttribute(name) {
      if (name === 'data-message-id') return messageId;
      if (name === 'data-message-author-role') return 'assistant';
      return null;
    },
    closest() { return turn; },
  };
}

test('assistant generation heartbeat records structural progress without reading assistant text', () => {
  const root = {};
  const oldTurn = container('old-turn');
  const newTurn = container('new-turn');
  const streamedTextNode = { nodeType: 3 };
  newTurn.descendants.add(streamedTextNode);
  let assistantNodes = [assistantRole(oldTurn, 'old-message')];
  let observer = null;
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      observer = this;
    }
    observe(observedRoot, options) {
      assert.equal(observedRoot, root);
      assert.equal(options.subtree, true);
      assert.equal(options.childList, true);
      assert.equal(options.characterData, true);
    }
    disconnect() {}
  }
  const context = vm.createContext({
    document: {
      body: root,
      documentElement: root,
      querySelectorAll(selector) {
        assert.equal(selector, '[data-message-author-role="assistant"]');
        return assistantNodes;
      },
    },
    MutationObserver: FakeMutationObserver,
  });

  const armed = vm.runInContext(`(${RESET_GENERATION_PROGRESS_FN})(null)`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(armed)), {
    ok: true,
    targetBound: false,
    assistantContentObserved: false,
  });
  assert.equal(context.__missionControlGenerationProgress.outputBegun, false);
  assert.equal(context.__missionControlGenerationProgress.counter, 0);

  assistantNodes = [assistantRole(oldTurn, 'old-message'), assistantRole(newTurn, 'new-message')];
  observer.callback([{ target: root, addedNodes: [newTurn] }]);
  assert.equal(context.__missionControlGenerationProgress.outputBegun, false);
  assert.equal(context.__missionControlGenerationProgress.counter, 0);

  newTurn.contentSurface = true;
  observer.callback([{ target: streamedTextNode, addedNodes: [] }]);
  assert.equal(context.__missionControlGenerationProgress.outputBegun, true);
  assert.equal(context.__missionControlGenerationProgress.counter, 1);
  assert.equal(Number.isFinite(context.__missionControlGenerationProgress.lastMutationAtMs), true);

  observer.callback([{ target: streamedTextNode, addedNodes: [] }]);
  assert.equal(context.__missionControlGenerationProgress.counter, 2);
  assert.equal(Object.hasOwn(context.__missionControlGenerationProgress, 'text'), false);
  assert.equal(Object.hasOwn(context.__missionControlGenerationProgress, 'content'), false);
});

test('progress stall timer starts only after output begins and resets whenever progress advances', () => {
  const stallMs = 120_000;
  const active = { generating: true, stopVisible: true };
  let tracker = { outputBegun: false, counter: null, lastAdvancedAtMs: null };

  tracker = advanceGenerationProgressTracker(
    tracker,
    { outputBegun: false, counter: 0 },
    1_000,
  );
  assert.equal(generationProgressIsStalled(tracker, active, 1_000_000, stallMs), false);

  tracker = advanceGenerationProgressTracker(
    tracker,
    { outputBegun: true, counter: 1 },
    10_000,
  );
  assert.equal(generationProgressIsStalled(tracker, active, 129_999, stallMs), false);
  assert.equal(generationProgressIsStalled(tracker, active, 130_000, stallMs), true);

  tracker = advanceGenerationProgressTracker(
    tracker,
    { outputBegun: true, counter: 2 },
    130_000,
  );
  assert.equal(generationProgressIsStalled(tracker, active, 249_999, stallMs), false);
  assert.equal(generationProgressIsStalled(tracker, active, 250_000, stallMs), true);
  assert.equal(generationProgressIsStalled(
    tracker, { generating: true, stopVisible: false }, 400_000, stallMs,
  ), false);
});
