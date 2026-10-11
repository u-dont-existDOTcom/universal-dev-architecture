import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterLookup, forgetConfiguredChats, loadConfiguredChats, nextDirectoryLookupMs, SupervisorLink, SupervisorLinkView, supervisorChatView, type ConfiguredChat, type DirectoryAnswer } from "../components/SupervisorLink";
import { isSpecificChatAddress } from "../lib/supervisor-chat-address";

test("only an address that names one ChatGPT conversation counts as a supervisor chat", () => {
  for (const url of ["https://chatgpt.com/", "https://chatgpt.com", "https://chatgpt.com//", "", "http://chatgpt.com/c/abc",
    "https://chatgpt.com/c/replace-auth-supervisor", "not a url", "https://chatgpt.com/settings", "https://chatgpt.com/auth/login",
    "https://chatgpt.com/c/", "https://chatgpt.com/c/abc/extra", "https://example.org/c/abc", "https://user:pw@chatgpt.com/c/abc",
    "https://chatgpt.com.example.org/c/abc"]) {
    assert.equal(isSpecificChatAddress(url), false, url);
  }
  for (const url of ["https://chatgpt.com/c/real-supervisor-chat", "https://chatgpt.com/c/WEB:abc-123", "https://chatgpt.com/c/abc/",
    "https://chatgpt.com/g/g-p-68b0-mission-control/c/abc", "https://chat.openai.com/c/abc"]) {
    assert.equal(isSpecificChatAddress(url), true, url);
  }
});

test("a button looks for a configured chat again: soon after a failure, otherwise once a minute", () => {
  assert.equal(nextDirectoryLookupMs(null), 15_000);
  assert.equal(nextDirectoryLookupMs([]), 60_000);
});

test("a recorded ChatGPT home page is not offered as the supervisor chat", () => {
  const html = renderToStaticMarkup(createElement(SupervisorLink, { url: "https://chatgpt.com/", label: "Open supervisor chat", placeholder: false, workerId: "auth" }));
  assert.match(html, /Checking for a supervisor chat/, "it looks up the configured chats before saying there is none");
  assert.doesNotMatch(html, /No supervisor chat linked/);
  assert.doesNotMatch(html, /href="https:\/\/chatgpt\.com\/"/);
  const withoutWorker = renderToStaticMarkup(createElement(SupervisorLink, { url: "https://chatgpt.com/", label: "Open supervisor chat", placeholder: false }));
  assert.match(withoutWorker, /No supervisor chat linked/);
  assert.match(withoutWorker, /href="\/supervision"/);
});

