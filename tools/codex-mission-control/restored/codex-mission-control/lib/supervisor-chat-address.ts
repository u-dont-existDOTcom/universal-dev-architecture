// A ChatGPT conversation, alone or inside a project: /c/<id> or /g/<project>/c/<id>, the same conversation ids the
// configured supervisor chats accept (lib/configured-supervisor-chats.ts).
const CONVERSATION_PATH = /^\/(?:g\/[A-Za-z0-9_-]+\/)?c\/(?:WEB:)?[A-Za-z0-9_-]+\/?$/;
const CONVERSATION_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);

/**
 * Whether an address opens one specific supervisor chat: an HTTPS ChatGPT conversation address, not a demo or
 * placeholder. Stored routes and links accept any HTTPS address, so the dashboard checks before offering one as a
 * link: the ChatGPT home page, its settings or sign-in pages and other sites don't count.
 */
export function isSpecificChatAddress(url: string | null | undefined): url is string {
  if (!url || /replace-|example|placeholder/i.test(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      && CONVERSATION_HOSTS.has(parsed.hostname) && CONVERSATION_PATH.test(parsed.pathname);
  } catch {
    return false;
  }
}
