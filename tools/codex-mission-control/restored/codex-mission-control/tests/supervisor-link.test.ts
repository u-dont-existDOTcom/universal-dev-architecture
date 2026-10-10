import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { forgetConfiguredChats, loadConfiguredChats, SupervisorLink } from "../components/SupervisorLink";
import { isSpecificChatAddress } from "../lib/supervisor-chat-address";

test("only an address that names one chat counts as a supervisor chat", () => {
  for (const url of ["https://chatgpt.com/", "https://chatgpt.com", "https://chatgpt.com//", "", "http://chatgpt.com/c/abc",
    "https://chatgpt.com/c/replace-auth-supervisor", "not a url"]) {
    assert.equal(isSpecificChatAddress(url), false, url);
  }
  assert.equal(isSpecificChatAddress("https://chatgpt.com/c/real-supervisor-chat"), true);
  assert.equal(isSpecificChatAddress("https://chatgpt.com/g/g-p-project/c/abc"), true);
});

test("a recorded ChatGPT home page is not offered as the supervisor chat", () => {
  const html = renderToStaticMarkup(createElement(SupervisorLink, { url: "https://chatgpt.com/", label: "Open supervisor chat", placeholder: false, workerId: "auth" }));
  assert.match(html, /No supervisor chat linked/);
  assert.doesNotMatch(html, /href="https:\/\/chatgpt\.com\/"/);
});

test("a failed supervisor-directory read is retried, and a good answer is reused for a while", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  const answers = [
    () => new Response("unavailable", { status: 503 }),
    () => { throw new TypeError("network down"); },
    () => Response.json({ entries: [{ scope: "SPECIALIST", workerId: "auth", url: "https://chatgpt.com/c/configured", label: "Auth supervisor" }] }),
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
