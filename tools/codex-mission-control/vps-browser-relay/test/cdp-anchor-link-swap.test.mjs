import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLICK_SEND_FN,
  ChromeDevtoolsBrowser,
  GENERATION_STATE_FN,
  GITHUB_APP_MENTION,
  PAGE_INSPECTION_FN,
  PREPARE_COMPOSER_FN,
  RESET_GENERATION_PROGRESS_FN,
  SUBMITTED_USER_TURN_ANCHOR_FN,
  VERIFY_COMPOSER_FN,
  describeAnchorObservation,
  provisionalConversationUrlSwap,
} from '../src/cdp.mjs';
import { sha256 } from '../src/core.mjs';

const PROVISIONAL = 'https://chatgpt.com/c/WEB:fresh-question';
const STABLE = 'https://chatgpt.com/c/stable-question';
const EXISTING = 'https://chatgpt.com/c/registered-chat';
const BODY = 'bounded synthetic question';
const READ_FAILS = Symbol('read fails');
const ANCHOR_TIMEOUT = 'Submitted user-turn structural anchor was not recoverable after generation start.';

test('a provisional link swapped for a stable one during generation still yields the user-turn anchor', async () => {
  const page = scriptedSendPage({ startUrl: PROVISIONAL, pageUrlAfterStart: STABLE });
  const browser = new ChromeDevtoolsBrowser({ WebSocketImpl: page.WebSocketImpl, pageReadyTimeoutMs: 2_000, submitTimeoutMs: 2_000 });
  const start = await submit(browser);
  assert.equal(start.status, 'GENERATION_STARTED');
  // The bound provisional link is reported, so the generation wait records the swap as it always has.
  assert.equal(start.conversationUrl, PROVISIONAL);
  assert.equal(start.anchorReadAfterLinkSwap, true);
  assert.equal(start.submittedUserTurnAnchor.key, 'user-turn-key');
  assert.equal(start.submittedUserTurnAnchor.mentionBindingVerified, true);
  assert.equal(start.submittedUserTurnAnchorApplies, true);
  assert.equal(start.submittedUserTurnAnchorDeferred, false);
  assert.equal(start.anchorObservation, null);
  assert.deepEqual(page.anchorUrls.slice(0, 2), [PROVISIONAL, STABLE]);
  assert.equal(page.clicks, 1);
});

test('an anchor read at an unchanged link reports no swap', async () => {
  const page = scriptedSendPage({ startUrl: STABLE, pageUrlAfterStart: STABLE });
  const browser = new ChromeDevtoolsBrowser({ WebSocketImpl: page.WebSocketImpl, pageReadyTimeoutMs: 2_000, submitTimeoutMs: 2_000 });
  const start = await submit(browser);
  assert.equal(start.conversationUrl, STABLE);
  assert.equal(start.anchorReadAfterLinkSwap, false);
  assert.deepEqual(page.anchorUrls, [STABLE]);
});

test('a move to a different stable conversation is not accepted and the timeout says what was seen', async () => {
  const page = scriptedSendPage({ startUrl: STABLE, pageUrlAfterStart: 'https://chatgpt.com/c/another-conversation' });
  const browser = new ChromeDevtoolsBrowser({ WebSocketImpl: page.WebSocketImpl, pageReadyTimeoutMs: 400, submitTimeoutMs: 2_000 });
  await assert.rejects(submit(browser), (error) => error.relayStage === 'GENERATION_STARTED'
    && error.message === `${ANCHOR_TIMEOUT} (last read: the page was at another link; provisional link swap not seen)`);
  assert.ok(page.anchorUrls.every((url) => url === STABLE));
});