test("the button says no chat is linked only after the directory answers; until then it says it is checking or can't check", () => {
  const props = { url: "", label: "Open supervisor chat", placeholder: true, workerId: "auth" };
  const configured: ConfiguredChat = { scope: "SPECIALIST", workerId: "auth", url: "https://chatgpt.com/c/configured", label: "Auth supervisor" };
  const elsewhere: ConfiguredChat = { scope: "SPECIALIST", workerId: "billing", url: "https://chatgpt.com/c/billing", label: "Billing supervisor" };
  const homePage: ConfiguredChat = { scope: "SPECIALIST", workerId: "auth", url: "https://chatgpt.com/", label: "Home page" };
  let answer: DirectoryAnswer = { state: "checking" };
  assert.deepEqual(supervisorChatView(props, answer), { kind: "checking" });
  answer = afterLookup(answer, "auth", null);
  assert.deepEqual(supervisorChatView(props, answer), { kind: "unavailable" }, "a failed or timed-out read is not 'no chat'");
  answer = afterLookup(answer, "auth", [elsewhere, homePage]);
  assert.deepEqual(supervisorChatView(props, answer), { kind: "none" }, "only another worker's chat and a home page are configured");
  answer = afterLookup(answer, "auth", [elsewhere, configured]);
  assert.deepEqual(supervisorChatView(props, answer), { kind: "link", href: "https://chatgpt.com/c/configured", label: "Auth supervisor" });
  assert.deepEqual(afterLookup(answer, "auth", null), answer, "a failed read keeps the last answer for the same worker");
  assert.deepEqual(supervisorChatView({ ...props, workerId: "billing" }, answer), { kind: "checking" }, "an answer for another worker is not used");
  assert.deepEqual(afterLookup(answer, "billing", null), { state: "unavailable", workerId: "billing" });
  assert.deepEqual(supervisorChatView({ ...props, url: "https://chatgpt.com/c/recorded", placeholder: false }, { state: "checking" }),
    { kind: "link", href: "https://chatgpt.com/c/recorded", label: "Open supervisor chat" }, "a recorded chat needs no lookup");
  const text = (view: ReturnType<typeof supervisorChatView>) => renderToStaticMarkup(createElement(SupervisorLinkView, { view }));
  assert.match(text({ kind: "checking" }), /Checking for a supervisor chat/);
  assert.match(text({ kind: "unavailable" }), /Couldn(?:'|&#x27;)t check for a supervisor chat; trying again/);
  for (const kind of ["checking", "unavailable", "none"] as const) {
    assert.match(text({ kind }), /href="\/supervision"/);
    assert.equal(/No supervisor chat linked/.test(text({ kind })), kind === "none", kind);
  }
  assert.match(text({ kind: "link", href: "https://chatgpt.com/c/configured", label: "Auth supervisor" }), /href="https:\/\/chatgpt\.com\/c\/configured"[^>]*>.*Auth supervisor/);
});

test("a supervisor-directory read that never answers, answers with malformed entries or reports an invalid list counts as failed", async () => {
  const realFetch = globalThis.fetch;
  try {
    forgetConfiguredChats();
    globalThis.fetch = ((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "AbortError")));
    })) as typeof fetch;
    assert.equal(await loadConfiguredChats(Date.now, 20), null);
    for (const entries of [[null], [{ scope: "SPECIALIST", workerId: "auth" }], "not a list"]) {
      forgetConfiguredChats();
      globalThis.fetch = (async () => Response.json({ configurationState: "CONFIGURED", entries })) as typeof fetch;
      assert.equal(await loadConfiguredChats(), null, JSON.stringify(entries));
    }
    forgetConfiguredChats();
    globalThis.fetch = (async () => Response.json({ configurationState: "MISSING", entries: [], error: null })) as typeof fetch;
    assert.deepEqual(await loadConfiguredChats(), [], "no configured chats is an answer");
    let clock = 1_000;
    const now = () => clock;
    forgetConfiguredChats();
    const good = [{ scope: "SPECIALIST", workerId: "auth", url: "https://chatgpt.com/c/configured", label: "Auth supervisor" }];
    globalThis.fetch = (async () => Response.json({ configurationState: "CONFIGURED", entries: good })) as typeof fetch;
    assert.deepEqual(await loadConfiguredChats(now), good);
    clock += 61_000;
    for (const body of [{ configurationState: "INVALID", entries: [], error: "Configured supervisor IDs must be unique." }, { entries: [] }]) {
      globalThis.fetch = (async () => Response.json(body)) as typeof fetch;
      assert.equal(await loadConfiguredChats(now), null, `${JSON.stringify(body)} is not an empty list`);
    }
    globalThis.fetch = (async () => { throw new Error("must not be read: the good answer is still cached"); }) as typeof fetch;
    clock -= 30_000;
    assert.deepEqual(await loadConfiguredChats(now), good, "an invalid answer never replaced the good one");
  } finally {
    globalThis.fetch = realFetch;
    forgetConfiguredChats();
  }
});

test("a failed supervisor-directory read is retried, and a good answer is reused for a while", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  const answers = [
    () => new Response("unavailable", { status: 503 }),
    () => { throw new TypeError("network down"); },
    () => Response.json({ configurationState: "CONFIGURED", entries: [{ scope: "SPECIALIST", workerId: "auth", url: "https://chatgpt.com/c/configured", label: "Auth supervisor" }] }),
  ];
  globalThis.fetch = (async () => answers[Math.min(calls++, answers.length - 1)]()) as typeof fetch;
  try {
    forgetConfiguredChats();
    let clock = 1_000;
    const now = () => clock;
    assert.equal(await loadConfiguredChats(now), null);
    assert.equal(await loadConfiguredChats(now), null);
    const entries = await loadConfiguredChats(now);
    assert.equal(entries?.[0].url, "https://chatgpt.com/c/configured");
    clock += 30_000;
    await loadConfiguredChats(now);
    assert.equal(calls, 3, "a fresh answer is reused");
    clock += 31_000;
    await loadConfiguredChats(now);
    assert.equal(calls, 4, "an old answer is read again");
  } finally {
    globalThis.fetch = realFetch;
    forgetConfiguredChats();
  }
});
