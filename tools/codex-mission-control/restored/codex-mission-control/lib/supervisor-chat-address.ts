/**
 * Whether an address can open one specific supervisor chat. Empty addresses, non-HTTPS addresses, demo or placeholder
 * addresses and a site's home page (such as https://chatgpt.com/) cannot: stored routes and links accept any HTTPS
 * address, so the dashboard checks before offering one as a link.
 */
export function isSpecificChatAddress(url: string | null | undefined): url is string {
  if (!url || /replace-|example|placeholder/i.test(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.pathname.replace(/\/+$/, "") !== "";
  } catch {
    return false;
  }
}