test('a timeout after the swap reports the structure it last saw, without links or text', async () => {
  const page = scriptedSendPage({ startUrl: PROVISIONAL, pageUrlAfterStart: STABLE, mentionVerified: false });
  const browser = new ChromeDevtoolsBrowser({ WebSocketImpl: page.WebSocketImpl, pageReadyTimeoutMs: 400, submitTimeoutMs: 2_000 });
  await assert.rejects(submit(browser), (error) => error.relayStage === 'GENERATION_STARTED'
    && error.message.endsWith('(last read: 1 user turn(s); mention binding not verified; provisional link swap seen)')
    && !/https?:|\/c\//.test(error.message));
});

test('a user turn that never shows while the reply generates defers the anchor instead of stranding the send', async () => {
  const page = scriptedSendPage({ startUrl: STABLE, pageUrlAfterStart: STABLE, anchorAnswer: () => ({ candidateCount: 0 }) });
  const browser = new ChromeDevtoolsBrowser({ WebSocketImpl: page.WebSocketImpl, pageReadyTimeoutMs: 400, submitTimeoutMs: 2_000 });
  const start = await submit(browser);
  assert.equal(start.status, 'GENERATION_STARTED');
  assert.equal(start.generationStarted, true);
  assert.equal(start.conversationUrl, STABLE);
  assert.equal(start.anchorReadAfterLinkSwap, false);
  assert.equal(start.submittedUserTurnAnchor, null);
  assert.equal(start.submittedUserTurnAnchorApplies, true);
  assert.equal(start.submittedUserTurnAnchorDeferred, true);
  assert.equal(start.anchorObservation, '(last read: 0 user turn(s); mention binding not verified; provisional link swap not seen)');
  assert.ok(start.limitations.some((line) => /anchor is deferred/.test(line)));
  assert.ok(page.anchorUrls.length > 1);
  assert.equal(page.clicks, 1);
});

test('no user turn shown after the provisional link swap also defers the anchor, without links or text', async () => {
  const page = scriptedSendPage({ startUrl: PROVISIONAL, pageUrlAfterStart: STABLE, anchorAnswer: () => ({ candidateCount: 0 }) });
  const browser = new ChromeDevtoolsBrowser({ WebSocketImpl: page.WebSocketImpl, pageReadyTimeoutMs: 400, submitTimeoutMs: 2_000 });
  const start = await submit(browser);
  assert.equal(start.conversationUrl, PROVISIONAL);
  assert.equal(start.anchorReadAfterLinkSwap, true);
  assert.equal(start.submittedUserTurnAnchorDeferred, true);
  assert.equal(start.anchorObservation, '(last read: 0 user turn(s); mention binding not verified; provisional link swap seen)');
  assert.doesNotMatch(start.anchorObservation, /https?:|\/c\//);
});

test('an early failed read followed by reads that show no user turn still defers the anchor', async () => {
  const page = scriptedSendPage({ startUrl: STABLE, pageUrlAfterStart: STABLE,
    anchorAnswer: (read) => (read === 1 ? READ_FAILS : { candidateCount: 0 }) });
  const browser = new ChromeDevtoolsBrowser({ WebSocketImpl: page.WebSocketImpl, pageReadyTimeoutMs: 600, submitTimeoutMs: 2_000 });
  const start = await submit(browser);
  assert.equal(start.submittedUserTurnAnchorDeferred, true);
  assert.ok(page.anchorUrls.length > 2);
});

for (const [name, answer, seen] of [
  ['a failed last read', (read) => (read === 1 ? { candidateCount: 0 } : READ_FAILS), '0 user turn(s)'],
  ['two user turns', () => ({ candidateCount: 2 }), '2 user turn(s)'],
  ['mixed page structure', () => ({ structureAmbiguous: true, candidateCount: 2 }), 'mixed page structure'],
  ['a bound read followed by another link', (read) => (read === 1 ? { candidateCount: 0 } : { urlMismatch: true }), 'the page was at another link'],
]) {
  test(`${name} still stops the send as an ambiguous start, as before`, async () => {
    const page = scriptedSendPage({ startUrl: STABLE, pageUrlAfterStart: STABLE, anchorAnswer: answer });
    const browser = new ChromeDevtoolsBrowser({ WebSocketImpl: page.WebSocketImpl, pageReadyTimeoutMs: 600, submitTimeoutMs: 2_000 });
    await assert.rejects(submit(browser), (error) => error.relayStage === 'GENERATION_STARTED'
      && error.message.includes(`(last read: ${seen}`));
    assert.equal(page.clicks, 1);
  });
}

test('a send into an existing chat returns once generation starts, without the first-message anchor wait', async () => {
  const page = scriptedSendPage({ startUrl: EXISTING, pageUrlAfterStart: EXISTING, anchorAnswer: () => ({ candidateCount: 3 }) });
  const browser = new ChromeDevtoolsBrowser({ WebSocketImpl: page.WebSocketImpl, pageReadyTimeoutMs: 400, submitTimeoutMs: 2_000 });
  const start = await submit(browser, EXISTING);
  assert.equal(start.status, 'GENERATION_STARTED');
  assert.equal(start.conversationUrl, EXISTING);
  assert.equal(start.submittedUserTurnAnchor, null);
  assert.equal(start.submittedUserTurnAnchorApplies, false);
  assert.equal(start.submittedUserTurnAnchorDeferred, false);
  assert.equal(start.anchorObservation, null);
  assert.deepEqual(page.anchorUrls, []);
  assert.equal(page.clicks, 1);
});

test('only the provisional-to-stable swap is accepted', () => {
  assert.equal(provisionalConversationUrlSwap(PROVISIONAL, `${STABLE}/?model=x`), STABLE);
  assert.equal(provisionalConversationUrlSwap(PROVISIONAL, 'https://chatgpt.com/c/WEB:another-provisional'), null);
  assert.equal(provisionalConversationUrlSwap(STABLE, 'https://chatgpt.com/c/another-conversation'), null);
  assert.equal(provisionalConversationUrlSwap(STABLE, PROVISIONAL), null);
  assert.equal(provisionalConversationUrlSwap(PROVISIONAL, 'https://chatgpt.com/'), null);
  assert.equal(provisionalConversationUrlSwap(PROVISIONAL, 'https://example.com/c/stable-question'), null);
  assert.equal(provisionalConversationUrlSwap(PROVISIONAL, undefined), null);
});

test('the anchor description carries structure only', () => {
  assert.equal(describeAnchorObservation(null, false), '(last read: no result)');
  assert.equal(describeAnchorObservation({ structureAmbiguous: true }, false),
    '(last read: mixed page structure; mention binding not verified; provisional link swap not seen)');
  assert.equal(describeAnchorObservation({ candidateCount: 0 }, true),
    '(last read: 0 user turn(s); mention binding not verified; provisional link swap seen)');
});

function submit(browser, expectedUrl = 'https://chatgpt.com/') {
  return browser.submitExactMessage({ id: 'owned-target', webSocketDebuggerUrl: 'ws://controlled/page' }, {
    expectedUrl,
    body: BODY,
    bodySha256: sha256(BODY),
    composerMentions: [GITHUB_APP_MENTION],
    onBeforeSubmissionBoundary: async () => {},
  });
}

// A page that answers each relay browser function as a fresh ChatGPT chat would. After the send starts, the page sits
// at `pageUrlAfterStart`; the anchor read succeeds only when asked about the link the page is at. `anchorAnswer(read)`,
// when given, replaces what a read at that link returns (READ_FAILS makes the read itself fail; urlMismatch moves the
// page elsewhere).
function scriptedSendPage({ startUrl, pageUrlAfterStart, mentionVerified = true, anchorAnswer = null }) {
  const state = { anchorUrls: [], clicks: 0 };
  const answer = (functionDeclaration, args) => {
    switch (functionDeclaration) {
      case PAGE_INSPECTION_FN: return { urlMismatch: false, composerFound: true, loginRequired: false };
      case PREPARE_COMPOSER_FN: return { ok: true, alreadyExact: true, verifiedMentionCount: 1 };
      case VERIFY_COMPOSER_FN: return { exact: true, length: BODY.length, verifiedMentionCount: 1 };
      case RESET_GENERATION_PROGRESS_FN: return { ok: true };
      case CLICK_SEND_FN: state.clicks += 1; return { ok: true };
      case GENERATION_STATE_FN: return { urlMismatch: false, conversationUrl: startUrl, generating: true, startSignal: 'STOP_CONTROL_VISIBLE' };
      case SUBMITTED_USER_TURN_ANCHOR_FN: {
        state.anchorUrls.push(args[0]);
        if (args[0] !== pageUrlAfterStart) return { urlMismatch: true, currentUrl: `${pageUrlAfterStart}?temporary-chat=false` };
        if (anchorAnswer) {
          const scripted = anchorAnswer(state.anchorUrls.length);
          if (scripted === READ_FAILS) return READ_FAILS;
          if (scripted.urlMismatch) return { urlMismatch: true, currentUrl: 'https://chatgpt.com/c/elsewhere' };
          return { urlMismatch: false, structureAmbiguous: scripted.structureAmbiguous === true, candidateCount: scripted.candidateCount };
        }
        return {
          urlMismatch: false, structureAmbiguous: false, candidateCount: 1, key: 'user-turn-key',
          keySource: 'data-turn-key', structureKind: 'CHATGPT_DATA_TURN_KEY_V1', role: 'user', messageOrdinal: 1,
          mentionBindingVerified: mentionVerified, assistantContentObserved: false,
        };
      }
      default: throw new Error('unexpected browser function');
    }
  };
  class ScriptedPage {
    constructor() { this.listeners = new Map(); queueMicrotask(() => this.emit('open', {})); }
    addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
    send(raw) {
      const message = JSON.parse(raw);
      let result = {};
      if (message.method === 'Runtime.evaluate') result = { result: { objectId: 'global-object' } };
      else if (message.method === 'Runtime.callFunctionOn') {
        const value = answer(message.params.functionDeclaration, message.params.arguments.map((item) => item.value));
        result = value === READ_FAILS ? { exceptionDetails: { text: 'Execution context was destroyed.' } } : { result: { value } };
      }
      queueMicrotask(() => this.emit('message', { data: JSON.stringify({ id: message.id, result }) }));
    }
    close() {}
    emit(type, event) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
  }
  return { WebSocketImpl: ScriptedPage, get anchorUrls() { return state.anchorUrls; }, get clicks() { return state.clicks; } };
}
